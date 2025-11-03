# VM Orchestration Service

This is the Go service that we use to actually orchestrate provisioning VMs using Incus.

## Quick Start

```bash
# Development, with hot reload
make dev

# Production
sudo make install
sudo make uninstall
```

## Commands

```bash
# logs
journalctl -u vm-orchestration -f
systemctl status vm-orchestration
systemctl restart vm-orchestration
# check funnell status
tailscale funnel status
```

## SSH Proxy Setup

The VMs are accessed via an SSH proxy (ssh2incus) running on port 2222 on the workstation. The systemd service automatically configures Tailscale Funnel to expose both:

- **HTTPS (port 443)**: VM orchestration API
- **TCP (port 8443)**: SSH proxy for VM access

### Automatic Setup (via systemd)

When you run `sudo make install`, the service automatically:

1. Starts the VM orchestration service
2. Exposes port 8080 via Tailscale Funnel on HTTPS port 443
3. Exposes port 2222 (ssh2incus) via Tailscale Funnel on TCP port 8443

Verify both funnels are running:

```bash
tailscale funnel status
# Should show:
# - https://your-hostname.ts.net:443 -> localhost:8080
# - tcp://your-hostname.ts.net:8443 -> localhost:2222
```

Then configure your site app:

```bash
SSH2INCUS_HOST=your-hostname.ts.net
SSH2INCUS_PORT=8443
```

### Manual Setup (Development)

If running in development without systemd:

```bash
# Start Tailscale funnels manually
tailscale funnel --bg --https=443 8080
tailscale funnel --bg --tcp=8443 tcp://localhost:2222
```

### Alternative: Direct Public Access

If your workstation has a public IP and you don't want to use Tailscale Funnel:

```bash
sudo ufw allow 2222/tcp
# Then configure site: SSH2INCUS_HOST=your-public-ip, SSH2INCUS_PORT=2222
```

**Security:** The SSH proxy uses public key authentication (configured via `uva ssh-key add`). Each VM is isolated and users can only access their own VMs.

## Todo

- no vm state persistence (e.g. if service dies, need to recover vms? or should it just die?)
- vm lifecycle:
  - need to track expiration
  - support extension
- support all apis
- incus vm creation non-atomic operations
- mutex for creation rather than for all operations

## API Structure

The API we are supporting right now is just for VM management (k8s, docker images coming later).

- `/vms`
  - POST: Creates the VM. Arguments are:
    - args:
      - `hours`
        - Note: in frontend we convert days => 24 hours.
      - `gpus` (number, we only support 0 or 1)
      - `cpus` (number, up to 16, powers of 2 only, min 1 CPU).
      - `ram` (number, up to 64, powers of 2 only, min 1GB).
      - `disk` (number, up to 1TB, powers of 2 only, min 64GB. in gigabytes).
      - `gpu-type` (string, we only have 5090)
      - `userId` (string)
    - returns:
      - `id` (string): vm id
      - tbd: something relating to how to connect via ssh

  - GET: gets all vms for a user id:
    - returns:
      - list of vm Id's

- `/vms/{id}`
  - GET: get status of a vm (ensure the vm id is associated with the )
    - returns:
      - if this user owns this vm, then get info about the vm (tbd)
- `/vms/{id}/stop`: stops vm
  - POST: stop vm
    - returns:
      - status of success (did it stop or nah, and why)
- `/vms/{id}/extend`
  - POST: extend vm lifetime
    - args:
      - `hours` (number)
    - returns:
      - status (did it extend or not, and why)
