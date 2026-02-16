package lib

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	templates "vm-orchestration-service/cloud-init-templates"
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

	secretGVR = schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "secrets",
	}

	dvGVR = schema.GroupVersionResource{
		Group:    "cdi.kubevirt.io",
		Version:  "v1beta1",
		Resource: "datavolumes",
	}

	pvcGVR = schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "persistentvolumeclaims",
	}
)

type KubeVirtAdapter struct {
	client        dynamic.Interface
	typedClient   kubernetes.Interface
	namespace     string
	config        KubeVirtConfig
	goldenImageMu sync.Mutex
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

	typedClient, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create typed client: %w", err)
	}

	return &KubeVirtAdapter{
		client:      client,
		typedClient: typedClient,
		namespace:   config.Namespace,
		config:      config,
	}, nil
}

func (k *KubeVirtAdapter) CreateVM(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string, statusCallback structs.StatusCallback, startupScript, cloudInitConfig string, expose *int, exposeSubdomain *string) error {
	ctx := context.Background()

	statusCallback(structs.VM_STATUS_BOOTING)

	sourceURL := k.config.VMImageSourceURL
	if gpus > 0 {
		sourceURL = k.config.VMImageGPUSourceURL
	}

	goldenPVCName, err := k.EnsureGoldenImage(ctx, sourceURL)
	if err != nil {
		return fmt.Errorf("failed to prepare golden image: %w", err)
	}

	cloudInitUserData := generateCloudInitUserData(sshPublicKeys, startupScript, cloudInitConfig, gpus > 0, expose, exposeSubdomain)
	secretName := fmt.Sprintf("cloudinit-%s", vmId)

	if err := k.createCloudInitSecret(ctx, secretName, cloudInitUserData); err != nil {
		return fmt.Errorf("failed to create cloud-init secret: %w", err)
	}

	rootDiskName := fmt.Sprintf("%s-rootdisk", vmId)
	if err := k.cloneAndResizeRootDisk(ctx, rootDiskName, disk, goldenPVCName); err != nil {
		_ = k.deleteCloudInitSecret(ctx, secretName)
		return fmt.Errorf("failed to prepare root disk: %w", err)
	}

	vm := k.buildVMObject(vmId, cpus, ram, gpus, secretName)

	_, err = k.client.Resource(vmGVR).Namespace(k.namespace).Create(ctx, vm, metav1.CreateOptions{})
	if err != nil {
		_ = k.deleteCloudInitSecret(ctx, secretName)
		return fmt.Errorf("failed to create VM: %w", err)
	}

	statusCallback(structs.VM_STATUS_BOOTING)
	err = k.waitForVMReady(ctx, vmId, statusCallback)
	if err != nil {
		_ = k.DestroyVM(vmId)
		return fmt.Errorf("VM failed to become ready: %w", err)
	}

	return nil
}

func (k *KubeVirtAdapter) createCloudInitSecret(ctx context.Context, secretName, userData string) error {
	secret := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "v1",
			"kind":       "Secret",
			"metadata": map[string]interface{}{
				"name":      secretName,
				"namespace": k.namespace,
				"labels": map[string]interface{}{
					"app.kubernetes.io/managed-by": "vm-orchestration-service",
				},
			},
			"type": "Opaque",
			"data": map[string]interface{}{
				"userdata": base64.StdEncoding.EncodeToString([]byte(userData)),
			},
		},
	}

	_, err := k.client.Resource(secretGVR).Namespace(k.namespace).Create(ctx, secret, metav1.CreateOptions{})
	return err
}

func (k *KubeVirtAdapter) deleteCloudInitSecret(ctx context.Context, secretName string) error {
	return k.client.Resource(secretGVR).Namespace(k.namespace).Delete(ctx, secretName, metav1.DeleteOptions{})
}

func (k *KubeVirtAdapter) EnsureGoldenImage(ctx context.Context, sourceURL string) (string, error) {
	goldenName := GoldenPVCName(sourceURL)

	if err := k.ensureGoldenDVCreated(ctx, goldenName, sourceURL); err != nil {
		return "", err
	}

	return goldenName, k.waitForGoldenImageReady(ctx, goldenName)
}

