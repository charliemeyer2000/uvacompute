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
	// CDI DataVolume configuration
	VMImageSourceURL  string // Registry URL for CDI to pull from (docker:// prefix)
	StorageAccessMode string // ReadWriteOnce, ReadWriteMany, etc.
}

func DefaultKubeVirtConfig() KubeVirtConfig {
	return KubeVirtConfig{
		Namespace:           getEnvOrDefault("KUBEVIRT_NAMESPACE", "uvacompute"),
		VMImageCPU:          getEnvOrDefault("VM_IMAGE_CPU", "quay.io/containerdisks/ubuntu:22.04"),
		VMImageGPU:          getEnvOrDefault("VM_IMAGE_GPU", "quay.io/containerdisks/ubuntu:22.04"),
		DefaultStorageClass: getEnvOrDefault("VM_STORAGE_CLASS", "local-path"),
		KubeconfigPath:      getEnvOrDefault("KUBECONFIG", ""),
		// CDI uses docker:// prefix for registry sources
		VMImageSourceURL:  getEnvOrDefault("VM_IMAGE_SOURCE_URL", "docker://quay.io/containerdisks/ubuntu:22.04"),
		StorageAccessMode: getEnvOrDefault("VM_STORAGE_ACCESS_MODE", "ReadWriteOnce"),
	}
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
