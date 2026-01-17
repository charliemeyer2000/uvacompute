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
- SSH access goes through jump host (SSH2INCUS_HOST)

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

| Plan                               | Status         | Branch | Notes                                               |
| ---------------------------------- | -------------- | ------ | --------------------------------------------------- |
| 1. Remove Incus, finalize KubeVirt | ✅ Complete    |        | Removed all Incus code, KubeVirt-only backend       |
| 2. Test KubeVirt on workstation    | ✅ Complete    |        | k3s v1.34.3 + KubeVirt v1.3.0 working               |
| 3. k3s/KubeVirt install script     | ✅ Complete    |        | uva node install/uninstall/status + GPU auto-detect |
| 4. Jobs schema + site API          | ⬜ Not Started |        |                                                     |
| 5. Jobs in orchestration service   | ⬜ Not Started |        |                                                     |
| 6. Jobs CLI commands               | ⬜ Not Started |        |                                                     |
| 7. Jobs website UI                 | ⬜ Not Started |        |                                                     |
| 8. Log storage + streaming         | ⬜ Not Started |        |                                                     |
| 9. Node management CLI             | ⬜ Not Started |        |                                                     |
| 10. Node config + partial sharing  | ⬜ Not Started |        |                                                     |
| 11. Multi-node SSH routing         | ⬜ Not Started |        |                                                     |
| 12. Admin commands                 | ⬜ Not Started |        |                                                     |

Status key: ⬜ Not Started | 🔄 In Progress | ✅ Complete | ❌ Blocked

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

### Context

Users should be able to run one command to join the network. The script should:

- Install k3s (server or agent mode)
- Install KubeVirt
- Install NVIDIA container toolkit (if GPU present)
- Configure resource sharing
- Save state for clean uninstall

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

## Plan 4: Jobs Schema + Site API

**Goal:** Add jobs table to Convex and create API endpoints in the site.

### Context

Jobs are container workloads that run to completion. We need:

- Convex schema for jobs
- API endpoints similar to VMs: create, list, get, delete
- Status callback endpoint for orchestration service

### Todos

- [ ] Add `jobs` table to `apps/site/convex/schema.ts`
- [ ] Create `apps/site/convex/jobs.ts` with queries/mutations
- [ ] Create `apps/site/src/app/api/jobs/route.ts` (POST, GET)
- [ ] Create `apps/site/src/app/api/jobs/[jobId]/route.ts` (GET, DELETE)
- [ ] Create `apps/site/src/app/api/jobs/[jobId]/update-status/route.ts` (callback)
- [ ] Add job schemas to `apps/site/src/lib/vm-schemas.ts` (or create job-schemas.ts)
- [ ] Run `npx convex dev` to push schema changes
- [ ] Test API endpoints with curl

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

- [ ] Convex schema deployed
- [ ] API endpoints return correct responses
- [ ] `pnpm build` succeeds in apps/site
- [ ] Branch created: `gt create --all --message "feat: jobs schema and site api"`

---

## Plan 5: Jobs in Orchestration Service

**Goal:** Implement job creation/management in the orchestration service using Kubernetes Jobs.

### Context

The orchestration service needs to:

- Accept job creation requests
- Create Kubernetes Jobs
- Watch job status and callback to site
- Support log streaming

### Todos

- [ ] Create `lib/jobs.go` with JobAdapter
- [ ] Implement CreateJob function (creates k8s Job)
- [ ] Implement DeleteJob function (deletes k8s Job)
- [ ] Implement GetJobStatus function
- [ ] Implement GetJobLogs function (streams from k8s)
- [ ] Add job handlers to `handlers/http.go`
- [ ] Add job routes in `structs/app.go`
- [ ] Implement job status watcher with callbacks
- [ ] Write tests for job adapter

### Files to Create/Modify

- `lib/jobs.go` → NEW
- `lib/jobs_test.go` → NEW
- `handlers/http.go` → Add job handlers
- `structs/app.go` → Add job routes
- `structs/types.go` → Add job request/response types

### Completion Criteria

- [ ] `go build` succeeds
- [ ] `go test ./...` passes
- [ ] Can create job via API (manual test)
- [ ] Job status callbacks work
- [ ] Branch created: `gt create --all --message "feat: jobs support in orchestration service"`

---

## Plan 6: Jobs CLI Commands

**Goal:** Add `uva run`, `uva jobs`, `uva logs`, `uva cancel` commands.

### Context

CLI commands for managing jobs:

- `uva run <image> [cmd...]` - Submit a container job
- `uva jobs` - List jobs
- `uva logs <job-id>` - Stream job logs
- `uva cancel <job-id>` - Cancel a running job

### Todos

- [ ] Create `apps/cli/src/jobs.ts` with job commands
- [ ] Implement `uva run` command with options (--gpu, --cpu, --ram, --env, --name)
- [ ] Implement `uva jobs` command (list jobs, filter by status)
- [ ] Implement `uva logs` command (stream logs, --tail, --no-follow)
- [ ] Implement `uva cancel` command
- [ ] Add job schemas to `apps/cli/src/lib/schemas.ts`
- [ ] Register commands in `apps/cli/index.ts`
- [ ] Update man page `apps/cli/uva.1`
- [ ] Test commands against site API

### Completion Criteria

- [ ] `bun run build` succeeds
- [ ] All commands work against dev site
- [ ] Man page updated
- [ ] Branch created: `gt create --all --message "feat: jobs cli commands"`

---

## Plan 7: Jobs Website UI

**Goal:** Add jobs list and log viewer to the dashboard.

### Context

The dashboard should show:

- Active jobs alongside active VMs
- Job history (completed/failed)
- Log viewer with streaming

### Todos

