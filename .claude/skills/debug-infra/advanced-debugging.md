# Advanced Debugging Reference

## KubeVirt Deep Dive

### Check VM Scheduling

```bash
# Why didn't a VM get scheduled?
ssh root@24.199.85.26 "kubectl describe vmi VM_NAME -n uvacompute | grep -A 20 'Conditions:'"

# Check node resources
ssh root@24.199.85.26 "kubectl describe node aiworkstation | grep -A 20 'Allocated resources:'"
```

### GPU Passthrough Issues

```bash
# Check VFIO devices
ssh workstation "ls -la /dev/vfio/"

# Check GPU PCI binding
ssh workstation "lspci -nnk | grep -A 3 -i nvidia"

# Check IOMMU groups
ssh workstation "find /sys/kernel/iommu_groups/ -type l | head -20"

# Check nvidia modules loaded (should be empty for VFIO)
ssh workstation "lsmod | grep nvidia"

# Check vfio-pci module
ssh workstation "lsmod | grep vfio"
```

### VM Network Debugging

```bash
# Get VM IP address
ssh root@24.199.85.26 "kubectl get vmi VM_NAME -n uvacompute -o jsonpath='{.status.interfaces[0].ipAddress}'"

# Check pod network
ssh root@24.199.85.26 "kubectl exec -it virt-launcher-VM_NAME-xxxxx -n uvacompute -- ip addr"
```

## vm-orchestration-service

### Restart Service

```bash
ssh root@24.199.85.26 "systemctl restart vm-orchestration-service"
```

### Deploy New Version

```bash
# Build locally
cd apps/vm-orchestration-service && go build .

# Copy to hub
scp vm-orchestration-service root@24.199.85.26:/root/

# Restart
ssh root@24.199.85.26 "systemctl restart vm-orchestration-service"
```

### Check Configuration

```bash
ssh root@24.199.85.26 "cat /etc/systemd/system/vm-orchestration-service.service"
```

## K3s Debugging

### Check K3s Server (Hub)

```bash
ssh root@24.199.85.26 "systemctl status k3s"
ssh root@24.199.85.26 "journalctl -u k3s -n 50 --no-pager"
```

### Check K3s Agent (Node)

```bash
ssh workstation "systemctl status k3s-agent"
ssh workstation "journalctl -u k3s-agent -n 50 --no-pager"
```

### Check Containerd

```bash
ssh workstation "crictl ps"
ssh workstation "crictl pods"
```

## Database / State

### List VMs in orchestrator memory

```bash
# Make API call to list VMs
curl -s http://24.199.85.26:8080/vms | jq
```

### Force sync from KubeVirt

```bash
# Restart orchestrator (it syncs on startup)
ssh root@24.199.85.26 "systemctl restart vm-orchestration-service"
```

## Cleanup Commands

### Delete stuck VM

```bash
# Delete VM (will also delete VMI)
ssh root@24.199.85.26 "kubectl delete vm VM_NAME -n uvacompute"

# If VMI is stuck, force delete
ssh root@24.199.85.26 "kubectl delete vmi VM_NAME -n uvacompute --force --grace-period=0"

# Clean up orphaned cloud-init secret
ssh root@24.199.85.26 "kubectl delete secret cloudinit-VM_ID -n uvacompute"
```

### Clean up all test VMs

```bash
ssh root@24.199.85.26 "kubectl delete vm --all -n uvacompute"
```

## Log Aggregation

### All relevant logs in one command

```bash
ssh root@24.199.85.26 "echo '=== Orchestrator ===' && journalctl -u vm-orchestration-service -n 20 --no-pager && echo '=== KubeVirt ===' && kubectl logs -n kubevirt -l kubevirt.io=virt-handler --tail=20"
```

## Health Checks

### Full system health check

```bash
echo "=== Nodes ===" && \
ssh root@24.199.85.26 "kubectl get nodes" && \
echo "=== VMs ===" && \
ssh root@24.199.85.26 "kubectl get vm,vmi -n uvacompute" && \
echo "=== KubeVirt ===" && \
ssh root@24.199.85.26 "kubectl get pods -n kubevirt" && \
echo "=== Orchestrator ===" && \
ssh root@24.199.85.26 "systemctl is-active vm-orchestration-service"
```
