# uvacompute

## Contribution

Hello contributor, text charlie. rough idea of what needs to be done can be found below:

## Todo list

- [x] speed is horrible.
- [x] need a man page
- [x] auth flow gives you the code twice basically
- [x] terminate instance on web ui
- [ ] upgrade/downgrade vCPUs, storage
- [x] allow BYO startup scripts
- [ ] Run Docker container (via Kubernetes, probably)
  - Live tail logs in CLI/UI (modal-style) in the CLI (and potentialyl UI)?
  - need to add into the ui view vms/jobs
- [ ] o11y into how people r using it ++ some visualization of usage
- [ ] When 2 GPUs are purchased, support 2 GPUs
- [ ] modal notebooks implementation
- [ ] support other computers joining uvacompute
  - add some switch off/on supoprt easily
- [ ] can this be rearchitected without incus and only using k8s?
- [ ] make some market out of this (?)

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

#### `site`

This is the main nextjs website. to run:

- in one terminal, run `pnpm dev`
- in another terminal, run `npx convex dev`

should work fine reading from dev database.

### `status`

This is the status page (status.uvacompute.com), just run with `pnpm dev` (goes to port 3001). this reads from prod status (i'm lazy).

### `cli`

The cli. to run locally, install `bun` then do `bun run index.ts [commands]`. this will run in development, but no VMs will be created unless you have the `vm-orchestration-service` running on port 8080

also ensure you update the man page if you update the cli. pls don't be lazy.

### `vm-orchestration-service`

the main vm thingy. this should only really run on linux machines since it uses `incus`. if you wanna set this up on a linux box, you need to have installed

- `tailscaled` and be connected to my tailnet
- `sshd` (should prolly ahve this by default)
- `autossh`
- `incus`
- `ssh2inucs`

other things for setup/general notes:

- this kind of has a `dev` environment where it just skips incus calls, but it's not really reliable atm. maybe a nice story would be to have a good dev environment (both for mac and linux)
- you need to have an ssh key in your root home that allows autossh to look for it.
- for this to work via ssh to the digital ocean vps, we need to add your ssh key on your workstation to the VPS

install with `sudo make install`, read makefile for other commands

### The actual workstation

if you wanna access the actual workstgation that is hosting the prod vm orchestration service, just ask charlie. you'll have to join his tailnet then all u gotta do is just do `ssh workstation` and you have a shell into it. really nice for debugging in prod (lol)

## General development "flow" [as of right now]

So let's say i wanna add a feature that tests the entire stack (cli, ui, and the actual vm orchestration service). currently we kinda just test in prod. let's work thru an example here where i add a new command to the cli. Let's say this is adding support for upgrading/downgrading a VM. here's roughly what it would look like.

- Make your changes and ship a PR, wait for reviewers.
- on the workstation, check out that branch and `sudo make install` the `vm-orchestration-service` since you made changes to it
- merge the PR when ready, then go into GitHub actions, look at the "release" action for releasing a new version of the CLI, then release.
- Install new version of cli
- test the commands
- debug via `ssh workstation` and tailing logs for the service and the Vercel logs.

_as you can tell we kinda do need a better dev setup here.
_

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

## Accounts

- Convex using github email
- GitHub (for github app) - using github email:
  - dev/staging/prod apps (all separate apps)
- Inbound.new (for email forwarding) - using github:
  - for email forwarding from \*@inbound.new to my personal email charlie@charliemeyer.xyz
- digital ocean using github email:
  - $4/mo vps (SSH proxy for nodes)
  - ip: 24.199.85.26
  - ssh: `ssh root@24.199.85.26`
  - password: `baked beans`
  - NODE_KEYS_SYNC_SECRET: `f5032891839d6e7a3d1e59292f3cfe8e46bb6ee3bc55e39f7686b64dd0dfa578`
    - This secret is used by the DO VPS to fetch node SSH keys from the site API
    - Must be set as env var on Vercel for the site
