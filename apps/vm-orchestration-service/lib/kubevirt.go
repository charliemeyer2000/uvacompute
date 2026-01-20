package lib

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"vm-orchestration-service/structs"
)

var (
	vmGVR = schema.GroupVersionResource{
		Group:    "kubevirt.io",
		Version:  "v1",
		Resource: "virtualmachines",
	}

	vmiGVR = schema.GroupVersionResource{
		Group:    "kubevirt.io",
		Version:  "v1",
		Resource: "virtualmachineinstances",
	}
)

type KubeVirtAdapter struct {
	client    dynamic.Interface
	namespace string
	config    KubeVirtConfig
}

func NewKubeVirtAdapter(config KubeVirtConfig) (*KubeVirtAdapter, error) {
	var restConfig *rest.Config
	var err error

	if config.KubeconfigPath != "" {
		restConfig, err = clientcmd.BuildConfigFromFlags("", config.KubeconfigPath)
		if err != nil {
			return nil, fmt.Errorf("failed to load kubeconfig: %w", err)
		}
	} else {
		restConfig, err = rest.InClusterConfig()
		if err != nil {
			restConfig, err = clientcmd.BuildConfigFromFlags("", clientcmd.RecommendedHomeFile)
			if err != nil {
				return nil, fmt.Errorf("failed to create config: %w", err)
			}
		}
	}

	client, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %w", err)
	}

	return &KubeVirtAdapter{
		client:    client,
		namespace: config.Namespace,
		config:    config,
	}, nil
}

func (k *KubeVirtAdapter) CreateVM(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string, statusCallback structs.StatusCallback, startupScript, cloudInitConfig string) error {
	ctx := context.Background()

	statusCallback(structs.VM_STATUS_INITIALIZING)

	image := k.config.VMImageCPU
	if gpus > 0 {
		image = k.config.VMImageGPU
	}

	cloudInitUserData := generateCloudInitUserData(sshPublicKeys, startupScript, cloudInitConfig)

	vm := k.buildVMObject(vmId, cpus, ram, disk, gpus, image, cloudInitUserData)

	statusCallback(structs.VM_STATUS_STARTING)
	_, err := k.client.Resource(vmGVR).Namespace(k.namespace).Create(ctx, vm, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create VM: %w", err)
	}

	statusCallback(structs.VM_STATUS_WAITING_FOR_AGENT)
	err = k.waitForVMReady(ctx, vmId, statusCallback)
	if err != nil {
		_ = k.DestroyVM(vmId)
		return fmt.Errorf("VM failed to become ready: %w", err)
	}

	return nil
}

func (k *KubeVirtAdapter) buildVMObject(vmId string, cpus, ram, disk, gpus int, image, cloudInitUserData string) *unstructured.Unstructured {
	devices := map[string]interface{}{
		"disks": []interface{}{
			map[string]interface{}{
				"name": "rootdisk",
				"disk": map[string]interface{}{
					"bus": "virtio",
				},
			},
			map[string]interface{}{
				"name": "cloudinit",
				"disk": map[string]interface{}{
					"bus": "virtio",
				},
			},
		},
		"interfaces": []interface{}{
			map[string]interface{}{
				"name":       "default",
				"masquerade": map[string]interface{}{},
			},
		},
	}

	if gpus > 0 {
		gpuDevices := make([]interface{}, gpus)
		for i := 0; i < gpus; i++ {
			gpuDevices[i] = map[string]interface{}{
				"name":       fmt.Sprintf("gpu%d", i),
				"deviceName": "nvidia.com/gpu",
			}
		}
		devices["gpus"] = gpuDevices
	}

	vm := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "kubevirt.io/v1",
			"kind":       "VirtualMachine",
			"metadata": map[string]interface{}{
				"name":      vmId,
				"namespace": k.namespace,
				"labels": map[string]interface{}{
					"app.kubernetes.io/name":       "uvacompute-vm",
					"app.kubernetes.io/managed-by": "vm-orchestration-service",
					"uvacompute.io/vm-id":          vmId,
				},
			},
			"spec": map[string]interface{}{
				"running": true,
				"template": map[string]interface{}{
					"metadata": map[string]interface{}{
						"labels": map[string]interface{}{
							"app.kubernetes.io/name": "uvacompute-vm",
							"uvacompute.io/vm-id":    vmId,
						},
					},
					"spec": map[string]interface{}{
						"domain": map[string]interface{}{
							"cpu": map[string]interface{}{
								"cores": int64(cpus),
							},
							"memory": map[string]interface{}{
								"guest": fmt.Sprintf("%dGi", ram),
							},
							"devices": devices,
							"resources": map[string]interface{}{
								"requests": map[string]interface{}{
									"memory": fmt.Sprintf("%dGi", ram),
									"cpu":    fmt.Sprintf("%d", cpus),
								},
							},
						},
						"networks": []interface{}{
							map[string]interface{}{
								"name": "default",
								"pod":  map[string]interface{}{},
							},
						},
						"volumes": []interface{}{
							map[string]interface{}{
								"name": "rootdisk",
								"containerDisk": map[string]interface{}{
									"image": image,
								},
							},
							map[string]interface{}{
								"name": "cloudinit",
								"cloudInitNoCloud": map[string]interface{}{
									"userData": cloudInitUserData,
								},
							},
						},
					},
				},
			},
		},
	}

	return vm
}

