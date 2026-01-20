# uvacompute Platform Architecture

## Current System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Current Architecture                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                    Customer Interfaces                                   │  │
│   │                                                                         │  │
│   │   CLI (uva)                     Website (uvacompute.com)                │  │
│   │   ─────────                     ─────────────────────────               │  │
│   │   $ uva login                   • Login/signup                          │  │
│   │   $ uva vm create               • Dashboard (VMs + Jobs)                │  │
│   │   $ uva vm ssh myvm             • Manage SSH keys                       │  │
│   │   $ uva run pytorch ...         • View logs                             │  │
│   │   $ uva logs <job-id>           • Early access signup                   │  │
│   │                                                                         │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                        │                                        │
│                                        │ HTTPS                                  │
│                                        ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                      Site (Next.js on Vercel)                            │  │
│   │                                                                         │  │
│   │   /api/vms/*          → VM operations                                  │  │
│   │   /api/jobs/*         → Job operations (NEW)                           │  │
│   │   /api/jobs/:id/logs  → Log streaming (WebSocket/SSE)                  │  │
│   │   /api/ssh-keys/*     → SSH key CRUD                                   │  │
│   │                                                                         │  │
│   │   Database: Convex (VMs, Jobs, SSH keys, logs metadata)                │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                        │                                        │
│                                        │ HMAC-signed                            │
│                                        ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │           Physical Machine (exposed via Tailscale Funnel)                │  │
│   │                                                                         │  │
│   │   VM Orchestration Service (Go)     SSH via virtctl                    │  │
│   │   ─────────────────────────────     ─────────────────────              │  │
│   │   POST /vms, /jobs                  virtctl port-forward               │  │
│   │   Callbacks to site                 (via k8s API)                      │  │
│   │                                                                         │  │
│   │   Backend: Incus (current) → KubeVirt (migration)                      │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Multi-Node Networking Architecture

### The Challenge

Contributors run nodes at home behind NAT routers. We need:

1. **Control plane communication** - k3s agents connecting to server
2. **SSH access** - Users connecting to VMs on contributor machines
3. **Log streaming** - Real-time logs from jobs anywhere in cluster

### Recommended Architecture: Hub-and-Spoke

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Multi-Node Architecture                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                              Internet                                           │
│                                  │                                              │
│                                  ▼                                              │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │              DigitalOcean VM (Hub) - Static Public IP                    │  │
│   │                                                                         │  │
│   │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐│  │
│   │   │  k3s Server     │  │  SSH Jump Host  │  │  Orchestration Service ││  │
│   │   │  (control plane)│  │  (routes SSH)   │  │  (API + scheduling)    ││  │
│   │   │                 │  │                 │  │                        ││  │
│   │   │  • API server   │  │  user → node    │  │  • Proxies to k8s API  ││  │
│   │   │  • Scheduler    │  │  → VM           │  │  • Callbacks to site   ││  │
│   │   │  • etcd         │  │                 │  │  • Log aggregation     ││  │
│   │   └─────────────────┘  └─────────────────┘  └─────────────────────────┘│  │
│   │              ▲                   ▲                                      │  │
│   └──────────────┼───────────────────┼──────────────────────────────────────┘  │
│                  │                   │                                          │
│                  │ Outbound connections (NAT-friendly)                         │
│                  │                   │                                          │
│        ┌─────────┴─────────┬─────────┴─────────┬─────────────────────┐         │
│        │                   │                   │                     │         │
│        ▼                   ▼                   ▼                     ▼         │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                        │
│   │  Node A     │    │  Node B     │    │  Node C     │    ...more nodes      │
│   │  (home)     │    │  (home)     │    │  (office)   │                        │
│   │  ─────────  │    │  ─────────  │    │  ─────────  │                        │
│   │  k3s agent  │    │  k3s agent  │    │  k3s agent  │                        │
│   │  ─────────  │    │  ─────────  │    │  ─────────  │                        │
│   │  Behind NAT │    │  Behind NAT │    │  Behind NAT │                        │
│   │  No public  │    │  No public  │    │  No public  │                        │
│   │  IP needed  │    │  IP needed  │    │  IP needed  │                        │
│   │             │    │             │    │             │                        │
│   │  VMs + Jobs │    │  VMs + Jobs │    │  VMs + Jobs │                        │
│   │  run here   │    │  run here   │    │  run here   │                        │
│   └─────────────┘    └─────────────┘    └─────────────┘                        │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### How It Works

#### 1. Control Plane (k3s)

```
Node (home, behind NAT)              DigitalOcean (public IP)
────────────────────────             ────────────────────────

k3s agent  ─────outbound────────►   k3s server:6443
           (establishes connection)  (accepts agent connections)

           ◄────────────────────►   Two-way communication over
           (tunnel stays open)       established connection
```

- Agents initiate **outbound** connection to server (works through NAT)
- Connection stays open for bidirectional communication
- No port forwarding needed on contributor's router

#### 2. SSH Access (Jump Host)

```
User                    DO Jump Host              Node               VM
────                    ────────────              ────               ──

ssh -p 2222            Receives SSH              k3s agent          VM
vmId@jump.uvacompute   ──────────────►          has reverse        receives
                       Looks up which            tunnel to          SSH
                       node has this VM          jump host          connection
                       ──────────────────────────────────►─────────►
```

- User connects via virtctl port-forward
- virtctl uses k8s API to route to correct node
- Requires kubectl access to the cluster

#### 3. Alternative: Tailscale (Optional Enhancement)

If contributor has Tailscale:

```
User (with Tailscale)              Node (with Tailscale)
─────────────────────              ─────────────────────

ssh root@node-xyz.tail12345.ts.net ────► Direct connection
                                         Lower latency
                                         No hop through DO
```

- Optional for power users
- Falls back to jump host if not available

### Why Hub-and-Spoke?

| Approach             | Pros                            | Cons                            |
| -------------------- | ------------------------------- | ------------------------------- |
| **Hub (DO)**         | NAT-friendly, simple onboarding | Single point, bandwidth         |
| **Mesh (Tailscale)** | Direct connections, low latency | Requires Tailscale on all nodes |
| **Hybrid**           | Best of both                    | More complexity                 |

**Recommendation: Start with Hub, add Tailscale as optional optimization.**

Contributors just run the install script - no network config needed. Tailscale can be added later for lower latency.

---

## Jobs Support

### Overview

Jobs are container workloads (Docker images) that run to completion.

| Feature  | VMs                      | Jobs                       |
| -------- | ------------------------ | -------------------------- |
| Duration | Hours/days (interactive) | Minutes/hours (batch)      |
| Access   | SSH                      | Logs only                  |
| GPU      | VFIO passthrough         | Time-slicing               |
| State    | Long-running             | Run to completion          |
| Use case | Development, GUI         | Training, batch processing |

### Data Model

Add to Convex schema:

```typescript
// convex/schema.ts
jobs: defineTable({
  userId: v.string(),
  jobId: v.string(),

  // Configuration
  image: v.string(),
  command: v.optional(v.array(v.string())),
  env: v.optional(v.any()),  // { KEY: "value" }

  // Resources
  cpus: v.number(),
  ram: v.number(),           // GB
  gpus: v.number(),

  // State
  status: v.union(
    v.literal("pending"),
    v.literal("scheduled"),
    v.literal("pulling"),
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("cancelled"),
  ),

  // Results
  exitCode: v.optional(v.number()),
  errorMessage: v.optional(v.string()),

  // Timestamps
  createdAt: v.number(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),

  // Node info (for debugging)
  nodeId: v.optional(v.string()),

  // Log storage reference
  logsUrl: v.optional(v.string()),  // S3/R2 URL for archived logs
})
  .index("by_user", ["userId"])
  .index("by_jobId", ["jobId"])
  .index("by_user_and_status", ["userId", "status"]),
```

### Log Storage Strategy

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            Log Storage Architecture                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   Job Running                    Job Completed                                  │
│   ───────────                    ─────────────                                  │
│                                                                                 │
│   ┌─────────────┐               ┌─────────────┐      ┌──────────────────┐      │
│   │  Kubernetes │               │  Kubernetes │      │  R2/S3           │      │
│   │  Pod Logs   │──────────────►│  Pod Logs   │─────►│  (archived)      │      │
│   │  (live)     │               │  (ephemeral)│      │  logs/job-xxx.txt│      │
│   └─────────────┘               └─────────────┘      └──────────────────┘      │
│         │                                                    │                  │
│         │ Stream                                             │ Fetch            │
│         ▼                                                    ▼                  │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                         Site API                                         │  │
│   │                                                                         │  │
│   │   GET /api/jobs/:id/logs                                               │  │
│   │   ├── If running: Stream from k8s via orchestration service            │  │
│   │   └── If completed: Fetch from R2/S3                                   │  │
│   │                                                                         │  │
│   │   WebSocket/SSE for real-time streaming                                │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│         │                                                                       │
│         │                                                                       │
│         ▼                                                                       │
│   ┌─────────────────┐         ┌─────────────────────────────────────────────┐  │
│   │  CLI            │         │  Website                                    │  │
│   │  $ uva logs xxx │         │  Job detail page with log viewer           │  │
│   │  (streams)      │         │  (auto-scroll, search, download)           │  │
│   └─────────────────┘         └─────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Storage tiers:**

| State         | Storage                  | Retention     | Cost       |
| ------------- | ------------------------ | ------------- | ---------- |
| Running       | k8s pod logs (in-memory) | While running | Free       |
| Completed <7d | R2/S3                    | 7 days        | ~$0.01/GB  |
| Completed >7d | R2/S3 (compressed)       | 30 days       | ~$0.005/GB |
| Archived      | Delete or user pays      | N/A           | N/A        |

### API Endpoints

#### Site API (New)

```
# Job management
POST   /api/jobs              # Submit job
GET    /api/jobs              # List user's jobs
GET    /api/jobs/:id          # Get job details
DELETE /api/jobs/:id          # Cancel job

# Logs
GET    /api/jobs/:id/logs     # Get/stream logs
  ?follow=true                # Stream live (WebSocket upgrade)
  ?tail=100                   # Last N lines
  ?since=2024-01-01T00:00:00Z # Since timestamp
```

#### Orchestration Service (New)

```
POST   /jobs                  # Create job (from site)
GET    /jobs/:id              # Get job status
DELETE /jobs/:id              # Cancel job
GET    /jobs/:id/logs         # Stream logs from k8s

# Callback to site
POST   /api/jobs/:id/update-status
```

### CLI Commands

```bash
# Submit a job
uva run <image> [command...]
  --gpu 1                     # Request GPU
  --cpu 4                     # CPU cores
  --ram 16                    # GB RAM
  --env KEY=value             # Environment variables
  --name "my training"        # Job name

# Examples
uva run pytorch/pytorch:2.0-cuda12.1 python train.py --epochs 100
uva run --gpu 1 --env WANDB_KEY=xxx myimage:latest ./run.sh

# List jobs
uva jobs                      # Active jobs
uva jobs --all                # All jobs including completed

# View logs
uva logs <job-id>             # Stream logs (follows by default)
uva logs <job-id> --tail 100  # Last 100 lines
uva logs <job-id> --no-follow # Print and exit

# Cancel job
uva cancel <job-id>
```

### Website UI

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Dashboard                                                              user ▼  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Active Workloads                                                       │   │
│  │                                                                         │   │
│  │  VMs                              Jobs                                  │   │
│  │  ────                             ────                                  │   │
│  │  devbox [running]                 training-v2 [running] 2h 34m         │   │
│  │  └─ 4 CPU, 16GB, 1 GPU            └─ pytorch:2.0 • 8 CPU, 32GB, 1 GPU  │   │
│  │                                      [View Logs] [Cancel]              │   │
│  │  test-vm [running]                                                     │   │
│  │  └─ 2 CPU, 8GB                    preprocessing [completed] ✓          │   │
│  │                                   └─ Finished in 45m • Exit 0          │   │
│  │                                      [View Logs] [Download]            │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Job Logs: training-v2                                    [Download ↓] │   │
│  │  ───────────────────────────────────────────────────────────────────── │   │
│  │  2024-12-28 15:30:01 | Epoch 1/100: loss=2.3456                       │   │
│  │  2024-12-28 15:30:45 | Epoch 2/100: loss=1.8234                       │   │
│  │  2024-12-28 15:31:30 | Epoch 3/100: loss=1.2456                       │   │
│  │  2024-12-28 15:32:15 | Epoch 4/100: loss=0.9876                       │   │
│  │  █ (streaming...)                                                      │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Complete CLI Reference

### Existing Commands (Unchanged)

```bash
# Authentication
uva login                    # Authenticate
uva logout                   # Log out
uva whoami                   # Show current user

# VMs
uva vm create -h <hours>     # Create VM
uva vm list [--all]          # List VMs
uva vm ssh <name>            # SSH into VM
uva vm status <name>         # Get status
uva vm delete <name>         # Delete VM

# SSH Keys
uva ssh-key list
uva ssh-key add <file> --name "name"
uva ssh-key remove <id>

# CLI
uva upgrade
uva uninstall
```

### New: Jobs Commands

```bash
# Run jobs
uva run <image> [cmd...]     # Submit container job
  --gpu <n>                  # GPU count
  --cpu <n>                  # CPU cores
  --ram <n>                  # RAM in GB
  --env KEY=value            # Environment variable (repeatable)
  --name <name>              # Job name

# Manage jobs
uva jobs [--all]             # List jobs
uva logs <job-id>            # Stream logs
  --tail <n>                 # Last N lines only
  --no-follow                # Don't stream, just print
uva cancel <job-id>          # Cancel running job
```

### New: Node Commands

```bash
# Install/configure node
uva node install             # Join as contributor node
uva node uninstall           # Leave cluster, clean up

# Control sharing
uva node status              # Show resources, workloads
uva node config              # Reconfigure resources
uva node pause               # Stop accepting work
uva node resume              # Resume accepting work
```

### New: Admin Commands

```bash
# Cluster visibility (requires admin)
uva admin status             # Cluster overview
uva admin nodes              # List all nodes
uva admin workloads          # All VMs + jobs
uva admin drain <node>       # Drain for maintenance
```

---

## Configuration

### `~/.uvacompute/` Directory

```
~/.uvacompute/
├── config                    # Auth token (existing)
├── node/                     # Node config (if contributor)
│   ├── config.yaml           # Resource sharing settings
│   ├── install-state.yaml    # For clean uninstall
│   └── node-id
└── completions/              # Shell completions
```

### Environment Variables

#### Site (Vercel)

```bash
VM_ORCHESTRATION_SERVICE_URL=https://orchestration.uvacompute.com
ORCHESTRATION_SHARED_SECRET=xxx
CONVEX_DEPLOYMENT=xxx

# Log storage
R2_BUCKET=uvacompute-logs
R2_ACCESS_KEY=xxx
R2_SECRET_KEY=xxx
```

#### Orchestration Service (DigitalOcean / Physical)

```bash
ENV=production
SITE_BASE_URL=https://uvacompute.com
ORCHESTRATION_SHARED_SECRET=xxx
VM_BACKEND=kubevirt
KUBECONFIG=/etc/rancher/k3s/k3s.yaml

# SSH jump host
SSH_PROXY_PORT=2222
```

#### Contributor Node

```bash
# Set during `uva node install`
K3S_URL=https://hub.uvacompute.com:6443
K3S_TOKEN=xxx
```

---

## Implementation Phases

> **Note:** See `IMPLEMENTATION_PLAN.md` for detailed todos and progress tracking.

### Phase 1: Single Node + Jobs ✅ Complete

| Task                     | Description                          | Plan |
| ------------------------ | ------------------------------------ | ---- |
| Jobs in Convex           | Add `jobs` table, queries, mutations | 4    |
| Jobs API (site)          | `/api/jobs/*` endpoints              | 4    |
| Jobs API (orchestration) | Create/cancel jobs via k8s           | 5    |
| Log streaming            | SSE from k8s → site → client         | 8    |
| CLI commands             | `uva run`, `uva jobs`, `uva logs`    | 6    |
| Website UI               | Jobs list, log viewer                | 7    |
| KubeVirtAdapter          | Replace Incus with KubeVirt          | 1-2  |

### Phase 2: Federated Multi-Node 🔄 In Progress

| Task                  | Description                      | Plan |
| --------------------- | -------------------------------- | ---- |
| Hub Setup             | k3s server + KubeVirt on DO VPS  | 14   |
| Agent Installation    | Nodes run k3s agent, join hub    | 15   |
| Multi-node scheduling | k8s scheduler places workloads   | 16   |
| SSH routing           | Jump host routes to correct node | 11   |
| Node onboarding       | Token-based registration         | 13   |
| Admin dashboard       | Cluster-wide visibility          | 17   |
| Health monitoring     | Node health, failover handling   | 18   |

### Phase 3: Polish

| Task                  | Description                  | Plan |
| --------------------- | ---------------------------- | ---- |
| Log archival          | Move completed logs to R2/S3 | TBD  |
| Kubernetes Dashboard  | Web admin UI (optional)      | 17   |
| Tailscale integration | Optional direct connections  | TBD  |
| Metrics/monitoring    | Resource usage, job stats    | TBD  |

---

## Summary

### Networking

| Component               | How It Connects                    |
| ----------------------- | ---------------------------------- |
| CLI/Website → Site      | HTTPS (Vercel)                     |
| Site → Orchestration    | HMAC-signed HTTPS                  |
| Orchestration → k8s     | Local kubeconfig                   |
| Contributor nodes → Hub | k3s agent (outbound, NAT-friendly) |
| User SSH → VM           | Jump host on hub routes to node    |

### Data Flow

| Data            | Storage       | Access                   |
| --------------- | ------------- | ------------------------ |
| Users, SSH keys | Convex        | Site API                 |
| VMs, Jobs       | Convex        | Site API                 |
| Live logs       | k8s pod logs  | Stream via orchestration |
| Archived logs   | R2/S3         | Direct URL or Site API   |
| Cluster state   | etcd (in k3s) | kubectl / orchestration  |

### Customer vs Admin

|        | Customer                        | Admin                    |
| ------ | ------------------------------- | ------------------------ |
| Web UI | uvacompute.com                  | Kubernetes Dashboard     |
| CLI    | `uva vm`, `uva run`, `uva jobs` | `uva admin`, `kubectl`   |
| Data   | Own VMs/jobs only               | All nodes, all workloads |

---

## References

- [KubeVirt User Guide](https://kubevirt.io/user-guide/)
- [k3s Documentation](https://docs.k3s.io/)
- [Kubernetes Dashboard](https://kubernetes.io/docs/tasks/access-application-cluster/web-ui-dashboard/)
- [Tailscale Funnel](https://tailscale.com/kb/1223/funnel)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
