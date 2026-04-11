# virtual machines

uvacompute vms provide instant access to gpu-powered virtual machines with up to rtx 5090s, 2tb nvme ssd, 32 vcpus, and 128gb ram. get an ssh shell in under 10 seconds.

## prerequisites

before creating a vm, make sure you have:

- installed the [uva cli](./getting-started.md)
- authenticated with `uva login`

## quick start

### 1. create a vm

provision a new virtual machine:

```bash
uva vm create -h 1 -n my-vm
```

`-h` specifies the number of hours, `-n` sets the vm name.

### 2. connect to your vm

ssh into your running vm:

```bash
uva vm ssh my-vm
```

## managing vms

### list your vms

```bash
uva vm list
```

use `-a` or `--all` to include expired vms.

### check vm status

```bash
uva vm status <vmId>
```

### extend a vm

add more time to a running vm:

```bash
uva vm extend my-vm --hours 2
```

`--hours` specifies how many additional hours to add.

### delete a vm

```bash
uva vm delete my-vm
```

also available as `uva vm rm`.

## vm options

| flag                   | description                                                          | example                |
| ---------------------- | -------------------------------------------------------------------- | ---------------------- |
| `-h, --hours`          | duration in hours (required)                                         | `-h 2`                 |
| `-n, --name`           | vm name                                                              | `-n my-vm`             |
| `-c, --cpus`           | number of CPUs (default: 1)                                          | `-c 4`                 |
| `-r, --ram`            | RAM in GB (default: 8)                                               | `-r 16`                |
| `-d, --disk`           | disk size in GB (default: 64)                                        | `-d 128`               |
| `-g, --gpus`           | number of GPUs (default: 0)                                          | `-g 1`                 |
| `-t, --gpu-type`       | GPU type (default: 5090)                                             | `-t 5090`              |
| `-e, --expose`         | expose port via HTTPS endpoint                                       | `-e 8000`              |
| `-s, --startup-script` | path to startup script (runs on first boot)                          | `-s setup.sh`          |
| `--cloud-init`         | path to cloud-init config (mutually exclusive with --startup-script) | `--cloud-init ci.yaml` |
