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

## Todo

- no vm state persistence (e.g. if service dies, need to recover vms? or should it just die?)
- vm lifecycle:
  - need to track expiration
  - support extension
- support all apis
- incus vm creation non-atomic operations
- ssh connection
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
