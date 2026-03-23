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
SERVICE_DIR="/etc/uvacompute"
SSH_KEY_PATH="/root/.ssh/id_ed25519_uvacompute"
REGISTRATION_TOKEN=""
NONINTERACTIVE="${NONINTERACTIVE:-false}"

# Storage configuration
STORAGE_PATH="/var/lib/uvacompute/storage"
STORAGE_SIZE_GB=0
STORAGE_TYPE="unknown"
STORAGE_DEVICE=""
STORAGE_ALLOCATION_GB=0

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
        fedora)
            log_info "Detected OS: ${OS_NAME}"
            ;;
        arch)
            log_info "Detected OS: ${OS_NAME}"
            ;;
        gentoo)
            log_warn "Detected OS: ${OS_NAME} (experimental support)"
            ;;
        *)
            die "Unsupported OS: ${OS_NAME}. Supported: Ubuntu, Debian, Fedora, Arch, Gentoo."
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
        case "${OS_ID}" in
            ubuntu|debian)
                apt-get update -qq
                apt-get install -y -qq curl systemd pciutils jq
                ;;
            fedora)
                dnf install -y curl systemd pciutils jq
                ;;
            arch)
                pacman -Sy --noconfirm curl pciutils jq
                ;;
            gentoo)
                emerge --ask=n net-misc/curl sys-apps/pciutils app-misc/jq
                ;;
        esac
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
    local gpu_type="none"
    if lspci | grep -qi nvidia; then
        gpus=$(lspci | grep -ci 'vga.*nvidia' || echo 0)
        # Get GPU name and format as type (e.g., "nvidia-rtx-5090")
        local gpu_name
        gpu_name=$(lspci | grep -i 'vga.*nvidia' | head -1 | sed 's/.*: //')
        if [[ -n "${gpu_name}" ]]; then
            gpu_type=$(echo "${gpu_name}" | tr '[:upper:]' '[:lower:]' | sed 's/nvidia corporation /nvidia-/g' | sed 's/nvidia geforce /nvidia-/g' | sed 's/ /-/g' | sed 's/[^a-z0-9-]//g')
        fi
    fi

    log_info "Registering as node: ${node_id}"
    log_info "  CPUs: ${cpus}"
    log_info "  RAM: ${ram}GB"
    log_info "  GPUs: ${gpus}"
    log_info "  GPU Type: ${gpu_type}"

    local gpu_mode="nvidia"
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
            \"gpus\": ${gpus},
            \"gpuType\": \"${gpu_type}\",
            \"gpuMode\": \"${gpu_mode}\",
            \"storage\": ${STORAGE_ALLOCATION_GB},
            \"storageType\": \"${STORAGE_TYPE}\",
            \"supportsVMs\": true,
            \"supportsJobs\": true
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
    VMPROXY_PUBLIC_KEY=$(echo "${response}" | jq -r '.vmproxyPublicKey')
    HUB_KUBECONFIG_B64=$(echo "${response}" | jq -r '.hubKubeconfig')
    ORCHESTRATION_SECRET=$(echo "${response}" | jq -r '.orchestrationSecret')
    NODE_SECRET=$(echo "${response}" | jq -r '.nodeSecret')

    if [[ -z "${K3S_URL}" || "${K3S_URL}" == "null" ]]; then
        die "Invalid response from bootstrap API: missing k3sUrl"
    fi

    if [[ -z "${K3S_TOKEN}" || "${K3S_TOKEN}" == "null" ]]; then
        die "Invalid response from bootstrap API: missing k3sToken"
    fi

    if [[ -z "${VMPROXY_PUBLIC_KEY}" || "${VMPROXY_PUBLIC_KEY}" == "null" ]]; then
        die "Invalid response from bootstrap API: missing vmproxyPublicKey"
    fi

    if [[ -z "${HUB_KUBECONFIG_B64}" || "${HUB_KUBECONFIG_B64}" == "null" ]]; then
        die "Invalid response from bootstrap API: missing hubKubeconfig"
    fi

    if [[ -z "${ORCHESTRATION_SECRET}" || "${ORCHESTRATION_SECRET}" == "null" ]]; then
        die "Invalid response from bootstrap API: missing orchestrationSecret"
    fi

    if [[ -z "${NODE_SECRET}" || "${NODE_SECRET}" == "null" ]]; then
        die "Invalid response from bootstrap API: missing nodeSecret"
    fi

    # Store secrets for API authentication
    mkdir -p /etc/uvacompute

    # Store per-node secret for node-specific API calls (preferred)
    echo "${NODE_SECRET}" > /etc/uvacompute/node-secret
    chmod 600 /etc/uvacompute/node-secret
    log_info "Node secret stored at /etc/uvacompute/node-secret"

    # Store orchestration secret for legacy compatibility
    echo "${ORCHESTRATION_SECRET}" > /etc/uvacompute/orchestration-secret
    chmod 600 /etc/uvacompute/orchestration-secret
    log_info "Orchestration secret stored at /etc/uvacompute/orchestration-secret"

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

    # Configure kubelet: cgroup driver + image GC (prune unused images at 70% disk usage)
    if ! grep -q "image-gc-high-threshold" /etc/systemd/system/k3s-agent.service.env 2>/dev/null; then
        log_info "Configuring kubelet args..."
        sed -i '/^K3S_KUBELET_ARG/d' /etc/systemd/system/k3s-agent.service.env 2>/dev/null || true
        echo 'K3S_KUBELET_ARG=--cgroup-driver=systemd --image-gc-high-threshold=70 --image-gc-low-threshold=50' >> /etc/systemd/system/k3s-agent.service.env
        systemctl daemon-reload
        systemctl restart k3s-agent
    fi

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
    local has_gpu="false"
    if [[ "${GPU_DETECTED}" == "true" ]]; then
        # Parse GPU name to create a label-friendly string
        # e.g., "NVIDIA GeForce RTX 5090" -> "nvidia-rtx-5090"
        gpu_label=$(echo "${GPU_NAME}" | tr '[:upper:]' '[:lower:]' | sed 's/nvidia geforce /nvidia-/g' | sed 's/ /-/g' | sed 's/[^a-z0-9-]//g')
        has_gpu="true"
    fi

    local gpu_mode="nvidia"  # Default to nvidia mode (for containers)

    log_info "Applying labels to node ${node_id}:"
    log_info "  uvacompute.com/cpus=${cpus}"
    log_info "  uvacompute.com/ram=${ram}"
    log_info "  uvacompute.com/gpu=${gpu_label}"
    log_info "  uvacompute.com/has-gpu=${has_gpu}"
    log_info "  uvacompute.com/storage=${STORAGE_ALLOCATION_GB}"
    log_info "  uvacompute.com/storage-type=${STORAGE_TYPE}"
    if [[ "${has_gpu}" == "true" ]]; then
        log_info "  uvacompute.com/gpu-mode=${gpu_mode}"
    fi

    # We need to use the hub's kubectl, so we'll create a script that runs on the hub
    # via SSH tunnel. For now, we'll create a label script that can be run from the hub.

    # Save label info for hub to apply
    cat > "${SERVICE_DIR}/node-labels.yaml" <<EOF
