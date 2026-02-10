# Job Examples

> **Note:** Use `--` to separate CLI options from the container command, especially when the command has its own flags (like `python -c`).

## Quick GPU Test

Verify GPU access and basic CUDA functionality:

```bash
uva jobs run -g -n gpu-quick-test nvcr.io/nvidia/pytorch:25.11-py3 \
  -- python -c "import torch; print('CUDA available:', torch.cuda.is_available()); print('Device:', torch.cuda.get_device_name(0)); print('Memory:', torch.cuda.get_device_properties(0).total_memory/1e9, 'GB'); x=torch.randn(1000,1000,device='cuda'); print('Tensor on GPU:', x.device); print('SUCCESS')"
```

## GPU Stress Test

Matrix multiplications with progress output (good for testing log streaming):

```bash
uva jobs run -g -c 4 -r 16 -n gpu-stress-test nvcr.io/nvidia/pytorch:25.11-py3 \
  -- python -c "import torch; import time; print('CUDA:', torch.cuda.is_available()); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A'); device='cuda' if torch.cuda.is_available() else 'cpu'; a=torch.randn(4096,4096,device=device); b=torch.randn(4096,4096,device=device); [(print(f'Matmul {i+1}/50, mem: {torch.cuda.memory_allocated()/1e9:.1f}GB'), torch.matmul(a,b), torch.cuda.synchronize() if device=='cuda' else None, time.sleep(0.5)) for i in range(50)]; print('DONE')"
```

## CPU-Only Job

Simple job without GPU:

```bash
uva jobs run -n hello-world python:3.12-slim \
  -- python -c "print('Hello from uvacompute!')"
```

## Job with Environment Variables

Pass secrets or configuration via environment variables:

```bash
uva jobs run -g -e WANDB_API_KEY=your_key_here -e BATCH_SIZE=32 -n training-job \
  nvcr.io/nvidia/pytorch:25.11-py3 \
  -- python -c "import os; print('WANDB_API_KEY:', os.environ.get('WANDB_API_KEY', 'not set')); print('BATCH_SIZE:', os.environ.get('BATCH_SIZE', 'not set'))"
```

## Custom Resources

Specify CPU and RAM:

```bash
uva jobs run -c 8 -r 32 -n big-cpu-job python:3.12-slim \
  -- python -c "import os; print('CPUs available:', os.cpu_count())"
```

## Long-Running Job (for testing status pages)

Runs for 60 seconds with periodic output:

```bash
uva jobs run -g -n long-running-test nvcr.io/nvidia/pytorch:25.11-py3 \
  -- python -c "import torch; import time; print('Starting 60s test'); device='cuda' if torch.cuda.is_available() else 'cpu'; a=torch.randn(2048,2048,device=device); start=time.time(); i=0; exec('while time.time()-start<60: torch.matmul(a,a); i+=1; print(f\"{int(time.time()-start)}s - {i} ops\") if i%20==0 else None; time.sleep(0.1)'); print(f'Done: {i} total ops')"
```

## CLI Reference

```bash
uva jobs run [options] <image> -- [command...]

Options:
  -g, --gpu              Request a GPU (NVIDIA 5090)
  -c, --cpu <cpus>       Number of CPUs (1-16, default: 1)
  -r, --ram <ram>        RAM in GB (1-64, default: 4)
  -d, --disk <disk>      Scratch disk in GB (0-100, mounted at /scratch)
  -e, --env <KEY=VALUE>  Environment variable (repeatable)
  -n, --name <name>      Job name (max 255 chars)
  --expose <port>        Expose port via HTTPS endpoint (1-65535)
  --no-follow            Don't stream logs after job starts

# List jobs
uva jobs ls           # Active jobs only
uva jobs ls --all     # All jobs including completed

# View logs
uva jobs logs <jobId>           # Stream logs (follows by default)
uva jobs logs <jobId> --no-follow
uva jobs logs <jobId> --tail 100

# Cancel a job
uva jobs cancel <jobId>
```

---

## GitHub Actions Runners

Use uvacompute as a self-hosted GitHub Actions runner. Add `uvacompute` to your workflow's `runs-on` labels and runners are automatically provisioned via webhook.

### Setup

1. Create an API key: `uva api-key create "GitHub Runners"`
2. Add a webhook to your GitHub repo (Settings → Webhooks → Add webhook):
   - **Payload URL:** `https://uvacompute.com/api/github/webhook/<your-key-prefix>`
   - **Content type:** `application/json`
   - **Secret:** your webhook secret from step 1
   - **Events:** select "Workflow jobs" only