// Mutex protects only the check-and-create to avoid blocking concurrent callers during the long import wait.
func (k *KubeVirtAdapter) ensureGoldenDVCreated(ctx context.Context, goldenName, sourceURL string) error {
	k.goldenImageMu.Lock()
	defer k.goldenImageMu.Unlock()

	pvc, err := k.client.Resource(pvcGVR).Namespace(k.namespace).Get(ctx, goldenName, metav1.GetOptions{})
	if err == nil {
		annotations := pvc.GetAnnotations()
		if annotations["uvacompute.io/source-url"] == sourceURL {
			if annotations["cdi.kubevirt.io/storage.pod.phase"] == "Succeeded" {
				log.Printf("Golden image %s already exists and is ready", goldenName)
			}
			return nil
		}
		log.Printf("Golden image %s has stale source URL, recreating", goldenName)
		if err := k.deleteGoldenImage(ctx, goldenName); err != nil {
			return fmt.Errorf("failed to delete stale golden image: %w", err)
		}
	}

	log.Printf("Creating golden image %s from %s", goldenName, sourceURL)

	dv := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "cdi.kubevirt.io/v1beta1",
			"kind":       "DataVolume",
			"metadata": map[string]interface{}{
				"name":      goldenName,
				"namespace": k.namespace,
				"labels": map[string]interface{}{
					"uvacompute.io/golden-image":   "true",
					"app.kubernetes.io/managed-by": "vm-orchestration-service",
				},
				"annotations": map[string]interface{}{
					"uvacompute.io/source-url":                         sourceURL,
					"cdi.kubevirt.io/storage.bind.immediate.requested": "true",
				},
			},
			"spec": map[string]interface{}{
				"pvc": map[string]interface{}{
					"accessModes": []interface{}{k.config.StorageAccessMode},
					"resources": map[string]interface{}{
						"requests": map[string]interface{}{
							"storage": fmt.Sprintf("%dGi", k.config.GoldenImageSizeGB),
						},
					},
					"storageClassName": k.config.DefaultStorageClass,
				},
				"source": goldenImageSource(sourceURL),
			},
		},
	}

	_, err = k.client.Resource(dvGVR).Namespace(k.namespace).Create(ctx, dv, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return fmt.Errorf("failed to create golden DataVolume: %w", err)
	}

	return nil
}

func (k *KubeVirtAdapter) waitForGoldenImageReady(ctx context.Context, goldenName string) error {
	timeout := time.After(30 * time.Minute)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			return fmt.Errorf("timeout waiting for golden image %s to become ready", goldenName)
		case <-ticker.C:
			dv, err := k.client.Resource(dvGVR).Namespace(k.namespace).Get(ctx, goldenName, metav1.GetOptions{})
			if err == nil {
				phase, _, _ := unstructured.NestedString(dv.Object, "status", "phase")
				switch phase {
				case "Succeeded":
					log.Printf("Golden image %s import complete", goldenName)
					return nil
				case "Failed":
					return fmt.Errorf("golden image %s import failed", goldenName)
				default:
					progress, _, _ := unstructured.NestedString(dv.Object, "status", "progress")
					log.Printf("Golden image %s: phase=%s progress=%s", goldenName, phase, progress)
				}
			}

			// Fallback: check PVC annotation (CDI sometimes doesn't update DV phase)
			pvc, err := k.client.Resource(pvcGVR).Namespace(k.namespace).Get(ctx, goldenName, metav1.GetOptions{})
			if err == nil {
				annotations := pvc.GetAnnotations()
				if annotations["cdi.kubevirt.io/storage.pod.phase"] == "Succeeded" {
					log.Printf("Golden image %s import complete (detected via PVC annotation)", goldenName)
					return nil
				}
			}
		}
	}
}

