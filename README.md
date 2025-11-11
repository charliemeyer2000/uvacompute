# UVACompute

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
  - for email forwarding from \*@inbound.new to my personal email charlie@charliemeyer.xyz
- digital ocean using github email:
  - $4/mo vps, password is uvaHazNoGp000s
  - ip is 24.199.85.26
