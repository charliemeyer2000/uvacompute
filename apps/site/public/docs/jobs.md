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

### passing flags to the container

if the container command has its own flags, use `--` to separate uva flags from container flags:

```bash
uva jobs run --gpu pytorch/pytorch:latest -- python train.py --epochs 10 --lr 0.001
```

### run a vllm inference server with https endpoint

spin up an OpenAI-compatible API for any open-source model using `--expose` to get an HTTPS endpoint:

```bash
uva jobs run -g -c 4 -r 32 --expose 8000 -n vllm-server \
  vllm/vllm-openai:latest \
  -- vllm serve Qwen/Qwen2.5-7B-Instruct \
    --host 0.0.0.0 \
    --port 8000 \
    --max-model-len 4096
```

this outputs an endpoint URL like `https://abc123.uvacompute.com`. once logs show "Application startup complete", query it:

```bash
curl https://YOUR_ENDPOINT.uvacompute.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-7B-Instruct",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

other models that work on a single GPU:

```bash
# Mistral 7B
uva jobs run -g -c 4 -r 32 --expose 8000 -n mistral-server \
  vllm/vllm-openai:latest \
  -- vllm serve mistralai/Mistral-7B-Instruct-v0.3 \
    --host 0.0.0.0 --port 8000

# Llama 3.1 8B (requires HuggingFace token)
uva jobs run -g -c 4 -r 32 --expose 8000 -n llama-server \
  -e HF_TOKEN=your_huggingface_token \
  vllm/vllm-openai:latest \
  -- vllm serve meta-llama/Llama-3.1-8B-Instruct \
    --host 0.0.0.0 --port 8000
```

> **tip:** first run downloads ~15GB from HuggingFace (10-15 min). a 7B model uses ~14GB VRAM — the 5090's 32GB handles concurrent requests easily via continuous batching.

## managing jobs

### list your jobs

```bash
uva jobs list
```

use `-a` or `--all` to include completed and failed jobs.

### view job logs

```bash
uva jobs logs <job-id>
```

use `-t <lines>` or `--tail <lines>` to show only the last N lines. use `--no-follow` to disable log streaming.

### cancel a running job

```bash
uva jobs cancel <job-id>
```

use `-f` or `--force` to skip the confirmation prompt.

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

## github actions runners

use uvacompute as a self-hosted github actions runner. add `uvacompute` to your workflow's `runs-on` labels and uvacompute automatically provisions an ephemeral runner for each job via webhook.

### 1. create an api key

generate an api key from the cli or the [profile page](https://uvacompute.com/profile). save the key, webhook secret, and webhook url — they are shown once.

```bash
uva api-key create "GitHub Runners"
```

### 2. add your github token

on the [profile page](https://uvacompute.com/profile), click **add github token** on your api key and paste a [github personal access token](https://github.com/settings/tokens). the token is validated instantly.

- **classic pat:** select the `repo` scope. works across all your accessible repos and orgs.
- **fine-grained pat:** select the repos you want, then grant `administration: read and write` permission. only works within a single owner (user or org).

### 3. add a github webhook

go to your repo's **settings > webhooks > add webhook** and configure:

| field        | value                                                         |
| ------------ | ------------------------------------------------------------- |
| payload url  | `https://uvacompute.com/api/github/webhook/<your-key-prefix>` |
| content type | `application/json`                                            |
| secret       | your webhook secret from step 1                               |
| events       | select **workflow jobs** only                                 |

### 4. use in your workflow

add the `uvacompute` label to `runs-on`. when the job is queued, a runner is automatically provisioned:

```yaml
jobs:
  build:
    runs-on: [self-hosted, uvacompute]
    steps:
      - uses: actions/checkout@v4
      - run: echo "Running on uvacompute!"
```

### resource labels

customize runner resources by adding labels to `runs-on`:

| label               | effect                                     |
| ------------------- | ------------------------------------------ |
| `uvacompute`        | default runner (4 cpu, 8gb ram, 32gb disk) |
| `uvacompute-gpu`    | adds 1 gpu                                 |
| `uvacompute-8cpu`   | set to 8 cpus                              |
| `uvacompute-16gb`   | set to 16gb ram                            |
| `uvacompute-64disk` | set to 64gb disk                           |

example with gpu and extra ram:

```yaml
runs-on: [self-hosted, uvacompute, uvacompute-gpu, uvacompute-32gb]
```

high-cpu build runner:

```yaml
runs-on: [self-hosted, uvacompute, uvacompute-8cpu, uvacompute-16gb]
```

> **note:** runners are ephemeral — each runner picks up one workflow job then exits. for workflows with multiple jobs, each job automatically gets its own runner.

> **tip:** runner containers start from a bare `ubuntu:22.04` image. use `sudo apt-get install` to install system dependencies your workflow needs.

## api keys

manage api keys for github actions runners and webhooks.

### create an api key

```bash
uva api-key create "my runners"
```

### list api keys

```bash
uva api-key list
```

### revoke an api key

```bash
uva api-key revoke <key-id>
```

use `-f` or `--force` to skip the confirmation prompt.
