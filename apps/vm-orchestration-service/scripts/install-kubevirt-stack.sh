#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

KUBEVIRT_VERSION="${KUBEVIRT_VERSION:-v1.3.0}"
K3S_VERSION="${K3S_VERSION:-}"
GPU_OPERATOR_VERSION="${GPU_OPERATOR_VERSION:-v24.6.0}"
NAMESPACE="${NAMESPACE:-uvacompute}"

INSTALL_K3S="${INSTALL_K3S:-true}"
INSTALL_KUBEVIRT="${INSTALL_KUBEVIRT:-true}"
INSTALL_GPU_OPERATOR="${INSTALL_GPU_OPERATOR:-false}"
CLUSTER_INIT="${CLUSTER_INIT:-false}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
    echo "[ERROR] $*" >&2
    exit 1
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root"
    fi
}

check_system() {
    log "Checking system requirements..."

    if ! grep -q vmx /proc/cpuinfo && ! grep -q svm /proc/cpuinfo; then
        log "Warning: Hardware virtualization may not be enabled"
    fi

    local mem_kb
    mem_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    local mem_gb=$((mem_kb / 1024 / 1024))
    if [[ $mem_gb -lt 8 ]]; then
        log "Warning: System has ${mem_gb}GB RAM, recommended minimum is 8GB"
    fi

    log "System check complete"
}

install_k3s() {
    log "Installing k3s..."

    local k3s_args=""

    if [[ "$CLUSTER_INIT" == "true" ]]; then
        k3s_args="--cluster-init"
        log "Initializing cluster with embedded etcd (multi-node ready)"
    fi

    k3s_args="$k3s_args --disable=traefik"

    if [[ -n "$K3S_VERSION" ]]; then
        curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION="$K3S_VERSION" sh -s - $k3s_args
    else
        curl -sfL https://get.k3s.io | sh -s - $k3s_args
    fi

    log "Waiting for k3s to be ready..."
    sleep 10

    until kubectl get nodes &>/dev/null; do
        log "Waiting for k3s API..."
        sleep 5
    done

    mkdir -p ~/.kube
    cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
    chmod 600 ~/.kube/config

    log "k3s installed successfully"
    kubectl get nodes
}

install_kubevirt() {
    log "Installing KubeVirt ${KUBEVIRT_VERSION}..."

    kubectl apply -f "https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-operator.yaml"

    log "Waiting for KubeVirt operator..."
    kubectl wait --for=condition=available --timeout=300s deployment/virt-operator -n kubevirt

    kubectl apply -f "https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-cr.yaml"

    log "Waiting for KubeVirt to be ready..."
    kubectl wait --for=condition=Available --timeout=600s kubevirt/kubevirt -n kubevirt

    log "KubeVirt installed successfully"
    kubectl get kubevirt -n kubevirt
}

configure_kubevirt_features() {
    log "Configuring KubeVirt features..."

    kubectl patch kubevirt kubevirt -n kubevirt --type=merge -p '
{
  "spec": {
    "configuration": {
      "developerConfiguration": {
        "featureGates": [
          "LiveMigration",
          "GPU",
          "HostDevices"
        ]
      },
      "permittedHostDevices": {
        "pciHostDevices": [
          {
            "pciVendorSelector": "10DE:*",
            "resourceName": "nvidia.com/gpu"
          }
        ]
      }
    }
  }
}'

    log "KubeVirt features configured"
}

install_gpu_operator() {
    log "Installing NVIDIA GPU Operator ${GPU_OPERATOR_VERSION}..."

    if ! helm version &>/dev/null; then
        log "Installing Helm..."
        curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    fi

    helm repo add nvidia https://helm.ngc.nvidia.com/nvidia
    helm repo update

    helm install --wait gpu-operator nvidia/gpu-operator \
        --namespace gpu-operator \
        --create-namespace \
        --version "${GPU_OPERATOR_VERSION}" \
        --set driver.enabled=true \
        --set toolkit.enabled=true \
        --set devicePlugin.enabled=true

    log "Waiting for GPU Operator pods..."
    sleep 30
    kubectl wait --for=condition=ready pod -l app=nvidia-device-plugin-daemonset -n gpu-operator --timeout=300s || true

    log "GPU Operator installed"
    kubectl get pods -n gpu-operator
}

create_namespace() {
    log "Creating namespace: $NAMESPACE"

    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

    kubectl label namespace "$NAMESPACE" app.kubernetes.io/managed-by=vm-orchestration-service --overwrite

    log "Namespace created"
}

