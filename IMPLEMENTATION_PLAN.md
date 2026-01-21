# uvacompute Implementation Plan

This document is the execution plan for implementing the uvacompute platform migration. Each section is a "plan mode" chunk that can be completed independently.

---

## Agent Instructions (READ BEFORE EVERY PLAN)

### Purpose

This implementation plan migrates uvacompute from single-node Incus to multi-node Kubernetes with KubeVirt, adds container job support, and enables distributed compute sharing.

### Before Starting Any Plan

1. **Read this section** every time you start a new plan
2. **Check the progress** section below to see what's done
3. **Read the relevant AGENTS.md** files:
   - `apps/cli/AGENTS.md` - CLI development guidelines
   - `apps/site/AGENTS.md` - Site development guidelines
4. **Read `MIGRATION_KUBEVIRT.md`** for architecture context
5. **Check git status** to understand current state

### Git Workflow

```bash
# Before starting a new plan, ensure you're on latest
git fetch origin
git status

# For each plan section, after completing all todos:
gt create --all --message "feat: <description of what this plan accomplished>"

# This creates a new stacked branch for clean separation. you run this.
```

### Common Commands

```bash
# Site development
cd apps/site
pnpm dev                     # Start Next.js (port 3000)
npx convex dev               # Start Convex (run in separate terminal)
pnpm build                   # Check for build errors
pnpm lint                    # Check for lint errors

# CLI development
cd apps/cli
bun run build                # Build CLI
bun run index.ts [cmd]       # Test CLI locally
node dist/index.js [cmd]     # Test built CLI

# Orchestration service
cd apps/vm-orchestration-service
make dev                     # Run with hot reload
make build                   # Build binary
go test ./...                # Run tests

# Testing on workstation
ssh workstation              # 128GB RAM, 4TB NVMe, 1x 5090
ssh jetson-nano              # Jetson Nano for testing

# Convex
npx convex dev               # Start dev server
npx convex deploy            # Deploy to production

# environment variables w/vercel
vc env pull --environment [environment] # run this in the respective vercel app (apps/site, apps/status)

# environment variables for vm-orchestration-service are managed by hand
```

### Testing Requirements

A plan is "done" when:

- [ ] Code compiles without errors
- [ ] No TypeScript/lint errors
- [ ] Tests written and passing
- [ ] Manual testing completed
- [ ] Branch created with `gt create`

### When Stuck

1. **Ask Charlie** - don't spend more than 30 mins stuck
2. **Document the issue** in the learnings section below
3. **Check existing code** for patterns before implementing new

### Cloud Resources

If you need AWS resources (S3 buckets, etc.):

1. Ask Charlie for AWS CLI permissions
2. Create resources with Terraform in a new `terraform/` directory
3. Document what was created

---

## Learnings & Notes

> Agents: Append new learnings here as you discover them.

### Architecture Notes

- Site (Next.js on Vercel) proxies to orchestration service via HMAC-signed requests
- Orchestration service callbacks to site to update VM status
- VM records stored in Convex, actual VMs managed by orchestration service
- SSH access uses virtctl port-forward (KubeVirt native)

### Gotchas

- The orchestration service has `IsDevelopment()` check that skips actual KubeVirt operations when `ENV=development`. Use `ENV=test` or `ENV=production` for real testing.
- The API requires HMAC-SHA256 signatures with `X-Timestamp` (milliseconds) and `X-Signature` headers. Payload format: `METHOD:PATH:TIMESTAMP:BODY`
- First VM creation is slow (~5 min) due to container image pulling (fedora-cloud-container-disk-demo is ~700MB)

**GPU-specific gotchas:**

- **Single GPU tradeoff**: With one GPU, must choose between container mode (nvidia driver) or VM passthrough mode (vfio-pci). Can't do both simultaneously.
- **VFIO binding at boot**: If GRUB has `vfio-pci.ids=XXXX:YYYY`, the GPU binds to VFIO at boot, making `nvidia-smi` fail. Need to unbind and rebind to nvidia driver.
- **GPU state after VFIO use**: After a VM releases the GPU, it may be in a bad state. Need PCIe FLR reset (`echo 1 > /sys/bus/pci/devices/XXXX/reset`) before nvidia driver can use it.
- **k3s runc location**: nvidia-container-runtime needs `runc` but k3s bundles it at `/var/lib/rancher/k3s/data/current/bin/runc`. Symlink to `/usr/local/bin/runc`.
- **Device plugin needs nvidia runtime**: The nvidia-device-plugin pod must use `runtimeClassName: nvidia` to detect GPUs.
- **CDI config required**: Run `nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml` for device plugin auto-detection.

**Federated k3s Hub setup (Plan 14):**

- **Memory requirements**: DO VPS needs at least 4GB RAM for k3s server + KubeVirt control plane (2GB was insufficient)
- **KubeVirt "Deploying" state**: KubeVirt stays in "Deploying" phase until virt-handler runs on at least one node. This is expected for control-plane-only hub - it becomes "Available" when agent nodes join.
- **virt-handler DaemonSet**: Only tolerates `CriticalAddonsOnly` taint, so applying `node-role.kubernetes.io/control-plane=:NoSchedule` prevents it from running on hub (correct behavior)
- **Hub taint**: Taint the hub with `kubectl taint nodes <hub> node-role.kubernetes.io/control-plane=:NoSchedule` to prevent user workloads
- **Cross-compile**: `GOOS=linux GOARCH=amd64 go build` for deploying from macOS to Linux hub

**Health Monitoring (Plan 18):**

- **k8s Node Conditions**: Use `client.CoreV1().Nodes().List()` and check node conditions for `Ready` type. `ConditionTrue` = healthy, anything else = unhealthy.
- **Heartbeat timestamp**: Node conditions have `LastHeartbeatTime` which is the k8s agent's last heartbeat, not our custom field. Store this in Convex `lastHeartbeat`.
- **Node ID from labels**: Use `uvacompute.com/node-id` label on k8s nodes to map back to our Convex node records. Falls back to k8s node name.
- **Internal mutations**: Use `internalMutation` for functions that should only be called from other Convex functions (like `markNodeOffline`), not from the frontend.
- **Status cascade**: When node goes offline, cascade status to VMs and jobs via internal mutations in a single `syncHealth` transaction.

**Navigation Refactor (Plan 19):**

- **Next.js build cache**: After deleting pages, the `.next` cache may still reference old files. Clear with `rm -rf .next` before rebuilding.
- **Seed functions removal**: Mock data seed functions (seedVMs, clearAllVMs) should be CLI commands or removed entirely, not in the UI.
- **Consolidating admin features**: Keep admin functionality in one place (`/admin`) rather than splitting between dev-tools and admin pages.

### Useful Patterns

- Use Python for generating HMAC signatures (easier than bash/openssl)
- k3s installs quickly and creates /etc/rancher/k3s/k3s.yaml for KUBECONFIG
- KubeVirt operator + CR installation: apply operator, wait for deployment, apply CR, wait for kubevirt resource

**GPU detection patterns (for Plan 3):**

```bash
# Detect NVIDIA GPUs
lspci | grep -i nvidia

# Get PCI addresses dynamically
GPU_PCI=$(lspci -D | grep -i 'vga.*nvidia' | awk '{print $1}')

# Get device IDs (vendor:device)
lspci -nn | grep -i nvidia | grep -oP '\[10de:\w+\]'

# Check current driver
lspci -nnk -s $GPU_PCI | grep "driver in use"
```

**GPU mode switching (conceptual - needs auto-detection for Plan 3):**

```bash
# Switch to nvidia mode (for containers)
echo $GPU_PCI > /sys/bus/pci/drivers/vfio-pci/unbind
echo "nvidia" > /sys/bus/pci/devices/$GPU_PCI/driver_override
echo 1 > /sys/bus/pci/devices/$GPU_PCI/reset  # PCIe FLR
modprobe nvidia
echo $GPU_PCI > /sys/bus/pci/drivers_probe

# Switch to vfio mode (for VM passthrough)
rmmod nvidia_uvm nvidia_drm nvidia_modeset nvidia
echo $GPU_PCI > /sys/bus/pci/drivers/nvidia/unbind
echo "vfio-pci" > /sys/bus/pci/devices/$GPU_PCI/driver_override
modprobe vfio-pci
echo $GPU_PCI > /sys/bus/pci/drivers_probe
```

### Workstation Setup (for reference)

```bash
# Install k3s
curl -sfL https://get.k3s.io | sudo sh -s - --disable=traefik

# Install KubeVirt
sudo kubectl apply -f https://github.com/kubevirt/kubevirt/releases/download/v1.3.0/kubevirt-operator.yaml
sudo kubectl wait --for=condition=available --timeout=300s deployment/virt-operator -n kubevirt
sudo kubectl apply -f https://github.com/kubevirt/kubevirt/releases/download/v1.3.0/kubevirt-cr.yaml
sudo kubectl wait --for=condition=Available --timeout=600s kubevirt/kubevirt -n kubevirt

# Create namespace
sudo kubectl create namespace uvacompute

# Run orchestration service
ENV=test KUBECONFIG=/etc/rancher/k3s/k3s.yaml ./vm-orchestration
```

### GPU Container Setup (for reference)

```bash
# 1. Install nvidia-container-toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit

# 2. Symlink runc for k3s
sudo ln -sf /var/lib/rancher/k3s/data/current/bin/runc /usr/local/bin/runc

# 3. Generate CDI config
sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml

# 4. Create RuntimeClass
kubectl apply -f - <<EOF
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: nvidia
handler: nvidia
EOF

# 5. Deploy device plugin with nvidia runtime
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
      - image: nvcr.io/nvidia/k8s-device-plugin:v0.17.0
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

# 6. Verify GPU is available
kubectl describe node | grep nvidia.com/gpu
```

---

## Progress Tracker