nodeId: ${node_id}
labels:
  uvacompute.com/cpus: "${cpus}"
  uvacompute.com/ram: "${ram}"
  uvacompute.com/gpu: "${gpu_label}"
  uvacompute.com/has-gpu: "${has_gpu}"
  uvacompute.com/gpu-mode: "${gpu_mode}"
  uvacompute.com/storage: "${STORAGE_ALLOCATION_GB}"
  uvacompute.com/storage-type: "${STORAGE_TYPE}"
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
            "kubectl get node ${node_id} &>/dev/null && kubectl label node ${node_id} uvacompute.com/cpus=${cpus} uvacompute.com/ram=${ram} uvacompute.com/gpu=${gpu_label} uvacompute.com/has-gpu=${has_gpu} uvacompute.com/gpu-mode=${gpu_mode} uvacompute.com/storage=${STORAGE_ALLOCATION_GB} uvacompute.com/storage-type=${STORAGE_TYPE} --overwrite" 2>/dev/null; then
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
        log_warn "  kubectl label node ${node_id} uvacompute.com/cpus=${cpus} uvacompute.com/ram=${ram} uvacompute.com/gpu=${gpu_label} uvacompute.com/has-gpu=${has_gpu} uvacompute.com/gpu-mode=${gpu_mode} uvacompute.com/storage=${STORAGE_ALLOCATION_GB} uvacompute.com/storage-type=${STORAGE_TYPE} --overwrite"
    fi
}

# Configure local-path provisioner to use our storage directory
configure_storage_provisioner() {
    log_step "Configuring storage provisioner path"

    local config_json="{\\\"nodePathMap\\\":[{\\\"node\\\":\\\"DEFAULT_PATH_FOR_NON_LISTED_NODES\\\",\\\"paths\\\":[\\\"${STORAGE_PATH}\\\"]}]}"

    # k3s built-in local-path-provisioner uses kube-system namespace
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "${SSH_KEY_PATH}" \
        "root@${TUNNEL_HOST}" \
        "kubectl patch configmap local-path-config -n kube-system --type=merge -p '{\"data\":{\"config.json\":\"${config_json}\"}}'" 2>/dev/null; then
        log_success "Storage provisioner configured to use ${STORAGE_PATH}"
    else
        log_warn "Could not configure storage provisioner. PVCs may use default k3s path."
    fi
}

# Detect NVIDIA GPUs
detect_gpu() {
    log_step "Detecting GPU"

    if ! lspci | grep -qi nvidia; then
        log_info "No NVIDIA GPU detected"
        GPU_DETECTED=false
        GPU_NAME=""
        GPU_COUNT=0
        return
    fi

    GPU_DETECTED=true

    GPU_PCIS=($(lspci -D | grep -i 'vga.*nvidia' | awk '{print $1}'))
    GPU_AUDIO_PCIS=($(lspci -D | grep -i 'audio.*nvidia' | awk '{print $1}'))
    GPU_COUNT=${#GPU_PCIS[@]}

    GPU_DEVICE_IDS=()
    for pci in "${GPU_PCIS[@]}"; do
        GPU_DEVICE_IDS+=($(lspci -nn -s "${pci}" | grep -oP '10de:\w+' | head -1))
    done

    GPU_AUDIO_DEVICE_IDS=()
    for pci in "${GPU_AUDIO_PCIS[@]}"; do
        GPU_AUDIO_DEVICE_IDS+=($(lspci -nn -s "${pci}" | grep -oP '10de:\w+' | head -1))
    done

    GPU_NAME=$(lspci -s "${GPU_PCIS[0]}" | sed 's/.*: //')

    log_success "Detected ${GPU_COUNT} NVIDIA GPU(s): ${GPU_NAME}"
    for i in "${!GPU_PCIS[@]}"; do
        log_info "  GPU $i: PCI ${GPU_PCIS[$i]}, Device ID ${GPU_DEVICE_IDS[$i]}"
    done
}

# Storage detection and configuration
detect_storage() {
    log_step "Detecting storage devices"

    # Find best storage device (prefer NVMe > SSD > HDD)
    # Look for NVMe first
    if lsblk -d -o NAME,TYPE,ROTA 2>/dev/null | grep -q "nvme.*disk.*0"; then
        STORAGE_TYPE="nvme"
        STORAGE_DEVICE=$(lsblk -d -o NAME,TYPE,ROTA | grep "nvme.*disk.*0" | awk '{print $1}' | head -1)
    # Then SSD (ROTA=0 means no rotation = SSD)
    elif lsblk -d -o NAME,TYPE,ROTA 2>/dev/null | grep -E "^sd[a-z]+\s+disk\s+0$" | head -1 >/dev/null 2>&1; then
        STORAGE_TYPE="ssd"
        STORAGE_DEVICE=$(lsblk -d -o NAME,TYPE,ROTA | grep -E "^sd[a-z]+\s+disk\s+0$" | awk '{print $1}' | head -1)
    # Fall back to HDD
    elif lsblk -d -o NAME,TYPE,ROTA 2>/dev/null | grep -E "^sd[a-z]+\s+disk\s+1$" | head -1 >/dev/null 2>&1; then
        STORAGE_TYPE="hdd"
        STORAGE_DEVICE=$(lsblk -d -o NAME,TYPE,ROTA | grep -E "^sd[a-z]+\s+disk\s+1$" | awk '{print $1}' | head -1)
    fi

    if [[ -n "${STORAGE_DEVICE}" ]]; then
        # Get available space on the device's main partition
        local mount_point
        mount_point=$(lsblk -no MOUNTPOINT "/dev/${STORAGE_DEVICE}" 2>/dev/null | grep -v "^$" | head -1)
        if [[ -z "${mount_point}" ]]; then
            # Device might have partitions, check first partition
            mount_point=$(lsblk -no MOUNTPOINT "/dev/${STORAGE_DEVICE}1" 2>/dev/null | head -1)
        fi
        if [[ -z "${mount_point}" ]]; then
            mount_point="/"  # Fall back to root
        fi

        # Get available space in GB
        local avail_gb
        avail_gb=$(df -BG "${mount_point}" | awk 'NR==2 {gsub("G",""); print $4}')
        STORAGE_SIZE_GB=${avail_gb:-0}

        log_success "Detected storage: ${STORAGE_TYPE} (${STORAGE_DEVICE}) with ${STORAGE_SIZE_GB}GB available"
    else
        log_warn "No dedicated storage device detected, using root filesystem"
        STORAGE_TYPE="root"
        STORAGE_SIZE_GB=$(df -BG / | awk 'NR==2 {gsub("G",""); print $4}')
        log_info "Root filesystem has ${STORAGE_SIZE_GB}GB available"
    fi
}

prompt_storage_allocation() {
    if [[ "${NONINTERACTIVE}" == "true" ]]; then
        # Default to 50% of available space, minimum 50GB, max 500GB
        local default_alloc=$((STORAGE_SIZE_GB / 2))
        [[ ${default_alloc} -lt 50 ]] && default_alloc=50
        [[ ${default_alloc} -gt 500 ]] && default_alloc=500
        [[ ${default_alloc} -gt ${STORAGE_SIZE_GB} ]] && default_alloc=$((STORAGE_SIZE_GB - 10))
        STORAGE_ALLOCATION_GB=${default_alloc}
        log_info "Non-interactive mode: allocating ${STORAGE_ALLOCATION_GB}GB for VM storage"
        return
    fi

    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                   STORAGE ALLOCATION                        ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║ Storage type: ${STORAGE_TYPE}"
    echo "║ Available: ${STORAGE_SIZE_GB}GB"
    echo "║"
    echo "║ How much storage to allocate for VM disks?"
    echo "║ (Remaining space stays available for other uses)"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""

    local default_alloc=$((STORAGE_SIZE_GB / 2))
    [[ ${default_alloc} -lt 50 ]] && default_alloc=50
    [[ ${default_alloc} -gt ${STORAGE_SIZE_GB} ]] && default_alloc=$((STORAGE_SIZE_GB - 10))

    read -rp "Storage allocation in GB [${default_alloc}]: " input_storage
    STORAGE_ALLOCATION_GB=${input_storage:-${default_alloc}}

    # Validate
    if [[ ${STORAGE_ALLOCATION_GB} -gt ${STORAGE_SIZE_GB} ]]; then
        log_error "Cannot allocate more than available (${STORAGE_SIZE_GB}GB)"
        exit 1
    fi
    if [[ ${STORAGE_ALLOCATION_GB} -lt 20 ]]; then
        log_error "Minimum allocation is 20GB"
        exit 1
    fi

    log_success "Will allocate ${STORAGE_ALLOCATION_GB}GB for VM storage"
}

setup_storage_directory() {
    log_step "Setting up storage directory"

    mkdir -p "${STORAGE_PATH}"
    chmod 755 "${STORAGE_PATH}"

    # Store storage config
    cat > "${SERVICE_DIR}/storage-config.yaml" <<EOF
storagePath: ${STORAGE_PATH}
storageType: ${STORAGE_TYPE}
storageDevice: ${STORAGE_DEVICE}
allocationGB: ${STORAGE_ALLOCATION_GB}
configuredAt: $(date -Iseconds)
EOF

    log_success "Storage configured: ${STORAGE_ALLOCATION_GB}GB at ${STORAGE_PATH}"
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
        case "${OS_ID}" in
            ubuntu|debian)
                log_info "Adding NVIDIA apt repository..."
                curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
                    gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg --yes

                curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
                    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
                    tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null

                log_info "Installing nvidia-container-toolkit..."
                apt-get update -qq
                apt-get install -y -qq nvidia-container-toolkit
                ;;
            fedora)
                log_info "Adding NVIDIA RPM repository..."
                curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
                    tee /etc/yum.repos.d/nvidia-container-toolkit.repo > /dev/null

                log_info "Installing nvidia-container-toolkit..."
                dnf install -y nvidia-container-toolkit
                ;;
            arch)
                log_info "Installing nvidia-container-toolkit from extra repo..."
                pacman -Sy --noconfirm nvidia-container-toolkit
                ;;
            gentoo)
                log_warn "nvidia-container-toolkit requires manual installation on Gentoo"
                log_warn "Options:"
                log_warn "  1. Use GURU overlay: eselect repository enable guru && emerge nvidia-container-toolkit"
                log_warn "  2. Build from source: https://github.com/NVIDIA/nvidia-container-toolkit"
                log_warn "Continuing without nvidia-container-toolkit..."
                ;;
        esac
    fi

    # SELinux configuration for Fedora
    if [[ "${OS_ID}" == "fedora" ]] && command -v getenforce &> /dev/null; then
        if [[ "$(getenforce)" != "Disabled" ]]; then
            log_info "Configuring SELinux for container GPU access..."
            setsebool -P container_use_devices on 2>/dev/null || true
        fi
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

