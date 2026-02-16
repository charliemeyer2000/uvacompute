---
name: gpu-vfio-setup
description: Set up GPU for VFIO passthrough to KubeVirt VMs. Use when GPU VMs fail with "no GPU nodes available", "failed to create GPU host-devices", or "group is not viable" errors.
allowed-tools: Bash, Read
---

# GPU VFIO Passthrough Setup

This skill configures the RTX 5090 for VFIO passthrough to KubeVirt VMs.

## Quick Diagnosis

```bash
# Check current GPU mode
ssh root@100.97.247.28 "uva node gpu-mode status"

# Check driver binding (should show vfio-pci for BOTH devices)
ssh root@100.97.247.28 "lspci -nnks c1:00"

# Check Kubernetes label
ssh root@100.97.247.28 "kubectl get node aiworkstation -o jsonpath='{.metadata.labels.uvacompute\\.com/gpu-mode}'"
```

## Common Errors and Fixes

### Error: "no GPU nodes available" (409)

Missing Kubernetes label.

```bash
ssh root@100.97.247.28 "kubectl label node aiworkstation uvacompute.com/gpu-mode=vfio --overwrite"
```

### Error: "group 19 is not viable"

Not all devices in IOMMU group bound to vfio-pci. The GPU and its audio device share IOMMU group 19 - BOTH must be on vfio-pci.

```bash
ssh root@100.97.247.28 "
echo 0000:c1:00.1 > /sys/bus/pci/drivers/snd_hda_intel/unbind 2>/dev/null
echo vfio-pci > /sys/bus/pci/devices/0000:c1:00.1/driver_override
echo 0000:c1:00.1 > /sys/bus/pci/drivers_probe
lspci -nnks c1:00.1
"
```

### Error: nvidia modules won't unload

Something is using the GPU.

```bash
ssh root@100.97.247.28 "
# Find what's using it
ps aux | grep -i nvidia
lsmod | grep nvidia

# Kill nvidia processes
kubectl delete daemonset nvidia-device-plugin-daemonset -n kube-system 2>/dev/null
systemctl stop nvidia-persistenced
pkill -f nvidia-device-plugin

# Try unload again
rmmod nvidia_uvm nvidia_drm nvidia_modeset nvidia
"
```

If still stuck, reboot the workstation.

## Full VFIO Setup Procedure

Run on workstation (ssh root@100.97.247.28):

### Step 1: Stop GPU consumers

```bash
# Delete k8s nvidia plugin (it reloads nvidia driver)
kubectl delete daemonset nvidia-device-plugin-daemonset -n kube-system 2>/dev/null

# Stop nvidia services
systemctl stop nvidia-persistenced
pkill -f nvidia-device-plugin
pkill -f nvidia-smi
```

### Step 2: Unload nvidia modules

```bash
rmmod nvidia_uvm nvidia_drm nvidia_modeset nvidia

# Verify empty
lsmod | grep nvidia
```

### Step 3: Load VFIO and bind devices

```bash
# Load VFIO
modprobe vfio-pci

# Bind GPU
echo "vfio-pci" > /sys/bus/pci/devices/0000:c1:00.0/driver_override
echo "0000:c1:00.0" > /sys/bus/pci/drivers_probe

# Bind Audio (REQUIRED - same IOMMU group)
echo "0000:c1:00.1" > /sys/bus/pci/drivers/snd_hda_intel/unbind 2>/dev/null
echo "vfio-pci" > /sys/bus/pci/devices/0000:c1:00.1/driver_override
echo "0000:c1:00.1" > /sys/bus/pci/drivers_probe
```

### Step 4: Verify and label

```bash
# Both should show "Kernel driver in use: vfio-pci"
lspci -nnks c1:00

# Set k8s label
kubectl label node aiworkstation uvacompute.com/gpu-mode=vfio --overwrite

# Final check
uva node gpu-mode status
```

## Hardware Reference

| Component      | PCI ID    | PCI Address  | IOMMU Group |
| -------------- | --------- | ------------ | ----------- |
| RTX 5090 GPU   | 10DE:2B85 | 0000:c1:00.0 | 19          |
| RTX 5090 Audio | 10DE:22E8 | 0000:c1:00.1 | 19          |

## KubeVirt Configuration

The KubeVirt CR must have permittedHostDevices configured:

```bash
kubectl patch kubevirt kubevirt -n kubevirt --type=merge -p '{
  "spec": {
    "configuration": {
      "permittedHostDevices": {
        "pciHostDevices": [{
          "pciVendorSelector": "10DE:2B85",
          "resourceName": "nvidia.com/gpu-passthrough"
        }]
      }
    }
  }
}'
```

## Code Reference

GPU passthrough uses `hostDevices` (not `gpus`) in VM spec:

- File: `apps/vm-orchestration-service/lib/kubevirt.go`
- Line: ~177
- Uses: `devices["hostDevices"]` with `deviceName: "nvidia.com/gpu-passthrough"`
