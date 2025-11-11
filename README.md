# UVACompute

## Todo list

- [ ] speed is horrible.
- [ ] need a man page
- [ ] auth flow gives you the code twice basically
- [ ] terminate instance on web ui
- [ ] upgrade/downgrade vCPUs, storage
- [ ] Add UV to base images
- [ ] allow BYO startup scripts
- [ ] Run Docker container (via Kubernetes, probably)
- [ ] Live tail logs in CLI/UI (modal-style)
- [ ] Integrate vcluster (?)
- [ ] When 2 GPUs are purchased, support 2 GPUs
- [ ] modal notebooks implementation
- [ ] support other computers joining uvacompute
  - add some switch off/on supoprt easily
- [ ] can this be rearchitected without incus and only using k8s?
- [ ] make some market out of this (?)

## Setup

```
pnpm i
vc link --repo
vc env pull --cwd apps/site # optional, pull preview/production with --environment=[preview|production]
```

## Run

```
pnpm dev
```

## Build & Deploy

- `apps/site` is a Next.js app that is deployed automatically to Vercel
- `apps/status` is a nextjs app that is deployed automatically to Vercel
- `apps/cli` is a CLI application with bun that is built with `build-binary`.
  - deployments are built on push/pr to main, but you manually make a release via the GitHub action.
- `apps/vm-orchestration-service` can be installed with `sudo make install` in `apps/vm-orchestration-service` and can be restarted/logged with `systemctl` commands
  - requires:
    - tailscale connected to my tailnet
    - autossh
    - the ip of our VPS for ssh proxying
    -

## Accounts

- GitHub (for github app) - using github email:
  - dev/staging/prod apps (all separate apps)
- Inbound.new (for email forwarding) - using github:
  - for email forwarding from \*@inbound.new to my personal email ***REDACTED_EMAIL***
- digital ocean using github email:
  - $4/mo vps, password is uvaHazNoGp000s
  - ip is ***REDACTED_IP***