func (k *KubeVirtAdapter) deleteGoldenImage(ctx context.Context, goldenName string) error {
	_ = k.client.Resource(dvGVR).Namespace(k.namespace).Delete(ctx, goldenName, metav1.DeleteOptions{})
	_ = k.client.Resource(pvcGVR).Namespace(k.namespace).Delete(ctx, goldenName, metav1.DeleteOptions{})

	timeout := time.After(30 * time.Second)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			return fmt.Errorf("timeout waiting for golden image %s to be deleted", goldenName)
		case <-ticker.C:
			_, err := k.client.Resource(pvcGVR).Namespace(k.namespace).Get(ctx, goldenName, metav1.GetOptions{})
			if errors.IsNotFound(err) {
				return nil
			}
		}
	}
}

func (k *KubeVirtAdapter) cloneAndResizeRootDisk(ctx context.Context, pvcName string, diskGB int, goldenPVCName string) error {
	log.Printf("Creating root disk %s (%dGi) from golden image %s", pvcName, diskGB, goldenPVCName)

	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      pvcName,
			Namespace: k.namespace,
			Labels: map[string]string{
				"app.kubernetes.io/managed-by": "vm-orchestration-service",
			},
			Annotations: map[string]string{
				"cdi.kubevirt.io/storage.bind.immediate.requested": "true",
			},
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes:      []corev1.PersistentVolumeAccessMode{corev1.PersistentVolumeAccessMode(k.config.StorageAccessMode)},
			StorageClassName: &k.config.DefaultStorageClass,
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse(fmt.Sprintf("%dGi", diskGB)),
				},
			},
		},
	}

	_, err := k.typedClient.CoreV1().PersistentVolumeClaims(k.namespace).Create(ctx, pvc, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return fmt.Errorf("failed to create root disk PVC: %w", err)
	}

	// Pod creation triggers PVC binding with WaitForFirstConsumer
	podName := fmt.Sprintf("clone-%s", pvcName)
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      podName,
			Namespace: k.namespace,
		},
		Spec: corev1.PodSpec{
			RestartPolicy: corev1.RestartPolicyNever,
			Containers: []corev1.Container{
				{
					Name:    "clone",
					Image:   "busybox:1.36",
					Command: []string{"sh", "-c", fmt.Sprintf("cp /src/disk.img /dst/disk.img && truncate -s %dG /dst/disk.img", diskGB)},
					VolumeMounts: []corev1.VolumeMount{
						{Name: "src", MountPath: "/src", ReadOnly: true},
						{Name: "dst", MountPath: "/dst"},
					},
				},
			},
			Volumes: []corev1.Volume{
				{
					Name: "src",
					VolumeSource: corev1.VolumeSource{
						PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
							ClaimName: goldenPVCName,
							ReadOnly:  true,
						},
					},
				},
				{
					Name: "dst",
					VolumeSource: corev1.VolumeSource{
						PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
							ClaimName: pvcName,
						},
					},
				},
			},
		},
	}

	_, err = k.typedClient.CoreV1().Pods(k.namespace).Create(ctx, pod, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return fmt.Errorf("failed to create clone pod: %w", err)
	}

	if err := k.waitForPodComplete(ctx, podName); err != nil {
		return err
	}
	_ = k.typedClient.CoreV1().Pods(k.namespace).Delete(ctx, podName, metav1.DeleteOptions{})

	log.Printf("Root disk %s ready (%dGi)", pvcName, diskGB)
	return nil
}

func (k *KubeVirtAdapter) waitForPodComplete(ctx context.Context, podName string) error {
	timeout := time.After(10 * time.Minute)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			return fmt.Errorf("timeout waiting for clone pod %s to complete", podName)
		case <-ticker.C:
			pod, err := k.typedClient.CoreV1().Pods(k.namespace).Get(ctx, podName, metav1.GetOptions{})
			if err != nil {
				continue
			}
			switch pod.Status.Phase {
			case corev1.PodSucceeded:
				return nil
			case corev1.PodFailed:
				return fmt.Errorf("clone pod %s failed", podName)
			}
		}
	}
}

