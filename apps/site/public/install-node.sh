#!/usr/bin/env bash
#
# uvacompute Node Installation Script
#
# This script installs k3s, KubeVirt, and optionally NVIDIA container toolkit
# to set up a machine as a uvacompute contributor node.
#
# Usage: curl -fsSL https://uvacompute.com/install-node.sh | sudo bash
#

set -euo pipefail

# Configuration
KUBEVIRT_VERSION="v1.3.0"
K3S_INSTALL_FLAGS="--disable=traefik"
NODE_CONFIG_DIR="${HOME}/.uvacompute/node"
NVIDIA_DEVICE_PLUGIN_VERSION="v0.17.0"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_step() {
    echo -e "\n${BOLD}==> $*${NC}"
}

die() {
    log_error "$*"
    exit 1
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        die "This script must be run as root (use sudo)"
    fi
}

# Detect OS
detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS_ID="${ID}"
        OS_VERSION="${VERSION_ID}"
        OS_NAME="${PRETTY_NAME}"
    else
        die "Cannot detect OS. /etc/os-release not found."
    fi

    case "${OS_ID}" in
        ubuntu|debian)
            log_info "Detected OS: ${OS_NAME}"
            ;;
        *)
            die "Unsupported OS: ${OS_NAME}. Only Ubuntu and Debian are supported."
            ;;
    esac
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites"

    local missing=()

    for cmd in curl systemctl lspci; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required commands: ${missing[*]}"
        log_info "Installing missing dependencies..."
        apt-get update -qq
        apt-get install -y -qq curl systemd pciutils
    fi

    log_success "All prerequisites satisfied"
}

# Install k3s
install_k3s() {
    log_step "Installing k3s"

    if command -v k3s &> /dev/null; then
        log_warn "k3s is already installed"
        local version
        version=$(k3s --version | head -1 | awk '{print $3}')
        log_info "Current version: ${version}"
    else
        log_info "Downloading and installing k3s..."
        curl -sfL https://get.k3s.io | sh -s - ${K3S_INSTALL_FLAGS}
    fi

    log_info "Waiting for k3s to be ready..."
    local retries=30
    while [[ $retries -gt 0 ]]; do
        if kubectl get nodes &> /dev/null; then
            break
        fi
        sleep 2
        ((retries--))
    done

    if [[ $retries -eq 0 ]]; then
        die "k3s failed to start within timeout"
    fi

    local k3s_version
    k3s_version=$(k3s --version | head -1 | awk '{print $3}')
    log_success "k3s installed and running (${k3s_version})"
}

