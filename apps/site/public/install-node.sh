#!/usr/bin/env bash
#
# uvacompute Node Installation Script (Agent Mode)
#
# This script installs a k3s agent that joins the uvacompute hub cluster,
# sets up GPU support if available, and establishes an SSH tunnel for access.
#
# Usage: curl -fsSL https://uvacompute.com/install-node.sh | sudo bash -s -- --token YOUR_TOKEN
#

set -euo pipefail

# Configuration
NVIDIA_DEVICE_PLUGIN_VERSION="v0.17.0"
SITE_URL="${SITE_URL:-https://uvacompute.com}"
SERVICE_DIR="/opt/uvacompute"
SSH_KEY_PATH="/root/.ssh/id_ed25519_uvacompute"
REGISTRATION_TOKEN=""

# These are set after registration
K3S_URL=""
K3S_TOKEN=""
TUNNEL_HOST=""
TUNNEL_PORT=""

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

    for cmd in curl systemctl lspci jq; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing required commands: ${missing[*]}"
        log_info "Installing missing dependencies..."
        apt-get update -qq
        apt-get install -y -qq curl systemd pciutils jq
    fi

    log_success "All prerequisites satisfied"
}

# Generate SSH keypair for DO VPS tunnel
generate_ssh_key() {
    log_step "Generating SSH keypair for tunnel"

    if [[ -f "${SSH_KEY_PATH}" ]]; then
        log_warn "SSH key already exists at ${SSH_KEY_PATH}"
    else
        mkdir -p "$(dirname "${SSH_KEY_PATH}")"
        ssh-keygen -t ed25519 -f "${SSH_KEY_PATH}" -N "" -C "uvacompute-node@$(hostname)"
        log_success "SSH keypair generated at ${SSH_KEY_PATH}"
    fi

    SSH_PUBLIC_KEY=$(cat "${SSH_KEY_PATH}.pub")
}

# Register node with the platform and get k3s credentials
register_node() {
    if [[ -z "${REGISTRATION_TOKEN}" ]]; then
        die "Registration token is required. Use --token YOUR_TOKEN"
    fi

    log_step "Registering node with uvacompute platform"

    local node_id
    node_id=$(hostname)

    local cpus
    cpus=$(nproc)

    local ram
    ram=$(free -g | awk '/^Mem:/{print $2}')

    local gpus=0
    if lspci | grep -qi nvidia; then
        gpus=$(lspci | grep -ci 'vga.*nvidia' || echo 0)
    fi

    log_info "Registering as node: ${node_id}"
    log_info "  CPUs: ${cpus}"
    log_info "  RAM: ${ram}GB"
    log_info "  GPUs: ${gpus}"

    local response
    response=$(curl -sf -X POST "${SITE_URL}/api/nodes/bootstrap" \
        -H "Content-Type: application/json" \
        -d "{
            \"token\": \"${REGISTRATION_TOKEN}\",
            \"sshPublicKey\": \"${SSH_PUBLIC_KEY}\",
            \"nodeId\": \"${node_id}\",
            \"name\": \"${node_id}\",
            \"cpus\": ${cpus},
            \"ram\": ${ram},
            \"gpus\": ${gpus}
        }" 2>&1) || {
        log_error "Failed to register node with platform"
        log_error "Response: ${response}"
        die "Registration failed. Check your token and try again."
    }

    # Parse response
    local success
    success=$(echo "${response}" | jq -r '.success')
    
    if [[ "${success}" != "true" ]]; then
        local error_msg
        error_msg=$(echo "${response}" | jq -r '.error // "Unknown error"')
        die "Registration failed: ${error_msg}"
    fi

    TUNNEL_HOST=$(echo "${response}" | jq -r '.tunnelHost')
    TUNNEL_PORT=$(echo "${response}" | jq -r '.tunnelPort')
    K3S_URL=$(echo "${response}" | jq -r '.k3sUrl')
    K3S_TOKEN=$(echo "${response}" | jq -r '.k3sToken')

    if [[ -z "${K3S_URL}" || "${K3S_URL}" == "null" ]]; then
        die "Invalid response from bootstrap API: missing k3sUrl"
    fi

    if [[ -z "${K3S_TOKEN}" || "${K3S_TOKEN}" == "null" ]]; then
        die "Invalid response from bootstrap API: missing k3sToken"
    fi

    log_success "Node registered successfully!"
    log_info "  Tunnel Host: ${TUNNEL_HOST}"
    log_info "  Tunnel Port: ${TUNNEL_PORT}"
    log_info "  K3S URL: ${K3S_URL}"

    # Save node config
    mkdir -p "${SERVICE_DIR}"
    cat > "${SERVICE_DIR}/node-config.yaml" <<EOF