3. Use `uvacompute` in your workflow's `runs-on`

### Workflow Configuration

```yaml
jobs:
  build:
    runs-on: [self-hosted, uvacompute]
    steps:
      - uses: actions/checkout@v4
      - run: echo "Running on uvacompute!"
```

### Resource Labels

Customize resources by adding labels to `runs-on`:

| Label               | Effect                                     |
| ------------------- | ------------------------------------------ |
| `uvacompute`        | Default runner (4 cpu, 8gb ram, 32gb disk) |
| `uvacompute-gpu`    | Adds 1 GPU                                 |
| `uvacompute-8cpu`   | Set to 8 CPUs                              |
| `uvacompute-16gb`   | Set to 16gb RAM                            |
| `uvacompute-64disk` | Set to 64gb disk                           |

Example with GPU and extra RAM:

```yaml
runs-on: [self-hosted, uvacompute, uvacompute-gpu, uvacompute-32gb]
```

### How It Works

1. When a workflow job with `uvacompute` label is queued, GitHub sends a webhook event
2. The webhook handler validates the API key and generates a JIT runner config
3. A container job is provisioned on uvacompute with the requested resources
4. The ephemeral runner picks up one job, executes it, then exits

**Note:** Runners are ephemeral — each one handles a single workflow job. For workflows with multiple jobs, each gets its own runner automatically.

**Tip:** Runner containers start from bare `ubuntu:22.04`. Use `sudo apt-get install` for system dependencies your workflow needs.

---

## vLLM Server with Exposed Endpoint

Run a vLLM inference server with a 7B model on a single GPU, exposed via HTTPS endpoint.

### Basic vLLM Server

```bash
uva jobs run -g -c 4 -r 32 --expose 8000 -n vllm-server \
  vllm/vllm-openai:latest \
  -- vllm serve Qwen/Qwen2.5-7B-Instruct \
    --host 0.0.0.0 \
    --port 8000 \
    --max-model-len 4096
```

This will output an endpoint URL like:

```
Endpoint    https://abc123.uvacompute.com
```

### Test the Endpoint

Once the server is running (watch logs for "Application startup complete"), test with curl:

```bash
# Health check
curl https://YOUR_ENDPOINT.uvacompute.com/health

# List models
curl https://YOUR_ENDPOINT.uvacompute.com/v1/models

# Chat completion
curl https://YOUR_ENDPOINT.uvacompute.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-7B-Instruct",
    "messages": [{"role": "user", "content": "Hello! What can you help me with?"}],
    "max_tokens": 100
  }'
```

### Alternative Models

Other 7B models that work well on a single GPU:

```bash
# Mistral 7B
uva jobs run -g -c 4 -r 32 --expose 8000 -n mistral-server \
  vllm/vllm-openai:latest \
  -- vllm serve mistralai/Mistral-7B-Instruct-v0.3 \
    --host 0.0.0.0 \
    --port 8000

# Llama 3.1 8B (requires HF token)
uva jobs run -g -c 4 -r 32 --expose 8000 -n llama-server \
  -e HF_TOKEN=your_huggingface_token \
  vllm/vllm-openai:latest \
  -- vllm serve meta-llama/Llama-3.1-8B-Instruct \
    --host 0.0.0.0 \
    --port 8000
```

### Simple Chat UI