func (k *KubeVirtAdapter) waitForVMReady(ctx context.Context, vmId string, statusCallback structs.StatusCallback) error {
	timeout := time.After(5 * time.Minute)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			return fmt.Errorf("timeout waiting for VM to be ready")
		case <-ticker.C:
			vmi, err := k.client.Resource(vmiGVR).Namespace(k.namespace).Get(ctx, vmId, metav1.GetOptions{})
			if err != nil {
				continue
			}

			phase, _, _ := unstructured.NestedString(vmi.Object, "status", "phase")

			switch phase {
			case "Running":
				if k.isGuestAgentReady(vmi) {
					statusCallback(structs.VM_STATUS_CONFIGURING)
					return nil
				}
			case "Failed":
				return fmt.Errorf("VM failed to start")
			case "Scheduling":
				statusCallback(structs.VM_STATUS_INITIALIZING)
			case "Scheduled":
				statusCallback(structs.VM_STATUS_STARTING)
			}
		}
	}
}

func (k *KubeVirtAdapter) isGuestAgentReady(vmi *unstructured.Unstructured) bool {
	conditions, found, _ := unstructured.NestedSlice(vmi.Object, "status", "conditions")
	if !found {
		interfaces, found, _ := unstructured.NestedSlice(vmi.Object, "status", "interfaces")
		return found && len(interfaces) > 0
	}

	for _, cond := range conditions {
		condMap, ok := cond.(map[string]interface{})
		if !ok {
			continue
		}
		condType, _ := condMap["type"].(string)
		condStatus, _ := condMap["status"].(string)
		if condType == "AgentConnected" && condStatus == "True" {
			return true
		}
	}

	interfaces, found, _ := unstructured.NestedSlice(vmi.Object, "status", "interfaces")
	return found && len(interfaces) > 0
}

func (k *KubeVirtAdapter) DestroyVM(vmId string) error {
	ctx := context.Background()

	err := k.client.Resource(vmGVR).Namespace(k.namespace).Delete(ctx, vmId, metav1.DeleteOptions{})
	if err != nil {
		return fmt.Errorf("failed to delete VM: %w", err)
	}

	return nil
}

func (k *KubeVirtAdapter) GetVMStatus(vmId string) (string, error) {
	ctx := context.Background()

	vmi, err := k.client.Resource(vmiGVR).Namespace(k.namespace).Get(ctx, vmId, metav1.GetOptions{})
	if err != nil {
		vm, vmErr := k.client.Resource(vmGVR).Namespace(k.namespace).Get(ctx, vmId, metav1.GetOptions{})
		if vmErr != nil {
			return "", fmt.Errorf("VM not found: %w", vmErr)
		}
		ready, _, _ := unstructured.NestedBool(vm.Object, "status", "ready")
		return fmt.Sprintf("VM exists but not running (Ready: %v)", ready), nil
	}

	phase, _, _ := unstructured.NestedString(vmi.Object, "status", "phase")
	return phase, nil
}

