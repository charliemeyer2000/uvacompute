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

`uva logout`: logs out from uvacompute

### Management

`uva upgrade`: upgrade the uvacompute CLI to the latest version

Checks for the latest version, presents an interactive confirmation prompt, and upgrades the CLI in place. This is more convenient than running the install script manually.

`uva uninstall`: uninstall the uvacompute CLI

Removes the CLI binary and all configuration data. Presents an interactive confirmation prompt (default: No) before proceeding.

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
- `-n, --name <name>`: VM name (optional, prompts for confirmation if name already exists)

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

`uva vm delete <nameOrVmId>`: delete a virtual machine by ID or name

`uva vm rm <nameOrVmId>`: alias for delete

If multiple VMs share the same name, presents an interactive selection menu with an option to delete all matching VMs.

**Examples:**

```bash
# Delete by ID
uva vm delete abc-123-def

# Delete by name (interactive menu if duplicates exist)
uva vm delete my-training-vm

# Alias works the same way
uva vm rm my-training-vm
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

If multiple VMs share the same name, presents an interactive selection menu.

**Examples:**

```bash
# Connect using VM name (interactive menu if duplicates exist)
uva vm ssh my-training-vm

# Connect using VM ID (always unique)
uva vm ssh abc-123-def
```

### Jobs

Run containerized workloads with optional GPU support. Jobs are ideal for batch processing, training runs, or running inference servers.

#### Run a Job

`uva jobs run [options] <image> -- [command...]`: run a container job

**Options:**

- `-g, --gpu`: Request a GPU (NVIDIA 5090)
- `-c, --cpu <cpus>`: Number of CPUs (1-16, default: 1)
- `-r, --ram <ram>`: RAM in GB (1-64, default: 4)
- `-d, --disk <disk>`: Scratch disk in GB (0-100, mounted at /scratch)
- `-e, --env <KEY=VALUE>`: Environment variable (repeatable)
- `-n, --name <name>`: Job name (max 255 chars)
- `--expose <port>`: Expose port via HTTPS endpoint (1-65535)
- `--no-follow`: Don't stream logs after job starts

> **Note:** Use `--` to separate CLI options from the container command, especially when the command has its own flags.

**Examples:**

```bash
# Simple CPU job
uva jobs run -n hello python:3.12-slim -- python -c "print('Hello!')"

# GPU job with PyTorch
uva jobs run -g -n gpu-test nvcr.io/nvidia/pytorch:25.11-py3 \
  -- python -c "import torch; print('CUDA:', torch.cuda.is_available())"

# Job with exposed endpoint (e.g., inference server)
uva jobs run -g -c 4 -r 32 --expose 8000 -n api-server \
  vllm/vllm-openai:latest \
  -- vllm serve Qwen/Qwen2.5-7B-Instruct --host 0.0.0.0 --port 8000

# Job with environment variables
uva jobs run -g -e API_KEY=secret -n training nvcr.io/nvidia/pytorch:25.11-py3 \
  -- python train.py
```

#### List Jobs

`uva jobs ls`: list active jobs

`uva jobs ls --all`: list all jobs including completed

#### View Job Logs

`uva jobs logs <jobId>`: stream logs from a job (follows by default)

**Options:**

- `--no-follow`: Print current logs and exit
- `--tail <lines>`: Number of lines to show from the end

**Examples:**

```bash
# Stream logs in real-time
uva jobs logs abc123

# Show last 100 lines and exit
uva jobs logs abc123 --tail 100 --no-follow
```

#### Cancel a Job

`uva jobs cancel <jobId>`: cancel a running job

### Planned Features (Not Yet Implemented)

`uva vm extend [id]`: extend vm lifetime

- `--hours / -h` (number): hours to extend for

`uva k8s create`: create vcluster

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