- [ ] Create `apps/site/convex/jobs.ts` queries for frontend (listActiveByUser, listInactiveByUser)
- [ ] Create `apps/site/src/app/[flags]/(protected)/dashboard/_components/active-jobs.tsx`
- [ ] Create `apps/site/src/app/[flags]/(protected)/dashboard/_components/job-history.tsx`
- [ ] Update `apps/site/src/app/[flags]/(protected)/dashboard/_components/vm-list.tsx` to show jobs
- [ ] Create log viewer component with streaming support
- [ ] Add job detail modal/page
- [ ] Style according to design system (lowercase, monospace, sharp edges)
- [ ] Test with real jobs

### Completion Criteria

- [ ] Dashboard shows jobs
- [ ] Can view job logs
- [ ] Styling matches existing design
- [ ] `pnpm build` succeeds
- [ ] Branch created: `gt create --all --message "feat: jobs ui in dashboard"`

---

## Plan 8: Log Storage + Streaming

**Goal:** Implement log storage in R2/S3 and real-time streaming via WebSocket/SSE.

### Context

Logs need to be:

- Streamed in real-time while job is running
- Archived to R2/S3 when job completes
- Retrievable after job completes

### Todos

- [ ] Ask Charlie for AWS/R2 credentials
- [ ] Create Terraform config for R2 bucket (if using Cloudflare R2)
- [ ] Add log upload logic to orchestration service
- [ ] Create `/api/jobs/[jobId]/logs` endpoint with WebSocket upgrade
- [ ] Implement log streaming from k8s → site → client
- [ ] Implement log archival on job completion
- [ ] Update CLI `uva logs` to use WebSocket
- [ ] Update dashboard log viewer to use WebSocket
- [ ] Test end-to-end log flow

### Completion Criteria

- [ ] Logs stream in real-time (CLI and web)
- [ ] Completed job logs stored in R2/S3
- [ ] Can retrieve archived logs
- [ ] Branch created: `gt create --all --message "feat: log storage and streaming"`

---

## Plan 9: Node Management CLI

**Goal:** Complete `uva node` commands: `install`, `uninstall`, `status`, `pause`, `resume`.

### Context

Building on Plan 3, complete the node management experience:

- `uva node install` - Set up machine as contributor
- `uva node uninstall` - Clean removal of all changes
- `uva node status` - Show sharing status
- `uva node pause` - Stop accepting work
- `uva node resume` - Resume accepting work

### Todos

- [ ] Implement `uva node uninstall` (read install-state.yaml, revert changes)
- [ ] Implement `uva node status` (show resources, workloads)
- [ ] Implement `uva node pause` (cordon node in k8s)
- [ ] Implement `uva node resume` (uncordon node)
- [ ] Implement `uva node config` (interactive resource configuration)
- [ ] Test uninstall actually reverts all changes
- [ ] Test pause/resume works correctly
- [ ] Update man page

### Completion Criteria

- [ ] All node commands work
- [ ] Uninstall actually cleans up
- [ ] Pause/resume work with k8s
- [ ] Branch created: `gt create --all --message "feat: complete node management cli"`

---

## Plan 10: Node Config + Partial Sharing

**Goal:** Implement partial resource sharing configuration.

### Context

Users should be able to specify:

- How many CPUs to share
- How much RAM to share
- Which GPUs to share (and in what mode)

### Todos

- [ ] Design config file format (`~/.uvacompute/node/config.yaml`)
- [ ] Implement interactive config wizard in `uva node config`
- [ ] Apply resource limits to k8s node (labels, taints, resource quotas)
- [ ] Implement GPU mode selection (container vs none - VFIO is optional future)
- [ ] Store config persistently
- [ ] Apply config on node restart
- [ ] Test partial sharing works

### Completion Criteria

- [ ] Can configure partial sharing interactively
- [ ] Config persists across restarts
- [ ] k8s respects resource limits
- [ ] Branch created: `gt create --all --message "feat: partial resource sharing config"`

---

## Plan 11: Multi-Node SSH Routing

**Goal:** Update SSH jump host to route to correct node in multi-node setup.

### Context

Currently SSH goes to single machine. In multi-node:

- Need to know which node has which VM
- Route SSH through jump host to correct node

### Todos

- [ ] Research ssh2incus or alternatives for multi-node
- [ ] Update SSH connection info to include node
- [ ] Update jump host config to route to nodes
- [ ] Test SSH to VM on different nodes
- [ ] Update `/api/vms/[vmId]/connection` to return correct node info
- [ ] Test end-to-end SSH flow

### Completion Criteria

- [ ] Can SSH to VM on any node
- [ ] Jump host routes correctly
- [ ] Connection info API returns correct data
- [ ] Branch created: `gt create --all --message "feat: multi-node ssh routing"`

---

## Plan 12: Admin Commands

**Goal:** Add `uva admin` commands for cluster visibility.

### Context

Admins need to see:

- All nodes in cluster
- All workloads (VMs + jobs) across cluster
- Cluster resource totals

### Todos

- [ ] Create `apps/cli/src/admin.ts` with admin commands
- [ ] Implement `uva admin status` (cluster overview)
- [ ] Implement `uva admin nodes` (list all nodes)
- [ ] Implement `uva admin workloads` (all VMs + jobs)
- [ ] Implement `uva admin drain <node>` (drain for maintenance)
- [ ] Add admin auth check (only certain users)
- [ ] Register commands in index.ts
- [ ] Update man page
- [ ] Test commands

### Completion Criteria

- [ ] Admin commands work
- [ ] Proper auth check in place
- [ ] Man page updated
- [ ] Branch created: `gt create --all --message "feat: admin cli commands"`

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

- **IP:** ***REDACTED_IP***
- **Use for:** SSH jump host, central coordinator (handled by Charlie)
