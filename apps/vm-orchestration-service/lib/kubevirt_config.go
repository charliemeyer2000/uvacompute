package lib

import (
	"crypto/sha256"
	"fmt"
	"os"
	"strconv"
)

type KubeVirtConfig struct {
	Namespace           string
	DefaultStorageClass string
	KubeconfigPath      string
	VMImageSourceURL    string // CDI source URL for CPU VMs (docker:// for registry, http(s):// for direct download)
	VMImageGPUSourceURL string // CDI source URL for GPU VMs (defaults to VMImageSourceURL)
	StorageAccessMode   string
	GoldenImageSizeGB   int // Size of golden image PVC (default: 4GB)
}

func DefaultKubeVirtConfig() KubeVirtConfig {
	cpuSourceURL := getEnvOrDefault("VM_IMAGE_SOURCE_URL", "https://cloud-images.ubuntu.com/minimal/releases/jammy/release/ubuntu-22.04-minimal-cloudimg-amd64.img")
	return KubeVirtConfig{
		Namespace:           getEnvOrDefault("KUBEVIRT_NAMESPACE", "uvacompute"),
		DefaultStorageClass: getEnvOrDefault("VM_STORAGE_CLASS", "local-path"),
		KubeconfigPath:      getEnvOrDefault("KUBECONFIG", ""),
		VMImageSourceURL:    cpuSourceURL,
		VMImageGPUSourceURL: getEnvOrDefault("VM_IMAGE_GPU_SOURCE_URL", cpuSourceURL),
		StorageAccessMode:   getEnvOrDefault("VM_STORAGE_ACCESS_MODE", "ReadWriteOnce"),
		GoldenImageSizeGB:   getEnvIntOrDefault("GOLDEN_IMAGE_SIZE_GB", 4),
	}
}

func GoldenPVCName(sourceURL string) string {
	h := sha256.Sum256([]byte(sourceURL))
	return fmt.Sprintf("uvacompute-golden-%x", h[:4])
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvIntOrDefault(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if n, err := strconv.Atoi(value); err == nil {
			return n
		}
	}
	return defaultValue
}
