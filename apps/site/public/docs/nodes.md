# node management

contribute your gpu hardware to the uvacompute network. nodes run vms and container jobs for users on the platform.

## prerequisites

- a linux machine with nvidia gpu(s)
- installed the [uva cli](./getting-started.md)
- authenticated with `uva login`
- root/sudo access on the machine

## installing a node

### 1. prepare your system

install nvidia drivers and check system requirements:

```bash
sudo uva node prepare
```

this installs nvidia drivers and verifies iommu support.

| flag           | description                                    |
| -------------- | ---------------------------------------------- |
| `--check`      | show what would be done without making changes |
| `--skip-iommu` | skip iommu verification checks                 |

### 2. create a registration token

generate a token for node registration:

```bash
uva node token create
```

tokens are single-use and expire after 24 hours.

### 3. install the node

install k3s, kubevirt, and register with uvacompute:

```bash
sudo uva node install
```

you'll be prompted for the registration token from step 2.

## pausing a node

pausing a node prevents new workloads from being scheduled while allowing existing workloads to complete.

### via cli

```bash
uva node pause
```

### via web dashboard

1. go to [my nodes](https://uvacompute.com/my-nodes)
2. click on your node to expand it
3. click "pause node"

> **note:** when paused, the node shows as "draining" status. existing vms and jobs will continue running until they complete.

## resuming a node

resuming a paused node allows it to accept new workloads again.

### via cli

```bash
uva node resume
```

### via web dashboard

1. go to [my nodes](https://uvacompute.com/my-nodes)
2. click on your paused node to expand it
3. click "resume node"

## uninstalling a node

completely remove uvacompute from your machine.

### 1. pause and wait for workloads

pause the node and wait for existing workloads to complete:

```bash
uva node pause
```

### 2. run the uninstall command

remove k3s, kubevirt, and all uvacompute components:

```bash
sudo uva node uninstall
```

this removes k3s, kubevirt, ssh tunnel service, and gpu scripts.

## node status reference

| status   | indicator | description                                            |
| -------- | --------- | ------------------------------------------------------ |
| online   | green     | accepting and running workloads                        |
| draining | yellow    | paused - existing workloads continue, no new workloads |
| offline  | red       | node is unreachable or not running                     |

## additional commands

### list your contributed nodes

```bash
uva node list
```

shows all nodes you've contributed to the network with their status and resources.

### check node status

```bash
uva node status
```

### view workloads on a node

```bash
uva node workloads <nodeId>
```

shows active vms and jobs running on a specific contributed node.

### configure resource sharing

```bash
uva node config
```

interactively configure how many cpus, ram, and gpus to share with the network.

### list your tokens

```bash
uva node token list
```
