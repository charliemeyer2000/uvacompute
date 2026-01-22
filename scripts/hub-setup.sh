#!/bin/bash
# Hub Setup Script for uvacompute
# Run this on the DO VPS (24.199.85.26) to set up the federated k3s control plane
#
# Usage: sudo ./hub-setup.sh
#
# This script installs:
# - k3s server (control plane)
# - KubeVirt operator (VM management)
# - Creates uvacompute namespace
#
# After running, you'll need to:
# 1. Deploy vm-orchestration-service (run deploy-hub.sh from your local machine)
# 2. Update Vercel env vars with VM_ORCHESTRATION_SERVICE_URL

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

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root (sudo ./hub-setup.sh)"
    exit 1
fi

# Configuration
HUB_IP="${HUB_IP:-24.199.85.26}"
KUBEVIRT_VERSION="${KUBEVIRT_VERSION:-v1.3.0}"

log_info "Starting hub setup on ${HUB_IP}"
log_info "KubeVirt version: ${KUBEVIRT_VERSION}"

# Step 1: Install k3s server
log_info "Installing k3s server..."
if command -v k3s &> /dev/null; then
    log_warn "k3s already installed, skipping installation"
else
    curl -sfL https://get.k3s.io | sh -s - server \
        --disable=traefik \
        --tls-san="${HUB_IP}" \
        --advertise-address="${HUB_IP}" \
        --node-external-ip="${HUB_IP}"
    
    log_info "Waiting for k3s to be ready..."
    sleep 10
fi

# Set up kubectl alias for convenience
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# Wait for node to be ready
log_info "Waiting for node to be ready..."
kubectl wait --for=condition=Ready node/$(hostname) --timeout=120s

log_info "k3s server is ready"

# Step 2: Install KubeVirt operator
log_info "Installing KubeVirt operator..."
if kubectl get namespace kubevirt &> /dev/null; then
    log_warn "kubevirt namespace already exists, checking status..."
else
    kubectl apply -f "https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-operator.yaml"
    
    log_info "Waiting for virt-operator deployment..."
    kubectl wait --for=condition=available --timeout=300s deployment/virt-operator -n kubevirt
fi

# Step 3: Install KubeVirt CR
log_info "Installing KubeVirt CR..."
if kubectl get kubevirt kubevirt -n kubevirt &> /dev/null; then
    log_warn "KubeVirt CR already exists, checking status..."
else
    kubectl apply -f "https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-cr.yaml"
fi

log_info "Waiting for KubeVirt to be available (this may take a few minutes)..."
kubectl wait --for=condition=Available --timeout=600s kubevirt/kubevirt -n kubevirt

log_info "KubeVirt is ready"

# Step 4: Create uvacompute namespace
log_info "Creating uvacompute namespace..."
kubectl create namespace uvacompute --dry-run=client -o yaml | kubectl apply -f -

# Step 5: Taint hub node to prevent user workloads from running here
log_info "Tainting hub node (control-plane only)..."
kubectl taint nodes $(hostname) node-role.kubernetes.io/control-plane=:NoSchedule --overwrite || true

# Step 6: Create service directories
log_info "Creating service directories..."
mkdir -p /opt/vm-orchestration-service
mkdir -p /etc/uvacompute

# Print summary
echo ""
echo "=========================================="
log_info "Hub setup complete!"
echo "=========================================="
echo ""
echo "Cluster status:"
kubectl get nodes
echo ""
echo "KubeVirt status:"
kubectl get kubevirt -n kubevirt
echo ""
echo "Agent join token (save this securely):"
echo "----------------------------------------"
cat /var/lib/rancher/k3s/server/node-token
echo "----------------------------------------"
echo ""
echo "Next steps:"
echo "1. Save the agent token above securely"
echo "2. Create /opt/vm-orchestration-service/.env.production with:"
echo "   SITE_BASE_URL=https://uvacompute.com"
echo "   ORCHESTRATION_SHARED_SECRET=<your-secret>"
echo "3. Run deploy-hub.sh from your local machine to deploy the orchestration service"
echo "4. Update Vercel env vars:"
echo "   VM_ORCHESTRATION_SERVICE_URL=http://${HUB_IP}:8080"
echo ""