# Install KubeVirt
install_kubevirt() {
    log_step "Installing KubeVirt ${KUBEVIRT_VERSION}"

    if kubectl get kubevirt -n kubevirt &> /dev/null 2>&1; then
        log_warn "KubeVirt is already installed"
        local phase
        phase=$(kubectl get kubevirt -n kubevirt -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Unknown")
        log_info "Current phase: ${phase}"
    else
        log_info "Installing KubeVirt operator..."
        kubectl apply -f "https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-operator.yaml"

        log_info "Waiting for operator to be ready..."
        kubectl wait --for=condition=available --timeout=300s deployment/virt-operator -n kubevirt

        log_info "Installing KubeVirt CR..."
        kubectl apply -f "https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-cr.yaml"

        log_info "Waiting for KubeVirt to deploy (this may take several minutes)..."
        kubectl wait --for=condition=Available --timeout=600s kubevirt/kubevirt -n kubevirt
    fi

    log_success "KubeVirt installed and deployed"
}

# Create uvacompute namespace
create_namespace() {
    log_step "Creating uvacompute namespace"

    if kubectl get namespace uvacompute &> /dev/null 2>&1; then
        log_warn "Namespace 'uvacompute' already exists"
    else
        kubectl create namespace uvacompute
        log_success "Namespace 'uvacompute' created"
    fi
}

# Detect NVIDIA GPU
detect_gpu() {
    log_step "Detecting GPU"

    if ! lspci | grep -qi nvidia; then
        log_info "No NVIDIA GPU detected"
        GPU_DETECTED=false
        return
    fi

    GPU_DETECTED=true

    # Get GPU PCI address (format: 0000:XX:XX.X)
    GPU_PCI=$(lspci -D | grep -i 'vga.*nvidia' | awk '{print $1}' | head -1)
    # Get audio device PCI (usually same bus, function 1)
    GPU_AUDIO_PCI=$(lspci -D | grep -i 'audio.*nvidia' | awk '{print $1}' | head -1)

    # Get device IDs
    GPU_DEVICE_ID=$(lspci -nn -s "${GPU_PCI}" | grep -oP '10de:\w+' | head -1)
    if [[ -n "${GPU_AUDIO_PCI}" ]]; then
        GPU_AUDIO_DEVICE_ID=$(lspci -nn -s "${GPU_AUDIO_PCI}" | grep -oP '10de:\w+' | head -1)
    fi

    # Get GPU name
    GPU_NAME=$(lspci -s "${GPU_PCI}" | sed 's/.*: //')

    log_success "Detected NVIDIA GPU: ${GPU_NAME}"
    log_info "  PCI Address: ${GPU_PCI}"
    log_info "  Device ID: ${GPU_DEVICE_ID}"
    if [[ -n "${GPU_AUDIO_PCI:-}" ]]; then
        log_info "  Audio PCI: ${GPU_AUDIO_PCI}"
    fi
}

# Install NVIDIA container toolkit
install_nvidia_toolkit() {
    if [[ "${GPU_DETECTED}" != "true" ]]; then
        return
    fi

    log_step "Installing NVIDIA container toolkit"

    if command -v nvidia-ctk &> /dev/null; then
        log_warn "nvidia-container-toolkit is already installed"
    else
        log_info "Adding NVIDIA apt repository..."
        curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
            gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg --yes

        curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
            sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
            tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null

        log_info "Installing nvidia-container-toolkit..."
        apt-get update -qq
        apt-get install -y -qq nvidia-container-toolkit
    fi

    log_success "nvidia-container-toolkit installed"
}

# Configure NVIDIA for k3s
configure_nvidia_k3s() {
    if [[ "${GPU_DETECTED}" != "true" ]]; then
        return
    fi

    log_step "Configuring NVIDIA for k3s"

    # Symlink k3s runc
    local k3s_runc="/var/lib/rancher/k3s/data/current/bin/runc"
    if [[ -f "${k3s_runc}" ]] && [[ ! -f "/usr/local/bin/runc" ]]; then
        ln -sf "${k3s_runc}" /usr/local/bin/runc
        log_success "Symlinked k3s runc to /usr/local/bin/runc"
    fi

    # Generate CDI config
    log_info "Generating CDI config..."
    mkdir -p /etc/cdi
    if nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml 2>/dev/null; then
        log_success "CDI config generated at /etc/cdi/nvidia.yaml"
    else
        log_warn "Could not generate CDI config (nvidia driver may not be loaded)"
    fi

    # Configure k3s containerd with nvidia runtime
    log_info "Configuring k3s containerd with nvidia runtime..."
    local containerd_dir="/var/lib/rancher/k3s/agent/etc/containerd"
    mkdir -p "${containerd_dir}"
    
    # Check if config already has nvidia runtime
    if [[ -f "${containerd_dir}/config.toml.tmpl" ]] && grep -q "runtimes.nvidia" "${containerd_dir}/config.toml.tmpl" 2>/dev/null; then
        log_warn "nvidia runtime already configured in containerd"
    else
        cat > "${containerd_dir}/config.toml.tmpl" << 'CONTAINERD_EOF'
{{ template "base" . }}

[plugins."io.containerd.cri.v1.runtime".containerd.runtimes.nvidia]
  runtime_type = "io.containerd.runc.v2"

[plugins."io.containerd.cri.v1.runtime".containerd.runtimes.nvidia.options]
  BinaryName = "/usr/bin/nvidia-container-runtime"
CONTAINERD_EOF
        log_success "nvidia runtime added to containerd config"
        
        # Restart k3s to apply containerd config
        log_info "Restarting k3s to apply containerd config..."
        systemctl restart k3s
        
        # Wait for k3s to be ready again
        local retries=60
        while [[ $retries -gt 0 ]]; do
            if kubectl get nodes &> /dev/null; then
                local status=$(kubectl get nodes -o jsonpath='{.items[0].status.conditions[?(@.type=="Ready")].status}' 2>/dev/null)
                if [[ "${status}" == "True" ]]; then
                    break
                fi
            fi
            sleep 2
            ((retries--))
        done
        
        if [[ $retries -eq 0 ]]; then
            log_warn "k3s taking longer than expected to restart, continuing anyway..."
        fi
    fi

    # Create nvidia RuntimeClass
    log_info "Creating nvidia RuntimeClass..."
    kubectl apply -f - <<EOF
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: nvidia
handler: nvidia
EOF
    log_success "nvidia RuntimeClass created"

    # Deploy nvidia device plugin
    log_info "Deploying nvidia device plugin..."
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: nvidia-device-plugin-daemonset
  namespace: kube-system
spec:
  selector:
    matchLabels:
      name: nvidia-device-plugin-ds
  updateStrategy:
    type: RollingUpdate
  template:
    metadata:
      labels:
        name: nvidia-device-plugin-ds
    spec:
      runtimeClassName: nvidia
      tolerations:
      - key: nvidia.com/gpu
        operator: Exists
        effect: NoSchedule
      priorityClassName: system-node-critical
      containers:
      - image: nvcr.io/nvidia/k8s-device-plugin:${NVIDIA_DEVICE_PLUGIN_VERSION}
        name: nvidia-device-plugin-ctr
        env:
        - name: FAIL_ON_INIT_ERROR
          value: "false"
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop: ["ALL"]
        volumeMounts:
        - name: device-plugin
          mountPath: /var/lib/kubelet/device-plugins
      volumes:
      - name: device-plugin
        hostPath:
          path: /var/lib/kubelet/device-plugins
EOF
    log_success "nvidia device plugin deployed"
}

# Generate GPU mode switching scripts
generate_gpu_scripts() {
    if [[ "${GPU_DETECTED}" != "true" ]]; then
        return
    fi

    log_step "Generating GPU mode switching scripts"

    local gpu_pci="${GPU_PCI}"
    local audio_pci="${GPU_AUDIO_PCI:-}"
    local gpu_devid="${GPU_DEVICE_ID}"
    local audio_devid="${GPU_AUDIO_DEVICE_ID:-}"

    # gpu-mode-nvidia script
    cat > /usr/local/bin/gpu-mode-nvidia <<SCRIPT
#!/bin/bash
# Switch GPU to nvidia mode (for containers)
# Auto-generated by uvacompute node install
set -e

GPU_PCI="${gpu_pci}"
AUDIO_PCI="${audio_pci}"

echo "Switching GPU to nvidia mode..."

# Unbind from vfio-pci if bound
if [ -e /sys/bus/pci/drivers/vfio-pci/\${GPU_PCI} ]; then
    echo "\${GPU_PCI}" > /sys/bus/pci/drivers/vfio-pci/unbind 2>/dev/null || true
fi
if [ -n "\${AUDIO_PCI}" ] && [ -e /sys/bus/pci/drivers/vfio-pci/\${AUDIO_PCI} ]; then
    echo "\${AUDIO_PCI}" > /sys/bus/pci/drivers/vfio-pci/unbind 2>/dev/null || true
fi

# Unload nvidia modules first (in case of bad state)
rmmod nvidia_uvm nvidia_drm nvidia_modeset nvidia 2>/dev/null || true

# Reset the GPU if possible
if [ -e /sys/bus/pci/devices/\${GPU_PCI}/reset ]; then
    echo 1 > /sys/bus/pci/devices/\${GPU_PCI}/reset 2>/dev/null || true
fi

# Set driver override to nvidia
echo "nvidia" > /sys/bus/pci/devices/\${GPU_PCI}/driver_override

# Load nvidia modules
modprobe nvidia
modprobe nvidia_uvm

# Probe the device
echo "\${GPU_PCI}" > /sys/bus/pci/drivers_probe 2>/dev/null || true

sleep 2

# Verify
if nvidia-smi > /dev/null 2>&1; then
    echo "✓ GPU is now in nvidia mode"
    nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
else
    echo "✗ Failed to switch to nvidia mode"
    exit 1
fi
SCRIPT
    chmod +x /usr/local/bin/gpu-mode-nvidia

    # gpu-mode-vfio script
    cat > /usr/local/bin/gpu-mode-vfio <<SCRIPT
#!/bin/bash
# Switch GPU to vfio mode (for VM passthrough)
# Auto-generated by uvacompute node install
set -e

GPU_PCI="${gpu_pci}"
AUDIO_PCI="${audio_pci}"
GPU_DEVID="${gpu_devid}"
AUDIO_DEVID="${audio_devid}"

echo "Switching GPU to vfio mode..."

# Stop nvidia device plugin first
kubectl delete daemonset nvidia-device-plugin-daemonset -n kube-system 2>/dev/null || true
sleep 2

# Unload nvidia modules
rmmod nvidia_uvm nvidia_drm nvidia_modeset nvidia 2>/dev/null || true

# Unbind from nvidia if bound
if [ -e /sys/bus/pci/drivers/nvidia/\${GPU_PCI} ]; then
    echo "\${GPU_PCI}" > /sys/bus/pci/drivers/nvidia/unbind 2>/dev/null || true
fi

# Clear driver override
echo "" > /sys/bus/pci/devices/\${GPU_PCI}/driver_override 2>/dev/null || true
if [ -n "\${AUDIO_PCI}" ]; then
    echo "" > /sys/bus/pci/devices/\${AUDIO_PCI}/driver_override 2>/dev/null || true
fi

# Load vfio modules
modprobe vfio
modprobe vfio_pci
modprobe vfio_iommu_type1

# Bind to vfio-pci
echo "\${GPU_DEVID}" > /sys/bus/pci/drivers/vfio-pci/new_id 2>/dev/null || true
if [ -n "\${AUDIO_DEVID}" ]; then
    echo "\${AUDIO_DEVID}" > /sys/bus/pci/drivers/vfio-pci/new_id 2>/dev/null || true
fi

echo "\${GPU_PCI}" > /sys/bus/pci/drivers/vfio-pci/bind 2>/dev/null || true
if [ -n "\${AUDIO_PCI}" ]; then
    echo "\${AUDIO_PCI}" > /sys/bus/pci/drivers/vfio-pci/bind 2>/dev/null || true
fi

sleep 1

# Verify
if lspci -nnk -s \${GPU_PCI} | grep -q "vfio-pci"; then
    echo "✓ GPU is now in vfio mode (ready for VM passthrough)"
    lspci -nnk -s \${GPU_PCI} | grep -E "VGA|driver"
else
    echo "✗ Failed to switch to vfio mode"
    exit 1
fi
SCRIPT
    chmod +x /usr/local/bin/gpu-mode-vfio

    # gpu-mode-status script
    cat > /usr/local/bin/gpu-mode-status <<SCRIPT
#!/bin/bash
# Show current GPU mode
# Auto-generated by uvacompute node install

GPU_PCI="${gpu_pci}"

echo "=== GPU Mode Status ==="
echo

DRIVER=\$(lspci -nnk -s \${GPU_PCI} | grep "driver in use" | awk '{print \$NF}')

case "\${DRIVER}" in
    nvidia)
        echo "Mode: NVIDIA (Container mode)"
        echo "- Kubernetes containers can use the GPU"
        echo "- KubeVirt VM passthrough NOT available"
        echo
        nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>/dev/null || echo "nvidia-smi not available"
        ;;
    vfio-pci)
        echo "Mode: VFIO (VM passthrough mode)"
        echo "- KubeVirt VMs can use GPU passthrough"
        echo "- Kubernetes containers CANNOT use the GPU"
        echo
        lspci -nnk -s \${GPU_PCI} | grep -E "VGA|driver"
        ;;
    *)
        echo "Mode: Unknown (driver: \${DRIVER:-none})"
        lspci -nnk -s \${GPU_PCI}
        ;;
