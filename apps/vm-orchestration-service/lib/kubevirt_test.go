package lib

import (
	"strings"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestGoldenPVCName(t *testing.T) {
	t.Parallel()

	name1 := GoldenPVCName("docker://quay.io/containerdisks/ubuntu:22.04")
	name2 := GoldenPVCName("docker://quay.io/containerdisks/ubuntu:24.04")
	name3 := GoldenPVCName("docker://quay.io/containerdisks/ubuntu:22.04")

	if name1 != name3 {
		t.Errorf("same URL should produce same name: %s vs %s", name1, name3)
	}
	if name1 == name2 {
		t.Errorf("different URLs should produce different names: %s vs %s", name1, name2)
	}
	if !strings.HasPrefix(name1, "uvacompute-golden-") {
		t.Errorf("expected uvacompute-golden- prefix, got %s", name1)
	}
}

func TestGoldenImageSource(t *testing.T) {
	t.Parallel()

	registrySource := goldenImageSource("docker://quay.io/containerdisks/ubuntu:22.04")
	if _, ok := registrySource["registry"]; !ok {
		t.Error("docker:// URL should produce registry source")
	}

	httpSource := goldenImageSource("https://cloud-images.ubuntu.com/releases/22.04/release/ubuntu-22.04-server-cloudimg-amd64.img")
	if _, ok := httpSource["http"]; !ok {
		t.Error("https:// URL should produce http source")
	}
}

func TestDefaultKubeVirtConfig(t *testing.T) {
	config := DefaultKubeVirtConfig()

	if config.Namespace != "uvacompute" {
		t.Errorf("Expected default namespace 'uvacompute', got '%s'", config.Namespace)
	}

	if config.VMImageSourceURL == "" {
		t.Error("Expected VMImageSourceURL to have a default value")
	}
}

func TestBuildVMObject(t *testing.T) {
	config := DefaultKubeVirtConfig()
	adapter := &KubeVirtAdapter{
		namespace: config.Namespace,
		config:    config,
	}

	tests := []struct {
		name           string
		vmId           string
		cpus           int
		ram            int
		gpus           int
		cloudInit      string
		expectGPU      bool
		expectedCores  int64
		expectedMemory string
	}{
		{
			name:           "Basic VM without GPU",
			vmId:           "test-vm-1",
			cpus:           2,
			ram:            8,
			gpus:           0,
			cloudInit:      "#cloud-config\n",
			expectGPU:      false,
			expectedCores:  2,
			expectedMemory: "8Gi",
		},
		{
			name:           "VM with GPU",
			vmId:           "test-vm-2",
			cpus:           4,
			ram:            16,
			gpus:           1,
			cloudInit:      "#cloud-config\n",
			expectGPU:      true,
			expectedCores:  4,
			expectedMemory: "16Gi",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			vm := adapter.buildVMObject(tt.vmId, tt.cpus, tt.ram, tt.gpus, tt.cloudInit)

			if vm.GetName() != tt.vmId {
				t.Errorf("Expected VM name '%s', got '%s'", tt.vmId, vm.GetName())
			}

			if vm.GetNamespace() != config.Namespace {
				t.Errorf("Expected namespace '%s', got '%s'", config.Namespace, vm.GetNamespace())
			}

			labels := vm.GetLabels()
			if labels["app.kubernetes.io/managed-by"] != "vm-orchestration-service" {
				t.Error("Expected managed-by label")
			}

			if labels["uvacompute.io/vm-id"] != tt.vmId {
				t.Errorf("Expected vm-id label '%s', got '%s'", tt.vmId, labels["uvacompute.io/vm-id"])
			}

			spec, found, _ := unstructured.NestedMap(vm.Object, "spec")
			if !found {
				t.Fatal("Expected spec in VM object")
			}

			running, found, _ := unstructured.NestedBool(spec, "running")
			if !found || !running {
				t.Error("Expected running to be true")
			}

			template, found, _ := unstructured.NestedMap(spec, "template")
			if !found {
				t.Fatal("Expected template in spec")
			}

			templateSpec, found, _ := unstructured.NestedMap(template, "spec")
			if !found {
				t.Fatal("Expected spec in template")
			}

			domain, found, _ := unstructured.NestedMap(templateSpec, "domain")
			if !found {
				t.Fatal("Expected domain in template.spec")
			}

			cores, found, _ := unstructured.NestedInt64(domain, "cpu", "cores")
			if !found {
				t.Fatal("Expected cpu.cores in domain")
			}
			if cores != tt.expectedCores {
				t.Errorf("Expected %d cores, got %d", tt.expectedCores, cores)
			}

			memory, found, _ := unstructured.NestedString(domain, "memory", "guest")
			if !found {
				t.Fatal("Expected memory.guest in domain")
			}
			if memory != tt.expectedMemory {
				t.Errorf("Expected memory '%s', got '%s'", tt.expectedMemory, memory)
			}

			devices, found, _ := unstructured.NestedMap(domain, "devices")
			if !found {
				t.Fatal("Expected devices in domain")
			}

			hostDevices, found, _ := unstructured.NestedSlice(devices, "hostDevices")
			if tt.expectGPU {
				if !found || len(hostDevices) == 0 {
					t.Error("Expected GPU host devices")
				}
			} else {
				if found && len(hostDevices) > 0 {
					t.Error("Did not expect GPU host devices")
				}
			}

			volumes, found, _ := unstructured.NestedSlice(templateSpec, "volumes")
			if !found || len(volumes) < 2 {
				t.Fatal("Expected at least 2 volumes (rootdisk and cloudinit)")
			}
		})
	}
}