func goldenImageSource(sourceURL string) map[string]interface{} {
	if strings.HasPrefix(sourceURL, "docker://") {
		return map[string]interface{}{
			"registry": map[string]interface{}{"url": sourceURL},
		}
	}
	return map[string]interface{}{
		"http": map[string]interface{}{"url": sourceURL},
	}
}

func (k *KubeVirtAdapter) buildVMObject(vmId string, cpus, ram, gpus int, cloudInitSecretName string) *unstructured.Unstructured {
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
				"deviceName": "nvidia.com/gpu-passthrough",
			}
		}
		devices["hostDevices"] = gpuDevices
	}

	templateSpec := map[string]interface{}{
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
				"persistentVolumeClaim": map[string]interface{}{
					"claimName": fmt.Sprintf("%s-rootdisk", vmId),
				},
			},
			map[string]interface{}{
				"name": "cloudinit",
				"cloudInitNoCloud": map[string]interface{}{
					"secretRef": map[string]interface{}{
						"name": cloudInitSecretName,
					},
				},
			},
		},
		"readinessProbe": map[string]interface{}{
			"tcpSocket": map[string]interface{}{
				"port": int64(9999),
			},
			"initialDelaySeconds": int64(30),
			"periodSeconds":       int64(10),
			"timeoutSeconds":      int64(5),
			"failureThreshold":    int64(180),
			"successThreshold":    int64(1),
		},
	}

	if gpus > 0 {
		templateSpec["nodeSelector"] = map[string]interface{}{
			"uvacompute.com/gpu-mode": "vfio",
		}
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
					"spec": templateSpec,
				},
			},
		},
	}

	return vm
}

func (k *KubeVirtAdapter) waitForVMReady(ctx context.Context, vmId string, statusCallback structs.StatusCallback) error {
	// Phase 1: Wait for VM to boot and guest agent to connect (up to 5 minutes)
	if err := k.waitForVMBooted(ctx, vmId, statusCallback); err != nil {
		return err
	}

	// Phase 2: Wait for cloud-init to complete (readinessProbe passes, up to 30 minutes)
	statusCallback(structs.VM_STATUS_PROVISIONING)
	if err := k.waitForCloudInitComplete(ctx, vmId); err != nil {
		return err
	}

	return nil
}

func (k *KubeVirtAdapter) waitForVMBooted(ctx context.Context, vmId string, statusCallback structs.StatusCallback) error {
	timeout := time.After(10 * time.Minute)
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			return fmt.Errorf("timeout waiting for VM to boot")
		case <-ticker.C:
			vmi, err := k.client.Resource(vmiGVR).Namespace(k.namespace).Get(ctx, vmId, metav1.GetOptions{})
			if err != nil {
				continue
			}

			phase, _, _ := unstructured.NestedString(vmi.Object, "status", "phase")

			switch phase {
			case "Running":
				if k.isGuestAgentReady(vmi) {
					return nil
				}
			case "Failed":
				return fmt.Errorf("VM failed to start")
			case "Scheduling":
				statusCallback(structs.VM_STATUS_BOOTING)
			case "Scheduled":
				statusCallback(structs.VM_STATUS_BOOTING)
			}

			// Check virt-launcher pod for scheduling failures (fast-fail instead of waiting 5 min)
			if err := k.checkPodSchedulingFailure(ctx, vmId); err != nil {
				return fmt.Errorf("VM scheduling failed: %w", err)
			}
		}
	}
}

func (k *KubeVirtAdapter) checkPodSchedulingFailure(ctx context.Context, vmId string) error {
	pods, err := k.typedClient.CoreV1().Pods(k.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("kubevirt.io/domain=%s", vmId),
	})
	if err != nil || len(pods.Items) == 0 {
		return nil // Pod not created yet or can't check - not an error
	}

	pod := &pods.Items[0]
	for _, condition := range pod.Status.Conditions {
		if condition.Type == corev1.PodScheduled &&
			condition.Status == corev1.ConditionFalse &&
			condition.Reason == "Unschedulable" {
			return fmt.Errorf("%s", condition.Message)
		}
	}

	return nil
}