esac

echo
echo "To switch modes:"
echo "  sudo gpu-mode-nvidia  # For container GPU access"
echo "  sudo gpu-mode-vfio    # For VM GPU passthrough"
SCRIPT
    chmod +x /usr/local/bin/gpu-mode-status

    log_success "GPU mode scripts created at /usr/local/bin/"
    log_info "  gpu-mode-nvidia - Switch to container mode"
    log_info "  gpu-mode-vfio   - Switch to VM passthrough mode"
    log_info "  gpu-mode-status - Show current mode"
}

# Save installation state
save_state() {
    log_step "Saving installation state"

    # Get actual user's home directory (not root's)
    local actual_home
    if [[ -n "${SUDO_USER:-}" ]]; then
        actual_home=$(getent passwd "${SUDO_USER}" | cut -d: -f6)
    else
        actual_home="${HOME}"
    fi

    local config_dir="${actual_home}/.uvacompute/node"
    mkdir -p "${config_dir}"

    # Get versions
    local k3s_version
    k3s_version=$(k3s --version | head -1 | awk '{print $3}')

    # Save config
    cat > "${config_dir}/config.yaml" <<EOF
node_id: $(hostname)
install_date: $(date -Iseconds)
k3s_version: ${k3s_version}
kubevirt_version: ${KUBEVIRT_VERSION}
EOF

    # Save state
    cat > "${config_dir}/install-state.yaml" <<EOF
installed: true
components:
  - k3s
  - kubevirt
  - uvacompute-namespace
EOF

    if [[ "${GPU_DETECTED}" == "true" ]]; then
        cat >> "${config_dir}/install-state.yaml" <<EOF
  - nvidia-container-toolkit
  - nvidia-device-plugin
  - gpu-scripts
gpu_detected: true
gpu_pci: ${GPU_PCI}
gpu_audio_pci: ${GPU_AUDIO_PCI:-}
gpu_device_id: ${GPU_DEVICE_ID}
gpu_name: "${GPU_NAME}"
EOF
    else
        echo "gpu_detected: false" >> "${config_dir}/install-state.yaml"
    fi

    # Fix ownership
    if [[ -n "${SUDO_USER:-}" ]]; then
        chown -R "${SUDO_USER}:${SUDO_USER}" "${actual_home}/.uvacompute"
    fi

    log_success "State saved to ${config_dir}/"
}