func TestBuildVMObjectWithCloudInit(t *testing.T) {
	config := DefaultKubeVirtConfig()
	adapter := &KubeVirtAdapter{
		namespace: config.Namespace,
		config:    config,
	}

	secretName := "cloudinit-test-vm"

	vm := adapter.buildVMObject("test-vm", 2, 8, 0, secretName)

	spec, _, _ := unstructured.NestedMap(vm.Object, "spec")
	template, _, _ := unstructured.NestedMap(spec, "template")
	templateSpec, _, _ := unstructured.NestedMap(template, "spec")
	volumes, _, _ := unstructured.NestedSlice(templateSpec, "volumes")

	foundCloudInit := false
	for _, vol := range volumes {
		volMap, ok := vol.(map[string]interface{})
		if !ok {
			continue
		}
		if volMap["name"] == "cloudinit" {
			cloudInitNoCloud, found, _ := unstructured.NestedMap(volMap, "cloudInitNoCloud")
			if found {
				// Check for secretRef (references k8s secret with cloud-init)
				secretRef, found, _ := unstructured.NestedMap(cloudInitNoCloud, "secretRef")
				if found {
					name, _, _ := unstructured.NestedString(secretRef, "name")
					if name == secretName {
						foundCloudInit = true
					}
				}
			}
		}
	}

	if !foundCloudInit {
		t.Error("Expected cloudinit volume with secretRef")
	}
}

func TestBuildVMObjectUsesPVCVolume(t *testing.T) {
	t.Parallel()
	config := DefaultKubeVirtConfig()
	adapter := &KubeVirtAdapter{
		namespace: config.Namespace,
		config:    config,
	}

	vm := adapter.buildVMObject("test-vm", 2, 8, 0, "cloudinit-test")

	// Should NOT have dataVolumeTemplates (PVC is pre-created)
	_, found, _ := unstructured.NestedSlice(vm.Object, "spec", "dataVolumeTemplates")
	if found {
		t.Error("Should not have dataVolumeTemplates")
	}

	// Should reference PVC directly
	volumes, _, _ := unstructured.NestedSlice(vm.Object, "spec", "template", "spec", "volumes")
	var rootVolume map[string]interface{}
	for _, v := range volumes {
		vol := v.(map[string]interface{})
		if vol["name"] == "rootdisk" {
			rootVolume = vol
			break
		}
	}
	if rootVolume == nil {
		t.Fatal("Expected rootdisk volume")
	}
	claimName, found, _ := unstructured.NestedString(rootVolume, "persistentVolumeClaim", "claimName")
	if !found || claimName != "test-vm-rootdisk" {
		t.Errorf("Expected PVC claimName=test-vm-rootdisk, got %s", claimName)
	}
}