# Install gpu-guardian: detects host GPU usage and sets node label
install_gpu_guardian() {
    local guardian_url="https://github.com/uvacompute/uvacompute/releases/download/gpu-guardian-v1/gpu-guardian-linux-amd64"
    local guardian_bin="/usr/local/bin/gpu-guardian"

    log_info "Installing gpu-guardian..."

    if [[ -f "${guardian_bin}" ]]; then
        log_info "gpu-guardian already installed"
    else
        if curl -fsSL -o "${guardian_bin}" "${guardian_url}" 2>/dev/null; then
            chmod +x "${guardian_bin}"
            log_success "gpu-guardian downloaded"
        else
            log_warn "Could not download gpu-guardian — GPU busy detection will not be available"
            log_info "You can install it manually later from: ${guardian_url}"
            return
        fi
    fi

    cat > /etc/systemd/system/uvacompute-gpu-guardian.service <<EOF
[Unit]
Description=UVACompute GPU Guardian - detect host GPU usage
After=k3s-agent.service uvacompute-tunnel.service
Wants=k3s-agent.service

[Service]
Type=simple
ExecStartPre=/bin/sleep 5
ExecStart=/usr/local/bin/gpu-guardian
ExecStopPost=/usr/bin/kubectl label node %H uvacompute.com/gpu-busy- --overwrite
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable uvacompute-gpu-guardian.service

    # Start immediately if in nvidia mode
    local current_driver
    current_driver=$(lspci -nnk -s "${GPU_PCI_IDS[0]:-}" 2>/dev/null | grep "driver in use" | awk '{print $NF}')
    if [[ "${current_driver}" == "nvidia" ]]; then
        systemctl start uvacompute-gpu-guardian || true
        log_info "gpu-guardian started (nvidia mode detected)"
    else
        log_info "gpu-guardian installed but not started (not in nvidia mode)"
    fi
}

