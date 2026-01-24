---
name: hub-maintenance
description: Maintain the UVACompute hub (DO droplet) including disk cleanup, service deployment, and KubeVirt management. Use when hub has disk pressure, services need deployment, or KubeVirt is unhealthy.
allowed-tools: Bash, Read
---

# Hub Maintenance

The hub (uvacompute-ssh) runs on a DigitalOcean droplet with limited disk (8.6G).

## Quick Health Check

```bash
ssh root@***REDACTED_IP*** "df -h /; kubectl get nodes; kubectl get pods -n kubevirt"
```

## Disk Pressure

### Symptoms

- KubeVirt pods stuck in Pending
- Node taint: `node.kubernetes.io/disk-pressure:NoSchedule`
- VM creation fails with scheduling errors

### Check

```bash
ssh root@***REDACTED_IP*** "
df -h /
kubectl describe node uvacompute-ssh | grep -A2 Taints
"
```

### Fix

```bash
ssh root@***REDACTED_IP*** "
# Prune unused container images
crictl rmi --prune

# Vacuum old journal logs
journalctl --vacuum-size=100M

# Truncate large log files
truncate -s 0 /var/log/auth.log /var/log/kern.log /var/log/syslog

# Remove old rotated logs
rm -f /var/log/*.1 /var/log/*.gz

# Check result
df -h /
"
```

### Remove taint manually (if auto-removal slow)

```bash
ssh root@***REDACTED_IP*** "kubectl taint nodes uvacompute-ssh node.kubernetes.io/disk-pressure-"
```

## Deploy vm-orchestration-service

### Standard deploy

```bash
cd apps/vm-orchestration-service
ssh root@***REDACTED_IP*** "systemctl stop vm-orchestration"
make build-linux && make deploy-hub
```

### If deploy-hub fails mid-way

The binary was likely copied but systemd wasn't reloaded:

```bash
ssh root@***REDACTED_IP*** "systemctl daemon-reload && systemctl restart vm-orchestration && systemctl status vm-orchestration"
```

### Check service health

```bash
ssh root@***REDACTED_IP*** "
systemctl status vm-orchestration
journalctl -u vm-orchestration -n 20 --no-pager
"
```

## KubeVirt Maintenance

### Pods stuck in Pending

Usually disk pressure. Fix disk first, then:

```bash
ssh root@***REDACTED_IP*** "kubectl delete pods -n kubevirt --all"
```

### Webhook timeout errors

Restart the virt-operator:

```bash
ssh root@***REDACTED_IP*** "
kubectl delete pod -n kubevirt -l kubevirt.io=virt-operator
sleep 15
kubectl get pods -n kubevirt
"
```

### Clean up failed/evicted pods

```bash
ssh root@***REDACTED_IP*** "kubectl delete pods -n kubevirt --field-selector=status.phase=Failed"
```

### Check KubeVirt CR

```bash
ssh root@***REDACTED_IP*** "kubectl get kubevirt -n kubevirt -o yaml | head -50"
```

## Clean Up Old VMs

```bash
# List VMs
ssh root@***REDACTED_IP*** "kubectl get vm -n uvacompute"

# Delete all VMs
ssh root@***REDACTED_IP*** "kubectl delete vm -n uvacompute --all"

# Delete specific VM
ssh root@***REDACTED_IP*** "kubectl delete vm VM_ID -n uvacompute"
```

## Access Reference

| Method          | Command                                 |
| --------------- | --------------------------------------- |
| SSH (public IP) | `ssh root@***REDACTED_IP***`                 |
| SSH (Tailscale) | Check `tailscale status` for current IP |

## File Locations

| File           | Path                                           |
| -------------- | ---------------------------------------------- |
| Service binary | `/usr/local/bin/vm-orchestration`              |
| Systemd unit   | `/etc/systemd/system/vm-orchestration.service` |
| Service logs   | `journalctl -u vm-orchestration`               |