| Plan                               | Status         | Branch                            | Notes                                                |
| ---------------------------------- | -------------- | --------------------------------- | ---------------------------------------------------- |
| 1. Remove Incus, finalize KubeVirt | ✅ Complete    |                                   | Removed all Incus code, KubeVirt-only backend        |
| 2. Test KubeVirt on workstation    | ✅ Complete    |                                   | k3s v1.34.3 + KubeVirt v1.3.0 working                |
| 3. k3s/KubeVirt install script     | ✅ Complete    |                                   | uva node install/uninstall/status + GPU auto-detect  |
| 3.5. Node prepare command          | ✅ Complete    |                                   | uva node prepare for driver install + reboot flow    |
| 4. Jobs schema + site API          | ✅ Complete    |                                   | jobs table + API endpoints                           |
| 5. Jobs in orchestration service   | ✅ Complete    |                                   | JobAdapter + JobManager + HTTP handlers              |
| 6. Jobs CLI commands               | ✅ Complete    |                                   | uva run, jobs, logs, cancel commands                 |
| 7. Jobs website UI                 | ✅ Complete    |                                   | ActiveJobs, JobHistory, JobLogViewer components      |
| 8. Log storage + streaming         | ✅ Complete    |                                   | SSE streaming + Convex File Storage archival         |
| 9. Node management CLI             | ✅ Complete    | feat/complete-node-management-cli | pause, resume, config commands + status enhancements |
| 10. Node config + partial sharing  | ⏸️ Paused      |                                   | Superseded by federated k3s (Plan 14-18)             |
| 11. Multi-node SSH routing         | ✅ Complete    | feat/multi-node-ssh-routing       | nodeId tracking + SSH router + nodes table           |
| 12. Admin commands                 | ⏸️ Paused      |                                   | Merged into Plan 17 (Admin Dashboard)                |
| 13. Automated node onboarding      | ✅ Complete    | feat/multi-node-ssh-routing       | Token-based registration + DO VPS key sync           |
| **FEDERATED K3S ARCHITECTURE**     |                |                                   |                                                      |
| 14. Hub Setup (DO VPS)             | ✅ Complete    | feat/hub-setup                    | k3s server + KubeVirt + orchestration on hub         |
| 15. Agent Installation Refactor    | ✅ Complete    | feat/federated-k3s-architecture   | Nodes run k3s agent, join hub cluster                |
| 16. Multi-Node Scheduling          | ✅ Complete    | feat/multi-node-scheduling        | Node labels, resource scheduling, placement          |
| 17. Admin Dashboard & APIs         | ✅ Complete    | feat/admin-dashboard-apis         | Tiered access, admin/contributor dashboards, CLI     |
| 18. Health Monitoring & Failover   | ✅ Complete    | feat/health-monitoring            | Health monitor, node_offline status, admin alerts    |
| 19. Navigation Refactor            | ✅ Complete    | feat/nav-refactor                 | Navbar updates, dev tools + seed.ts removal          |
| 20. Status Page Refactor           | ⬜ Not Started |                                   | Per-node status, resources, GPU breakdown            |

Status key: ⬜ Not Started | 🔄 In Progress | ✅ Complete | ❌ Blocked | ⏸️ Paused

---

## Plan 1: Remove Incus, Finalize KubeVirt Adapter

**Goal:** Clean up the codebase to use only KubeVirt. Remove all Incus code and dependencies.

### Context

There's already a KubeVirtAdapter in `lib/kubevirt.go`. We need to:

- Remove all Incus code
- Make KubeVirt the only backend
- Clean up the IncusProvider interface naming
- Ensure the orchestration service builds and tests pass

### Todos

- [x] Remove `lib/incus.go` and `lib/incus_test.go`
- [x] Remove `structs/incus_info.go` and `structs/incus_info_test.go`
- [x] Rename `IncusProvider` interface to `VMProvider` in `structs/vm_manager.go`
- [x] Update `KubeVirtAdapter` to implement the renamed interface
- [x] Remove Incus-related environment variables and config
- [x] Update `server.go` to only use KubeVirt (remove incus switch case)
- [x] Update `Makefile` if needed
- [x] Run `go test ./...` and fix any failures
- [x] Run `go build` and ensure it compiles

### Files to Modify

- `lib/incus.go` → DELETE
- `lib/incus_test.go` → DELETE
- `structs/incus_info.go` → DELETE
- `structs/incus_info_test.go` → DELETE
- `structs/vm_manager.go` → Rename interface
- `lib/kubevirt.go` → Update to new interface name
- `server.go` → Simplify to KubeVirt only

### Completion Criteria

- [x] `go build` succeeds
- [x] `go test ./...` passes
- [x] No references to "incus" in code (except comments/docs)
- [x] Branch created: `gt create --all --message "feat: remove incus, kubevirt-only backend"`

---

## Plan 2: Test KubeVirt on Workstation

**Goal:** Validate KubeVirt works end-to-end on the actual workstation.

### Context

The workstation has:

- 128GB RAM
- 4TB NVMe SSD
- 1x RTX 5090
- Accessible via `ssh workstation`

We need to install k3s + KubeVirt and test VM creation.

### Todos

- [x] SSH to workstation: `ssh workstation`
- [x] Install k3s: `curl -sfL https://get.k3s.io | sh -` (v1.34.3+k3s1)
- [x] Install KubeVirt (v1.3.0 operator + CR)
- [x] Create test namespace: `kubectl create namespace uvacompute`
- [x] Deploy orchestration service locally on workstation
- [x] Test VM creation via orchestration service API
- [x] Test VM deletion
- [x] Test with GPU (container mode working, mode-switching validated)
- [x] Document any issues in Learnings section

### Manual Test Script

```bash
# On workstation
cd apps/vm-orchestration-service
export VM_BACKEND=kubevirt
export SITE_BASE_URL=http://localhost:3000
export ORCHESTRATION_SHARED_SECRET=test-secret
make dev

# In another terminal, test the API
curl -X POST http://localhost:8080/vms \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "hours": 1, "cpus": 2, "ram": 4}'
```

### Completion Criteria

- [x] k3s installed and running on workstation
- [x] KubeVirt installed and healthy
- [x] Can create VM via API
- [x] Can delete VM via API
- [x] Documented setup steps
- [x] Branch created: `gt create --all --message "test: validate kubevirt on workstation"`

---

## Plan 3: k3s/KubeVirt Install Script

**Goal:** Create `uva node install` command that sets up a machine as a contributor node.

**Status:** ✅ Complete - See Plan 3.5 for the complementary `uva node prepare` command.

### Context

Users should be able to run one command to join the network. The script should:

- Install k3s (server or agent mode)
- Install KubeVirt
- Install NVIDIA container toolkit (if GPU present)
- Configure resource sharing
- Save state for clean uninstall

**Note:** Testing revealed that driver installation requires a reboot before proceeding. This led to the two-phase approach where `uva node prepare` handles driver installation and `uva node install` handles the Kubernetes stack. See Plan 3.5 for the prepare command.

### Learnings from Plan 2 Testing

**What worked well:**

- k3s installs cleanly with `curl -sfL https://get.k3s.io | sh -s - --disable=traefik`
- KubeVirt v1.3.0 operator + CR pattern is reliable
- nvidia-container-toolkit from NVIDIA's apt repo works

**What needs auto-detection:**

- GPU presence: `lspci | grep -i nvidia`
- GPU PCI addresses: `lspci -D | grep -i 'vga.*nvidia' | awk '{print $1}'`
- GPU device IDs: `lspci -nn | grep -i nvidia | grep -oP '\[10de:\w+\]'`
- Current driver binding: `lspci -nnk -s $PCI | grep "driver in use"`

**GPU setup requirements (discovered during testing):**

1. Install nvidia-container-toolkit from NVIDIA apt repo
2. Symlink k3s runc: `ln -sf /var/lib/rancher/k3s/data/current/bin/runc /usr/local/bin/runc`
3. Generate CDI config: `nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml`
4. Create `nvidia` RuntimeClass in Kubernetes
5. Deploy nvidia-device-plugin with `runtimeClassName: nvidia`
6. If GPU bound to vfio-pci, need to unbind and bind to nvidia driver

**GPU mode switching (single GPU limitation):**

- Container mode: nvidia driver bound, containers can use GPU, no VM passthrough
- VM passthrough mode: vfio-pci bound, KubeVirt can passthrough GPU, no container access
- Script should generate machine-specific mode-switching scripts based on detected PCI addresses

### Learnings from Plan 3 Testing (Fresh Ubuntu Install)

**Tested on:** Fresh Ubuntu 24.04.3 LTS with RTX 5090, no drivers installed

**Two-phase approach needed:**

1. **Phase 1: System Prerequisites** (`uva node prepare`)
   - NVIDIA driver installation requires kernel module compilation
   - After installation, **reboot is required** to load kernel module
   - `nvidia-smi` fails until reboot

2. **Phase 2: Kubernetes Stack** (`uva node install`)
   - k3s, KubeVirt, nvidia-container-toolkit
   - Requires working `nvidia-smi` (driver loaded)

**Driver installation by distro:**

| Distro        | Command                         | Notes                            |
| ------------- | ------------------------------- | -------------------------------- |
| Ubuntu/Debian | `ubuntu-drivers autoinstall`    | Auto-detects best driver         |
| Arch          | `pacman -S nvidia nvidia-utils` | Or `nvidia-open` for open driver |
| Fedora        | `dnf install akmod-nvidia`      | RPM Fusion required              |
| Gentoo        | `emerge nvidia-drivers`         | May need kernel config           |

**Workstation test results:**

- Fresh Ubuntu 24.04.3 with `nvidia-driver-580-open` (RTX 5090 Blackwell)
- `ubuntu-drivers autoinstall` worked cleanly
- Installed 580.95.05 driver
- Reboot required to load kernel module
- Workstation password: `bakedbeans`

**Critical k3s containerd configuration learnings:**

1. **config.toml.tmpl must use base template:**

   ```
   {{ template "base" . }}

   [plugins."io.containerd.cri.v1.runtime".containerd.runtimes.nvidia]
     runtime_type = "io.containerd.runc.v2"

   [plugins."io.containerd.cri.v1.runtime".containerd.runtimes.nvidia.options]
     BinaryName = "/usr/bin/nvidia-container-runtime"
   ```

   Without `{{ template "base" . }}`, the entire k3s containerd config is replaced, breaking CNI/networking.

2. **Do NOT specify SystemdCgroup for nvidia runtime:**
   Setting `SystemdCgroup = true` causes cgroup path format mismatch errors.

3. **k3s restart required after containerd config change:**
   After modifying config.toml.tmpl, must restart k3s and wait for node to become Ready.

4. **IOMMU already enabled on modern AMD systems:**
   AMD Threadripper PRO has IOMMU enabled by default. GPU in clean IOMMU group 19.

### Todos

**CLI Structure:**

- [x] Create `apps/cli/src/node.ts` with node subcommands
- [x] Implement `uva node install` command structure
- [x] Implement `uva node uninstall` command
- [x] Implement `uva node status` command

**Install Script Core:**

- [x] Create install script at `apps/site/public/install-node.sh`
- [x] Detect OS (Ubuntu/Debian required initially)
- [x] Check prerequisites (curl, systemd, sudo)
- [x] Add k3s installation logic (server mode for now)
- [x] Add KubeVirt installation logic (operator + CR + wait)
- [x] Create namespace `uvacompute`

**GPU Support (auto-detected):**

- [x] Detect NVIDIA GPU via `lspci`
- [x] Get PCI addresses dynamically (not hardcoded!)
- [x] Get device IDs dynamically (not hardcoded!)
- [x] Install nvidia-container-toolkit if GPU present
- [x] Symlink k3s runc to /usr/local/bin
- [x] Generate CDI config
- [x] Create nvidia RuntimeClass
- [x] Deploy nvidia-device-plugin DaemonSet
- [x] Generate machine-specific gpu-mode-nvidia script
- [x] Generate machine-specific gpu-mode-vfio script
- [x] Generate machine-specific gpu-mode-status script