# Generate GPU mode switching scripts
generate_gpu_scripts() {
    if [[ "${GPU_DETECTED}" != "true" ]]; then
        return
    fi

    log_step "Generating GPU mode switching scripts"

    local node_id
    node_id=$(hostname)
    local tunnel_host="${TUNNEL_HOST}"
    local ssh_key="${SSH_KEY_PATH}"

    local gpu_pcis_str="${GPU_PCIS[*]}"
    local audio_pcis_str="${GPU_AUDIO_PCIS[*]:-}"
    local gpu_devids_str="${GPU_DEVICE_IDS[*]}"
    local audio_devids_str="${GPU_AUDIO_DEVICE_IDS[*]:-}"

    # gpu-mode-nvidia script
    cat > /usr/local/bin/gpu-mode-nvidia <<SCRIPT
#!/bin/bash
# Switch GPU(s) to nvidia mode (for containers)
# Auto-generated by uvacompute node install
set -e

GPU_PCIS=(${gpu_pcis_str})
AUDIO_PCIS=(${audio_pcis_str})
NODE_ID="${node_id}"
SITE_URL="${SITE_URL}"
HUB_HOST="${tunnel_host}"
SSH_KEY="${ssh_key}"
NODE_SECRET_FILE="/etc/uvacompute/node-secret"
LEGACY_SECRET_FILE="/etc/uvacompute/orchestration-secret"

# Helper: Sign request with per-node HMAC-SHA256
# Payload format: nodeId:timestamp:body (for node auth)
# Returns: auth_type:timestamp:signature
sign_node_request() {
    local body="\$1"
    local timestamp=\$(date +%s)
    local secret

    # Try per-node secret first (preferred)
    if [[ -f "\${NODE_SECRET_FILE}" ]]; then
        secret=\$(cat "\${NODE_SECRET_FILE}")
        # Node-specific payload format includes nodeId
        local payload="\${NODE_ID}:\${timestamp}:\${body}"
        local signature=\$(echo -n "\${payload}" | openssl dgst -sha256 -hmac "\${secret}" | awk '{print \$2}')
        echo "node:\${timestamp}:\${signature}"
    # Fall back to legacy shared secret
    elif [[ -f "\${LEGACY_SECRET_FILE}" ]]; then
        secret=\$(cat "\${LEGACY_SECRET_FILE}")
        local payload="\${timestamp}:\${body}"
        local signature=\$(echo -n "\${payload}" | openssl dgst -sha256 -hmac "\${secret}" | awk '{print \$2}')
        echo "shared:\${timestamp}:\${signature}"
    else
        echo ""
        return
    fi
}

# Helper: Check for active GPU workloads
check_gpu_workloads() {
    local auth=\$(sign_node_request "")
    if [[ -z "\${auth}" ]]; then
        echo "Warning: No authentication secret found, skipping workload check"
        return 0
    fi

    local auth_type=\$(echo "\${auth}" | cut -d: -f1)
    local timestamp=\$(echo "\${auth}" | cut -d: -f2)
    local signature=\$(echo "\${auth}" | cut -d: -f3)

    local response
    if [[ "\${auth_type}" == "node" ]]; then
        # Node-specific auth with X-Node-Id header
        response=\$(curl -sf -X GET "\${SITE_URL}/api/nodes/\${NODE_ID}/gpu-mode" \
            -H "X-Node-Id: \${NODE_ID}" \
            -H "X-Timestamp: \${timestamp}" \
            -H "X-Signature: \${signature}" 2>&1) || {
            echo "Warning: Could not check workloads (API may be unavailable)"
            return 0
        }
    else
        # Legacy shared secret auth (no X-Node-Id)
        response=\$(curl -sf -X GET "\${SITE_URL}/api/nodes/\${NODE_ID}/gpu-mode" \
            -H "X-Timestamp: \${timestamp}" \
            -H "X-Signature: \${signature}" 2>&1) || {
            echo "Warning: Could not check workloads (API may be unavailable)"
            return 0
        }
    fi

    local can_switch=\$(echo "\${response}" | jq -r '.canSwitch // true')
    local gpu_vm_count=\$(echo "\${response}" | jq -r '.gpuVmCount // 0')
    local gpu_job_count=\$(echo "\${response}" | jq -r '.gpuJobCount // 0')

    if [[ "\${can_switch}" != "true" ]]; then
        echo "✗ Cannot switch GPU mode: \${gpu_vm_count} GPU VM(s) and \${gpu_job_count} GPU job(s) active"
        echo "  Please stop all GPU workloads before switching modes"
        return 1
    fi
    return 0
}

# Helper: Report GPU mode to database
report_gpu_mode() {
    local mode="\$1"
    local verified="\$2"

    local body="{\"gpuMode\":\"\${mode}\",\"verified\":\${verified}}"
    local auth=\$(sign_node_request "\${body}")
    if [[ -z "\${auth}" ]]; then
        echo "Warning: No authentication secret found, skipping mode report"
        return 0
    fi

    local auth_type=\$(echo "\${auth}" | cut -d: -f1)
    local timestamp=\$(echo "\${auth}" | cut -d: -f2)
    local signature=\$(echo "\${auth}" | cut -d: -f3)

    local response
    if [[ "\${auth_type}" == "node" ]]; then
        # Node-specific auth with X-Node-Id header
        response=\$(curl -sf -X POST "\${SITE_URL}/api/nodes/\${NODE_ID}/gpu-mode" \
            -H "Content-Type: application/json" \
            -H "X-Node-Id: \${NODE_ID}" \
            -H "X-Timestamp: \${timestamp}" \
            -H "X-Signature: \${signature}" \
            -d "\${body}" 2>&1) || {
            if [[ "\${verified}" == "true" ]]; then
                echo "Warning: Could not report GPU mode to database"
            fi
            return 0
        }
    else
        # Legacy shared secret auth (no X-Node-Id)
        response=\$(curl -sf -X POST "\${SITE_URL}/api/nodes/\${NODE_ID}/gpu-mode" \
            -H "Content-Type: application/json" \
            -H "X-Timestamp: \${timestamp}" \
            -H "X-Signature: \${signature}" \
            -d "\${body}" 2>&1) || {
            if [[ "\${verified}" == "true" ]]; then
                echo "Warning: Could not report GPU mode to database"
            fi
            return 0
        }
    fi
    return 0
}

# Helper: Update Kubernetes node label (try local kubectl, fall back to SSH to hub)
update_k8s_label() {
    local mode="\$1"
    kubectl label node \$(hostname) uvacompute.com/gpu-mode=\${mode} --overwrite 2>/dev/null && return 0
    if [[ -n "\${HUB_HOST}" ]] && [[ -f "\${SSH_KEY}" ]]; then
        ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "\${SSH_KEY}" \
            "root@\${HUB_HOST}" \
            "kubectl label node \${NODE_ID} uvacompute.com/gpu-mode=\${mode} --overwrite" 2>/dev/null && return 0
    fi
    echo "Warning: Could not update Kubernetes label"
    return 1
}

echo "Checking for active GPU workloads..."
check_gpu_workloads || exit 1

echo "Switching \${#GPU_PCIS[@]} GPU(s) to nvidia mode..."

# Unbind from vfio-pci if bound
for pci in "\${GPU_PCIS[@]}" "\${AUDIO_PCIS[@]}"; do
    [[ -z "\${pci}" ]] && continue
    if [ -e /sys/bus/pci/drivers/vfio-pci/\${pci} ]; then
        echo "\${pci}" > /sys/bus/pci/drivers/vfio-pci/unbind 2>/dev/null || true
    fi
done

rmmod nvidia_uvm nvidia_drm nvidia_modeset nvidia 2>/dev/null || true

# Reset and set driver override
for pci in "\${GPU_PCIS[@]}"; do
    if [ -e /sys/bus/pci/devices/\${pci}/reset ]; then
        echo 1 > /sys/bus/pci/devices/\${pci}/reset 2>/dev/null || true
    fi
    echo "nvidia" > /sys/bus/pci/devices/\${pci}/driver_override
done

# Load nvidia modules
modprobe nvidia
modprobe nvidia_uvm

# Probe GPUs
for pci in "\${GPU_PCIS[@]}"; do
    echo "\${pci}" > /sys/bus/pci/drivers_probe 2>/dev/null || true
done

sleep 2
if nvidia-smi > /dev/null 2>&1; then
    echo "✓ \$(nvidia-smi -L | wc -l) GPU(s) now in nvidia mode"
    nvidia-smi --query-gpu=name,driver_version --format=csv,noheader
    # Regenerate CDI config for device plugin
    nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml 2>/dev/null || true
    update_k8s_label "nvidia"
    report_gpu_mode "nvidia" "true"
    # Start GPU guardian to detect host GPU usage
    systemctl start uvacompute-gpu-guardian 2>/dev/null || true
else
    echo "✗ Failed to switch to nvidia mode"
    report_gpu_mode "nvidia" "false"
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

GPU_PCIS=(${gpu_pcis_str})
AUDIO_PCIS=(${audio_pcis_str})
GPU_DEVIDS=(${gpu_devids_str})
AUDIO_DEVIDS=(${audio_devids_str})
NODE_ID="${node_id}"
SITE_URL="${SITE_URL}"
HUB_HOST="${tunnel_host}"
SSH_KEY="${ssh_key}"
NODE_SECRET_FILE="/etc/uvacompute/node-secret"
LEGACY_SECRET_FILE="/etc/uvacompute/orchestration-secret"

# Helper: Sign request with per-node HMAC-SHA256
# Payload format: nodeId:timestamp:body (for node auth)
# Returns: auth_type:timestamp:signature
sign_node_request() {
    local body="\$1"
    local timestamp=\$(date +%s)
    local secret

    # Try per-node secret first (preferred)
    if [[ -f "\${NODE_SECRET_FILE}" ]]; then
        secret=\$(cat "\${NODE_SECRET_FILE}")
        # Node-specific payload format includes nodeId
        local payload="\${NODE_ID}:\${timestamp}:\${body}"
        local signature=\$(echo -n "\${payload}" | openssl dgst -sha256 -hmac "\${secret}" | awk '{print \$2}')
        echo "node:\${timestamp}:\${signature}"
    # Fall back to legacy shared secret
    elif [[ -f "\${LEGACY_SECRET_FILE}" ]]; then
        secret=\$(cat "\${LEGACY_SECRET_FILE}")
        local payload="\${timestamp}:\${body}"
        local signature=\$(echo -n "\${payload}" | openssl dgst -sha256 -hmac "\${secret}" | awk '{print \$2}')
        echo "shared:\${timestamp}:\${signature}"
    else
        echo ""
        return
    fi
}

# Helper: Check for active GPU workloads
check_gpu_workloads() {
    local auth=\$(sign_node_request "")
    if [[ -z "\${auth}" ]]; then
        echo "Warning: No authentication secret found, skipping workload check"
        return 0
    fi

    local auth_type=\$(echo "\${auth}" | cut -d: -f1)
    local timestamp=\$(echo "\${auth}" | cut -d: -f2)
    local signature=\$(echo "\${auth}" | cut -d: -f3)

    local response
    if [[ "\${auth_type}" == "node" ]]; then
        # Node-specific auth with X-Node-Id header
        response=\$(curl -sf -X GET "\${SITE_URL}/api/nodes/\${NODE_ID}/gpu-mode" \
            -H "X-Node-Id: \${NODE_ID}" \
            -H "X-Timestamp: \${timestamp}" \
            -H "X-Signature: \${signature}" 2>&1) || {
            echo "Warning: Could not check workloads (API may be unavailable)"
            return 0
        }
    else
        # Legacy shared secret auth (no X-Node-Id)
        response=\$(curl -sf -X GET "\${SITE_URL}/api/nodes/\${NODE_ID}/gpu-mode" \
            -H "X-Timestamp: \${timestamp}" \
            -H "X-Signature: \${signature}" 2>&1) || {
            echo "Warning: Could not check workloads (API may be unavailable)"
            return 0
        }
    fi

    local can_switch=\$(echo "\${response}" | jq -r '.canSwitch // true')
    local gpu_vm_count=\$(echo "\${response}" | jq -r '.gpuVmCount // 0')
    local gpu_job_count=\$(echo "\${response}" | jq -r '.gpuJobCount // 0')

    if [[ "\${can_switch}" != "true" ]]; then
        echo "✗ Cannot switch GPU mode: \${gpu_vm_count} GPU VM(s) and \${gpu_job_count} GPU job(s) active"
        echo "  Please stop all GPU workloads before switching modes"
        return 1
    fi
    return 0
}

# Helper: Report GPU mode to database
report_gpu_mode() {
    local mode="\$1"
    local verified="\$2"

    local body="{\"gpuMode\":\"\${mode}\",\"verified\":\${verified}}"
    local auth=\$(sign_node_request "\${body}")
    if [[ -z "\${auth}" ]]; then
        echo "Warning: No authentication secret found, skipping mode report"
        return 0
    fi

    local auth_type=\$(echo "\${auth}" | cut -d: -f1)
    local timestamp=\$(echo "\${auth}" | cut -d: -f2)
    local signature=\$(echo "\${auth}" | cut -d: -f3)

    local response
    if [[ "\${auth_type}" == "node" ]]; then
        # Node-specific auth with X-Node-Id header
        response=\$(curl -sf -X POST "\${SITE_URL}/api/nodes/\${NODE_ID}/gpu-mode" \
            -H "Content-Type: application/json" \
            -H "X-Node-Id: \${NODE_ID}" \
            -H "X-Timestamp: \${timestamp}" \
            -H "X-Signature: \${signature}" \
            -d "\${body}" 2>&1) || {
            if [[ "\${verified}" == "true" ]]; then
                echo "Warning: Could not report GPU mode to database"
            fi
            return 0
        }
    else
        # Legacy shared secret auth (no X-Node-Id)
        response=\$(curl -sf -X POST "\${SITE_URL}/api/nodes/\${NODE_ID}/gpu-mode" \
            -H "Content-Type: application/json" \
            -H "X-Timestamp: \${timestamp}" \
            -H "X-Signature: \${signature}" \
            -d "\${body}" 2>&1) || {
            if [[ "\${verified}" == "true" ]]; then
                echo "Warning: Could not report GPU mode to database"
            fi
            return 0
        }
    fi
    return 0
}

# Helper: Update Kubernetes node label (try local kubectl, fall back to SSH to hub)
update_k8s_label() {
    local mode="\$1"
    kubectl label node \$(hostname) uvacompute.com/gpu-mode=\${mode} --overwrite 2>/dev/null && return 0
    if [[ -n "\${HUB_HOST}" ]] && [[ -f "\${SSH_KEY}" ]]; then
        ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "\${SSH_KEY}" \
            "root@\${HUB_HOST}" \
            "kubectl label node \${NODE_ID} uvacompute.com/gpu-mode=\${mode} --overwrite" 2>/dev/null && return 0
    fi
    echo "Warning: Could not update Kubernetes label"
    return 1
}

echo "Checking for active GPU workloads..."
check_gpu_workloads || exit 1

# Stop GPU guardian before switching modes
systemctl stop uvacompute-gpu-guardian 2>/dev/null || true
kubectl label node \$(hostname) uvacompute.com/gpu-busy- --overwrite 2>/dev/null || true

echo "Switching \${#GPU_PCIS[@]} GPU(s) to vfio mode..."

# Stop nvidia device plugin on this node so modules can be unloaded
HOSTNAME=\$(hostname)
PLUGIN_POD=\$(kubectl get pods -n kube-system -l app=nvidia-device-plugin-daemonset \
    --field-selector spec.nodeName=\${HOSTNAME} -o name 2>/dev/null | head -1)
if [[ -n "\${PLUGIN_POD}" ]]; then
    echo "Stopping nvidia device plugin..."
    kubectl delete \${PLUGIN_POD} -n kube-system --grace-period=5 --wait=true 2>/dev/null || true
    sleep 2
fi

# Unload nvidia modules (retry — device plugin may take a moment to release)
for attempt in 1 2 3 4 5; do
    rmmod nvidia_uvm nvidia_drm nvidia_modeset nvidia 2>/dev/null && break
    echo "Modules in use, retrying... (\${attempt}/5)"
    sleep 3
done
if lsmod | grep -q "^nvidia "; then
    echo "✗ Failed to unload nvidia modules after 5 attempts"
    echo "  Check for processes using the GPU: lsof /dev/nvidia*"
    exit 1
fi

# Unbind from nvidia if bound
for pci in "\${GPU_PCIS[@]}" "\${AUDIO_PCIS[@]}"; do
    [[ -z "\${pci}" ]] && continue
    if [ -e /sys/bus/pci/drivers/nvidia/\${pci} ]; then
        echo "\${pci}" > /sys/bus/pci/drivers/nvidia/unbind 2>/dev/null || true
    fi
done

for pci in "\${GPU_PCIS[@]}" "\${AUDIO_PCIS[@]}"; do
    [[ -z "\${pci}" ]] && continue
    echo "" > /sys/bus/pci/devices/\${pci}/driver_override 2>/dev/null || true
done

# Load vfio modules
modprobe vfio
modprobe vfio_pci
modprobe vfio_iommu_type1

# Bind to vfio-pci (new_id expects space-separated, e.g. "10de 2b85")
for devid in "\${GPU_DEVIDS[@]}" "\${AUDIO_DEVIDS[@]}"; do
    [[ -z "\${devid}" ]] && continue
    echo "\${devid//:/ }" > /sys/bus/pci/drivers/vfio-pci/new_id 2>/dev/null || true
done

for pci in "\${GPU_PCIS[@]}" "\${AUDIO_PCIS[@]}"; do
    [[ -z "\${pci}" ]] && continue
    echo "\${pci}" > /sys/bus/pci/drivers/vfio-pci/bind 2>/dev/null || true
done

sleep 1
VERIFIED=true
for pci in "\${GPU_PCIS[@]}"; do
    if ! lspci -nnk -s \${pci} | grep -q "vfio-pci"; then
        VERIFIED=false
        break
    fi
done

if \${VERIFIED}; then
    echo "✓ \${#GPU_PCIS[@]} GPU(s) now in vfio mode (ready for VM passthrough)"
    for pci in "\${GPU_PCIS[@]}"; do
        lspci -nnk -s \${pci} | grep -E "VGA|driver"
    done
    update_k8s_label "vfio"
    report_gpu_mode "vfio" "true"
else
    echo "✗ Failed to switch to vfio mode"
    report_gpu_mode "vfio" "false"
    exit 1
fi
SCRIPT
    chmod +x /usr/local/bin/gpu-mode-vfio

    # gpu-mode-status script
    cat > /usr/local/bin/gpu-mode-status <<SCRIPT
#!/bin/bash
# Show current GPU mode
# Auto-generated by uvacompute node install

GPU_PCIS=(${gpu_pcis_str})

echo "=== GPU Mode Status ==="
echo

for pci in "\${GPU_PCIS[@]}"; do
    GPU_NAME=\$(lspci -s \${pci} | sed 's/.*: //')
    DRIVER=\$(lspci -nnk -s \${pci} | grep "driver in use" | awk '{print \$NF}')
    echo "GPU \${pci}: \${GPU_NAME}"
    echo "  Driver: \${DRIVER:-none}"
done

echo

DRIVER=\$(lspci -nnk -s \${GPU_PCIS[0]} | grep "driver in use" | awk '{print \$NF}')

case "\${DRIVER}" in
    nvidia)
        echo "Mode: NVIDIA (Container mode)"
        echo "- Kubernetes containers can use the GPU"
        echo "- KubeVirt VM passthrough NOT available"
        echo
        nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>/dev/null || true
        ;;
    vfio-pci)
        echo "Mode: VFIO (VM passthrough mode)"
        echo "- KubeVirt VMs can use GPU passthrough"
        echo "- Kubernetes containers CANNOT use the GPU"
        ;;
    *)
        echo "Mode: Unknown (driver: \${DRIVER:-none})"
        ;;