func TestBuildVMObjectGPUDevices(t *testing.T) {
	config := DefaultKubeVirtConfig()
	adapter := &KubeVirtAdapter{
		namespace: config.Namespace,
		config:    config,
	}

	vm := adapter.buildVMObject("test-vm", 4, 16, 2, "cloudinit-test-vm")

	spec, _, _ := unstructured.NestedMap(vm.Object, "spec")
	template, _, _ := unstructured.NestedMap(spec, "template")
	templateSpec, _, _ := unstructured.NestedMap(template, "spec")
	domain, _, _ := unstructured.NestedMap(templateSpec, "domain")
	devices, _, _ := unstructured.NestedMap(domain, "devices")
	hostDevices, found, _ := unstructured.NestedSlice(devices, "hostDevices")

	if !found {
		t.Fatal("Expected hostDevices in devices")
	}

	if len(hostDevices) != 2 {
		t.Errorf("Expected 2 GPU host devices, got %d", len(hostDevices))
	}

	for i, dev := range hostDevices {
		devMap, ok := dev.(map[string]interface{})
		if !ok {
			t.Fatalf("hostDevice %d is not a map", i)
		}

		deviceName, _ := devMap["deviceName"].(string)
		if deviceName != "nvidia.com/gpu-passthrough" {
			t.Errorf("hostDevice %d: expected deviceName 'nvidia.com/gpu-passthrough', got '%s'", i, deviceName)
		}
	}
}

func TestMapVMStatus(t *testing.T) {
	config := DefaultKubeVirtConfig()
	adapter := &KubeVirtAdapter{
		namespace: config.Namespace,
		config:    config,
	}

	tests := []struct {
		name           string
		vmiPhase       string
		vmReady        bool
		hasVMI         bool
		expectedStatus string
	}{
		{
			name:           "Running VMI",
			vmiPhase:       "Running",
			hasVMI:         true,
			expectedStatus: "RUNNING",
		},
		{
			name:           "Scheduling VMI",
			vmiPhase:       "Scheduling",
			hasVMI:         true,
			expectedStatus: "STARTING",
		},
		{
			name:           "Failed VMI",
			vmiPhase:       "Failed",
			hasVMI:         true,
			expectedStatus: "ERROR",
		},
		{
			name:           "Stopped VMI",
			vmiPhase:       "Succeeded",
			hasVMI:         true,
			expectedStatus: "STOPPED",
		},
		{
			name:           "No VMI, VM ready",
			hasVMI:         false,
			vmReady:        true,
			expectedStatus: "RUNNING",
		},
		{
			name:           "No VMI, VM not ready",
			hasVMI:         false,
			vmReady:        false,
			expectedStatus: "STOPPED",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			vm := &unstructured.Unstructured{
				Object: map[string]interface{}{
					"status": map[string]interface{}{
						"ready": tt.vmReady,
					},
				},
			}

			var vmi *unstructured.Unstructured
			if tt.hasVMI {
				vmi = &unstructured.Unstructured{
					Object: map[string]interface{}{
						"status": map[string]interface{}{
							"phase": tt.vmiPhase,
						},
					},
				}
			}

			status := adapter.mapVMStatus(vm, vmi)
			if status != tt.expectedStatus {
				t.Errorf("Expected status '%s', got '%s'", tt.expectedStatus, status)
			}
		})
	}
}

