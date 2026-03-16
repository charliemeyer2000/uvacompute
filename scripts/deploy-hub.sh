#!/bin/bash
# Deploy vm-orchestration-service to the hub (DO VPS)
#
# Usage: ./scripts/deploy-hub.sh
#
# Prerequisites:
# - SSH access to your hub VPS (set HUB_IP env var)
# - Hub setup completed (k3s + KubeVirt running)
# - .env.production configured on hub

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
HUB_IP="${HUB_IP:?HUB_IP environment variable is required}"
HUB_USER="${HUB_USER:-root}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(dirname "$SCRIPT_DIR")"
SERVICE_DIR="$WORKSPACE_ROOT/apps/vm-orchestration-service"

log_info "Deploying vm-orchestration-service to hub at ${HUB_IP}"

# Change to service directory
cd "$SERVICE_DIR"

# Step 1: Build for Linux
log_info "Building for Linux AMD64..."
mkdir -p dist
GOOS=linux GOARCH=amd64 go build -o dist/vm-orchestration-linux .
log_info "Build complete: dist/vm-orchestration-linux"

# Step 2: Check SSH connectivity
log_info "Checking SSH connectivity to ${HUB_USER}@${HUB_IP}..."
if ! ssh -o ConnectTimeout=5 "${HUB_USER}@${HUB_IP}" "echo 'SSH connection OK'" &> /dev/null; then
    log_error "Cannot connect to ${HUB_USER}@${HUB_IP}"
    log_error "Make sure you have SSH access configured"
    exit 1
fi

# Step 3: Upload binary
log_info "Uploading binary to hub..."
scp dist/vm-orchestration-linux "${HUB_USER}@${HUB_IP}:/usr/local/bin/vm-orchestration"

# Step 4: Upload systemd service file
log_info "Uploading systemd service file..."
scp hub.service "${HUB_USER}@${HUB_IP}:/etc/systemd/system/vm-orchestration.service"

# Step 5: Check if .env.production exists on hub
log_info "Checking for .env.production on hub..."
if ! ssh "${HUB_USER}@${HUB_IP}" "test -f /opt/vm-orchestration-service/.env.production"; then
    log_warn ".env.production not found on hub"
    log_warn "Creating template .env.production..."
    ssh "${HUB_USER}@${HUB_IP}" "mkdir -p /opt/vm-orchestration-service && cat > /opt/vm-orchestration-service/.env.production << 'EOF'
# vm-orchestration-service configuration
SITE_BASE_URL=https://uvacompute.com
ORCHESTRATION_SHARED_SECRET=CHANGE_ME_TO_MATCH_VERCEL
EOF"
    log_warn "Please update ORCHESTRATION_SHARED_SECRET on hub:"
    log_warn "  ssh ${HUB_USER}@${HUB_IP} 'nano /opt/vm-orchestration-service/.env.production'"
fi

# Step 6: Reload and restart service
log_info "Restarting vm-orchestration service..."
ssh "${HUB_USER}@${HUB_IP}" "systemctl daemon-reload && systemctl enable vm-orchestration && systemctl restart vm-orchestration"

# Step 7: Wait a moment and check status
sleep 2
log_info "Checking service status..."
if ssh "${HUB_USER}@${HUB_IP}" "systemctl is-active vm-orchestration" &> /dev/null; then
    log_info "Service is running!"
else
    log_error "Service failed to start. Check logs:"
    log_error "  ssh ${HUB_USER}@${HUB_IP} 'journalctl -u vm-orchestration -n 50'"
    exit 1
fi

# Step 8: Test health endpoint
log_info "Testing health endpoint..."
if curl -s --connect-timeout 5 "http://${HUB_IP}:8080/health" &> /dev/null; then
    log_info "Health endpoint responding!"
else
    log_warn "Health endpoint not responding yet (may need a moment to start)"
fi

echo ""
echo "=========================================="
log_info "Deployment complete!"
echo "=========================================="
echo ""
echo "Service status:"
ssh "${HUB_USER}@${HUB_IP}" "systemctl status vm-orchestration --no-pager | head -15"
echo ""
echo "Useful commands:"
echo "  View logs:    ssh ${HUB_USER}@${HUB_IP} 'journalctl -u vm-orchestration -f'"
echo "  Check health: curl http://${HUB_IP}:8080/health"
echo ""
echo "Don't forget to update Vercel environment variables:"
echo "  VM_ORCHESTRATION_SERVICE_URL=http://${HUB_IP}:8080"
echo ""