func (k *KubeVirtAdapter) GetVMInfo(vmId string) (*structs.VMInfo, error) {
	ctx := context.Background()

	vm, err := k.client.Resource(vmGVR).Namespace(k.namespace).Get(ctx, vmId, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get VM: %w", err)
	}

	vmi, _ := k.client.Resource(vmiGVR).Namespace(k.namespace).Get(ctx, vmId, metav1.GetOptions{})

	info := &structs.VMInfo{
		Name:         vm.GetName(),
		Status:       k.mapVMStatus(vm, vmi),
		Type:         "virtual-machine",
		Architecture: "x86_64",
		Created:      vm.GetCreationTimestamp().Format("2006/01/02 15:04 MST"),
	}

	if vmi != nil {
		nodeName, _, _ := unstructured.NestedString(vmi.Object, "status", "nodeName")
		if nodeName != "" {
			info.Location = nodeName
		}

		info.Resources = &structs.VMResources{
			NetworkUsage: make(map[string]*structs.NetworkDevice),
		}

		interfaces, found, _ := unstructured.NestedSlice(vmi.Object, "status", "interfaces")
		if found {
			for _, iface := range interfaces {
				ifaceMap, ok := iface.(map[string]interface{})
				if !ok {
					continue
				}
				name, _ := ifaceMap["name"].(string)
				mac, _ := ifaceMap["mac"].(string)
				if name != "" {
					info.Resources.NetworkUsage[name] = &structs.NetworkDevice{
						Type:       "broadcast",
						State:      "UP",
						MACAddress: mac,
					}
				}
			}
		}
	}

	return info, nil
}

func (k *KubeVirtAdapter) mapVMStatus(vm, vmi *unstructured.Unstructured) string {
	if vmi != nil {
		phase, _, _ := unstructured.NestedString(vmi.Object, "status", "phase")
		switch phase {
		case "Running":
			return "RUNNING"
		case "Scheduling", "Scheduled", "Pending":
			return "STARTING"
		case "Failed":
			return "ERROR"
		case "Succeeded":
			return "STOPPED"
		}
	}

	ready, _, _ := unstructured.NestedBool(vm.Object, "status", "ready")
	if ready {
		return "RUNNING"
	}

	return "STOPPED"
}

func (k *KubeVirtAdapter) ListVMs() ([]structs.ListVM, error) {
	ctx := context.Background()

	vmList, err := k.client.Resource(vmGVR).Namespace(k.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app.kubernetes.io/managed-by=vm-orchestration-service",
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list VMs: %w", err)
	}

	vmiList, _ := k.client.Resource(vmiGVR).Namespace(k.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app.kubernetes.io/managed-by=vm-orchestration-service",
	})

	vmiMap := make(map[string]*unstructured.Unstructured)
	if vmiList != nil {
		for i := range vmiList.Items {
			vmiMap[vmiList.Items[i].GetName()] = &vmiList.Items[i]
		}
	}

	var result []structs.ListVM
	for _, vm := range vmList.Items {
		vmi := vmiMap[vm.GetName()]

		status := "Stopped"
		if vmi != nil {
			phase, _, _ := unstructured.NestedString(vmi.Object, "status", "phase")
			if phase == "Running" {
				status = "Running"
			}
		} else {
			ready, _, _ := unstructured.NestedBool(vm.Object, "status", "ready")
			if ready {
				status = "Running"
			}
		}

		config := make(map[string]string)
		cores, found, _ := unstructured.NestedInt64(vm.Object, "spec", "template", "spec", "domain", "cpu", "cores")
		if found {
			config["limits.cpu"] = fmt.Sprintf("%d", cores)
		}
		memory, found, _ := unstructured.NestedString(vm.Object, "spec", "template", "spec", "domain", "memory", "guest")
		if found {
			config["limits.memory"] = memory
		}

		result = append(result, structs.ListVM{
			Name:      vm.GetName(),
			Status:    status,
			Type:      "virtual-machine",
			Config:    config,
			CreatedAt: vm.GetCreationTimestamp().Format(time.RFC3339),
		})
	}

	return result, nil
}

func (k *KubeVirtAdapter) InitializeFromKubevirt() error {
	log.Printf("Syncing VM state from KubeVirt...")

	vms, err := k.ListVMs()
	if err != nil {
		return fmt.Errorf("failed to list VMs from KubeVirt: %w", err)
	}

	log.Printf("Found %d VMs in KubeVirt namespace %s", len(vms), k.namespace)
	return nil
}

