package structs

import (
	"testing"
)

func TestIntOrDefault(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		ptr        *int
		defaultVal int
		expected   int
	}{
		{"nil returns default", nil, 42, 42},
		{"non-nil returns value", intPtr(7), 42, 7},
		{"zero value", intPtr(0), 42, 0},
		{"negative value", intPtr(-1), 42, -1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := IntOrDefault(tt.ptr, tt.defaultVal)
			if got != tt.expected {
				t.Errorf("IntOrDefault() = %d, want %d", got, tt.expected)
			}
		})
	}
}

func TestStringOrDefault(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		ptr        *string
		defaultVal string
		expected   string
	}{
		{"nil returns default", nil, "default", "default"},
		{"non-nil returns value", strPtr("hello"), "default", "hello"},
		{"empty string", strPtr(""), "default", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := StringOrDefault(tt.ptr, tt.defaultVal)
			if got != tt.expected {
				t.Errorf("StringOrDefault() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestGpuTypeOrDefault(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		ptr        *GPUType
		defaultVal GPUType
		expected   GPUType
	}{
		{"nil returns default", nil, GPU_5090, GPU_5090},
		{"non-nil returns value", gpuTypePtr(GPU_5090), "other", GPU_5090},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := GpuTypeOrDefault(tt.ptr, tt.defaultVal)
			if got != tt.expected {
				t.Errorf("GpuTypeOrDefault() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestVMStatus_IsTerminal(t *testing.T) {
	t.Parallel()
	tests := []struct {
		status   VMStatus
		terminal bool
	}{
		{VM_STATUS_STOPPED, true},
		{VM_STATUS_FAILED, true},
		{VM_STATUS_CREATING, false},
		{VM_STATUS_PENDING, false},
		{VM_STATUS_BOOTING, false},
		{VM_STATUS_PROVISIONING, false},
		{VM_STATUS_READY, false},
		{VM_STATUS_STOPPING, false},
		{VM_STATUS_OFFLINE, false},
	}

	for _, tt := range tests {
		t.Run(string(tt.status), func(t *testing.T) {
			t.Parallel()
			if got := tt.status.IsTerminal(); got != tt.terminal {
				t.Errorf("VMStatus(%q).IsTerminal() = %v, want %v", tt.status, got, tt.terminal)
			}
		})
	}
}

func TestJobStatus_IsTerminal(t *testing.T) {
	t.Parallel()
	tests := []struct {
		status   JobStatus
		terminal bool
	}{
		{JOB_STATUS_COMPLETED, true},
		{JOB_STATUS_FAILED, true},
		{JOB_STATUS_CANCELLED, true},
		{JOB_STATUS_PENDING, false},
		{JOB_STATUS_SCHEDULED, false},
		{JOB_STATUS_PULLING, false},
		{JOB_STATUS_RUNNING, false},
		{JOB_STATUS_NODE_OFFLINE, false},
	}

	for _, tt := range tests {
		t.Run(string(tt.status), func(t *testing.T) {
			t.Parallel()
			if got := tt.status.IsTerminal(); got != tt.terminal {
				t.Errorf("JobStatus(%q).IsTerminal() = %v, want %v", tt.status, got, tt.terminal)
			}
		})
	}
}

func TestParseVMInfo_Basic(t *testing.T) {
	t.Parallel()
	yamlData := []byte(`
Name: test-vm
Description: A test VM
Status: Running
Type: virtual-machine
Architecture: x86_64
Created: 2024/01/01 00:00
Last Used: 2024/01/02 00:00
`)

	info, err := ParseVMInfo(yamlData)
	if err != nil {
		t.Fatalf("ParseVMInfo() error = %v", err)
	}

	if info.Name != "test-vm" {
		t.Errorf("Name = %q, want %q", info.Name, "test-vm")
	}
	if info.Status != "Running" {
		t.Errorf("Status = %q, want %q", info.Status, "Running")
	}
	if info.Architecture != "x86_64" {
		t.Errorf("Architecture = %q, want %q", info.Architecture, "x86_64")
	}
}

func TestParseVMInfo_WithOS(t *testing.T) {
	t.Parallel()
	yamlData := []byte(`
Name: test-vm
Status: Running
Type: virtual-machine
Architecture: x86_64
Created: 2024/01/01 00:00
Last Used: 2024/01/02 00:00
Operating System:
  OS: Ubuntu
  OS Version: "22.04"
  Kernel Version: "5.15.0"
  Hostname: test-host
  FQDN: test-host.local
`)

	info, err := ParseVMInfo(yamlData)
	if err != nil {
		t.Fatalf("ParseVMInfo() error = %v", err)
	}

	if info.OperatingSystem == nil {
		t.Fatal("OperatingSystem should not be nil")
	}
	if info.OperatingSystem.OS != "Ubuntu" {
		t.Errorf("OS = %q, want %q", info.OperatingSystem.OS, "Ubuntu")
	}
	if info.OperatingSystem.Hostname != "test-host" {
		t.Errorf("Hostname = %q, want %q", info.OperatingSystem.Hostname, "test-host")
	}
}

func TestParseVMInfo_EmptyInput(t *testing.T) {
	t.Parallel()
	info, err := ParseVMInfo([]byte(""))
	if err != nil {
		t.Fatalf("ParseVMInfo() unexpected error for empty input: %v", err)
	}
	if info.Name != "" {
		t.Errorf("Name = %q, want empty", info.Name)
	}
}

func TestParseVMInfo_InvalidYAML(t *testing.T) {
	t.Parallel()
	_, err := ParseVMInfo([]byte("{{invalid yaml"))
	if err == nil {
		t.Error("ParseVMInfo() expected error for invalid YAML")
	}
}

// helpers
func intPtr(v int) *int          { return &v }
func strPtr(v string) *string    { return &v }
func gpuTypePtr(v GPUType) *GPUType { return &v }