nodeId: ${node_id}
tunnelHost: ${TUNNEL_HOST}
tunnelPort: ${TUNNEL_PORT}
k3sUrl: ${K3S_URL}
sshKeyPath: ${SSH_KEY_PATH}
registeredAt: $(date -Iseconds)
EOF

    log_success "Node config saved to ${SERVICE_DIR}/node-config.yaml"
}

# Install k3s agent (joins hub cluster)
install_k3s_agent() {
    log_step "Installing k3s agent"

    if command -v k3s &> /dev/null; then
        log_warn "k3s is already installed"
        local version
        version=$(k3s --version | head -1 | awk '{print $3}')
        log_info "Current version: ${version}"
        
        # Check if it's running as agent
        if systemctl is-active k3s-agent &> /dev/null; then
            log_info "k3s agent is already running"
            return
        elif systemctl is-active k3s &> /dev/null; then
            log_warn "k3s server is running. You may need to uninstall first."
            log_warn "Run: sudo /usr/local/bin/k3s-uninstall.sh"
            die "Cannot install agent when server is running"
        fi
    fi

    log_info "Downloading and installing k3s agent..."
    log_info "  Joining cluster at: ${K3S_URL}"
    
    curl -sfL https://get.k3s.io | K3S_URL="${K3S_URL}" K3S_TOKEN="${K3S_TOKEN}" sh -s - agent

    log_info "Waiting for k3s agent to be ready..."
    local retries=30
    while [[ $retries -gt 0 ]]; do
        if systemctl is-active k3s-agent &> /dev/null; then
            break
        fi
        sleep 2
        ((retries--))
    done

    if [[ $retries -eq 0 ]]; then
        die "k3s agent failed to start within timeout"
    fi

    local k3s_version
    k3s_version=$(k3s --version | head -1 | awk '{print $3}')
    log_success "k3s agent installed and running (${k3s_version})"
}

# Label the node with resources
label_node() {
    log_step "Labeling node with resources"

    local node_id
    node_id=$(hostname)

    local cpus
    cpus=$(nproc)

    local ram
    ram=$(free -g | awk '/^Mem:/{print $2}')

    local gpu_label="none"
    if [[ "${GPU_DETECTED}" == "true" ]]; then
        # Parse GPU name to create a label-friendly string
        # e.g., "NVIDIA GeForce RTX 5090" -> "nvidia-rtx-5090"
        gpu_label=$(echo "${GPU_NAME}" | tr '[:upper:]' '[:lower:]' | sed 's/nvidia geforce /nvidia-/g' | sed 's/ /-/g' | sed 's/[^a-z0-9-]//g')
    fi

    log_info "Applying labels to node ${node_id}:"
    log_info "  uvacompute.com/cpus=${cpus}"
    log_info "  uvacompute.com/ram=${ram}"
    log_info "  uvacompute.com/gpu=${gpu_label}"

    # We need to use the hub's kubectl, so we'll create a script that runs on the hub
    # via SSH tunnel. For now, we'll create a label script that can be run from the hub.
    
    # Save label info for hub to apply
    cat > "${SERVICE_DIR}/node-labels.yaml" <<EOF
nodeId: ${node_id}
labels:
  uvacompute.com/cpus: "${cpus}"
  uvacompute.com/ram: "${ram}"
  uvacompute.com/gpu: "${gpu_label}"
EOF

    log_success "Node labels saved to ${SERVICE_DIR}/node-labels.yaml"
    log_info "Labels will be applied when the node joins the cluster"
    
    # Try to apply labels via the hub (if we can reach it)
    # The hub's kubectl can label the node once it appears
    log_info "Waiting for node to appear in cluster..."
    local retries=60
    local labeled=false
    
    while [[ $retries -gt 0 ]]; do
        # Try to SSH to hub and label the node
        if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "${SSH_KEY_PATH}" \
            "root@${TUNNEL_HOST}" \
            "kubectl get node ${node_id} &>/dev/null && kubectl label node ${node_id} uvacompute.com/cpus=${cpus} uvacompute.com/ram=${ram} uvacompute.com/gpu=${gpu_label} --overwrite" 2>/dev/null; then
            labeled=true
            break
        fi
        sleep 5
        ((retries--))
    done

    if [[ "${labeled}" == "true" ]]; then
        log_success "Node labels applied successfully"
    else
        log_warn "Could not apply labels automatically. Run this on the hub:"
        log_warn "  kubectl label node ${node_id} uvacompute.com/cpus=${cpus} uvacompute.com/ram=${ram} uvacompute.com/gpu=${gpu_label} --overwrite"
    fi
}