esac

echo
echo "To switch modes:"
echo "  uva node gpu-mode nvidia  # For container GPU access"
echo "  uva node gpu-mode vfio    # For VM GPU passthrough"
SCRIPT
    chmod +x /usr/local/bin/gpu-mode-status

    # gpu-mode-reconcile script
    cat > /usr/local/bin/gpu-mode-reconcile <<SCRIPT
#!/bin/bash
# Reconcile GPU mode label after boot
# Auto-generated by uvacompute node install

GPU_PCIS=(${gpu_pcis_str})
NODE_ID="${node_id}"
HUB_HOST="${tunnel_host}"
SSH_KEY="${ssh_key}"

update_k8s_label() {
    local mode="\$1"
    kubectl label node \$(hostname) uvacompute.com/gpu-mode=\${mode} --overwrite 2>/dev/null && return 0
    if [[ -n "\${HUB_HOST}" ]] && [[ -f "\${SSH_KEY}" ]]; then
        ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -i "\${SSH_KEY}" \
            "root@\${HUB_HOST}" \
            "kubectl label node \${NODE_ID} uvacompute.com/gpu-mode=\${mode} --overwrite" 2>/dev/null && return 0
    fi
    return 1
}

DRIVER=\$(lspci -nnk -s \${GPU_PCIS[0]} | grep "driver in use" | awk '{print \$NF}')