func TestGetEnvOrDefault(t *testing.T) {
	tests := []struct {
		name         string
		key          string
		defaultValue string
		envValue     string
		setEnv       bool
		expected     string
	}{
		{
			name:         "Uses default when env not set",
			key:          "TEST_VAR_1",
			defaultValue: "default-value",
			setEnv:       false,
			expected:     "default-value",
		},
		{
			name:         "Uses env when set",
			key:          "TEST_VAR_2",
			defaultValue: "default-value",
			envValue:     "env-value",
			setEnv:       true,
			expected:     "env-value",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.setEnv {
				t.Setenv(tt.key, tt.envValue)
			}

			result := getEnvOrDefault(tt.key, tt.defaultValue)
			if result != tt.expected {
				t.Errorf("Expected '%s', got '%s'", tt.expected, result)
			}
		})
	}
}

func TestGenerateMIMEMultipart_BasicNoOptionalFields(t *testing.T) {
	t.Parallel()
	sshConfig := generateSSHKeysConfig([]string{"ssh-rsa AAAA... user@example.com"})
	result := generateMIMEMultipart(sshConfig, "", "", false, nil, nil)

	if !strings.Contains(result, "multipart/mixed") {
		t.Error("should contain multipart/mixed Content-Type header")
	}
	if !strings.Contains(result, "==CLOUDCONFIG_BOUNDARY==") {
		t.Error("should contain boundary marker")
	}
	if !strings.Contains(result, "ssh-config.cfg") {
		t.Error("should contain SSH config part")
	}
	if !strings.Contains(result, "uvacompute-base.cfg") {
		t.Error("should contain base template part")
	}
	if !strings.Contains(result, "completion-marker.cfg") {
		t.Error("should contain completion marker when no expose")
	}
	if strings.Contains(result, "uvacompute-cuda.cfg") {
		t.Error("should NOT contain CUDA template for non-GPU")
	}
	if strings.Contains(result, "startup-script.sh") {
		t.Error("should NOT contain startup script when empty")
	}
	if strings.Contains(result, "user-config.cfg") {
		t.Error("should NOT contain user config when empty")
	}
	if strings.Contains(result, "frpc-config.cfg") {
		t.Error("should NOT contain frpc config when no expose")
	}
}

func TestGenerateMIMEMultipart_WithGPU(t *testing.T) {
	t.Parallel()
	sshConfig := generateSSHKeysConfig(nil)
	result := generateMIMEMultipart(sshConfig, "", "", true, nil, nil)

	if !strings.Contains(result, "uvacompute-cuda.cfg") {
		t.Error("should contain CUDA template for GPU VMs")
	}
}

func TestGenerateMIMEMultipart_WithStartupScript(t *testing.T) {
	t.Parallel()
	sshConfig := generateSSHKeysConfig(nil)
	result := generateMIMEMultipart(sshConfig, "echo hello", "", false, nil, nil)

	if !strings.Contains(result, "startup-script.sh") {
		t.Error("should contain startup script part")
	}
	if !strings.Contains(result, "text/x-shellscript") {
		t.Error("startup script should have x-shellscript content type")
	}
	if !strings.Contains(result, "echo hello") {
		t.Error("should contain the user's script content")
	}
	if !strings.Contains(result, "export HOME=/root") {
		t.Error("should wrap script with HOME export")
	}
}

func TestGenerateMIMEMultipart_WithCloudInitConfig(t *testing.T) {
	t.Parallel()
	sshConfig := generateSSHKeysConfig(nil)
	userConfig := "#cloud-config\npackages:\n  - vim"
	result := generateMIMEMultipart(sshConfig, "", userConfig, false, nil, nil)

	if !strings.Contains(result, "user-config.cfg") {
		t.Error("should contain user config part")
	}
	if !strings.Contains(result, "packages:") {
		t.Error("should contain user cloud-init content")
	}
}