install_virtctl() {
    log "Installing virtctl CLI..."

    local arch
    arch=$(uname -m)
    case $arch in
        x86_64) arch="amd64" ;;
        aarch64) arch="arm64" ;;
    esac

    curl -L -o /usr/local/bin/virtctl \
        "https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/virtctl-${KUBEVIRT_VERSION}-linux-${arch}"

    chmod +x /usr/local/bin/virtctl

    log "virtctl installed: $(virtctl version --client)"
}

setup_local_registry() {
    log "Setting up local container registry..."

    kubectl apply -f - << 'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: registry
  namespace: kube-system
  labels:
    app: registry
spec:
  containers:
  - name: registry
    image: registry:2
    ports:
    - containerPort: 5000
    volumeMounts:
    - name: registry-data
      mountPath: /var/lib/registry
  volumes:
  - name: registry-data
    emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: registry
  namespace: kube-system
spec:
  type: NodePort
  ports:
  - port: 5000
    targetPort: 5000
    nodePort: 30500
  selector:
    app: registry
EOF

    log "Local registry available at localhost:30500"
}

print_summary() {
    log "Installation complete!"
    echo ""
    echo "=============================================="
    echo "           Installation Summary"
    echo "=============================================="
    echo ""
    echo "k3s installed: $(kubectl version --short 2>/dev/null | head -1 || echo 'Yes')"
    echo "KubeVirt version: $KUBEVIRT_VERSION"
    echo "Namespace: $NAMESPACE"
    echo ""
    echo "Kubeconfig: /etc/rancher/k3s/k3s.yaml"
    echo ""
    echo "To use kubectl:"
    echo "  export KUBECONFIG=/etc/rancher/k3s/k3s.yaml"
    echo ""
    echo "To check KubeVirt status:"
    echo "  kubectl get kubevirt -n kubevirt"
    echo "  kubectl get pods -n kubevirt"
    echo ""
    echo "To start the VM orchestration service:"
    echo "  VM_BACKEND=kubevirt KUBECONFIG=/etc/rancher/k3s/k3s.yaml ./vm-orchestration-service"
    echo ""
    if [[ "$CLUSTER_INIT" == "true" ]]; then
        echo "To join additional nodes to this cluster:"
        echo "  1. Get the token: cat /var/lib/rancher/k3s/server/node-token"
        echo "  2. On the new node: curl -sfL https://get.k3s.io | K3S_URL=https://<this-ip>:6443 K3S_TOKEN=<token> sh -"
        echo ""
    fi
    echo "=============================================="
}

usage() {
    cat << EOF
Install k3s + KubeVirt stack for VM orchestration

Usage: $0 [options]

Options:
    --kubevirt-version <version>   KubeVirt version (default: $KUBEVIRT_VERSION)
    --k3s-version <version>        k3s version (default: latest)
    --namespace <name>             Namespace for VMs (default: $NAMESPACE)
    --cluster-init                 Initialize cluster for multi-node support
    --with-gpu                     Install NVIDIA GPU Operator
    --skip-k3s                     Skip k3s installation
    --skip-kubevirt                Skip KubeVirt installation
    --with-registry                Setup local container registry
    -h, --help                     Show this help

Examples:
    $0                             # Basic installation
    $0 --cluster-init              # Multi-node ready installation
    $0 --with-gpu --cluster-init   # With GPU support
    $0 --skip-k3s                  # Install KubeVirt on existing cluster
EOF
    exit 0
}

WITH_REGISTRY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --kubevirt-version)
            KUBEVIRT_VERSION="$2"
            shift 2
            ;;
        --k3s-version)
            K3S_VERSION="$2"
            shift 2
            ;;
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --cluster-init)
            CLUSTER_INIT=true
            shift
            ;;
        --with-gpu)
            INSTALL_GPU_OPERATOR=true
            shift
            ;;
        --skip-k3s)
            INSTALL_K3S=false
            shift
            ;;
        --skip-kubevirt)
            INSTALL_KUBEVIRT=false
            shift
            ;;
        --with-registry)
            WITH_REGISTRY=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

main() {
    check_root
    check_system

    if [[ "$INSTALL_K3S" == "true" ]]; then
        install_k3s
    fi

    if [[ "$INSTALL_KUBEVIRT" == "true" ]]; then
        install_kubevirt
        configure_kubevirt_features
        install_virtctl
    fi

    if [[ "$INSTALL_GPU_OPERATOR" == "true" ]]; then
        install_gpu_operator
    fi

    create_namespace

    if [[ "$WITH_REGISTRY" == "true" ]]; then
        setup_local_registry
    fi

    print_summary
}

main
