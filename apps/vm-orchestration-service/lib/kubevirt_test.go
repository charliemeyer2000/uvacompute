package lib

import (
	"strings"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestDefaultKubeVirtConfig(t *testing.T) {
	config := DefaultKubeVirtConfig()

	if config.Namespace != "uvacompute" {
		t.Errorf("Expected default namespace 'uvacompute', got '%s'", config.Namespace)
	}

	if config.VMImageCPU == "" {
		t.Error("Expected VMImageCPU to have a default value")
	}

	if config.VMImageGPU == "" {
		t.Error("Expected VMImageGPU to have a default value")
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
		disk           int
		gpus           int
		image          string
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
			disk:           64,
			gpus:           0,
			image:          "test-image:latest",
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
			disk:           128,
			gpus:           1,
			image:          "gpu-image:latest",
			cloudInit:      "#cloud-config\n",
			expectGPU:      true,
			expectedCores:  4,
			expectedMemory: "16Gi",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			vm := adapter.buildVMObject(tt.vmId, tt.cpus, tt.ram, tt.disk, tt.gpus, tt.image, tt.cloudInit)

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

			gpus, found, _ := unstructured.NestedSlice(devices, "gpus")
			if tt.expectGPU {
				if !found || len(gpus) == 0 {
					t.Error("Expected GPU devices")
				}
			} else {
				if found && len(gpus) > 0 {
					t.Error("Did not expect GPU devices")
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

	cloudInit := `#cloud-config
users:
  - name: root
    ssh_authorized_keys:
      - ssh-rsa AAAAB3... user@example.com`

	vm := adapter.buildVMObject("test-vm", 2, 8, 64, 0, "test-image", cloudInit)

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
				userData, found, _ := unstructured.NestedString(cloudInitNoCloud, "userData")
				if found && strings.Contains(userData, "#cloud-config") {
					foundCloudInit = true
				}
			}
		}
	}

	if !foundCloudInit {
		t.Error("Expected cloudinit volume with userData")
	}
}

func TestBuildVMObjectGPUDevices(t *testing.T) {
	config := DefaultKubeVirtConfig()
	adapter := &KubeVirtAdapter{
		namespace: config.Namespace,
		config:    config,
	}

	vm := adapter.buildVMObject("test-vm", 4, 16, 64, 2, "gpu-image", "#cloud-config")

	spec, _, _ := unstructured.NestedMap(vm.Object, "spec")
	template, _, _ := unstructured.NestedMap(spec, "template")
	templateSpec, _, _ := unstructured.NestedMap(template, "spec")
	domain, _, _ := unstructured.NestedMap(templateSpec, "domain")
	devices, _, _ := unstructured.NestedMap(domain, "devices")
	gpus, found, _ := unstructured.NestedSlice(devices, "gpus")

	if !found {
		t.Fatal("Expected GPUs in devices")
	}

	if len(gpus) != 2 {
		t.Errorf("Expected 2 GPU devices, got %d", len(gpus))
	}

	for i, gpu := range gpus {
		gpuMap, ok := gpu.(map[string]interface{})
		if !ok {
			t.Fatalf("GPU %d is not a map", i)
		}

		deviceName, _ := gpuMap["deviceName"].(string)
		if deviceName != "nvidia.com/gpu" {
			t.Errorf("GPU %d: expected deviceName 'nvidia.com/gpu', got '%s'", i, deviceName)
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