func (k *KubeVirtAdapter) WatchVMs(ctx context.Context) (<-chan watch.Event, error) {
	watcher, err := k.client.Resource(vmiGVR).Namespace(k.namespace).Watch(ctx, metav1.ListOptions{
		LabelSelector: "app.kubernetes.io/managed-by=vm-orchestration-service",
	})
	if err != nil {
		return nil, err
	}
	return watcher.ResultChan(), nil
}

func (k *KubeVirtAdapter) Ping() error {
	ctx := context.Background()
	_, err := k.client.Resource(vmGVR).Namespace(k.namespace).List(ctx, metav1.ListOptions{Limit: 1})
	return err
}

func (k *KubeVirtAdapter) EnsureNamespace() error {
	ctx := context.Background()

	nsGVR := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "namespaces",
	}

	_, err := k.client.Resource(nsGVR).Get(ctx, k.namespace, metav1.GetOptions{})
	if err == nil {
		return nil
	}

	ns := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Namespace",
			"metadata": map[string]interface{}{
				"name": k.namespace,
				"labels": map[string]interface{}{
					"app.kubernetes.io/managed-by": "vm-orchestration-service",
				},
			},
		},
	}

	_, err = k.client.Resource(nsGVR).Create(ctx, ns, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create namespace: %w", err)
	}

	log.Printf("Created namespace %s", k.namespace)
	return nil
}

func prettyPrint(v interface{}) string {
	b, _ := json.MarshalIndent(v, "", "  ")
	return string(b)
}

func generateCloudInitUserData(sshPublicKeys []string, startupScript, cloudInitConfig string) string {
	sshConfig := generateSSHKeysConfig(sshPublicKeys)

	if startupScript == "" && cloudInitConfig == "" {
		return sshConfig
	}

	return generateMIMEMultipart(sshConfig, startupScript, cloudInitConfig)
}

func generateSSHKeysConfig(sshPublicKeys []string) string {
	var userLevelKeys []string
	for _, key := range sshPublicKeys {
		userLevelKeys = append(userLevelKeys, fmt.Sprintf("      - %s", key))
	}

	return fmt.Sprintf(`#cloud-config
users:
  - name: root
    ssh_authorized_keys:
%s
ssh_pwauth: false
disable_root: false`, strings.Join(userLevelKeys, "\n"))
}

func generateMIMEMultipart(sshConfig, startupScript, cloudInitConfig string) string {
	boundary := "==CLOUDCONFIG_BOUNDARY=="
	parts := []string{
		"Content-Type: multipart/mixed; boundary=\"" + boundary + "\"",
		"MIME-Version: 1.0",
		"",
		"--" + boundary,
		"Content-Type: text/cloud-config; charset=\"us-ascii\"",
		"MIME-Version: 1.0",
		"Content-Transfer-Encoding: 7bit",
		"Content-Disposition: attachment; filename=\"base-config.cfg\"",
		"",
		sshConfig,
	}

	if startupScript != "" {
		wrappedScript := `#!/bin/bash
export HOME=/root
export USER=root
export LOGNAME=root
cd /root

# Run user's script
` + startupScript

		parts = append(parts,
			"--"+boundary,
			"Content-Type: text/x-shellscript; charset=\"us-ascii\"",
			"MIME-Version: 1.0",
			"Content-Transfer-Encoding: 7bit",
			"Content-Disposition: attachment; filename=\"startup-script.sh\"",
			"",
			wrappedScript,
		)
	}

	if cloudInitConfig != "" {
		parts = append(parts,
			"--"+boundary,
			"Content-Type: text/cloud-config; charset=\"us-ascii\"",
			"MIME-Version: 1.0",
			"Content-Transfer-Encoding: 7bit",
			"Content-Disposition: attachment; filename=\"user-config.cfg\"",
			"Merge-Type: list(append)+dict(no_replace,recurse_list)+str()",
			"",
			cloudInitConfig,
		)
	}

	parts = append(parts, "--"+boundary+"--", "")

	return strings.Join(parts, "\n")
}