Save this as `chat.html` and open in browser. Replace `YOUR_ENDPOINT` with your actual endpoint:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>vLLM Chat</title>
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        font-family: system-ui, sans-serif;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        background: #1a1a2e;
        color: #eee;
      }
      h1 {
        color: #7c3aed;
        margin-bottom: 20px;
      }
      #chat {
        border: 1px solid #333;
        border-radius: 8px;
        height: 400px;
        overflow-y: auto;
        padding: 16px;
        margin-bottom: 16px;
        background: #16213e;
      }
      .msg {
        margin: 8px 0;
        padding: 10px 14px;
        border-radius: 8px;
      }
      .user {
        background: #7c3aed;
        margin-left: 20%;
      }
      .assistant {
        background: #333;
        margin-right: 20%;
      }
      #input-row {
        display: flex;
        gap: 8px;
      }
      #input {
        flex: 1;
        padding: 12px;
        border: 1px solid #333;
        border-radius: 8px;
        background: #16213e;
        color: #eee;
        font-size: 16px;
      }
      button {
        padding: 12px 24px;
        background: #7c3aed;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 16px;
      }
      button:hover {
        background: #6d28d9;
      }
      button:disabled {
        background: #555;
        cursor: not-allowed;
      }
      #logs {
        margin-top: 20px;
        padding: 16px;
        background: #0f0f23;
        border-radius: 8px;
        font-family: monospace;
        font-size: 12px;
        max-height: 200px;
        overflow-y: auto;
        white-space: pre-wrap;
      }
      .log-entry {
        color: #666;
      }
      .log-entry.info {
        color: #4ade80;
      }
      .log-entry.error {
        color: #f87171;
      }
    </style>
  </head>
  <body>
    <h1>vLLM Chat</h1>

    <div>
      <label>Endpoint: </label>
      <input
        id="endpoint"
        value="https://YOUR_ENDPOINT.uvacompute.com"
        style="width: 400px; padding: 8px; background: #16213e; border: 1px solid #333; border-radius: 4px; color: #eee;"
      />
    </div>
    <br />

    <div id="chat"></div>

    <div id="input-row">
      <input
        id="input"
        placeholder="Type a message..."
        onkeydown="if(event.key==='Enter')send()"
      />
      <button onclick="send()" id="send-btn">Send</button>
    </div>

    <div id="logs">
      <div class="log-entry info">Ready. Enter your endpoint URL above.</div>
    </div>

    <script>
      const chat = document.getElementById("chat");
      const input = document.getElementById("input");
      const logs = document.getElementById("logs");
      const sendBtn = document.getElementById("send-btn");
      let messages = [];

      function log(msg, type = "") {
        const time = new Date().toLocaleTimeString();
        logs.innerHTML += `<div class="log-entry ${type}">[${time}] ${msg}</div>`;
        logs.scrollTop = logs.scrollHeight;
      }

      function addMessage(role, content) {
        messages.push({ role, content });
        chat.innerHTML += `<div class="msg ${role}">${content}</div>`;
        chat.scrollTop = chat.scrollHeight;
      }

      async function send() {
        const text = input.value.trim();
        if (!text) return;

        const endpoint = document
          .getElementById("endpoint")
          .value.replace(/\/$/, "");

        addMessage("user", text);
        input.value = "";
        sendBtn.disabled = true;

        log(`Sending request to ${endpoint}/v1/chat/completions`);

        try {
          const res = await fetch(`${endpoint}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "Qwen/Qwen2.5-7B-Instruct",
              messages: messages,
              max_tokens: 512,
            }),
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${await res.text()}`);
          }

          const data = await res.json();
          log(
            `Response received (${data.usage?.total_tokens || "?"} tokens)`,
            "info",
          );

          const reply = data.choices[0].message.content;
          addMessage("assistant", reply);
        } catch (err) {
          log(`Error: ${err.message}`, "error");
          chat.innerHTML += `<div class="msg assistant" style="color: #f87171;">Error: ${err.message}</div>`;
        }

        sendBtn.disabled = false;
        input.focus();
      }

      // Check endpoint health on load
      async function checkHealth() {
        const endpoint = document
          .getElementById("endpoint")
          .value.replace(/\/$/, "");
        log(`Checking endpoint health...`);
        try {
          const res = await fetch(`${endpoint}/health`);
          if (res.ok) {
            log("Endpoint is healthy!", "info");
          } else {
            log(`Endpoint returned ${res.status}`, "error");
          }
        } catch (err) {
          log(`Cannot reach endpoint: ${err.message}`, "error");
        }
      }
    </script>
  </body>
</html>
```

### Monitoring Your Server

```bash
# View real-time logs
uva jobs logs <jobId>

# List active jobs
uva jobs ls

# Cancel when done
uva jobs cancel <jobId>
```

### Tips

- **Model download**: The first run downloads the model from HuggingFace (~15GB for 7B models). This can take 10-15 minutes. Watch logs for "Loading safetensors checkpoint shards: 100%".
- **Server startup**: After model loads, vLLM captures CUDA graphs. Look for "Application startup complete" in logs before sending requests.
- **Memory usage**: A 7B model uses ~14GB VRAM in bfloat16. The 5090's 32GB leaves ~12GB for KV cache (supports ~57x concurrent 4K context requests).
- **Max tokens**: Adjust `--max-model-len` based on your needs. Higher values use more VRAM for KV cache.
- **Multiple users**: vLLM handles concurrent requests automatically with continuous batching.
