---
name: debug-infra
description: Debug UVACompute infrastructure including the DO droplet (orchestrator/hub), workstation node, KubeVirt VMs, and GPU mode. Use when troubleshooting VM creation failures, GPU issues, node connectivity, or checking system status.
allowed-tools: Bash, Read
---

# UVACompute Infrastructure Debugging

This skill helps debug the UVACompute infrastructure components.

## Infrastructure Overview

| Component        | Access                                                   | Description                                          |
| ---------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| DO Droplet (Hub) | `ssh root@24.199.85.26`                                  | K3s control plane, vm-orchestration-service, vmproxy |
| Workstation      | `ssh workstation` (alias) or `ssh root@<workstation-ip>` | GPU node for running VMs                             |

## Quick Access Commands

### SSH to Hub (DO Droplet)

**Prerequisite:** The local SSH key (`~/.ssh/id_ed25519`) is passphrase-protected. Ensure it's loaded in the SSH agent before connecting:

```bash
ssh-add ~/.ssh/id_ed25519  # only needed once per session
ssh root@24.199.85.26
```

If you get "Permission denied" errors, the most likely cause is the key not being loaded in the agent (`ssh-add -l` to check).

### SSH to Workstation

```bash
ssh workstation
```

## Common Debugging Tasks

### 1. Check Cluster Status

**On the hub:**

```bash
ssh root@24.199.85.26 "kubectl get nodes -o wide"
```

**Check node labels (including GPU mode):**

```bash
ssh root@24.199.85.26 "kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{\"\\t\"}{.metadata.labels}{\"\\n\"}{end}'"
```

### 2. Check VM Status

**List all VMs:**

```bash
ssh root@24.199.85.26 "kubectl get vm -n uvacompute"
```

**List running VM instances:**

```bash
ssh root@24.199.85.26 "kubectl get vmi -n uvacompute"
```

**Describe a specific VM (replace VM_NAME):**

```bash
ssh root@24.199.85.26 "kubectl describe vmi VM_NAME -n uvacompute"
```

### 3. Check GPU Mode

**On the workstation node:**

```bash
ssh workstation "gpu-mode-status"
```

**Check GPU mode label:**

```bash
ssh root@24.199.85.26 "kubectl get node aiworkstation -o jsonpath='{.metadata.labels.uvacompute\\.com/gpu-mode}'"
```

**Switch to VFIO mode (for VM passthrough):**

```bash
ssh workstation "sudo gpu-mode-vfio"
```

**Switch to NVIDIA mode (for containers):**

```bash
ssh workstation "sudo gpu-mode-nvidia"
```

### 4. Check vm-orchestration-service

**View service status:**

```bash
ssh root@24.199.85.26 "systemctl status vm-orchestration.service"
```

**View recent logs:**

```bash
ssh root@24.199.85.26 "journalctl -u vm-orchestration.service -n 100 --no-pager"
```

**Follow logs in real-time:**

```bash
ssh root@24.199.85.26 "journalctl -u vm-orchestration.service -f"
```

**Check startup/sync logs (useful after deploys):**

```bash
ssh root@24.199.85.26 "journalctl -u vm-orchestration.service --since '10 minutes ago' --no-pager | head -60"
```

### 5. Check KubeVirt Components

**Check KubeVirt pods:**

```bash
ssh root@24.199.85.26 "kubectl get pods -n kubevirt"
```

**Check virt-handler on a node:**

```bash
ssh root@24.199.85.26 "kubectl logs -n kubevirt -l kubevirt.io=virt-handler --tail=50"
```

**Check virt-launcher pod for a specific VM:**

```bash
ssh root@24.199.85.26 "kubectl logs -n uvacompute -l kubevirt.io/domain=VM_NAME --tail=100"
```

### 6. Check SSH Tunnel

**On the hub - check tunnel service:**

```bash
ssh root@24.199.85.26 "systemctl status vmproxy"
```

**On a node - check tunnel to hub:**

```bash
ssh workstation "systemctl status uvacompute-tunnel"
```

### 7. Check Jobs

**List all jobs and pods:**

```bash
ssh root@24.199.85.26 "kubectl get jobs,pods -n uvacompute -o wide"
```