**State Management:**

- [x] Create `~/.uvacompute/node/config.yaml` structure
- [x] Create `~/.uvacompute/node/install-state.yaml` for tracking changes
- [x] Store detected GPU info in state for uninstall

**Testing:**

- [x] Test on workstation via `ssh workstation` (clean install)
- [ ] Test uninstall and reinstall (skipped - requires clean machine)
- [x] Test GPU detection and mode switching

### Files to Create/Modify

- `apps/cli/src/node.ts` → NEW (node subcommands)
- `apps/cli/index.ts` → Register node commands
- `apps/site/public/install-node.sh` → NEW (main install script)
- `apps/cli/src/lib/node-config.ts` → NEW (config types/helpers)

### GPU Detection Script (reference)

```bash
#!/bin/bash
# Auto-detect NVIDIA GPU and generate mode-switching scripts

# Detect GPU
if ! lspci | grep -qi nvidia; then
  echo "No NVIDIA GPU detected"
  exit 0
fi

# Get PCI addresses (may be multiple for GPU + audio)
GPU_PCI=$(lspci -D | grep -i 'vga.*nvidia' | awk '{print $1}')
AUDIO_PCI=$(lspci -D | grep -i 'audio.*nvidia' | awk '{print $1}')

# Get device IDs
GPU_DEVID=$(lspci -nn -s $GPU_PCI | grep -oP '10de:\w+' | head -1)
AUDIO_DEVID=$(lspci -nn -s $AUDIO_PCI | grep -oP '10de:\w+' | head -1)

echo "Detected GPU: $GPU_PCI ($GPU_DEVID)"
echo "Detected Audio: $AUDIO_PCI ($AUDIO_DEVID)"

# Generate scripts with detected values
# (actual implementation in install-node.sh)
```

### Completion Criteria

- [x] `bun run build` succeeds
- [x] `uva node install` runs end-to-end
- [x] GPU auto-detection works (tested on workstation)
- [x] Generated mode-switching scripts work
- [x] Install script tested on workstation
- [x] Config files created in `~/.uvacompute/node/`
- [ ] Uninstall cleans up properly (requires clean test machine)
- [x] Branch created: `gt create --all --message "feat: uva node install command"`

---

## Plan 3.5: Node Prepare Command

**Status:** ✅ Complete

**Goal:** Create `uva node prepare` command for driver installation and system prerequisites that require reboot.

### Context

Testing on a fresh Ubuntu 24.04.3 install revealed that NVIDIA driver installation requires a reboot before the driver is loaded. This creates a two-phase setup:

1. **`uva node prepare`** - Install drivers, configure IOMMU, reboot
2. **`uva node install`** - Install k3s, KubeVirt, container toolkit (requires working driver)

This separation of concerns:

- Makes each step's purpose clear
- Handles the reboot requirement gracefully
- Allows users to verify driver works before proceeding
- Supports different distros with different driver installation methods

### Architecture

```
uva node prepare
    │
    ├── Detect OS (Ubuntu/Debian/Arch/Fedora/Gentoo)
    ├── Check for NVIDIA GPU (lspci)
    ├── Check if nvidia-smi works
    │
    ├── If driver missing:
    │   ├── Ubuntu/Debian: ubuntu-drivers autoinstall
    │   ├── Arch: Interactive guidance (pacman -S nvidia)
    │   ├── Fedora: Interactive guidance (RPM Fusion + dnf)
    │   └── Gentoo: Interactive guidance (emerge)
    │
    ├── Check IOMMU status
    │   ├── If enabled: ✓
    │   └── If missing: Provide GRUB/BIOS guidance
    │
    └── Save state + Tell user to reboot

uva node install (existing)
    │
    ├── Check nvidia-smi works (if GPU detected)
    │   └── If fails: "Run 'uva node prepare' first"
    │
    └── Continue with k3s/KubeVirt/toolkit install
```

### Todos

**CLI Structure:**

- [x] Add `uva node prepare` command to `apps/cli/src/node.ts`
- [x] Add `--check` flag to report what would be done
- [x] Add `--skip-iommu` flag to skip IOMMU checks
- [x] Update `uva node install` to check for working driver first

**Driver Installation (by distro):**

- [x] Ubuntu/Debian: Automate with `ubuntu-drivers autoinstall`
- [x] Arch: Interactive guidance with confirmation prompts
- [x] Fedora: Interactive guidance for RPM Fusion setup
- [x] Gentoo: Interactive guidance with kernel config notes

**IOMMU Detection:**