func (k *KubeVirtAdapter) waitForCloudInitComplete(ctx context.Context, vmId string) error {
	timeout := time.After(30 * time.Minute)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	log.Printf("Waiting for cloud-init to complete on VM %s...", vmId)

	for {
		select {
		case <-timeout:
			return fmt.Errorf("timeout waiting for cloud-init to complete (30 minutes)")
		case <-ticker.C:
			vmi, err := k.client.Resource(vmiGVR).Namespace(k.namespace).Get(ctx, vmId, metav1.GetOptions{})
			if err != nil {
				continue
			}

			phase, _, _ := unstructured.NestedString(vmi.Object, "status", "phase")
			if phase == "Failed" {
				return fmt.Errorf("VM failed during provisioning")
			}

			if k.isVMReady(vmi) {
				log.Printf("Cloud-init complete on VM %s", vmId)
				return nil
			}
		}
	}
}

func (k *KubeVirtAdapter) isVMReady(vmi *unstructured.Unstructured) bool {
	conditions, found, _ := unstructured.NestedSlice(vmi.Object, "status", "conditions")
	if !found {
		return false
	}

	for _, cond := range conditions {
		condMap, ok := cond.(map[string]interface{})
		if !ok {
			continue
		}
		condType, _ := condMap["type"].(string)
		condStatus, _ := condMap["status"].(string)
		if condType == "Ready" && condStatus == "True" {
			return true
		}
	}

	return false
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

	secretName := fmt.Sprintf("cloudinit-%s", vmId)
	_ = k.deleteCloudInitSecret(ctx, secretName)

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

func (k *KubeVirtAdapter) Ping() error {
	ctx := context.Background()
	_, err := k.client.Resource(vmGVR).Namespace(k.namespace).List(ctx, metav1.ListOptions{Limit: 1})
	return err
}

func (k *KubeVirtAdapter) HasVfioCapableNode(ctx context.Context) (bool, error) {
	nodes, err := k.typedClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{
		LabelSelector: "uvacompute.com/gpu-mode=vfio",
	})
	if err != nil {
		return false, fmt.Errorf("failed to list nodes: %w", err)
	}
	return len(nodes.Items) > 0, nil
}

func (k *KubeVirtAdapter) GetAvailableGPUs(ctx context.Context) (int, error) {
	gpuResource := corev1.ResourceName("nvidia.com/gpu-passthrough")

	nodes, err := k.typedClient.CoreV1().Nodes().List(ctx, metav1.ListOptions{
		LabelSelector: "uvacompute.com/gpu-mode=vfio",
	})
	if err != nil {
		return 0, fmt.Errorf("failed to list GPU nodes: %w", err)
	}

	totalAvailable := 0
	for _, node := range nodes.Items {
		nodeReady := false
		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodeReady && condition.Status == corev1.ConditionTrue {
				nodeReady = true
				break
			}
		}
		if !nodeReady {
			continue
		}

		allocatable, exists := node.Status.Allocatable[gpuResource]
		if !exists {
			continue
		}

		pods, err := k.typedClient.CoreV1().Pods("").List(ctx, metav1.ListOptions{
			FieldSelector: fmt.Sprintf("spec.nodeName=%s,status.phase!=Failed,status.phase!=Succeeded", node.Name),
		})
		if err != nil {
			log.Printf("Warning: failed to list pods on node %s: %v", node.Name, err)
			continue
		}

		var requestedGPUs int64
		for _, pod := range pods.Items {
			for _, container := range pod.Spec.Containers {
				if gpuReq, ok := container.Resources.Requests[gpuResource]; ok {
					requestedGPUs += gpuReq.Value()
				}
			}
		}

		available := allocatable.Value() - requestedGPUs
		if available > 0 {
			totalAvailable += int(available)
		}
	}

	return totalAvailable, nil
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

