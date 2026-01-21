# Job Examples

> **Note:** Use `--` to separate CLI options from the container command, especially when the command has its own flags (like `python -c`).

## Quick GPU Test

Verify GPU access and basic CUDA functionality:

```bash
uva run -g -n gpu-quick-test nvcr.io/nvidia/pytorch:25.11-py3 \
  -- python -c "import torch; print('CUDA available:', torch.cuda.is_available()); print('Device:', torch.cuda.get_device_name(0)); print('Memory:', torch.cuda.get_device_properties(0).total_memory/1e9, 'GB'); x=torch.randn(1000,1000,device='cuda'); print('Tensor on GPU:', x.device); print('SUCCESS')"
```

## GPU Stress Test

Matrix multiplications with progress output (good for testing log streaming):

```bash
uva run -g -c 4 -r 16 -n gpu-stress-test nvcr.io/nvidia/pytorch:25.11-py3 \
  -- python -c "import torch; import time; print('CUDA:', torch.cuda.is_available()); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A'); device='cuda' if torch.cuda.is_available() else 'cpu'; a=torch.randn(4096,4096,device=device); b=torch.randn(4096,4096,device=device); [(print(f'Matmul {i+1}/50, mem: {torch.cuda.memory_allocated()/1e9:.1f}GB'), torch.matmul(a,b), torch.cuda.synchronize() if device=='cuda' else None, time.sleep(0.5)) for i in range(50)]; print('DONE')"
```

## CPU-Only Job

Simple job without GPU:

```bash
uva run -n hello-world python:3.12-slim \
  -- python -c "print('Hello from uvacompute!')"
```

## Job with Environment Variables

Pass secrets or configuration via environment variables:

```bash
uva run -g -e WANDB_API_KEY=your_key_here -e BATCH_SIZE=32 -n training-job \
  nvcr.io/nvidia/pytorch:25.11-py3 \
  -- python -c "import os; print('WANDB_API_KEY:', os.environ.get('WANDB_API_KEY', 'not set')); print('BATCH_SIZE:', os.environ.get('BATCH_SIZE', 'not set'))"
```

## Custom Resources

Specify CPU and RAM:

```bash
uva run -c 8 -r 32 -n big-cpu-job python:3.12-slim \
  -- python -c "import os; print('CPUs available:', os.cpu_count())"
```

## Long-Running Job (for testing status pages)

Runs for 60 seconds with periodic output:

```bash
uva run -g -n long-running-test nvcr.io/nvidia/pytorch:25.11-py3 \
  -- python -c "import torch; import time; print('Starting 60s test'); device='cuda' if torch.cuda.is_available() else 'cpu'; a=torch.randn(2048,2048,device=device); start=time.time(); i=0; exec('while time.time()-start<60: torch.matmul(a,a); i+=1; print(f\"{int(time.time()-start)}s - {i} ops\") if i%20==0 else None; time.sleep(0.1)'); print(f'Done: {i} total ops')"
```

## CLI Reference

```bash
uva run [options] <image> -- [command...]

Options:
  -g, --gpu              Request a GPU
  -c, --cpu <cpus>       Number of CPUs (default: 1)
  -r, --ram <ram>        RAM in GB (default: 4)
  -e, --env <KEY=VALUE>  Environment variable (repeatable)
  -n, --name <name>      Job name
  --no-follow            Don't stream logs after job starts

# List jobs
uva jobs              # Active jobs only
uva jobs --all        # All jobs including completed

# View logs
uva logs <jobId>      # Stream logs (follows by default)
uva logs <jobId> --no-follow
uva logs <jobId> --tail 100

# Cancel a job
uva cancel <jobId>
```
