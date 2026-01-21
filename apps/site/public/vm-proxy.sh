#!/bin/bash
# VM Proxy - validates token and proxies SSH to VM
set -euo pipefail

# Source environment
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

exec virtctl port-forward --stdio=true --namespace=uvacompute "vmi/$VM_ID" 22
