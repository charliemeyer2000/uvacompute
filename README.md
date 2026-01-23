# uvacompute

## Contribution

Hello contributor, text charlie. rough idea of what needs to be done can be found below:

## Todo list

- [x] speed is horrible.
- [x] need a man page
- [x] auth flow gives you the code twice basically
- [x] terminate instance on web ui
- [x] allow BYO startup scripts
- [x] Run Docker container (via Kubernetes)
  - [x] Live tail logs in CLI
  - [x] Add into the UI view for vms/jobs
- [x] Can this be rearchitected without incus and only using k8s? (now uses KubeVirt)
- [ ] upgrade/downgrade vCPUs, storage
- [ ] o11y into how people r using it ++ some visualization of usage
- [ ] When 2 GPUs are purchased, support 2 GPUs
- [ ] modal notebooks implementation
- [ ] support other computers joining uvacompute
  - add some switch off/on support easily
- [ ] make some market out of this (?)

## Infra

![Infrastructure Diagram](apps/site/public/infra.png)

**Architecture Overview:**

- **CLI** (`uva`) runs on user machines, authenticates via device flow, and communicates with the site API
- **Site** (uvacompute.com) is a Next.js app on Vercel that serves the web UI and API gateway, backed by Convex for real-time data
- **Status** (status.uvacompute.com) is a separate Next.js app showing uptime and cluster health, backed by Redis
- **DO Droplet** (hub VPS) acts as an SSH proxy/tunnel endpoint for CLI access to VMs and handles endpoint exposure via Caddy
- **Workstation Node** runs the vm-orchestration-service with k3s + KubeVirt for actual VM/job execution, connected via Tailscale

Data flow: CLI → Site API (Vercel) → vm-orchestration-service (on workstation) → Kubernetes (KubeVirt VMs / Jobs)

## Setup

### General

need `pnpm`, `vercel`, `convex` `bun`, `go`, `tailscale` and `make`.

### Local Sites

```
pnpm i
vc link --repo # install vercel cli if needed, and also talk to charlie about being added as collaborator so you can pull environment variables

# pull specific repo
vc env pull --cwd apps/site # optional, pull preview/production with --environment=[preview|production]

# install convex cli and also you need to contact charlie to get collaborator access on convex
npx convex dev
```

## Apps

### `site`

Main Next.js website (uvacompute.com). Serves as the web UI and API gateway.

**Key features:**

- Web dashboard for managing VMs and container jobs
- API routes that proxy to the vm-orchestration-service
- Device authorization flow for CLI authentication (via Better-Auth)
- Real-time status updates via Convex
- SSH key management

**To run locally:**

- In one terminal: `pnpm dev`
- In another terminal: `npx convex dev`

### `status`

Status page (status.uvacompute.com). Shows infrastructure health and uptime.

**Key features:**

- Current system status (operational/degraded/down)
- Response time tracking and uptime percentages
- 30-day historical data
- Cluster status from the main site API

**To run locally:** `pnpm dev` (runs on port 3001, reads from prod Redis)

### `cli`

The CLI tool (`uva`). TypeScript/Bun compiled to a standalone binary.

**Commands:**

- `uva login` / `uva logout` - Authentication
- `uva vm create/list/status/ssh/delete` - VM management
- `uva jobs run/ls/logs/cancel` - Container job management
- `uva ssh-keys add/list/remove` - SSH key management
- `uva upgrade` / `uva uninstall` - CLI management

**To run locally:** `bun run index.ts [commands]` (runs in dev mode, won't create real VMs unless vm-orchestration-service is running on port 8080)

Also ensure you update the man page if you update the cli.

### `vm-orchestration-service`

Go service that orchestrates VM and job creation via Kubernetes.

**Key features:**

- Creates VMs using KubeVirt (Kubernetes-native VMs)
- Runs container jobs as Kubernetes Jobs with GPU support
- Cloud-init integration for SSH keys and startup scripts
- Health monitoring and reconciliation with Convex
- FRPC integration for SSH tunneling through the hub

**Requirements on the workstation node:**

- k3s with KubeVirt, GPU Operator, CDI installed (see Makefile)
- Tailscale connected to the tailnet
- SSH key for autossh tunnel to hub

**To install:** `sudo make install` (see Makefile for other commands like `make install-kubevirt-stack`)

### The actual workstation

If you wanna access the actual workstation that is hosting the prod vm orchestration service, just ask charlie. You'll have to join his tailnet then all u gotta do is just do `ssh workstation` and you have a shell into it.

## Examples

See the `examples/` directory for usage examples:

- `examples/JOBS.md` - Container job examples including GPU tests, vLLM servers, etc.

## Build & Deploy

- **`apps/site`** - Next.js app deployed automatically to Vercel on push to main
- **`apps/status`** - Next.js app deployed automatically to Vercel on push to main
- **`apps/cli`** - Bun CLI built with `build-binary`. Binaries are built on push/PR to main, but releases are made manually via the GitHub action
- **`apps/vm-orchestration-service`** - Go service deployed to the workstation node:
  - SSH into workstation: `ssh workstation`
  - Pull latest: `cd ~/uvacompute && git pull`
  - Reinstall: `cd apps/vm-orchestration-service && sudo make install`
  - View logs: `journalctl -u vm-orchestration -f`
  - Restart: `sudo systemctl restart vm-orchestration`
- **DO Droplet (hub)** - Runs Caddy for endpoint exposure and SSH proxy:
  - Deploy hub service: `make deploy-hub` (from vm-orchestration-service dir)
  - SSH: `ssh root@***REDACTED_IP***`

## Accounts

(Contact charlie for access to any of these)

- Convex using github email
- GitHub (for github app) - using github email:
  - dev/staging/prod apps (all separate apps)
- Inbound.new (for email forwarding) - using github:
  - for email forwarding from \*@inbound.new to my personal email ***REDACTED_EMAIL***
- digital ocean using github email:
  - $12/mo vps (SSH proxy for nodes)
  - ip: ***REDACTED_IP***
  - ssh: `ssh root@***REDACTED_IP***`
  - password: `***REDACTED***`
  - NODE_KEYS_SYNC_SECRET: `***REDACTED***`
    - This secret is used by the DO VPS to fetch node SSH keys from the site API
    - Must be set as env var on Vercel for the site
