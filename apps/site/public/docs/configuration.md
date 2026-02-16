# configuration

uvacompute stores configuration and data in standardized locations following the filesystem hierarchy standard (fhs).

## cli configuration (~/.uvacompute/)

user authentication and local settings. this directory is created when you run `uva login`.

| file                      | description                           |
| ------------------------- | ------------------------------------- |
| `config`                  | auth token and version info (json)    |
| `node/config.yaml`        | local node management config          |
| `node/install-state.yaml` | installation tracking                 |
| `node/prepare-state.yaml` | pre-install state (gpu, iommu checks) |

## node system configuration (/etc/uvacompute/)

node registration and runtime settings. these files are created during node installation and require root access.

| file                   | description                                         |
| ---------------------- | --------------------------------------------------- |
| `node-config.yaml`     | hub connection details (tunnel host, port, k3s url) |
| `node-labels.yaml`     | kubernetes resource labels (cpus, ram, gpu type)    |
| `storage-config.yaml`  | vm storage allocation settings                      |
| `orchestration-secret` | api authentication for gpu mode scripts             |

> **note:** these files contain sensitive information. the orchestration-secret file has mode 600 (owner read/write only).

## node data storage (/var/lib/uvacompute/)

persistent vm and job data. this is where vm disk images and working directories are stored.

| path       | description                             |
| ---------- | --------------------------------------- |
| `storage/` | vm disk images, job working directories |

> **storage allocation:** during node installation, you specify how much disk space to allocate. this directory will use up to that amount for vm disks and job data.

## ssh keys (~/.ssh/)

ssh keys used for secure communication between nodes and the hub.

| file                        | description                             |
| --------------------------- | --------------------------------------- |
| `id_ed25519_uvacompute`     | node tunnel communication key (private) |
| `id_ed25519_uvacompute.pub` | node tunnel communication key (public)  |

## gpu mode management

switch between nvidia (container) and vfio (vm passthrough) gpu modes on nodes with nvidia gpus.

| command                    | description                                     |
| -------------------------- | ----------------------------------------------- |
| `uva node gpu-mode status` | show current gpu mode                           |
| `uva node gpu-mode nvidia` | switch to nvidia mode (for container workloads) |
| `uva node gpu-mode vfio`   | switch to vfio mode (for vm gpu passthrough)    |

### example usage

```bash
uva node gpu-mode status
uva node gpu-mode nvidia
uva node gpu-mode vfio
```

## directory summary

| purpose       | location               | rationale                               |
| ------------- | ---------------------- | --------------------------------------- |
| system config | `/etc/uvacompute/`     | fhs: host-specific system configuration |
| variable data | `/var/lib/uvacompute/` | fhs: persistent application data        |
| user config   | `~/.uvacompute/`       | xdg: user-level configuration           |
| scripts       | `/usr/local/bin/`      | fhs: locally installed executables      |
