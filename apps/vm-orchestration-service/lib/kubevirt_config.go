package lib

import (
	"os"
)

type KubeVirtConfig struct {
	Namespace           string
	VMImageCPU          string
	VMImageGPU          string
	DefaultStorageClass string
	KubeconfigPath      string
}

func DefaultKubeVirtConfig() KubeVirtConfig {
	return KubeVirtConfig{
		Namespace:           getEnvOrDefault("KUBEVIRT_NAMESPACE", "uvacompute"),
		VMImageCPU:          getEnvOrDefault("VM_IMAGE_CPU", "docker.io/kubevirt/fedora-cloud-container-disk-demo:latest"),
		VMImageGPU:          getEnvOrDefault("VM_IMAGE_GPU", "docker.io/kubevirt/fedora-cloud-container-disk-demo:latest"),
		DefaultStorageClass: getEnvOrDefault("VM_STORAGE_CLASS", ""),
		KubeconfigPath:      getEnvOrDefault("KUBECONFIG", ""),
	}
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