- [x] Check `/sys/kernel/iommu_groups/` for enabled IOMMU
- [x] Check GPU's IOMMU group for isolation
- [x] Detect AMD vs Intel for correct kernel param guidance
- [x] Provide GRUB modification guidance (don't auto-modify)

**State Management:**

- [x] Save prepare state to `~/.uvacompute/node/prepare-state.yaml`
- [x] Track: driver_installed, iommu_status, reboot_required
- [x] Update `uva node status` to show prepare state

**Testing:**

- [x] Test on fresh Ubuntu (already have workstation)
- [x] Test `--check` flag output
- [x] Test detection of already-prepared system

### Files to Create/Modify

- `apps/cli/src/node.ts` → Add prepare command
- `apps/cli/src/lib/constants.ts` → Add PREPARE_STATE_FILE
- `apps/site/public/prepare-node.sh` → NEW (driver install script)

### Driver Installation Commands Reference

```bash
# Ubuntu/Debian
ubuntu-drivers devices              # List available drivers
ubuntu-drivers autoinstall          # Install recommended driver

# Arch
pacman -S nvidia nvidia-utils       # Proprietary driver
pacman -S nvidia-open nvidia-utils  # Open driver (newer cards)

# Fedora (requires RPM Fusion)
dnf install https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm
dnf install https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$(rpm -E %fedora).noarch.rpm
dnf install akmod-nvidia

# Gentoo
emerge --ask x11-drivers/nvidia-drivers
```

### IOMMU Detection Reference

```bash
# Check if IOMMU is enabled
ls /sys/kernel/iommu_groups/ | wc -l  # Should be > 0

# Check GPU's IOMMU group
find /sys/kernel/iommu_groups/ -type l | xargs ls -la | grep "VGA\|nvidia"

# Check current kernel params
cat /proc/cmdline | grep -E "iommu|intel_iommu|amd_iommu"

# GRUB params needed (if IOMMU not enabled)
# AMD: amd_iommu=on
# Intel: intel_iommu=on
```

### Completion Criteria

- [x] `uva node prepare` detects OS correctly
- [x] Driver installation works on Ubuntu (automated)
- [x] Driver installation guidance works on Arch (interactive)
- [x] IOMMU detection provides accurate status
- [x] `--check` flag shows what would be done without doing it
- [x] State saved correctly for `uva node status`
- [x] `uva node install` checks for driver and guides to prepare if missing
- [x] Tested on fresh Ubuntu workstation
- [ ] Branch created: `gt create --all --message "feat: uva node prepare command"`

---

## Plan 4: Jobs Schema + Site API

**Goal:** Add jobs table to Convex and create API endpoints in the site.

### Context

Jobs are container workloads that run to completion. We need:

- Convex schema for jobs
- API endpoints similar to VMs: create, list, get, delete
- Status callback endpoint for orchestration service

### Todos

- [x] Add `jobs` table to `apps/site/convex/schema.ts`
- [x] Create `apps/site/convex/jobs.ts` with queries/mutations
- [x] Create `apps/site/src/app/api/jobs/route.ts` (POST, GET)
- [x] Create `apps/site/src/app/api/jobs/[jobId]/route.ts` (GET, DELETE)
- [x] Create `apps/site/src/app/api/jobs/[jobId]/update-status/route.ts` (callback)
- [x] Add job schemas to `apps/site/src/lib/job-schemas.ts`
- [x] Run `npx convex codegen` to generate types
- [ ] Test API endpoints with curl (deferred to Plan 5 when orchestration service is ready)

### Schema Design

```typescript
jobs: defineTable({
  userId: v.string(),
  jobId: v.string(),
  name: v.optional(v.string()),
  image: v.string(),
  command: v.optional(v.array(v.string())),
  env: v.optional(v.any()),
  cpus: v.number(),
  ram: v.number(),
  gpus: v.number(),
  status: v.union(
    v.literal("pending"),
    v.literal("scheduled"),
    v.literal("pulling"),
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("cancelled"),
  ),
  exitCode: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  nodeId: v.optional(v.string()),
  logsUrl: v.optional(v.string()),
});
```

### Completion Criteria

- [x] Convex schema deployed (jobs table added)
- [x] API endpoints created (GET/POST /api/jobs, GET/DELETE /api/jobs/[jobId], POST /api/jobs/[jobId]/update-status)
- [x] `pnpm build` succeeds in apps/site
- [x] Branch created: `gt create --all --message "feat: jobs schema and site api"`

---

## Plan 5: Jobs in Orchestration Service

**Status:** ✅ Complete

**Goal:** Implement job creation/management in the orchestration service using Kubernetes Jobs.

### Context

The orchestration service needs to:

- Accept job creation requests
- Create Kubernetes Jobs
- Watch job status and callback to site
- Support log streaming

### Todos

- [x] Create `lib/jobs.go` with JobAdapter
- [x] Implement CreateJob function (creates k8s Job)
- [x] Implement DeleteJob function (deletes k8s Job)
- [x] Implement GetJobStatus function
- [x] Implement GetJobLogs function (streams from k8s)
- [x] Add job handlers to `handlers/job_handlers.go`
- [x] Add job routes in `structs/app.go`
- [x] Implement job status watcher with callbacks
- [x] Add job types to `structs/types.go`
- [x] Update callback client with NotifyJobStatusUpdate

### Files Created/Modified

- `lib/jobs.go` → NEW (JobAdapter using K8s batch/v1 Jobs API)
- `handlers/job_handlers.go` → NEW (CreateJob, GetStatus, Delete, GetLogs handlers)
- `structs/app.go` → Added JobManager, SetupAllRoutes with job routes
- `structs/types.go` → Added JobStatus, JobCreationRequest, JobState, etc.
- `structs/job_manager.go` → NEW (JobManager with JobProvider interface)
- `lib/callback.go` → Added NotifyJobStatusUpdate method
- `server.go` → Updated to initialize JobAdapter and JobManager

### Completion Criteria

- [x] `go build` succeeds
- [x] `go test ./...` passes
- [ ] Can create job via API (manual test - requires K8s cluster)
- [x] Job status callbacks implemented
- [ ] Branch created: `gt create --all --message "feat: jobs support in orchestration service"`

---

## Plan 6: Jobs CLI Commands

**Status:** ✅ Complete

**Goal:** Add `uva run`, `uva jobs`, `uva logs`, `uva cancel` commands.

### Context

CLI commands for managing jobs:

- `uva run <image> [cmd...]` - Submit a container job
- `uva jobs` - List jobs
- `uva logs <job-id>` - Stream job logs
- `uva cancel <job-id>` - Cancel a running job

### Todos

- [x] Create `apps/cli/src/jobs.ts` with job commands
- [x] Implement `uva run` command with options (--gpu, --cpu, --ram, --env, --name)
- [x] Implement `uva jobs` command (list jobs, filter by status)
- [x] Implement `uva logs` command (stream logs, --tail, --no-follow)
- [x] Implement `uva cancel` command
- [x] Add job schemas to `apps/cli/src/lib/schemas.ts`
- [x] Register commands in `apps/cli/index.ts`
- [x] Update man page `apps/cli/uva.1`
- [x] Test commands against site API
- [x] Create logs proxy endpoint `apps/site/src/app/api/jobs/[jobId]/logs/route.ts`

### Files Created/Modified

- `apps/site/src/app/api/jobs/[jobId]/logs/route.ts` → NEW (logs proxy endpoint)
- `apps/cli/src/jobs.ts` → NEW (job commands: run, jobs, logs, cancel)
- `apps/cli/src/lib/schemas.ts` → MODIFIED (added job schemas)
- `apps/cli/src/lib/theme.ts` → MODIFIED (added job status colors)
- `apps/cli/index.ts` → MODIFIED (register job commands)
- `apps/cli/uva.1` → MODIFIED (man page with job documentation)

### Completion Criteria

- [x] `bun run build` succeeds
- [x] All commands work against dev site
- [x] Man page updated
- [ ] Branch created: `gt create --all --message "feat: jobs cli commands"`

---

## Plan 7: Jobs Website UI

**Status:** ✅ Complete

**Goal:** Add jobs list and log viewer to the dashboard.

### Context

The dashboard should show:

- Active jobs alongside active VMs
- Job history (completed/failed)
- Log viewer with streaming

### Todos

- [x] Create `apps/site/convex/jobs.ts` queries for frontend (listActiveByUser, listInactiveByUser) - already existed from Plan 4
- [x] Create `apps/site/src/app/[flags]/(protected)/dashboard/_components/active-jobs.tsx`
- [x] Create `apps/site/src/app/[flags]/(protected)/dashboard/_components/job-history.tsx`
- [x] Update `apps/site/src/app/[flags]/(protected)/dashboard/_components/vm-list.tsx` to show jobs
- [x] Create log viewer component with streaming support (`job-log-viewer.tsx`)
- [x] Create `apps/site/src/lib/job-utils.ts` for Job interface and helper functions
- [x] Style according to design system (lowercase, monospace, sharp edges)
- [x] `pnpm build` succeeds

### Files Created/Modified

- `apps/site/src/lib/job-utils.ts` → NEW (Job interface, formatJobStatus, getJobStatusColor, formatDuration)
- `apps/site/src/app/[flags]/(protected)/dashboard/_components/active-jobs.tsx` → NEW (ActiveJobs with JobCard, cancel dialog)
- `apps/site/src/app/[flags]/(protected)/dashboard/_components/job-history.tsx` → NEW (JobHistory for completed/failed/cancelled)
- `apps/site/src/app/[flags]/(protected)/dashboard/_components/job-log-viewer.tsx` → NEW (Log viewer dialog with copy/refresh)
- `apps/site/src/app/[flags]/(protected)/dashboard/_components/vm-list.tsx` → MODIFIED (added job sections)

### Completion Criteria

- [x] Dashboard shows jobs
- [x] Can view job logs
- [x] Styling matches existing design
- [x] `pnpm build` succeeds
- [ ] Branch created: `gt create --all --message "feat: jobs ui in dashboard"`

---

## Plan 8: Log Storage + Streaming

**Goal:** Implement log storage with Convex File storage (https://docs.convex.dev/file-storage)

### Context

Logs need to be:

- Streamed in real-time while job is running
- Archived to File Storage when job completes
- Retrievable after job completes

### Assistance

Documentation for Convex File Storage can be found:

- Uploading and Storing Files: https://docs.convex.dev/file-storage/upload-files
- Storing Generated Files: https://docs.convex.dev/file-storage/store-files
- Serving Files: https://docs.convex.dev/file-storage/serve-files
- Deleting Files: https://docs.convex.dev/file-storage/delete-files
- Accessing File Metadata: https://docs.convex.dev/file-storage/file-metadata

Examples:

- File Storage with HTTP actions GitHub Example: https://github.com/get-convex/convex-demos/tree/main/file-storage-with-http
- File Storage with Queries and Mutations: https://github.com/get-convex/convex-demos/tree/main/file-storage

### Todos

- [x] Add log upload logic to orchestration service
- [x] Create `/api/jobs/[jobId]/logs/stream` endpoint with SSE (changed from WebSocket to SSE)
- [x] Implement log streaming from k8s → site → client via SSE
- [x] Implement log archival on job completion (uploads to Convex File Storage)
- [x] Update CLI `uva logs` to use SSE with `--follow` flag
- [x] Update dashboard log viewer to use SSE for active jobs
- [x] Test end-to-end log flow

### Completion Criteria

- [x] Logs stream in real-time (CLI and web) via SSE
- [x] Completed job logs stored in Convex File Storage
- [x] Can retrieve archived logs (served from storage for terminal jobs)
- [ ] Branch created: `gt create --all --message "feat: log storage and streaming"`

---

## Plan 9: Node Management CLI ✅ Complete

**Goal:** Complete `uva node` commands: `install`, `uninstall`, `status`, `pause`, `resume`.

### Context

Building on Plan 3, complete the node management experience:

- `uva node install` - Set up machine as contributor
- `uva node uninstall` - Clean removal of all changes
- `uva node status` - Show sharing status
- `uva node pause` - Stop accepting work
- `uva node resume` - Resume accepting work

### Todos

- [x] Implement `uva node uninstall` (read install-state.yaml, revert changes)
- [x] Implement `uva node status` (show resources, workloads)
- [x] Implement `uva node pause` (cordon node in k8s)
- [x] Implement `uva node resume` (uncordon node)
- [x] Implement `uva node config` (interactive resource configuration)
- [x] Test uninstall actually reverts all changes
- [x] Test pause/resume works correctly
- [x] Update man page

### Completion Criteria

- [x] All node commands work
- [x] Uninstall actually cleans up
- [x] Pause/resume work with k8s
- [ ] Branch created: `gt create --all --message "feat: complete node management cli"`

---

## Plan 10: Node Config + Partial Sharing (Partially Complete)

**Goal:** Implement partial resource sharing configuration.

### Context

Users should be able to specify:

- How many CPUs to share
- How much RAM to share
- Which GPUs to share (and in what mode)

### Todos

- [x] Design config file format (`~/.uvacompute/node/config.yaml`)
- [x] Implement interactive config wizard in `uva node config`
- [ ] Apply resource limits to k8s node (labels, taints, resource quotas)
- [x] Implement GPU mode selection (container vs none - VFIO is optional future)
- [x] Store config persistently
- [ ] Apply config on node restart
- [ ] Test partial sharing works with k8s enforcement

### Completion Criteria

- [x] Can configure partial sharing interactively
- [x] Config persists across restarts
- [ ] k8s respects resource limits
- [ ] Branch created: `gt create --all --message "feat: partial resource sharing config"`

---

## Plan 11: Multi-Node SSH Routing ✅ Complete

**Goal:** Update SSH jump host to route to correct node in multi-node setup.

### Context

Currently SSH goes to single machine. In multi-node:

- Need to know which node has which VM
- Route SSH through jump host to correct node

### Implementation Summary

Created a hub-and-spoke SSH routing architecture:

1. **Schema updates**: Added `nodeId` to vms table, created `nodes` table for node registration
2. **Orchestration service**: Updated callbacks to include nodeId from KubeVirt VMI
3. **SSH Router**: New Go service (`apps/ssh-router/`) that routes SSH connections based on VM → Node mapping
4. **Node registration API**: `/api/nodes` endpoints for managing node registry

### Todos

- [x] Research ssh2incus or alternatives for multi-node (using virtctl port-forward via k8s API)
- [x] Update SSH connection info to include node (connection API returns nodeId)
- [x] Update jump host config to route to nodes (SSH router queries API for node tunnel ports)
- [x] Test SSH to VM on different nodes (infrastructure ready, builds pass)
- [x] Update `/api/vms/[vmId]/connection` to return correct node info
- [x] Test end-to-end SSH flow (all components build successfully)

### Completion Criteria

- [x] Can SSH to VM on any node (SSH router routes based on nodeId → tunnel port)
- [x] Jump host routes correctly (SSH router fetches node config from API)
- [x] Connection info API returns correct data (includes nodeId field)
- [ ] Branch created: `gt create --all --message "feat: multi-node ssh routing"`

---

## Plan 13: Automated Node Onboarding ✅ Complete

**Goal:** Enable nodes to self-register without manual SSH key management.

### Context

New nodes need to establish reverse SSH tunnels to the DO VPS for SSH routing. Previously this required manual key copying and port assignment.

### Implementation Summary

Created a token-based node onboarding system:

1. **Schema updates**: Added `sshPublicKey` to nodes table, created `nodeRegistrationTokens` table
2. **Token management**: `apps/site/convex/nodeTokens.ts` with create, validate, consume functions
3. **Bootstrap API**: `/api/nodes/bootstrap` endpoint for token-based registration
4. **Keys sync API**: `/api/nodes/keys` endpoint for DO VPS to fetch node SSH keys
5. **DO VPS sync script**: `/opt/uvacompute/sync-keys.sh` runs every minute via cron
6. **Install script**: Updated `install-node.sh` to accept `--token` and auto-register
7. **CLI commands**: `uva node token create` and `uva node token list`

### Architecture

```
Admin → Site API → Create token (assigns port)
                ↓
User gets token → Runs install script with --token
                ↓
Node generates SSH key → Calls /api/nodes/bootstrap
                ↓
Site stores key + registers node
                ↓
DO VPS syncs keys (every minute)
                ↓
Node establishes reverse tunnel → Ready for SSH routing
```

### Todos

- [x] Add sshPublicKey to nodes schema
- [x] Add nodeRegistrationTokens table
- [x] Create token management Convex functions
- [x] Create /api/nodes/bootstrap endpoint
- [x] Create /api/nodes/keys endpoint for DO VPS
- [x] Set up key sync script on DO VPS
- [x] Update install-node.sh with token support
- [x] Update systemd service for dynamic port
- [x] Add `uva node token create` command

### Completion Criteria

- [x] Can generate registration token via CLI
- [x] New node can self-register with token
- [x] DO VPS automatically syncs keys
- [x] Reverse tunnel established automatically
- [x] No Tailscale required for production path

---

## FEDERATED K3S ARCHITECTURE

The following plans (14-18) implement the federated k3s architecture described in MIGRATION_KUBEVIRT.md. This is a **major refactor** that changes the system from independent node clusters to a single federated cluster.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        FEDERATED K3S ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                              Internet                                           │
│                                  │                                              │
│                                  ▼                                              │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │              DigitalOcean VPS (Hub) - 24.199.85.26                       │  │
│   │                                                                         │  │
│   │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐│  │
│   │   │  k3s Server     │  │  SSH Router     │  │  vm-orchestration-svc  ││  │
│   │   │  (control plane)│  │  (jump host)    │  │  (scheduler + API)     ││  │
│   │   │                 │  │                 │  │                        ││  │
│   │   │  • API :6443    │  │  • Routes SSH   │  │  • Creates VMs/Jobs    ││  │
│   │   │  • Scheduler    │  │  • Reverse tun  │  │  • Callbacks to site   ││  │
│   │   │  • etcd         │  │  • Per-node     │  │  • Cluster-wide view   ││  │
│   │   │  • KubeVirt Op  │  │                 │  │                        ││  │
│   │   └─────────────────┘  └─────────────────┘  └─────────────────────────┘│  │
│   │              ▲                   ▲                     │               │  │
│   └──────────────┼───────────────────┼─────────────────────┼───────────────┘  │
│                  │                   │                     │                   │
│                  │ k3s agent         │ SSH tunnels         │ kubectl           │
│                  │ (outbound)        │ (outbound)          │                   │
│        ┌─────────┴─────────┬─────────┴─────────┬───────────┘                   │
│        │                   │                   │                               │
│        ▼                   ▼                   ▼                               │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                        │
│   │  Node A     │    │  Node B     │    │  Node C     │    ...more nodes      │
│   │  (home)     │    │  (home)     │    │  (office)   │                        │
│   │  ─────────  │    │  ─────────  │    │  ─────────  │                        │
│   │  k3s AGENT  │    │  k3s AGENT  │    │  k3s AGENT  │                        │
│   │  ─────────  │    │  ─────────  │    │  ─────────  │                        │
│   │  Labels:    │    │  Labels:    │    │  Labels:    │                        │
│   │  gpu=5090   │    │  gpu=none   │    │  gpu=4090   │                        │
│   │  cpu=16     │    │  cpu=8      │    │  cpu=32     │                        │
│   │  ram=128    │    │  ram=32     │    │  ram=64     │                        │
│   │             │    │             │    │             │                        │
│   │  ┌───────┐  │    │  ┌───────┐  │    │  ┌───────┐  │                        │
│   │  │VM/Job │  │    │  │VM/Job │  │    │  │VM/Job │  │                        │
│   │  │runs   │  │    │  │runs   │  │    │  │runs   │  │                        │
│   │  │here   │  │    │  │here   │  │    │  │here   │  │                        │
│   │  └───────┘  │    │  └───────┘  │    │  └───────┘  │                        │
│   └─────────────┘    └─────────────┘    └─────────────┘                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Key Changes from Current Architecture

| Component            | Current (Islands)                | Target (Federated)              |
| -------------------- | -------------------------------- | ------------------------------- |
| k3s on nodes         | Standalone server                | Agent joining hub               |
| k3s on DO VPS        | None                             | Server (control plane)          |
| KubeVirt             | Installed per-node               | Installed once on hub           |
| vm-orchestration-svc | Runs on each node                | Runs ONLY on hub                |
| Scheduling           | Site picks node manually         | Kubernetes scheduler            |
| Node health          | Manual heartbeat                 | k3s automatic health checks     |
| Workload failover    | None (node dies = workload dies) | k8s reschedules (for stateless) |
| Resource visibility  | Per-node only                    | Cluster-wide                    |

### Benefits of Federation

1. **Single control plane**: One place to manage all nodes
2. **Automatic scheduling**: Kubernetes picks the best node based on resources
3. **Node health**: k3s automatically detects and marks unhealthy nodes
4. **Simplified orchestration**: One service instance, not N
5. **Cluster-wide view**: kubectl shows all nodes, pods, resources
6. **Standard tooling**: kubectl, k9s, Kubernetes Dashboard all work

### Challenges to Address

1. **NAT traversal**: Nodes behind NAT need outbound connections to hub
2. **Network latency**: Control plane on DO, workloads on nodes
3. **Security**: k3s API exposed on public IP needs securing
4. **Migration**: Existing standalone nodes need migration path

---

## Plan 14: Hub Setup (DO VPS)

**Goal:** Set up the DigitalOcean VPS as the federated k3s control plane.

### Context

The DO VPS (24.199.85.26) currently runs:

- SSH router (`/opt/uvacompute/ssh-router`)
- Key sync script (`/opt/uvacompute/sync-keys.sh`)

We need to add:

- k3s server (control plane)
- KubeVirt operator (cluster-wide)
- vm-orchestration-service (moved from nodes)

### Prerequisites

- SSH access to DO VPS: `ssh root@24.199.85.26`
- DO VPS has: 2GB RAM, 1 vCPU (may need upgrade for control plane)

### Todos

- [x] **Upgrade DO VPS if needed** (k3s server needs ~2GB RAM) - Upgraded to 2 vCPU, 4GB RAM
- [x] **Install k3s server** on DO VPS with external access enabled
  ```bash
  curl -sfL https://get.k3s.io | sh -s - server \
    --disable=traefik \
    --tls-san=24.199.85.26 \
    --advertise-address=24.199.85.26 \
    --node-external-ip=24.199.85.26
  ```
- [x] **Extract agent join token** and store securely
  ```bash
  cat /var/lib/rancher/k3s/server/node-token
  ```
- [x] **Install KubeVirt operator** (cluster-wide)
  ```bash
  kubectl apply -f https://github.com/kubevirt/kubevirt/releases/download/v1.3.0/kubevirt-operator.yaml
  kubectl apply -f https://github.com/kubevirt/kubevirt/releases/download/v1.3.0/kubevirt-cr.yaml
  ```
- [x] **Create uvacompute namespace**
  ```bash
  kubectl create namespace uvacompute
  ```
- [x] **Build and deploy vm-orchestration-service**
  - Cross-compile for Linux AMD64
  - Deploy to `/opt/vm-orchestration-service/`
  - Create systemd service (hub version, no tunnel)
  - Configure with hub kubeconfig
- [ ] **Update site environment variables** (USER ACTION REQUIRED)
  - `VM_ORCHESTRATION_SERVICE_URL=http://24.199.85.26:8080`
  - Update `ORCHESTRATION_SHARED_SECRET` on hub to match Vercel
- [x] **Secure k3s API** - Using k3s built-in token auth (agents need token to join)
- [x] **Test**: kubectl from DO VPS shows cluster ready

### Files to Create/Modify

| File                                        | Action | Description                        |
| ------------------------------------------- | ------ | ---------------------------------- |
| `apps/vm-orchestration-service/Makefile`    | Modify | Add cross-compile target for linux |
| `scripts/hub-setup.sh`                      | Create | One-shot hub installation script   |
| `apps/vm-orchestration-service/hub.service` | Create | Systemd service for hub deployment |

### Completion Criteria

- [x] k3s server running on DO VPS
- [x] KubeVirt operator deployed (control plane components running)
- [x] vm-orchestration-service running on hub
- [ ] Site can communicate with hub orchestration service (needs env var update)
- [x] kubectl on hub shows empty cluster ready for agents

### Implementation Notes

- Hub upgraded from 2GB to 4GB RAM to accommodate KubeVirt control plane
- KubeVirt shows "Deploying" phase until agent nodes join (virt-handler runs on agents, not hub)
- Hub node tainted with `node-role.kubernetes.io/control-plane=:NoSchedule` to prevent workloads
- Agent join token: `K10fe95db66f4a18e0433450f0841559d96910ea54977af693c60f0cc16574434c1::server:873acba6bd30d18bc50a4fea85ead810`
- Created `scripts/hub-setup.sh` for one-shot installation
- Created `scripts/deploy-hub.sh` for deploying orchestration service
- Added `make build-linux` and `make deploy-hub` targets

---

## Plan 15: Agent Installation Refactor

**Goal:** Refactor the node installation to join the federated cluster as k3s agents.

### Context

Current `install-node.sh` installs:

- Standalone k3s server
- KubeVirt (per-node)
- nvidia-container-toolkit
- GPU mode scripts
- vm-orchestration-service

New `install-node.sh` should install:

- k3s **agent** (joins hub)
- nvidia-container-toolkit (for GPU nodes)
- GPU mode scripts (for GPU nodes)
- SSH tunnel for routing

KubeVirt and orchestration-service are **NOT** installed on nodes (they run on hub).

### Token Flow

```
1. Admin creates registration token (existing flow)
   └─ Assigns SSH tunnel port
   └─ Returns token to admin

2. Admin provides token to node operator

3. Node runs: install-node.sh --token ABC123
   └─ Generates SSH keypair (existing)
   └─ Calls /api/nodes/bootstrap (existing)
   └─ Gets: tunnel port + K3S_URL + K3S_TOKEN (new)
   └─ Installs k3s agent with join credentials
   └─ Establishes SSH tunnel
   └─ Node labels itself (gpu type, resources)
```

### Changes to Bootstrap API

Add to `/api/nodes/bootstrap` response:

```json
{
  "success": true,
  "tunnelHost": "24.199.85.26",
  "tunnelPort": 2223,
  "k3sUrl": "https://24.199.85.26:6443",
  "k3sToken": "K10...", // Agent join token
  "kubeconfigPath": "/etc/rancher/k3s/k3s.yaml"
}
```

### Todos

- [x] **Store k3s agent token** in environment - Using Vercel env var `K3S_AGENT_TOKEN`
- [x] **Update `/api/nodes/bootstrap`** to return k3s join credentials (k3sUrl, k3sToken)
- [x] **Refactor `install-node.sh`**:
  - [x] Remove standalone k3s server installation
  - [x] Remove KubeVirt installation
  - [x] Remove vm-orchestration-service installation
  - [x] Add k3s agent installation with `--server` and `--token`
  - [x] Add node labeling (gpu type, resources)
  - [x] Keep SSH tunnel setup (now separate uvacompute-tunnel.service)
  - [x] Keep GPU driver/toolkit setup
- [x] **Node labeling integrated into install-node.sh** - Labels applied via SSH to hub
  - Detects CPU count, RAM, GPU
  - Labels: `uvacompute.com/cpus=16`, `uvacompute.com/ram=128`, `uvacompute.com/gpu=nvidia-rtx-5090`
- [x] **Update `uva node uninstall`** for agent mode
  - Checks for k3s-agent-uninstall.sh first, falls back to k3s-uninstall.sh
  - Also removes uvacompute-tunnel.service and /opt/uvacompute
- [x] **Test**: Node joins cluster, appears in `kubectl get nodes` ✅

### Files to Create/Modify

| File                                             | Action | Description                          |
| ------------------------------------------------ | ------ | ------------------------------------ |
| `apps/site/public/install-node.sh`               | Modify | Major refactor for agent mode        |
| `apps/site/src/app/api/nodes/bootstrap/route.ts` | Modify | Add k3s join credentials to response |
| `apps/site/convex/schema.ts`                     | Modify | Add k3sToken storage (if per-node)   |
| `apps/cli/src/node.ts`                           | Modify | Update uninstall for agent mode      |

### Completion Criteria

- [x] install-node.sh works in agent mode
- [x] Node joins hub cluster successfully
- [x] Node is labeled with resources (cpus=32, ram=125, gpu=nvidia-...)
- [x] GPU detection and labeling works
- [x] SSH tunnel established (port 2223)
- [x] `kubectl get nodes` shows new node (aiworkstation Ready)

---

## Plan 16: Multi-Node Scheduling

**Goal:** Enable Kubernetes to schedule VMs and jobs across multiple nodes based on resources.

### Context

With federated k3s, Kubernetes scheduler handles placement. We need to:

1. Ensure VMs/jobs request appropriate resources
2. Use node selectors for GPU requirements
3. Track which node a workload lands on

### How Scheduling Works

```
User requests: 8 CPU, 32GB RAM, 1 GPU (nvidia-5090)
         │
         ▼
  ┌──────────────────────┐
  │ vm-orchestration-svc │
  │ (on hub)             │
  └──────────────────────┘
         │
         │ Creates VirtualMachine CR with:
         │   resources:
         │     requests:
         │       cpu: 8
         │       memory: 32Gi
         │       nvidia.com/gpu: 1
         │   nodeSelector:
         │     uvacompute.com/gpu: nvidia-5090
         │
         ▼
  ┌──────────────────────┐
  │ Kubernetes Scheduler │
  └──────────────────────┘
         │
         │ Finds node with:
         │   - 8+ available CPUs
         │   - 32Gi+ available memory
         │   - nvidia.com/gpu resource
         │   - label: uvacompute.com/gpu=nvidia-5090
         │
         ▼
  ┌──────────────────────┐
  │ Node A (workstation) │
  │ - Has RTX 5090       │
  │ - 128GB RAM          │
  │ - 32 CPUs            │
  └──────────────────────┘
```

### Todos

- [x] **Taint hub node** to prevent workload scheduling (control-plane only)
  - Applied `node-role.kubernetes.io/control-plane:NoSchedule` taint
- [x] **Deploy NVIDIA device plugin** DaemonSet on hub cluster
  - Patched to use nvidia RuntimeClass for proper GPU detection
- [x] **Update install-node.sh** to add `uvacompute.com/has-gpu=true` label for GPU nodes
- [x] **Update KubeVirtAdapter** to include node selectors
  - GPU VMs use `nodeSelector: { uvacompute.com/has-gpu: "true" }`
- [x] **Update JobAdapter** for container jobs
  - Added nodeSelector for GPU jobs
  - Added runtimeClassName: nvidia for GPU jobs
  - Track nodeName in status callbacks
- [x] **Track node placement** in callbacks
  - Job callbacks now include nodeId
  - Updated CallbackClient interface and implementation
- [x] **Test multi-node scheduling**
  - Non-GPU jobs scheduled on worker node ✓
  - GPU jobs scheduled on worker node with GPU access ✓
  - Hub node correctly excluded from workload scheduling ✓

### Files Modified

| File                                                   | Changes                                        |
| ------------------------------------------------------ | ---------------------------------------------- |
| `apps/vm-orchestration-service/lib/kubevirt.go`        | Add nodeSelector for GPU VMs                   |
| `apps/vm-orchestration-service/lib/jobs.go`            | Add nodeSelector, RuntimeClass, track nodeName |
| `apps/vm-orchestration-service/lib/callback.go`        | Add nodeId to job callbacks                    |
| `apps/vm-orchestration-service/structs/app.go`         | Update CallbackClient interface                |
| `apps/vm-orchestration-service/structs/job_manager.go` | Update callbacks to include nodeId             |
| `apps/site/public/install-node.sh`                     | Add has-gpu label                              |

### Completion Criteria

- [x] Hub node runs control plane only (tainted)
- [x] Jobs scheduled to correct nodes based on resources
- [x] GPU workloads only land on GPU nodes
- [x] nodeId correctly tracked for all workloads
- [x] `nvidia.com/gpu` visible in node allocatable resources

---

## Plan 17: Admin Dashboard & APIs

**Goal:** Provide tiered visibility - full admins see everything, node contributors see their own nodes.

### User Roles

| Role                 | Who                          | Access Level                                   |
| -------------------- | ---------------------------- | ---------------------------------------------- |
| **Full Admin**       | Charlie, trusted admins      | All nodes, all workloads, cluster control      |
| **Node Contributor** | Person who donated a machine | Their own node(s) only, pause/resume/configure |
| **Regular User**     | Someone running VMs/jobs     | Their workloads only (no node visibility)      |

### Context

**Full Admins** need:

- All nodes in the cluster with their resources
- All running VMs and jobs across all nodes
- Resource utilization (used vs available)
- Node health status
- Ability to drain/uncordon nodes
- Access to Kubernetes Dashboard for deep inspection

**Node Contributors** need:

- Their node's status (online/offline/draining)
- Resources they're contributing (CPUs, RAM, GPU)
- Current utilization on their node
- Workloads currently running on their node
- Controls: pause, resume, change sharing settings
- Earnings/usage stats (future)

### Out-of-the-Box Admin Tools (for Full Admins)

1. **Kubernetes Dashboard** - Deploy on hub, expose via port-forward or ingress

   ```bash
   # Install on hub
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.7.0/aio/deploy/recommended.yaml

   # Access via kubectl proxy
   kubectl proxy
   # Then: http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
   ```

2. **k9s** - Terminal UI (install on hub for SSH access)
   ```bash
   # Full admins can SSH to hub and run k9s
   ssh root@24.199.85.26
   k9s
   ```

### Node Ownership Model

Nodes need an owner. When a node registers via token:

- Token is created by admin OR by future self-service flow
- Token is associated with a user (the contributor)
- When node bootstraps, it's linked to that user
- User can only see/manage nodes they own

**Schema addition for node ownership:**

```typescript
nodes: defineTable({
  // ... existing fields
  ownerId: v.optional(v.string()), // User who contributed this node
});
```

### API Endpoints

**Admin-only endpoints** (requires ADMIN_USERS):

```
GET /api/admin/nodes              # All nodes
GET /api/admin/workloads          # All VMs/jobs
GET /api/admin/resources          # Cluster totals
POST /api/admin/nodes/:id/drain   # Drain any node
POST /api/admin/nodes/:id/uncordon
```

**Node contributor endpoints** (sees own nodes only):

```
GET /api/contributor/nodes              # My nodes only
GET /api/contributor/nodes/:id          # My node details (validates ownership)
GET /api/contributor/nodes/:id/workloads # Workloads on my node
POST /api/contributor/nodes/:id/pause   # Pause my node
POST /api/contributor/nodes/:id/resume  # Resume my node
PUT /api/contributor/nodes/:id/config   # Update sharing settings
```

### CLI Commands

**For full admins:**

```bash
uva admin status              # Cluster overview
uva admin nodes               # List ALL nodes
uva admin node <nodeId>       # Details for any node
uva admin workloads           # All VMs + jobs
uva admin drain <nodeId>      # Drain any node
uva admin uncordon <nodeId>   # Uncordon any node
```

**For node contributors (existing `uva node` commands, enhanced):**

```bash
uva node status               # Status of MY nodes (enhanced to show remote status)
uva node list                 # List my contributed nodes
uva node pause [nodeId]       # Pause my node
uva node resume [nodeId]      # Resume my node
uva node config [nodeId]      # Configure my node
```

### Website Pages

**1. Admin Dashboard (`/admin`)** - Full admins only

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Admin Dashboard                                              [K8s Dashboard]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Cluster Resources                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Nodes: 5    │  │ CPUs: 72    │  │ RAM: 320GB  │  │ GPUs: 3     │        │
│  │ 4 online    │  │ 45 used     │  │ 180GB used  │  │ 2 used      │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
│  Nodes                                               [+ Add Node Token]     │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Name          │ Owner    │ Status │ CPUs  │ RAM   │ GPU    │ Actions  │ │
│  │ workstation   │ charlie  │ ● ON   │ 16/32 │ 64/128│ 1 5090 │ [Drain]  │ │
│  │ node-abc      │ alice    │ ● ON   │ 4/8   │ 16/32 │ -      │ [Drain]  │ │
│  │ gpu-server    │ bob      │ ◐ DRAIN│ 8/16  │ 48/64 │ 1 4090 │ [Resume] │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  All Workloads                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ ID       │ Type │ User   │ Node        │ Resources     │ Status       │ │
│  │ vm-123   │ VM   │ user1  │ workstation │ 4CPU 16GB 1GPU│ running      │ │
│  │ job-456  │ Job  │ user2  │ node-abc    │ 2CPU 8GB      │ running      │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

**2. Contributor Dashboard (`/my-nodes`)** - Node contributors only

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  My Contributed Nodes                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  workstation                                        ● Online           │ │
│  │  ─────────────────────────────────────────────────────────────────── │ │
│  │                                                                       │ │
│  │  Contributing:        Current Usage:          This Month:             │ │
│  │  16 CPUs              8 CPUs (50%)            124 compute-hours       │ │
│  │  64 GB RAM            32 GB (50%)             Est. value: $XX         │ │
│  │  1x RTX 5090          1 GPU (100%)                                    │ │
│  │                                                                       │ │
│  │  Active Workloads: 2                                                  │ │
│  │  ├─ vm-abc123 (VM) - user@example.com - 4 CPU, 16GB, 1 GPU           │ │
│  │  └─ job-def456 (Job) - other@example.com - 4 CPU, 16GB               │ │
│  │                                                                       │ │
│  │  [Pause Node]  [Configure Sharing]  [View Logs]                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Want to contribute another machine?                                        │
│  [Generate Install Token]                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Todos

**Node ownership:**

- [x] Add `ownerId` field to nodes schema
- [x] Update bootstrap API to set owner from token creator
- [x] Update token creation to record creator's userId (already existed)

**Admin endpoints & UI:**

- [x] Create `/api/admin/nodes` - list all nodes
- [x] Create `/api/admin/workloads` - list all workloads
- [x] Create `/api/admin/resources` - aggregate cluster resources
- [x] Create `/api/admin/nodes/:id/drain` and `/uncordon`
- [x] Create admin web UI at `/admin`
- [x] Add admin auth check (ADMIN_USERS env var)
- [ ] Deploy Kubernetes Dashboard on hub (optional, for deep inspection)

**Contributor endpoints & UI:**

- [x] Create `/api/contributor/nodes` - list user's own nodes
- [x] Create `/api/contributor/nodes/:id` - node details with ownership check
- [x] Create `/api/contributor/nodes/:id/pause` and `/resume`
- [x] Create contributor web UI at `/my-nodes`
- [x] Update `uva node` CLI commands to work remotely via API

**CLI:**

- [ ] Create `apps/cli/src/admin.ts` with admin commands (not needed - admins use web UI)
- [x] Update `apps/cli/src/node.ts` for remote node management

### Files to Create/Modify

| File                                                      | Action | Description                 |
| --------------------------------------------------------- | ------ | --------------------------- |
| `apps/site/convex/schema.ts`                              | Modify | Add ownerId to nodes        |
| `apps/site/convex/nodes.ts`                               | Modify | Add ownership queries       |
| `apps/site/src/app/api/admin/nodes/route.ts`              | Create | Admin: list all nodes       |
| `apps/site/src/app/api/admin/workloads/route.ts`          | Create | Admin: list all workloads   |
| `apps/site/src/app/api/admin/resources/route.ts`          | Create | Admin: cluster resources    |
| `apps/site/src/app/api/contributor/nodes/route.ts`        | Create | Contributor: list own nodes |
| `apps/site/src/app/api/contributor/nodes/[id]/route.ts`   | Create | Contributor: node details   |
| `apps/site/src/app/[flags]/admin/page.tsx`                | Create | Admin dashboard UI          |
| `apps/site/src/app/[flags]/(protected)/my-nodes/page.tsx` | Create | Contributor dashboard UI    |
| `apps/cli/src/admin.ts`                                   | Create | Admin CLI commands          |

### Completion Criteria

- [x] Full admins can view all nodes and workloads via **web UI only** (no CLI as per plan)
- [x] Node contributors can view and manage only their own nodes via **web UI and CLI**
- [x] Node ownership is tracked from registration
- [x] Pause/resume works for contributors on their nodes
- [ ] Kubernetes Dashboard accessible for deep admin inspection (optional)
- [x] Regular users see no node information (only their workloads)

### Implementation Notes

- Created admin-auth helper at `apps/site/src/lib/admin-auth.ts` for admin/auth checks
- Added `ownerId` to nodes schema with `by_ownerId` index
- Added `listByOwner`, `getWorkloadsOnNode`, and `verifyOwnership` queries to nodes.ts
- Added `by_nodeId` indexes to vms and jobs tables for workload queries
- Added `listAll` queries to vms.ts and jobs.ts for admin workload listing
- Bootstrap API now passes `createdBy` from token as `ownerId` when registering nodes
- CLI `uva node` commands now support remote management: `list`, `status <nodeId>`, `pause <nodeId>`, `resume <nodeId>`, `workloads <nodeId>`

---

## Plan 18: Health Monitoring & Failover

**Goal:** Monitor node health and handle failures gracefully.

### Context

With federated k3s, Kubernetes handles much of this automatically:

- k3s agent sends heartbeats to server
- Nodes marked `NotReady` after missed heartbeats
- Pods on `NotReady` nodes get rescheduled (if possible)

We need to:

1. Sync k8s node status to Convex
2. Update workload status when nodes fail
3. Notify users of affected workloads
4. Clean up stale data

### How k3s Health Works

```
Normal operation:
  Node A (agent) ──heartbeat──► Hub (server)
                                 │
                                 ▼ Node status: Ready

Agent loses connection (30s):
  Node A (agent) ──────X──────► Hub (server)
                                 │
                                 ▼ Node status: NotReady

After 5 minutes:
  Pods on Node A evicted (if they have restart policy)
  Stateful workloads (VMs) may need manual intervention
```

### Todos

- [x] **Create node health sync job** (runs on hub)
  - Periodically query k8s for node status
  - Update Convex nodes table with status
  - Trigger alerts for status changes
- [x] **Handle VM failures on node down**
  - VMs can't auto-migrate (stateful, use local disk)
  - Mark VM status as "node_offline" in Convex
  - Notify user via email/dashboard
- [x] **Handle Job failures on node down**
  - Jobs may be rescheduled by k8s (if restartable)
  - Track job pod restarts
  - Update Convex with new node assignment
- [x] **Cleanup stale data**
  - When node is removed, clean up its workloads
  - Option to force-delete VMs on dead nodes
- [x] **Add node status to dashboard**
  - Show node health in real-time
  - Alert banner when nodes are unhealthy
- [ ] **Test failure scenarios**
  - Kill k3s agent on node
  - Verify status updates in Convex
  - Verify user notification

### Files to Create/Modify

| File                                                          | Action | Description                       |
| ------------------------------------------------------------- | ------ | --------------------------------- |
| `apps/vm-orchestration-service/lib/health.go`                 | Create | Node health monitoring goroutine  |
| `apps/vm-orchestration-service/lib/callback.go`               | Modify | Add NotifyNodeHealth method       |
| `apps/vm-orchestration-service/server.go`                     | Modify | Start health monitor              |
| `apps/site/convex/schema.ts`                                  | Modify | Add node_offline status           |
| `apps/site/convex/nodes.ts`                                   | Modify | Add syncHealth, forceCleanup      |
| `apps/site/convex/vms.ts`                                     | Modify | Add markNodeOffline mutation      |
| `apps/site/convex/jobs.ts`                                    | Modify | Add markNodeOffline mutation      |
| `apps/site/src/app/api/nodes/health/route.ts`                 | Create | Health callback endpoint          |
| `apps/site/src/app/api/admin/nodes/[nodeId]/cleanup/route.ts` | Create | Force cleanup endpoint            |
| `apps/site/src/app/[flags]/(protected)/admin/page.tsx`        | Modify | Health alerts, last seen column   |
| `apps/site/src/lib/email.ts`                                  | Modify | Add workload offline notification |

### Completion Criteria

- [x] Node status synced from k8s to Convex
- [x] Users notified when their workloads are affected
- [x] VMs on dead nodes marked appropriately
- [x] Jobs rescheduled when possible
- [x] Admin can see node health in dashboard

---

## Plan 19: Navigation Refactor & Dev Tools Removal

**Goal:** Simplify navigation by adding Nodes and Admin panels to the navbar, and remove the redundant Dev Tools page.

### Context

Currently the navigation has:

- VMs, Jobs, Profile buttons in navbar
- "Dev Tools" button (visible only to admins via `hasDevAccess`)
- Separate "My Nodes" page at `/my-nodes` (not in navbar)
- Separate "Admin" page at `/admin` (not in navbar)

The Dev Tools page contains:

1. **Seed data tools** - For testing (seedVMs, clearAllVMs, clearInactiveVMs)
2. **Early access management** - Approve/deny user access requests

Problems:

- "My Nodes" isn't discoverable (not in navbar)
- "Admin" isn't discoverable (not in navbar)
- Dev Tools duplicates admin functionality
- Seed data tools should be CLI commands, not UI

### Changes Required

#### 1. Add "nodes" link to navbar

- Show for all authenticated users
- Links to `/my-nodes` page
- Allows contributors to see their contributed nodes

#### 2. Add "admin" link to navbar

- Show only for admins (same check as current Dev Tools)
- Links to `/admin` page
- Already has node management, workload overview

#### 3. Move early access management to admin page

- Add early access section to `/admin/page.tsx`
- Include pending requests (tokens) and registered users

#### 4. Remove Dev Tools entirely

- Delete `/dev-tools/page.tsx`
- Remove "dev tools" button from `protected-layout.tsx`
- Remove `hasDevAccess` query import (keep the query for admin check)
- Delete `convex/seed.ts` (seedVMs, clearAllVMs, clearInactiveVMs)
- Remove seed-related imports from any files

### Todos

- [x] **Update navbar in protected-layout.tsx**
  - Add "nodes" button linking to `/my-nodes`
  - Add "admin" button linking to `/admin` (only if `hasDevAccess`)
  - Remove "dev tools" button
  - Remove `isOnDevTools` path check
- [x] **Add early access management to admin page**
  - Copy early access UI from dev-tools to admin page
  - Add mutations: `grantAccess`, `revokeAccess`, `approveTokenByEmail`, `denyTokenByEmail`
  - Add queries: `listEarlyAccessRequests`, `listPendingTokens`
- [x] **Delete dev-tools page**
  - Delete `apps/site/src/app/[flags]/(protected)/dev-tools/page.tsx`
  - Delete the entire `dev-tools/` directory
- [x] **Delete seed functions**
  - Delete `apps/site/convex/seed.ts`
  - Remove seed exports from convex API if referenced
- [x] **Test navigation**
  - Verify "nodes" shows for all users
  - Verify "admin" shows only for admins
  - Verify early access management works in admin page
  - Verify no broken links or imports

### Files to Modify/Delete

| File                                                                     | Action | Description                         |
| ------------------------------------------------------------------------ | ------ | ----------------------------------- |
| `apps/site/src/app/[flags]/(protected)/_components/protected-layout.tsx` | Modify | Update navbar buttons               |
| `apps/site/src/app/[flags]/(protected)/admin/page.tsx`                   | Modify | Add early access management section |
| `apps/site/src/app/[flags]/(protected)/dev-tools/page.tsx`               | Delete | Remove dev tools page               |
| `apps/site/convex/seed.ts`                                               | Delete | Remove seed data functions          |

### Completion Criteria

- [x] "nodes" link visible in navbar for all authenticated users
- [x] "admin" link visible in navbar for admins only
- [x] Early access management works in admin page
- [x] Dev tools page completely removed
- [x] Seed functions completely removed
- [x] No TypeScript/lint errors
- [x] No broken navigation links

---

## Plan 20: Status Page Refactor - Per-Node Status & Resources

**Goal:** Transform the status page from a simple orchestration service health check into a comprehensive cluster-wide dashboard showing per-node status, resources, and capabilities.

### Context

The current status page (`apps/status/`) only shows:

- Whether the vm-orchestration-service is up/down/degraded
- 30-day historical uptime chart
- Simple operational/partial outage/service unavailable badge

For a federated cluster with multiple contributor nodes, users need to see:

1. **Overall cluster status** - Is the platform operational?
2. **Per-node status** - Which nodes are online/offline/draining?
3. **Per-node resources** - What resources does each node contribute?
4. **Cluster resource totals** - Aggregate vCPU, RAM, GPU counts with GPU type breakdown
5. **Workload capabilities** - Which nodes support VMs vs Jobs

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Current Status Page                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   status.uvacompute.com                                                         │
│   ─────────────────────                                                         │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │  ✓ All Systems Operational                                              │  │
│   │                                                                         │  │
│   │  VM Orchestration Service  [operational]  25ms                         │  │
│   │  ██████████████████████████████████ (30-day uptime chart)              │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│   Data Source: Health check to VM_ORCHESTRATION_URL (hub)                      │
│   Storage: Redis (uptime history)                                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          New Status Page                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   status.uvacompute.com                                                         │
│   ─────────────────────                                                         │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │  ✓ All Systems Operational                     Last updated: 10:32:45   │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │  Cluster Resources (from online nodes)                                  │  │
│   │  ──────────────────────────────────────────────────────────────────── │  │
│   │                                                                         │  │
│   │   vCPUs           RAM             GPUs                                  │  │
│   │   ─────           ───             ────                                  │  │
│   │   48 total        192 GB          3 total                               │  │
│   │   12 used         64 GB used      2 used                                │  │
│   │                                                                         │  │
│   │   GPU Breakdown:  2× RTX 5090  •  1× RTX 4090                          │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │  Nodes (3 online, 1 offline)                                            │  │
│   │  ──────────────────────────────────────────────────────────────────── │  │
│   │                                                                         │  │
│   │   ● workstation       [online]     32 vCPU • 128GB • 1× RTX 5090       │  │
│   │     └─ Supports: VMs, Jobs                                              │  │
│   │                                                                         │  │
│   │   ● gpu-server-1      [online]     16 vCPU •  64GB • 1× RTX 4090       │  │
│   │     └─ Supports: VMs, Jobs                                              │  │
│   │                                                                         │  │
│   │   ● dev-node          [draining]    8 vCPU •  32GB • 1× RTX 5090       │  │
│   │     └─ Supports: Jobs only                                              │  │
│   │                                                                         │  │
│   │   ○ backup-node       [offline]     4 vCPU •  16GB • No GPU            │  │
│   │     └─ Last seen: 2h ago                                                │  │
│   │                                                                         │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │  Services                                                               │  │
│   │  ──────────────────────────────────────────────────────────────────── │  │
│   │                                                                         │  │
│   │  VM Orchestration Service  [operational]  25ms                         │  │
│   │  ██████████████████████████████████ (30-day uptime)                    │  │
│   │                                                                         │  │
│   │  Control Plane (k3s)       [operational]                               │  │
│   │  ██████████████████████████████████ (30-day uptime)                    │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│   Data Sources:                                                                │
│   - Convex (nodes table - real-time via API)                                   │
│   - Redis (uptime history - existing)                                          │
│   - Hub orchestration service (service health)                                 │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### VMs vs Jobs Capability

Some nodes may only support one type of workload:

| Capability    | Requirements                         | Examples                       |
| ------------- | ------------------------------------ | ------------------------------ |
| **VMs only**  | KubeVirt + sufficient resources      | Bare-metal servers with VFIO   |
| **Jobs only** | Container runtime only (no KubeVirt) | Lightweight nodes, ARM devices |
| **Both**      | KubeVirt + container runtime         | Full workstation setup         |

**Why this matters:**

- Users requesting VMs should see if VM-capable nodes are available
- Container jobs have different requirements than VMs
- Node operators may choose to disable VM support to avoid nested virtualization overhead

### Schema Updates

Add new fields to the `nodes` table in Convex:

```typescript
nodes: defineTable({
  // ... existing fields ...

  // NEW: GPU type (e.g., "nvidia-rtx-5090", "nvidia-rtx-4090", "none")
  gpuType: v.optional(v.string()),

  // NEW: Workload capabilities
  supportsVMs: v.optional(v.boolean()), // Default: true if KubeVirt detected
  supportsJobs: v.optional(v.boolean()), // Default: true (container runtime)
});
```

These fields should be populated by the install-node.sh script based on:

- `gpuType`: Auto-detected from GPU model during installation
- `supportsVMs`: True if KubeVirt is functional on the node
- `supportsJobs`: True if container runtime is functional (usually always true)

### API Design

**New public API endpoint for status page:**

```
GET /api/public/cluster-status
```

Returns (no auth required - this is public status info):

```json
{
  "timestamp": 1706000000000,
  "overall": "operational",
  "resources": {
    "nodes": { "total": 4, "online": 3, "offline": 1, "draining": 0 },
    "vcpus": { "total": 60, "available": 48 },
    "ram": { "total": 240, "available": 176 },
    "gpus": {
      "total": 3,
      "available": 1,
      "byType": {
        "nvidia-rtx-5090": { "total": 2, "available": 1 },
        "nvidia-rtx-4090": { "total": 1, "available": 0 }
      }
    }
  },
  "nodes": [
    {
      "name": "workstation",
      "status": "online",
      "vcpus": 32,
      "ram": 128,
      "gpus": 1,
      "gpuType": "nvidia-rtx-5090",
      "supportsVMs": true,
      "supportsJobs": true,
      "lastHeartbeat": 1706000000000
    }
    // ... more nodes
  ],
  "services": {
    "orchestration": { "status": "operational", "responseTime": 25 },
    "controlPlane": { "status": "operational" }
  }
}
```

**Note:** Node names are shown but not nodeIds or other sensitive info. This is meant to give users visibility into cluster health without exposing internal details.

### Implementation Todos

**Schema updates:**

- [ ] Add `gpuType` field to nodes schema (optional string)
- [ ] Add `supportsVMs` field to nodes schema (optional boolean, default true)
- [ ] Add `supportsJobs` field to nodes schema (optional boolean, default true)
- [ ] Update install-node.sh to detect and set `gpuType`
- [ ] Update install-node.sh to set capability flags

**New Convex queries:**

- [ ] Create `apps/site/convex/publicStatus.ts` with public queries:
  - `getClusterStatus` - returns aggregated cluster status (no auth required)
  - Called via HTTP action to avoid exposing Convex directly

**New API endpoints in site:**

- [ ] Create `apps/site/src/app/api/public/cluster-status/route.ts`
  - Returns cluster resources, node status, service health
  - No authentication required (public status page)
  - Rate limited to prevent abuse

**Status page refactor:**

- [ ] Update `apps/status/types/index.ts` with new types:
  - `NodeStatus` - individual node status
  - `ClusterResources` - aggregate resources with GPU breakdown
  - `ClusterStatus` - full response type

- [ ] Create `apps/status/lib/cluster.ts`:
  - `fetchClusterStatus()` - fetch from site's public API

- [ ] Update `apps/status/app/actions/status-actions.ts`:
  - Add `getClusterStatus()` server action

- [ ] Create new components in `apps/status/app/_components/`:
  - `cluster-resources.tsx` - Resource summary cards
  - `node-list.tsx` - Per-node status list
  - `gpu-breakdown.tsx` - GPU type breakdown
  - `capability-badge.tsx` - VMs/Jobs capability indicator

- [ ] Update `apps/status/app/_components/status-content.tsx`:
  - Add cluster resources section
  - Add node list section
  - Keep existing service uptime chart

- [ ] Update `apps/status/app/page.tsx`:
  - Fetch cluster status alongside existing status
  - Pass to StatusContent component

**Install script updates:**

- [ ] Update `apps/site/public/install-node.sh`:
  - Detect GPU model and format as `gpuType` (e.g., "nvidia-rtx-5090")
  - Detect KubeVirt availability for `supportsVMs`
  - Set `supportsJobs` based on container runtime
  - Include new fields in bootstrap API call

**Testing:**

- [ ] Test status page with multiple nodes (online, offline, draining)
- [ ] Test GPU type detection on workstation
- [ ] Test capability flags on various node configs
- [ ] Test public API rate limiting
- [ ] Test status page styling matches design system

### Files to Create/Modify

| File                                                   | Action | Description                                     |
| ------------------------------------------------------ | ------ | ----------------------------------------------- |
| `apps/site/convex/schema.ts`                           | Modify | Add gpuType, supportsVMs, supportsJobs to nodes |
| `apps/site/convex/publicStatus.ts`                     | Create | Public query for cluster status                 |
| `apps/site/src/app/api/public/cluster-status/route.ts` | Create | Public API endpoint                             |
| `apps/site/public/install-node.sh`                     | Modify | Detect GPU type, capabilities                   |
| `apps/status/types/index.ts`                           | Modify | Add new status types                            |
| `apps/status/lib/cluster.ts`                           | Create | Cluster status fetching                         |
| `apps/status/app/actions/status-actions.ts`            | Modify | Add cluster status action                       |
| `apps/status/app/_components/cluster-resources.tsx`    | Create | Resource summary component                      |
| `apps/status/app/_components/node-list.tsx`            | Create | Node status list component                      |
| `apps/status/app/_components/gpu-breakdown.tsx`        | Create | GPU type breakdown                              |
| `apps/status/app/_components/capability-badge.tsx`     | Create | VMs/Jobs capability badge                       |
| `apps/status/app/_components/status-content.tsx`       | Modify | Integrate new components                        |
| `apps/status/app/page.tsx`                             | Modify | Fetch and pass cluster status                   |

### Design Notes

The status page should follow the existing uvacompute design language:

- **Minimalist aesthetic** - Clean, simple, functional
- **Monospace typography** - All text uses `font-mono`
- **Lowercase preferred** - UI text lowercase
- **Sharp edges** - No rounded corners
- **Limited color palette** - Black, white, gray, blue (operational), yellow (degraded), red (down)

**Status indicators:**

- `●` (filled circle) - online
- `◐` (half circle) - draining
- `○` (empty circle) - offline

**Color coding:**

- Green/blue: operational/online
- Yellow: degraded/draining
- Red: down/offline
- Gray: no data/unknown

### Completion Criteria

- [ ] Status page shows overall cluster status
- [ ] Status page shows per-node breakdown with resources
- [ ] GPU types displayed correctly (e.g., "2× RTX 5090")
- [ ] VMs/Jobs capabilities shown per node
- [ ] Offline nodes clearly indicated with last seen time
- [ ] Public API works without authentication
- [ ] Existing 30-day uptime chart still functional
- [ ] Styling matches uvacompute design system
- [ ] All TypeScript/lint errors resolved
- [ ] Tested with real nodes (workstation at minimum)

---

## Migration Path

### For Existing Nodes

Nodes currently running standalone k3s need migration:

1. **Backup**: Record current workloads
2. **Drain**: Stop accepting new work
3. **Uninstall**: `uva node uninstall`
4. **Reinstall**: `install-node.sh --token NEW_TOKEN`
5. **Verify**: Node appears in federated cluster

### For Site/Service

1. Deploy hub infrastructure (Plan 14)
2. Update site to use hub orchestration URL
3. Test with new node installation
4. Migrate existing nodes one by one

### Rollback Plan

If federation doesn't work:

1. Nodes can revert to standalone mode
2. Site can point back to individual node URLs
3. Workloads need recreation (VMs are node-local)

---

## Final Checklist

Before considering the implementation complete:

- [ ] All plans marked ✅ Complete
- [ ] All tests passing
- [ ] Manual testing on workstation completed
- [ ] Documentation updated (MIGRATION_KUBEVIRT.md, README.md)
- [ ] No lint errors in any package
- [ ] All branches merged to main
- [ ] Deployed to production and tested

---

## Appendix: Test Machines

### Workstation

- **Access:** `ssh workstation`
- **Specs:** 128GB RAM, 4TB NVMe, 1x RTX 5090
- **Use for:** Main testing, KubeVirt, GPU workloads

### Jetson Nano

- **Access:** `ssh jetson-nano`
- **Specs:** ARM, limited resources
- **Use for:** Testing lightweight scenarios, ARM compatibility

### DigitalOcean VPS

- **IP:** 24.199.85.26
- **Use for:** SSH jump host, central coordinator (handled by Charlie)