case "\${DRIVER}" in
    nvidia)
        echo "Boot reconciliation: GPU driver is nvidia, setting label"
        nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml 2>/dev/null || true
        update_k8s_label "nvidia"
        ;;
    vfio-pci)
        echo "Boot reconciliation: GPU driver is vfio-pci, setting label"
        update_k8s_label "vfio"
        ;;
    *)
        echo "Boot reconciliation: GPU driver is \${DRIVER:-none} (defaulting to nvidia)"
        gpu-mode-nvidia 2>/dev/null || update_k8s_label "nvidia"
        ;;
esac
SCRIPT
    chmod +x /usr/local/bin/gpu-mode-reconcile

    cat > /etc/systemd/system/uvacompute-gpu-reconcile.service <<EOF
[Unit]
Description=Reconcile GPU mode label after boot
After=k3s-agent.service uvacompute-tunnel.service
Wants=k3s-agent.service

[Service]
Type=oneshot
ExecStartPre=/bin/sleep 10
ExecStart=/usr/local/bin/gpu-mode-reconcile
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable uvacompute-gpu-reconcile.service

    # Install gpu-guardian daemon
    install_gpu_guardian

    log_success "GPU mode scripts created at /usr/local/bin/"
    log_info "  gpu-mode-nvidia - Switch to container mode"
    log_info "  gpu-mode-vfio - Switch to VM passthrough mode"
    log_info "  gpu-mode-status - Show current mode"
    log_info "  gpu-mode-reconcile - Sync label with actual driver (runs on boot)"
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
        case "${OS_ID}" in
            ubuntu|debian)
                apt-get update -qq
                apt-get install -y -qq autossh
                ;;
            fedora)
                dnf install -y autossh
                ;;
            arch)
                pacman -S --noconfirm autossh
                ;;
            gentoo)
                emerge --ask=n net-misc/autossh
                ;;
        esac
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