func TestGenerateMIMEMultipart_WithExpose(t *testing.T) {
	t.Setenv("FRP_AUTH_TOKEN", "test-token")

	sshConfig := generateSSHKeysConfig(nil)
	port := 8080
	subdomain := "my-app"
	result := generateMIMEMultipart(sshConfig, "", "", false, &port, &subdomain)

	if !strings.Contains(result, "frpc-config.cfg") {
		t.Error("should contain frpc config part when expose is set")
	}
	if strings.Contains(result, "completion-marker.cfg") {
		t.Error("should NOT contain separate completion marker when expose is set")
	}
}

func TestGenerateMIMEMultipart_AllFields(t *testing.T) {
	t.Setenv("FRP_AUTH_TOKEN", "test-token")

	sshKeys := []string{"ssh-rsa AAAA... user@example.com"}
	sshConfig := generateSSHKeysConfig(sshKeys)
	port := 3000
	subdomain := "all-fields"
	result := generateMIMEMultipart(sshConfig, "#!/bin/bash\necho all", "#cloud-config\npackages:\n  - curl", true, &port, &subdomain)

	expected := []string{
		"ssh-config.cfg",
		"uvacompute-base.cfg",
		"uvacompute-cuda.cfg",
		"frpc-config.cfg",
		"startup-script.sh",
		"user-config.cfg",
	}
	for _, part := range expected {
		if !strings.Contains(result, part) {
			t.Errorf("should contain %s", part)
		}
	}

	if !strings.Contains(result, "--==CLOUDCONFIG_BOUNDARY==--") {
		t.Error("should end with boundary terminator")
	}
}

func TestGenerateMIMEMultipart_BoundaryStructure(t *testing.T) {
	t.Parallel()
	sshConfig := generateSSHKeysConfig(nil)
	result := generateMIMEMultipart(sshConfig, "", "", false, nil, nil)

	if !strings.HasPrefix(result, "Content-Type: multipart/mixed") {
		t.Error("should start with Content-Type header")
	}

	boundary := "==CLOUDCONFIG_BOUNDARY=="
	startBoundaries := strings.Count(result, "--"+boundary+"\n")
	endBoundary := strings.Count(result, "--"+boundary+"--")

	if startBoundaries < 3 {
		t.Errorf("expected at least 3 part boundaries, got %d", startBoundaries)
	}
	if endBoundary != 1 {
		t.Errorf("expected exactly 1 end boundary, got %d", endBoundary)
	}
}

func TestGenerateSSHKeysConfig(t *testing.T) {
	t.Parallel()

	t.Run("single key", func(t *testing.T) {
		result := generateSSHKeysConfig([]string{"ssh-rsa AAAA..."})
		if !strings.Contains(result, "#cloud-config") {
			t.Error("should start with #cloud-config")
		}
		if !strings.Contains(result, "ssh-rsa AAAA...") {
			t.Error("should contain the SSH key")
		}
		if !strings.Contains(result, "ssh_pwauth: false") {
			t.Error("should disable password auth")
		}
	})

	t.Run("multiple keys", func(t *testing.T) {
		keys := []string{"ssh-rsa key1", "ssh-ed25519 key2"}
		result := generateSSHKeysConfig(keys)
		if !strings.Contains(result, "ssh-rsa key1") {
			t.Error("should contain first key")
		}
		if !strings.Contains(result, "ssh-ed25519 key2") {
			t.Error("should contain second key")
		}
	})

	t.Run("no keys", func(t *testing.T) {
		result := generateSSHKeysConfig(nil)
		if !strings.Contains(result, "ssh_authorized_keys:") {
			t.Error("should still have authorized_keys section")
		}
	})
}

func TestGenerateCloudInitUserData(t *testing.T) {
	t.Setenv("FRP_AUTH_TOKEN", "test-token")

	result := generateCloudInitUserData([]string{"ssh-rsa AAAA..."}, "", "", false, nil, nil)

	if !strings.Contains(result, "multipart/mixed") {
		t.Error("should produce MIME multipart output")
	}
	if !strings.Contains(result, "ssh-rsa AAAA...") {
		t.Error("should include SSH keys")
	}
}
