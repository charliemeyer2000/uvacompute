# uvacompute CLI

## Installation

Install with a single command:

```bash
curl -fsSL https://uvacompute.com/install.sh | bash
```

Or download the script first to inspect it:

```bash
curl -fsSL https://uvacompute.com/install.sh -o install.sh
chmod +x install.sh
./install.sh
```

## Documentation

A comprehensive man page is available. To view it:

```bash
man ./uva.1
```

Or after installation:

```bash
man uva
```

## API

### Auth

`uva login`: logs in to uvacompute

- `--force`: if already logged in, forcefully re-logs in.

`uva logout`: logs out (not yet implemented)

### Management

`uva uninstall`: uninstall the uvacompute CLI

Removes the CLI binary and all configuration data. Prompts for confirmation (y/N) before proceeding.

### Virtual Machines

#### Create VM

`uva vm create`: create a new virtual machine

**Required:**

- `-h, --hours <hours>`: Number of hours to run the VM

**Optional:**

- `-c, --cpus <cpus>`: Number of CPUs (default: 1, must be power of 2, max: 16)
- `-r, --ram <ram>`: RAM in GB (default: 8, must be power of 2, max: 64)
- `-d, --disk <disk>`: Disk size in GB (default: 64, must be power of 2, max: 1000)
- `-g, --gpus <gpus>`: Number of GPUs (default: 0, max: 1)
- `-t, --gpu-type <type>`: GPU type (default: 5090, currently only supports 5090)
- `-n, --name <name>`: VM name (optional)

**Examples:**

```bash
# Create a basic VM for 1 hour
uva vm create -h 1

# Create a VM with GPU for 24 hours
uva vm create -h 24 -g 1 -t 5090

# Create a custom VM with specific resources
uva vm create -h 2 -c 4 -r 16 -d 128 -n my-training-vm
```

#### Delete VM

`uva vm delete <vmId>`: delete a virtual machine

`uva vm rm <vmId>`: alias for delete

**Example:**

```bash
uva vm delete abc-123-def
uva vm rm abc-123-def
```

#### Check VM Status

`uva vm status <vmId>`: get the status of a virtual machine

**Example:**

```bash
uva vm status abc-123-def
```

#### List VMs

`uva vm list`: list all your virtual machines

**Example:**

```bash
uva vm list
```

#### SSH to VM

`uva vm ssh <nameOrVmId>`: connect to a virtual machine via SSH

**Example:**

```bash
# Connect using VM name
uva vm ssh my-training-vm

# Connect using VM ID
uva vm ssh abc-123-def
```

### Planned Features (Not Yet Implemented)

`uva vm extend [id]`: extend vm lifetime

- `--hours / -h` (number): hours to extend for

`uva k8s create`: create vcluster

`uva job run [image url]`: run docker image

## Development

```bash
bun install
bun run dev
bun run index.ts login
```

## Building

### Development Build

```bash
# Uses http://localhost:3000
bun run build
bun run build-binary
```

### Production Build

```bash
# Uses https://uvacompute.com
bun run build:prod
bun run build-binary:prod
```

## Environment Variables

- `NODE_ENV`: `"production"` uses https://uvacompute.com, otherwise uses localhost
- `SITE_URL`: Overrides the base URL for any environment

## Priority Order

1. `SITE_URL` environment variable (highest priority)
2. `NODE_ENV=production` → https://uvacompute.com
3. Default → http://localhost:3000 (lowest priority)