# Install virtctl for VM management
install_virtctl() {
    log_step "Installing virtctl"

    if command -v virtctl &> /dev/null; then
        log_warn "virtctl is already installed"
        virtctl version --client 2>/dev/null || true
        return
    fi

    local virtctl_version="v1.4.0"
    local arch
    arch=$(uname -m)
    case "${arch}" in
        x86_64) arch="amd64" ;;
        aarch64) arch="arm64" ;;
        *) die "Unsupported architecture: ${arch}" ;;
    esac

    log_info "Downloading virtctl ${virtctl_version} for ${arch}..."
    curl -L -o /usr/local/bin/virtctl \
        "https://github.com/kubevirt/kubevirt/releases/download/${virtctl_version}/virtctl-${virtctl_version}-linux-${arch}"
    chmod +x /usr/local/bin/virtctl

    if virtctl version --client &>/dev/null; then
        log_success "virtctl installed successfully"
    else
        log_warn "virtctl installed but version check failed"
    fi
}

# Set up kubeconfig for kubectl/virtctl to talk to hub
setup_kubeconfig() {
    log_step "Setting up kubeconfig"

    # The kubeconfig from the hub points to localhost:6443, but we need localhost:6444
    # which is the tunnel endpoint on this node that forwards to the hub's k3s API
    mkdir -p /root/.kube

    # Decode and modify the kubeconfig to use localhost:6444
    echo "${HUB_KUBECONFIG_B64}" | base64 -d | \
        sed 's|server: https://127.0.0.1:6443|server: https://127.0.0.1:6444|g' \
        > /root/.kube/config
    chmod 600 /root/.kube/config

    # Verify it works (may take a moment for tunnel to be ready)
    log_info "Verifying kubeconfig..."
    local retries=30
    while [[ $retries -gt 0 ]]; do
        if kubectl get nodes &>/dev/null; then
            log_success "kubeconfig verified - can reach cluster API"
            return
        fi
        sleep 2
        ((retries--))
    done

    log_warn "Could not verify kubeconfig immediately - tunnel may need more time"
    log_info "You can verify later with: kubectl get nodes"
}

# Add vmproxy public key to allow hub to SSH to this node for VM access
setup_vmproxy_access() {
    log_step "Setting up vmproxy SSH access"

    mkdir -p /root/.ssh
    chmod 700 /root/.ssh

    # Add vmproxy public key if not already present
    if grep -q "vmproxy@uvacompute" /root/.ssh/authorized_keys 2>/dev/null; then
        log_warn "vmproxy key already in authorized_keys"
    else
        echo "${VMPROXY_PUBLIC_KEY}" >> /root/.ssh/authorized_keys
        chmod 600 /root/.ssh/authorized_keys
        log_success "vmproxy public key added to /root/.ssh/authorized_keys"
    fi
}

# Annotate node with tunnel port so vm-proxy.sh can find it
annotate_node() {
    log_step "Annotating node with tunnel port"

    local node_id
    node_id=$(hostname)

    # Wait for node to appear in cluster
    log_info "Waiting for node to appear in cluster..."
    local retries=60
    while [[ $retries -gt 0 ]]; do
        if kubectl get node "${node_id}" &>/dev/null; then
            break
        fi
        sleep 5
        ((retries--))
    done

    if [[ $retries -eq 0 ]]; then
        log_warn "Node not found in cluster yet. Annotation will need to be applied manually:"
        log_warn "  kubectl annotate node ${node_id} uvacompute.io/tunnel-port=${TUNNEL_PORT}"
        return
    fi

    # Apply annotation
    if kubectl annotate node "${node_id}" "uvacompute.io/tunnel-port=${TUNNEL_PORT}" --overwrite; then
        log_success "Node annotated with tunnel port: ${TUNNEL_PORT}"
    else
        log_warn "Failed to annotate node. Apply manually:"
        log_warn "  kubectl annotate node ${node_id} uvacompute.io/tunnel-port=${TUNNEL_PORT}"
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
gpu_count: ${GPU_COUNT}
gpu_pcis: "${GPU_PCIS[*]}"
gpu_device_ids: "${GPU_DEVICE_IDS[*]}"
gpu_name: "${GPU_NAME}"
EOF
    else
        echo "gpu_detected: false" >> "${config_dir}/install-state.yaml"
    fi

    # Add storage info
    cat >> "${config_dir}/install-state.yaml" <<EOF
storage:
  path: ${STORAGE_PATH}
  type: ${STORAGE_TYPE}
  device: ${STORAGE_DEVICE:-root}
  allocation_gb: ${STORAGE_ALLOCATION_GB}
EOF

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
    echo "  • VM storage (${STORAGE_ALLOCATION_GB}GB at ${STORAGE_PATH})"
    if [[ "${GPU_DETECTED}" == "true" ]]; then
        echo "  • nvidia-container-toolkit"
        echo "  • GPU mode switching scripts"
    fi
    echo
    echo -e "${BOLD}Node info:${NC}"
    echo "  • Node ID: $(hostname)"
    echo "  • Hub URL: ${K3S_URL}"
    echo "  • Tunnel Port: ${TUNNEL_PORT}"
    echo "  • Storage: ${STORAGE_ALLOCATION_GB}GB (${STORAGE_TYPE})"
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

# Call unregister API to remove node from database
call_unregister_api() {
    log_info "Notifying hub of node removal..."

    # Read node ID from config
    local node_id
    if [[ -f "${SERVICE_DIR}/node-config.yaml" ]]; then
        node_id=$(grep "^nodeId:" "${SERVICE_DIR}/node-config.yaml" 2>/dev/null | awk '{print $2}')
    fi

    if [[ -z "${node_id}" ]]; then
        node_id=$(hostname)
        log_warn "Could not read nodeId from config, using hostname: ${node_id}"
    fi

    # Try node secret first (preferred), fall back to orchestration secret
    local node_secret_file="/etc/uvacompute/node-secret"
    local legacy_secret_file="/etc/uvacompute/orchestration-secret"
    local use_node_auth=false
    local secret=""

    if [[ -f "${node_secret_file}" ]]; then
        secret=$(cat "${node_secret_file}")
        use_node_auth=true
    elif [[ -f "${legacy_secret_file}" ]]; then
        secret=$(cat "${legacy_secret_file}")
    fi

    if [[ -z "${secret}" ]]; then
        log_warn "No authentication secret found, skipping API notification"
        return 0
    fi

    # Sign request with HMAC-SHA256
    local body=""
    local timestamp
    timestamp=$(date +%s)

    local payload signature
    if [[ "${use_node_auth}" == "true" ]]; then
        # Node-specific payload format includes nodeId
        payload="${node_id}:${timestamp}:${body}"
    else
        # Legacy shared secret payload
        payload="${timestamp}:${body}"
    fi
    signature=$(echo -n "${payload}" | openssl dgst -sha256 -hmac "${secret}" | awk '{print $2}')

    # Call DELETE API
    local http_code
    if [[ "${use_node_auth}" == "true" ]]; then
        # Node-specific auth with X-Node-Id header
        http_code=$(curl -sf -w "%{http_code}" -o /tmp/unregister_response.json \
            -X DELETE "${SITE_URL}/api/nodes/${node_id}" \
            -H "X-Node-Id: ${node_id}" \
            -H "X-Timestamp: ${timestamp}" \
            -H "X-Signature: ${signature}" 2>&1) || http_code="000"
    else
        # Legacy shared secret auth (no X-Node-Id)
        http_code=$(curl -sf -w "%{http_code}" -o /tmp/unregister_response.json \
            -X DELETE "${SITE_URL}/api/nodes/${node_id}" \
            -H "X-Timestamp: ${timestamp}" \
            -H "X-Signature: ${signature}" 2>&1) || http_code="000"
    fi

    case "${http_code}" in
        200)
            local vms_deleted jobs_cancelled
            vms_deleted=$(jq -r '.vmsDeleted // 0' /tmp/unregister_response.json 2>/dev/null || echo "0")
            jobs_cancelled=$(jq -r '.jobsCancelled // 0' /tmp/unregister_response.json 2>/dev/null || echo "0")
            log_success "Node unregistered from hub (${vms_deleted} VMs stopped, ${jobs_cancelled} jobs cancelled)"
            ;;
        404)
            log_info "Node not found in hub database (already removed or never registered)"
            ;;
        000)
            log_warn "Could not reach hub API (network error). Node entry may remain in database."
            ;;
        *)
            log_warn "API returned status ${http_code}. Node entry may remain in database."
            ;;
    esac

    rm -f /tmp/unregister_response.json
    return 0
}