func generateCloudInitUserData(sshPublicKeys []string, startupScript, cloudInitConfig string, hasGPU bool, expose *int, exposeSubdomain *string) string {
	sshConfig := generateSSHKeysConfig(sshPublicKeys)

	return generateMIMEMultipart(sshConfig, startupScript, cloudInitConfig, hasGPU, expose, exposeSubdomain)
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

func generateMIMEMultipart(sshConfig, startupScript, cloudInitConfig string, hasGPU bool, expose *int, exposeSubdomain *string) string {
	boundary := "==CLOUDCONFIG_BOUNDARY=="
	parts := []string{
		"Content-Type: multipart/mixed; boundary=\"" + boundary + "\"",
		"MIME-Version: 1.0",
		"",
		// Part 1: SSH configuration
		"--" + boundary,
		"Content-Type: text/cloud-config; charset=\"us-ascii\"",
		"MIME-Version: 1.0",
		"Content-Transfer-Encoding: 7bit",
		"Content-Disposition: attachment; filename=\"ssh-config.cfg\"",
		"",
		sshConfig,
	}

	// Part 2: Base template (always injected - includes python, node, uv, git, etc.)
	parts = append(parts,
		"--"+boundary,
		"Content-Type: text/cloud-config; charset=\"us-ascii\"",
		"MIME-Version: 1.0",
		"Content-Transfer-Encoding: 7bit",
		"Content-Disposition: attachment; filename=\"uvacompute-base.cfg\"",
		"Merge-Type: list(append)+dict(no_replace,recurse_list)+str()",
		"",
		templates.Base,
	)

	// Part 3: CUDA template (injected for GPU VMs)
	if hasGPU {
		parts = append(parts,
			"--"+boundary,
			"Content-Type: text/cloud-config; charset=\"us-ascii\"",
			"MIME-Version: 1.0",
			"Content-Transfer-Encoding: 7bit",
			"Content-Disposition: attachment; filename=\"uvacompute-cuda.cfg\"",
			"Merge-Type: list(append)+dict(no_replace,recurse_list)+str()",
			"",
			templates.CUDA,
		)
	}

	// Part 4: frpc configuration (for ephemeral endpoints - --expose flag)
	// For VMs with --expose, include completion marker in frpc config (after verification)
	if expose != nil && exposeSubdomain != nil {
		frpcConfig := GenerateFrpcCloudInit(*expose, *exposeSubdomain, true)
		parts = append(parts,
			"--"+boundary,
			"Content-Type: text/cloud-config; charset=\"us-ascii\"",
			"MIME-Version: 1.0",
			"Content-Transfer-Encoding: 7bit",
			"Content-Disposition: attachment; filename=\"frpc-config.cfg\"",
			"Merge-Type: list(append)+dict(no_replace,recurse_list)+str()",
			"",
			frpcConfig,
		)
	}

	// Part 5: User's startup script (if provided)
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

	// Part 6: User's cloud-init config (if provided)
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

	// Part 7: Completion marker (only for VMs without --expose)
	// For VMs with --expose, the completion marker is included in the frpc config
	// after frpc verification succeeds, ensuring the endpoint is ready before READY status
	if expose == nil {
		completionMarker := `#cloud-config
runcmd:
  - touch /var/run/uvacompute-provisioned
  - echo "UVACompute provisioning complete at $(date)" >> /var/log/uvacompute-init.log
  - nohup nc -lk 9999 < /dev/null > /dev/null 2>&1 &
  - echo "Readiness port 9999 listening" >> /var/log/uvacompute-init.log`

		parts = append(parts,
			"--"+boundary,
			"Content-Type: text/cloud-config; charset=\"us-ascii\"",
			"MIME-Version: 1.0",
			"Content-Transfer-Encoding: 7bit",
			"Content-Disposition: attachment; filename=\"completion-marker.cfg\"",
			"Merge-Type: list(append)+dict(no_replace,recurse_list)+str()",
			"",
			completionMarker,
		)
	}

	parts = append(parts, "--"+boundary+"--", "")

	return strings.Join(parts, "\n")
}
