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

- (Add gotchas as you discover them)

### Useful Patterns

- (Add patterns as you discover them)

---

## Progress Tracker

| Plan                               | Status         | Branch | Notes                                         |
| ---------------------------------- | -------------- | ------ | --------------------------------------------- |
| 1. Remove Incus, finalize KubeVirt | ✅ Complete    |        | Removed all Incus code, KubeVirt-only backend |
| 2. Test KubeVirt on workstation    | ⬜ Not Started |        |                                               |
| 3. k3s/KubeVirt install script     | ⬜ Not Started |        |                                               |
| 4. Jobs schema + site API          | ⬜ Not Started |        |                                               |
| 5. Jobs in orchestration service   | ⬜ Not Started |        |                                               |
| 6. Jobs CLI commands               | ⬜ Not Started |        |                                               |
| 7. Jobs website UI                 | ⬜ Not Started |        |                                               |
| 8. Log storage + streaming         | ⬜ Not Started |        |                                               |
| 9. Node management CLI             | ⬜ Not Started |        |                                               |
| 10. Node config + partial sharing  | ⬜ Not Started |        |                                               |
| 11. Multi-node SSH routing         | ⬜ Not Started |        |                                               |
| 12. Admin commands                 | ⬜ Not Started |        |                                               |

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

- [ ] SSH to workstation: `ssh workstation`
- [ ] Install k3s: `curl -sfL https://get.k3s.io | sh -`
- [ ] Install KubeVirt (follow install script in `scripts/`)
- [ ] Create test namespace: `kubectl create namespace uvacompute`
- [ ] Deploy orchestration service locally on workstation
- [ ] Test VM creation via orchestration service API
- [ ] Test VM deletion
- [ ] Test with GPU (if NVIDIA operator is set up)
- [ ] Document any issues in Learnings section

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

- [ ] k3s installed and running on workstation
- [ ] KubeVirt installed and healthy
- [ ] Can create VM via API
- [ ] Can delete VM via API
- [ ] Documented setup steps
- [ ] Branch created: `gt create --all --message "test: validate kubevirt on workstation"`

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

### Todos

- [ ] Create `apps/cli/src/node.ts` with node subcommands
- [ ] Implement `uva node install` command structure
- [ ] Create install script at `apps/site/public/install.sh` (already exists, update it)
- [ ] Add k3s installation logic
- [ ] Add KubeVirt installation logic
- [ ] Add NVIDIA container toolkit installation (detect GPU first)
- [ ] Create `~/.uvacompute/node/config.yaml` structure
- [ ] Create `~/.uvacompute/node/install-state.yaml` for tracking changes
- [ ] Test on workstation via `ssh workstation`

### Files to Create/Modify

- `apps/cli/src/node.ts` → NEW
- `apps/cli/index.ts` → Register node commands
- `apps/site/public/install.sh` → UPDATE
- `apps/cli/src/lib/node-config.ts` → NEW (config types/helpers)

### Completion Criteria

- [ ] `bun run build` succeeds
- [ ] `uva node install` runs (even if just scaffolding)
- [ ] Install script tested on workstation
- [ ] Config files created in `~/.uvacompute/node/`
- [ ] Branch created: `gt create --all --message "feat: uva node install command"`

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
