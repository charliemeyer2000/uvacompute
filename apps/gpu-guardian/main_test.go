package main

import (
	"os"
	"runtime"
	"strconv"
	"testing"
)

func TestDiscoverGpuDevices(t *testing.T) {
	devices := discoverGpuDevices()
	t.Logf("Found %d GPU devices: %v", len(devices), devices)
}

func TestIsK8sProcess(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("Requires /proc filesystem")
	}
	if isK8sProcess(os.Getpid()) {
		t.Error("Current process detected as k8s process")
	}
}

func TestGetCmdline(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("Requires /proc filesystem")
	}
	cmdline := getCmdline(os.Getpid())
	if cmdline == "<unknown>" {
		t.Error("Failed to read cmdline of current process")
	}
	t.Logf("Current process cmdline: %s", cmdline)
}

func TestScanGpuProcesses_NoDevices(t *testing.T) {
	results := scanGpuProcesses([]string{"/dev/nonexistent-gpu-device-12345"})
	if len(results) != 0 {
		t.Errorf("Expected 0 results for non-existent device, got %d", len(results))
	}
}

func TestDiscoverGpuDevices_Filtering(t *testing.T) {
	// Test the filtering logic that discoverGpuDevices uses
	testCases := []struct {
		name string
		want bool
	}{
		{"nvidia0", true},
		{"nvidia1", true},
		{"nvidia12", true},
		{"nvidiactl", false},
		{"nvidia-uvm", false},
		{"nvidia-uvm-tools", false},
		{"nvidia-caps", false},
	}

	for _, tc := range testCases {
		trimmed := tc.name[len("nvidia"):]
		_, err := strconv.Atoi(trimmed)
		isGpu := err == nil
		if isGpu != tc.want {
			t.Errorf("%s: got isGpu=%v, want %v", tc.name, isGpu, tc.want)
		}
	}
}

func TestTriggerScan_NonBlocking(t *testing.T) {
	ch := make(chan struct{}, 1)
	triggerScan(ch)
	triggerScan(ch) // should not block
	<-ch

	select {
	case <-ch:
		t.Error("Channel should be empty after drain")
	default:
	}
}