**Check job details (creation time, spec):**

```bash
ssh root@24.199.85.26 "kubectl get job JOB_ID -n uvacompute -o yaml | head -50"
```

**Describe a pod for scheduling issues:**

```bash
ssh root@24.199.85.26 "kubectl describe pod POD_NAME -n uvacompute | head -40"
```

**Delete an orphan job:**

```bash
ssh root@24.199.85.26 "kubectl delete job JOB_ID -n uvacompute"
```

### 8. Debug VM Creation Issues

**Check events for a VM:**

```bash
ssh root@24.199.85.26 "kubectl get events -n uvacompute --field-selector involvedObject.name=VM_NAME"
```

**Check cloud-init secret:**

```bash
ssh root@24.199.85.26 "kubectl get secret cloudinit-VM_ID -n uvacompute -o yaml"
```

### 9. Node Connectivity

**Check node annotations (tunnel ports):**

```bash
ssh root@24.199.85.26 "kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{\"\\t\"}{.metadata.annotations.uvacompute\\.io/tunnel-port}{\"\\n\"}{end}'"
```

**Test SSH to node via tunnel (from hub):**

```bash
ssh root@24.199.85.26 "ssh -p TUNNEL_PORT localhost hostname"
```

## Troubleshooting Flowchart

### VM Creation Fails

1. Check vm-orchestration-service logs
2. Check if GPU VM and no VFIO nodes: `kubectl get nodes -l uvacompute.com/gpu-mode=vfio`
3. Check KubeVirt events: `kubectl get events -n uvacompute`
4. Check virt-launcher pod logs

### GPU VM Won't Start

1. Verify GPU mode is VFIO: `ssh workstation "gpu-mode-status"`
2. Check node label: `kubectl get node -l uvacompute.com/gpu-mode=vfio`
3. Switch to VFIO if needed: `ssh workstation "sudo gpu-mode-vfio"`
4. Check IOMMU is enabled: `ssh workstation "dmesg | grep -i iommu"`

### Node Not Joining

1. Check k3s-agent on node: `ssh workstation "systemctl status k3s-agent"`
2. Check tunnel status: `ssh workstation "systemctl status uvacompute-tunnel"`
3. Check node appears: `ssh root@24.199.85.26 "kubectl get nodes"`
4. Check node logs: `ssh workstation "journalctl -u k3s-agent -n 50"`

### Job/VM Desync (UI doesn't match reality)

There are 3 sources of truth: Kubernetes, vm-orchestration-service (in-memory), and Convex (database).

1. Check what's actually running in K8s: `kubectl get jobs,pods -n uvacompute`
2. Check service startup logs for sync results: `journalctl -u vm-orchestration.service --since '1 hour ago' | grep -E "(sync|Convex|Fetched)"`
3. Look for "Fetched 0 active jobs" after restart - means Convex has no record
4. If K8s has jobs that Convex doesn't know about, they're orphans - delete them from K8s
5. Common cause: job cancellation succeeded in Convex but K8s delete failed

## File Locations

### Node Configuration

| File                 | Location                               | Description              |
| -------------------- | -------------------------------------- | ------------------------ |
| Node config          | `/etc/uvacompute/node-config.yaml`     | Node registration info   |
| Node labels          | `/etc/uvacompute/node-labels.yaml`     | Kubernetes labels        |
| Storage config       | `/etc/uvacompute/storage-config.yaml`  | VM storage settings      |
| Orchestration secret | `/etc/uvacompute/orchestration-secret` | API auth for GPU scripts |
| Kubeconfig           | `/root/.kube/config`                   | Cluster access           |
| SSH key              | `/root/.ssh/id_ed25519_uvacompute`     | Tunnel SSH key           |

### Hub Configuration (Platform Internal)

| File                  | Location                              | Description              |
| --------------------- | ------------------------------------- | ------------------------ |
| VM proxy script       | `/usr/local/bin/uvacompute-vm-proxy`  | SSH VM access proxy      |
| Key sync script       | `/usr/local/bin/uvacompute-sync-keys` | Node key synchronization |
| Orchestration service | `/opt/vm-orchestration-service/`      | Service binary + config  |
