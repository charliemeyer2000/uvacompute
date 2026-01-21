#!/bin/bash
# VM Proxy - validates token and proxies SSH to VM via worker node tunnel
#
# This script runs on the hub when users SSH to their VMs. It:
# 1. Validates the SSH token
# 2. Looks up which node the VM is running on
# 3. Gets the tunnel port from the node's annotation
# 4. Proxies the SSH connection through the tunnel to the VM
#
set -euo pipefail

[ -f /etc/environment ] && . /etc/environment

# SSH calls shell as: /path/to/shell -c "command"
if [[ "${1:-}" == "-c" ]]; then
  TOKEN="$2"
else
  TOKEN="${SSH_ORIGINAL_COMMAND:-$1}"
fi

[[ -z "$TOKEN" ]] && { echo "No token provided" >&2; exit 1; }
[[ -z "${VM_PROXY_SECRET:-}" ]] && { echo "Server misconfigured" >&2; exit 1; }

# Convert base64url to base64 and decode
TOKEN_B64=$(echo "$TOKEN" | tr '_-' '/+')
MOD=$((${#TOKEN_B64} % 4))
case $MOD in
  2) TOKEN_B64="${TOKEN_B64}==";;
  3) TOKEN_B64="${TOKEN_B64}=";;
esac

DECODED=$(echo "$TOKEN_B64" | base64 -d 2>/dev/null) || { echo "Invalid token" >&2; exit 1; }
IFS=':' read -r USER_ID VM_ID EXPIRES SIG <<< "$DECODED"
[[ -z "$VM_ID" || -z "$EXPIRES" || -z "$SIG" ]] && { echo "Invalid token format" >&2; exit 1; }

# Verify signature
PAYLOAD="${USER_ID}:${VM_ID}:${EXPIRES}"
EXPECTED_SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$VM_PROXY_SECRET" | awk '{print $2}' | cut -c1-16)
[[ "$SIG" != "$EXPECTED_SIG" ]] && { echo "Invalid signature" >&2; exit 1; }

# Check expiry
NOW=$(date +%s)
[[ "$NOW" -gt "$EXPIRES" ]] && { echo "Token expired" >&2; exit 1; }

# Validate VM ID format
[[ ! "$VM_ID" =~ ^[a-f0-9-]{36}$ ]] && { echo "Invalid VM ID" >&2; exit 1; }

# Use vmproxy user's kubeconfig
export KUBECONFIG="${HOME}/.kube/config"

# Get the node name where the VM is running
NODE_NAME=$(kubectl get vmi "$VM_ID" -n uvacompute -o jsonpath='{.status.nodeName}' 2>/dev/null) || { echo "VM not found" >&2; exit 1; }

# Get VM's pod IP - the worker can reach it directly since they're on the same node
VM_IP=$(kubectl get vmi "$VM_ID" -n uvacompute -o jsonpath='{.status.interfaces[0].ipAddress}' 2>/dev/null) || { echo "VM IP not found" >&2; exit 1; }

# Get tunnel port from node annotation
TUNNEL_PORT=$(kubectl get node "$NODE_NAME" -o jsonpath='{.metadata.annotations.uvacompute\.io/tunnel-port}' 2>/dev/null)
[[ -z "$TUNNEL_PORT" ]] && { echo "No tunnel port configured for node: $NODE_NAME" >&2; exit 1; }

# Use SSH -W to proxy directly to the VM's SSH port via the worker
# The worker can reach the VM IP directly since they're on the same node's pod network
exec ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR \
    -p "$TUNNEL_PORT" root@localhost \
    -W "${VM_IP}:22"
