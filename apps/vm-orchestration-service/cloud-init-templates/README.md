# Cloud-Init Templates

This directory contains cloud-init templates that are automatically injected into VMs during provisioning.

## How It Works

Templates are embedded into the Go binary at compile time using Go's `//go:embed` directive. When a VM is created, the orchestration service injects these templates as part of a MIME multipart cloud-init configuration.

**Injection order:**

1. SSH configuration (always)
2. `base.yaml` (always) - common development tools
3. `cuda.yaml` (GPU VMs only) - NVIDIA CUDA toolkit
4. User's startup script (if provided)
5. User's cloud-init config (if provided)

Cloud-init merges these configurations using `list(append)+dict(no_replace,recurse_list)+str()`, meaning:

- Lists are appended (e.g., `packages` from multiple configs are combined)
- Dictionaries are merged recursively (user config doesn't override base)
- Strings are kept from the first occurrence

## Templates

### base.yaml

Injected into **all VMs**. Provides:

- **Utilities**: curl, wget, git, vim, htop, jq, unzip, tar
- **Build tools**: gcc, g++, make
- **Python**: python3, pip, venv, [uv](https://github.com/astral-sh/uv) (fast package manager), [ruff](https://github.com/astral-sh/ruff) (fast linter)
- **Node.js**: Installed via [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager), LTS version

### cuda.yaml

Injected into **GPU VMs only** (when `gpus > 0`). Provides:

- NVIDIA CUDA repository configuration
- CUDA toolkit installation
- Environment variables (`PATH`, `LD_LIBRARY_PATH`)

**Note**: CUDA installation can take 10-15 minutes on first boot.

## Modifying Templates

1. Edit the YAML files in this directory
2. Rebuild the vm-orchestration-service: `go build`
3. Redeploy the service

Changes only affect newly created VMs - existing VMs are not affected.

## VM Readiness & Timer

The VM's billing timer only starts **after cloud-init completes**, not when the VM boots. This is implemented via:

1. **Marker file**: Cloud-init creates `/var/run/uvacompute-provisioned` as its final step
2. **readinessProbe**: The VM spec includes a probe that checks for this marker file
3. **Wait loop**: The orchestration service waits for the VM's `Ready` condition before starting the timer

This ensures users don't lose time to provisioning (e.g., CUDA installation on GPU VMs can take 15+ minutes).

**Timeouts:**

- VM boot + guest agent: 5 minutes
- Cloud-init completion: 30 minutes

## Debugging

On a running VM, you can check cloud-init status and logs:

```bash
# Check status
cloud-init status

# Wait for completion
cloud-init status --wait

# View logs
cat /var/log/cloud-init.log
cat /var/log/cloud-init-output.log

# View UVACompute-specific log
cat /var/log/uvacompute-init.log

# View applied configs
cat /var/lib/cloud/instance/user-data.txt
```

## Adding New Templates

1. Create a new YAML file (e.g., `rust.yaml`)
2. Add an embed directive in `templates.go`:
   ```go
   //go:embed rust.yaml
   var Rust string
   ```
3. Modify `lib/kubevirt.go` to inject the template based on some condition
4. Rebuild and redeploy

## References

- [cloud-init documentation](https://cloudinit.readthedocs.io/)
- [cloud-init examples](https://cloudinit.readthedocs.io/en/latest/topics/examples.html)
- [MIME multipart format](https://cloudinit.readthedocs.io/en/latest/explanation/format.html#mime-multi-part-archive)