# Uninstall node
uninstall_node() {
    local force=false
    if [[ "${1:-}" == "--force" || "${1:-}" == "-f" ]]; then
        force=true
    fi

    # Confirmation prompt unless --force is used
    if [[ "${force}" != "true" && "${NONINTERACTIVE}" != "true" ]]; then
        echo ""
        echo -e "${YELLOW}${BOLD}WARNING: This will uninstall UVACompute from this node.${NC}"
        echo ""
        echo "This will:"
        echo "  • Remove this node from the cluster"
        echo "  • Stop all VMs and jobs running on this node"
        echo "  • Delete all VM storage data at /var/lib/uvacompute"
        echo "  • Remove k3s, SSH tunnel, and GPU scripts"
        echo ""
        read -rp "Are you sure you want to continue? [y/N] " confirm
        if [[ "${confirm}" != "y" && "${confirm}" != "Y" ]]; then
            log_info "Uninstall cancelled"
            exit 0
        fi
    fi

    log_step "Uninstalling UVACompute node"

    call_unregister_api

    # Stop services
    log_info "Stopping services..."
    systemctl stop uvacompute-tunnel 2>/dev/null || true
    systemctl disable uvacompute-tunnel 2>/dev/null || true

    # Uninstall k3s agent
    if [[ -f /usr/local/bin/k3s-agent-uninstall.sh ]]; then
        log_info "Uninstalling k3s agent..."
        /usr/local/bin/k3s-agent-uninstall.sh
    fi

    # Force remove storage directories
    log_info "Removing storage directories..."
    rm -rf /var/lib/uvacompute
    rm -rf /var/lib/rancher/k3s/storage

    # Remove GPU scripts, guardian, and reconcile service
    log_info "Removing GPU scripts..."
    systemctl stop uvacompute-gpu-guardian 2>/dev/null || true
    systemctl disable uvacompute-gpu-guardian 2>/dev/null || true
    systemctl stop uvacompute-gpu-reconcile 2>/dev/null || true
    systemctl disable uvacompute-gpu-reconcile 2>/dev/null || true
    rm -f /usr/local/bin/gpu-mode-nvidia
    rm -f /usr/local/bin/gpu-mode-vfio
    rm -f /usr/local/bin/gpu-mode-status
    rm -f /usr/local/bin/gpu-mode-reconcile
    rm -f /usr/local/bin/gpu-guardian
    rm -f /etc/systemd/system/uvacompute-gpu-guardian.service
    rm -f /etc/systemd/system/uvacompute-gpu-reconcile.service

    # Remove virtctl
    rm -f /usr/local/bin/virtctl

    # Remove SSH tunnel service
    rm -f /etc/systemd/system/uvacompute-tunnel.service
    systemctl daemon-reload

    # Remove secrets
    log_info "Removing authentication secrets..."
    rm -f /etc/uvacompute/node-secret
    rm -f /etc/uvacompute/orchestration-secret

    # Remove config directories
    log_info "Removing configuration directories..."
    rm -rf "${SERVICE_DIR}"
    rm -rf ~/.uvacompute/node/

    # Remove SSH key (generated by this script)
    rm -f /root/.ssh/id_ed25519_uvacompute
    rm -f /root/.ssh/id_ed25519_uvacompute.pub

    # Remove authorized key entry (vmproxy)
    if [[ -f /root/.ssh/authorized_keys ]]; then
        log_info "Removing vmproxy SSH key..."
        sed -i '/vmproxy@/d' /root/.ssh/authorized_keys
    fi

    # Remove kubeconfig
    rm -f /root/.kube/config

    log_success "Node uninstalled successfully"
    log_info "To re-register: curl -fsSL https://uvacompute.com/install-node.sh | sudo bash -s -- --token YOUR_TOKEN"
}

# Parse arguments
parse_args() {
    # Check for uninstall command first
    if [[ "${1:-}" == "uninstall" ]]; then
        check_root
        # Check for --force flag
        local force_flag=""
        shift
        while [[ $# -gt 0 ]]; do
            case $1 in
                --force|-f)
                    force_flag="--force"
                    shift
                    ;;
                *)
                    shift
                    ;;
            esac
        done
        uninstall_node "${force_flag}"
        exit 0
    fi

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
            --noninteractive|-y)
                NONINTERACTIVE=true
                shift
                ;;
            --storage)
                STORAGE_ALLOCATION_GB="$2"
                shift 2
                ;;
            --storage=*)
                STORAGE_ALLOCATION_GB="${1#*=}"
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [COMMAND] [OPTIONS]"
                echo ""
                echo "Commands:"
                echo "  (none)           Install the node (default)"
                echo "  uninstall        Remove uvacompute node installation"
                echo ""
                echo "Options:"
                echo "  --token TOKEN    Registration token for platform enrollment (required)"
                echo "  --noninteractive, -y  Non-interactive mode (use defaults)"
                echo "  --storage GB     Storage allocation in GB (default: auto)"
                echo "  --force, -f      Skip confirmation prompts (for uninstall)"
                echo "  --help, -h       Show this help message"
                echo ""
                echo "Examples:"
                echo "  curl -fsSL https://uvacompute.com/install-node.sh | sudo bash -s -- --token abc123"
                echo "  curl -fsSL https://uvacompute.com/install-node.sh | sudo bash -s -- --token abc123 --noninteractive"
                echo "  curl -fsSL https://uvacompute.com/install-node.sh | sudo bash -s uninstall"
                echo "  curl -fsSL https://uvacompute.com/install-node.sh | sudo bash -s uninstall --force"
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
    detect_gpu
    detect_storage
    prompt_storage_allocation
    setup_storage_directory
    generate_ssh_key
    register_node
    install_k3s_agent
    install_nvidia_toolkit
    configure_nvidia_k3s
    generate_gpu_scripts
    setup_ssh_tunnel
    install_virtctl
    setup_vmproxy_access
    setup_kubeconfig
    annotate_node
    label_node
    configure_storage_provisioner
    save_state
    print_summary
}

main "$@"
