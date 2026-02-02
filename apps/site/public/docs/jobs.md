# container jobs

run any docker container on uvacompute with a single command. jobs are perfect for batch processing, ml training, data pipelines, and any workload that can run in a container.

## prerequisites

before running jobs, make sure you have:

- installed the [uva cli](./getting-started.md)
- authenticated with `uva login`

## quick start

### 1. run your first job

execute a command in any docker image:

```bash
uva jobs run alpine echo "hello world"
```

### 2. use any docker image

run python, node, or any container image from docker hub:

```bash
uva jobs run python:3.11 python -c "print(1+1)"
uva jobs run node:20 node -e "console.log('hello')"
```

## examples

### run a python script

```bash
uva jobs run python:3.11 python -c "import torch; print(torch.cuda.is_available())"
```

### run with gpu support

```bash
uva jobs run --gpu pytorch/pytorch:latest python train.py
```

### run a bash script

```bash
uva jobs run ubuntu:22.04 bash -c "apt update && apt install -y curl"
```

## managing jobs

### list your jobs

```bash
uva jobs list
```

### view job logs

```bash
uva jobs logs <job-id>
```

### cancel a running job

```bash
uva jobs cancel <job-id>
```

## job options

| flag          | description                                   | example           |
| ------------- | --------------------------------------------- | ----------------- |
| `-n, --name`  | name for the job                              | `--name my-job`   |
| `-g, --gpu`   | request a GPU for the job                     | `--gpu`           |
| `-c, --cpu`   | number of CPUs (default: 1)                   | `--cpu 4`         |
| `-r, --ram`   | RAM in GB (default: 4)                        | `--ram 16`        |
| `-d, --disk`  | scratch disk in GB (mounted at /scratch)      | `--disk 50`       |
| `-e, --env`   | environment variable (can use multiple times) | `--env KEY=value` |
| `--expose`    | expose port via HTTPS endpoint                | `--expose 8000`   |
| `--no-follow` | don't stream logs after job starts            | `--no-follow`     |