# Detect NVIDIA GPU
detect_gpu() {
    log_step "Detecting GPU"

    if ! lspci | grep -qi nvidia; then
        log_info "No NVIDIA GPU detected"
        GPU_DETECTED=false
        GPU_NAME=""
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

# Configure NVIDIA for k3s agent
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
        
        # Restart k3s-agent to apply containerd config
        log_info "Restarting k3s-agent to apply containerd config..."
        systemctl restart k3s-agent
        
        # Wait for k3s-agent to be ready again
        local retries=60
        while [[ $retries -gt 0 ]]; do
            if systemctl is-active k3s-agent &> /dev/null; then
                break
            fi
            sleep 2
            ((retries--))
        done
        
        if [[ $retries -eq 0 ]]; then
            log_warn "k3s-agent taking longer than expected to restart, continuing anyway..."
        fi
    fi

    log_success "NVIDIA configured for k3s agent"
    log_info "Note: RuntimeClass and device plugin are managed by the hub"
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

# Set up SSH tunnel service
setup_ssh_tunnel() {
    log_step "Setting up SSH tunnel service"

    # Add DO VPS to known_hosts
    log_info "Adding hub to known_hosts..."
    mkdir -p /root/.ssh
    ssh-keyscan -H "${TUNNEL_HOST}" >> /root/.ssh/known_hosts 2>/dev/null || true

    # Install autossh if not present
    if ! command -v autossh &> /dev/null; then
        log_info "Installing autossh..."
        apt-get update -qq
        apt-get install -y -qq autossh
    fi

    # Create systemd service for SSH tunnel
    cat > /etc/systemd/system/uvacompute-tunnel.service <<EOF
[Unit]
Description=uvacompute SSH Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/autossh -M 0 -N -o "ServerAliveInterval 30" -o "ServerAliveCountMax 3" -o "ExitOnForwardFailure yes" -o "StrictHostKeyChecking no" -i ${SSH_KEY_PATH} -R ${TUNNEL_PORT}:localhost:22 root@${TUNNEL_HOST}
Restart=always
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable uvacompute-tunnel
    systemctl start uvacompute-tunnel

    # Verify tunnel is running
    sleep 2
    if systemctl is-active uvacompute-tunnel &> /dev/null; then
        log_success "SSH tunnel service started"
    else
        log_warn "SSH tunnel service may not have started correctly"
        log_warn "Check with: sudo journalctl -u uvacompute-tunnel"
    fi
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
install_mode: agent
hub_url: ${K3S_URL}
EOF

    # Save state
    cat > "${config_dir}/install-state.yaml" <<EOF
installed: true
install_mode: agent
components:
  - k3s-agent
  - ssh-tunnel
EOF

    if [[ "${GPU_DETECTED}" == "true" ]]; then
        cat >> "${config_dir}/install-state.yaml" <<EOF
  - nvidia-container-toolkit
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
    echo "  • k3s agent (joined hub cluster)"
    echo "  • SSH tunnel to hub"
    if [[ "${GPU_DETECTED}" == "true" ]]; then
        echo "  • nvidia-container-toolkit"
        echo "  • GPU mode switching scripts"
    fi
    echo
    echo -e "${BOLD}Node info:${NC}"
    echo "  • Node ID: $(hostname)"
    echo "  • Hub URL: ${K3S_URL}"
    echo "  • Tunnel Port: ${TUNNEL_PORT}"
    echo
    echo -e "${BOLD}Useful commands:${NC}"
    echo "  • Check tunnel: sudo systemctl status uvacompute-tunnel"
    echo "  • Check k3s agent: sudo systemctl status k3s-agent"
    if [[ "${GPU_DETECTED}" == "true" ]]; then
        echo "  • GPU mode: sudo gpu-mode-status"
    fi
    echo
    echo -e "${BOLD}On the hub, verify with:${NC}"
    echo "  • kubectl get nodes"
    echo "  • kubectl describe node $(hostname)"
    echo
}

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --token)
                REGISTRATION_TOKEN="$2"
                shift 2
                ;;
            --token=*)
                REGISTRATION_TOKEN="${1#*=}"
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --token TOKEN    Registration token for platform enrollment (required)"
                echo "  --help, -h       Show this help message"
                echo ""
                echo "Example:"
                echo "  curl -fsSL https://uvacompute.com/install-node.sh | sudo bash -s -- --token abc123"
                exit 0
                ;;
            *)
                log_warn "Unknown option: $1"
                shift
                ;;
        esac
    done

    if [[ -z "${REGISTRATION_TOKEN}" ]]; then
        die "Registration token is required. Use --token YOUR_TOKEN"
    fi
}

# Main
main() {
    parse_args "$@"

    echo -e "${BOLD}"
    echo "╔════════════════════════════════════════╗"
    echo "║   uvacompute Node Installation Script  ║"
    echo "║          (Agent Mode)                  ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"

    check_root
    detect_os
    check_prerequisites
    generate_ssh_key
    register_node
    install_k3s_agent
    detect_gpu
    install_nvidia_toolkit
    configure_nvidia_k3s
    generate_gpu_scripts
    setup_ssh_tunnel
    label_node
    save_state
    print_summary
}

main "$@"