# Print summary
print_summary() {
    echo
    echo -e "${GREEN}${BOLD}========================================${NC}"
    echo -e "${GREEN}${BOLD}  uvacompute Node Installation Complete ${NC}"
    echo -e "${GREEN}${BOLD}========================================${NC}"
    echo
    echo -e "${BOLD}Installed components:${NC}"
    echo "  • k3s (Kubernetes)"
    echo "  • KubeVirt ${KUBEVIRT_VERSION}"
    if [[ "${GPU_DETECTED}" == "true" ]]; then
        echo "  • nvidia-container-toolkit"
        echo "  • nvidia device plugin"
        echo "  • GPU mode switching scripts"
    fi
    echo
    echo -e "${BOLD}Next steps:${NC}"
    echo "  1. Run 'uva node status' to verify installation"
    if [[ "${GPU_DETECTED}" == "true" ]]; then
        echo "  2. Run 'sudo gpu-mode-status' to check GPU mode"
        echo "  3. Run 'sudo gpu-mode-nvidia' to enable GPU for containers"
    fi
    echo
}

# Main
main() {
    echo -e "${BOLD}"
    echo "╔════════════════════════════════════════╗"
    echo "║   uvacompute Node Installation Script  ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"

    check_root
    detect_os
    check_prerequisites
    install_k3s
    install_kubevirt
    create_namespace
    detect_gpu
    install_nvidia_toolkit
    configure_nvidia_k3s
    generate_gpu_scripts
    save_state
    print_summary
}

main "$@"
