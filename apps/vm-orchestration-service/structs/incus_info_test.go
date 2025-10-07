package structs

import (
	"testing"
)

func TestParseIncusInfo(t *testing.T) {
	yamlData := []byte(`Name: first
Description: 
Status: RUNNING
Type: container
Architecture: x86_64
PID: 1276
Created: 2025/10/06 05:49 UTC
Last Used: 2025/10/06 05:49 UTC
Started: 2025/10/06 05:49 UTC

Resources:
  Processes: 12
  Disk usage:
    root: 3.55MiB
  CPU usage:
    CPU usage (in seconds): 4
  Memory usage:
    Memory (current): 47.22MiB
  Network usage:
    eth0:
      Type: broadcast
      State: UP
      Host interface: veth74fb253e
      MAC address: 10:66:6a:f4:b8:cf
      MTU: 1500
      Bytes received: 3.14kB
      Bytes sent: 2.61kB
      Packets received: 23
      Packets sent: 28
      IP addresses:
        inet:  10.21.232.85/24 (global)
        inet6: fd42:71f7:53e5:ddb5:1266:6aff:fef4:b8cf/64 (global)
        inet6: fe80::1266:6aff:fef4:b8cf/64 (link)
    lo:
      Type: loopback
      State: UP
      MTU: 65536
      Bytes received: 0B
      Bytes sent: 0B
      Packets received: 0
      Packets sent: 0
      IP addresses:
        inet:  127.0.0.1/8 (local)
        inet6: ::1/128 (local)
`)

	info, err := ParseIncusInfo(yamlData)
	if err != nil {
		t.Fatalf("Failed to parse YAML: %v", err)
	}

	if info.Name != "first" {
		t.Errorf("Expected Name to be 'first', got '%s'", info.Name)
	}

	if info.Status != "RUNNING" {
		t.Errorf("Expected Status to be 'RUNNING', got '%s'", info.Status)
	}

	if info.Type != "container" {
		t.Errorf("Expected Type to be 'container', got '%s'", info.Type)
	}

	if info.Architecture != "x86_64" {
		t.Errorf("Expected Architecture to be 'x86_64', got '%s'", info.Architecture)
	}

	if info.PID != 1276 {
		t.Errorf("Expected PID to be 1276, got %d", info.PID)
	}

	if info.Resources == nil {
		t.Fatal("Expected Resources to be non-nil")
	}

	if info.Resources.Processes != 12 {
		t.Errorf("Expected Processes to be 12, got %d", info.Resources.Processes)
	}

	if info.Resources.DiskUsage == nil {
		t.Fatal("Expected DiskUsage to be non-nil")
	}

	rootDisk, exists := info.Resources.DiskUsage["root"]
	if !exists {
		t.Error("Expected 'root' disk to exist in DiskUsage")
	}
	if rootDisk != "3.55MiB" {
		t.Errorf("Expected root disk to be '3.55MiB', got '%s'", rootDisk)
	}

	if info.Resources.CPUUsage == nil {
		t.Fatal("Expected CPUUsage to be non-nil")
	}

	if info.Resources.CPUUsage.CPUUsageSeconds != 4 {
		t.Errorf("Expected CPUUsageSeconds to be 4, got %d", info.Resources.CPUUsage.CPUUsageSeconds)
	}

	if info.Resources.MemoryUsage == nil {
		t.Fatal("Expected MemoryUsage to be non-nil")
	}

	if info.Resources.MemoryUsage.MemoryCurrent != "47.22MiB" {
		t.Errorf("Expected MemoryCurrent to be '47.22MiB', got '%s'", info.Resources.MemoryUsage.MemoryCurrent)
	}

	if info.Resources.NetworkUsage == nil {
		t.Fatal("Expected NetworkUsage to be non-nil")
	}

	eth0, exists := info.Resources.NetworkUsage["eth0"]
	if !exists {
		t.Fatal("Expected 'eth0' interface to exist in NetworkUsage")
	}

	if eth0.Type != "broadcast" {
		t.Errorf("Expected eth0 Type to be 'broadcast', got '%s'", eth0.Type)
	}

	if eth0.State != "UP" {
		t.Errorf("Expected eth0 State to be 'UP', got '%s'", eth0.State)
	}

	if eth0.HostInterface != "veth74fb253e" {
		t.Errorf("Expected eth0 HostInterface to be 'veth74fb253e', got '%s'", eth0.HostInterface)
	}

	if eth0.MACAddress != "10:66:6a:f4:b8:cf" {
		t.Errorf("Expected eth0 MACAddress to be '10:66:6a:f4:b8:cf', got '%s'", eth0.MACAddress)
	}

	if eth0.MTU != 1500 {
		t.Errorf("Expected eth0 MTU to be 1500, got %d", eth0.MTU)
	}

	if eth0.PacketsReceived != 23 {
		t.Errorf("Expected eth0 PacketsReceived to be 23, got %d", eth0.PacketsReceived)
	}

	if eth0.PacketsSent != 28 {
		t.Errorf("Expected eth0 PacketsSent to be 28, got %d", eth0.PacketsSent)
	}

	lo, exists := info.Resources.NetworkUsage["lo"]
	if !exists {
		t.Fatal("Expected 'lo' interface to exist in NetworkUsage")
	}

	if lo.Type != "loopback" {
		t.Errorf("Expected lo Type to be 'loopback', got '%s'", lo.Type)
	}

	if lo.MTU != 65536 {
		t.Errorf("Expected lo MTU to be 65536, got %d", lo.MTU)
	}

	t.Log("All tests passed successfully!")
}

func TestParseIncusInfoMinimal(t *testing.T) {
	yamlData := []byte(`Name: minimal-vm
Status: STOPPED
Type: virtual-machine
Architecture: x86_64
Created: 2025/10/06 06:00 UTC
Last Used: 1969/12/31 19:00 EST
`)

	info, err := ParseIncusInfo(yamlData)
	if err != nil {
		t.Fatalf("Failed to parse minimal YAML: %v", err)
	}

	if info.Name != "minimal-vm" {
		t.Errorf("Expected Name to be 'minimal-vm', got '%s'", info.Name)
	}

	if info.Status != "STOPPED" {
		t.Errorf("Expected Status to be 'STOPPED', got '%s'", info.Status)
	}

	if info.PID != 0 {
		t.Errorf("Expected PID to be 0 for stopped instance, got %d", info.PID)
	}

	if info.Resources != nil {
		t.Error("Expected Resources to be nil for stopped instance")
	}

	if info.Started != "" {
		t.Errorf("Expected Started to be empty for stopped instance, got '%s'", info.Started)
	}

	if info.OperatingSystem != nil {
		t.Error("Expected OperatingSystem to be nil for stopped instance")
	}

	t.Log("Minimal test passed successfully!")
}

func TestParseIncusInfoRealRunningContainer(t *testing.T) {
	// Real output from: incus info test-container
	yamlData := []byte(`Name: test-container
Status: RUNNING
Type: container
Architecture: x86_64
PID: 7991
Created: 2025/10/07 19:09 EDT
Last Used: 2025/10/07 19:09 EDT

Resources:
  Processes: 13
  CPU usage:
    CPU usage (in seconds): 0
  Memory usage:
    Memory (current): 29.06MiB
  Network usage:
    eth0:
      Type: broadcast
      State: UP
      Host interface: veth30e0ca59
      MAC address: 00:16:3e:b1:91:7c
      MTU: 1500
      Bytes received: 2.07kB
      Bytes sent: 1.84kB
      Packets received: 19
      Packets sent: 19
      IP addresses:
        inet:  10.230.191.228/24 (global)
        inet6: fd42:84d:dd4b:ab6b:216:3eff:feb1:917c/64 (global)
        inet6: fe80::216:3eff:feb1:917c/64 (link)
    lo:
      Type: loopback
      State: UP
      MTU: 65536
      Bytes received: 0B
      Bytes sent: 0B
      Packets received: 0
      Packets sent: 0
      IP addresses:
        inet:  127.0.0.1/8 (local)
        inet6: ::1/128 (local)
`)

	info, err := ParseIncusInfo(yamlData)
	if err != nil {
		t.Fatalf("Failed to parse real running container YAML: %v", err)
	}

	// Validate basic fields
	if info.Name != "test-container" {
		t.Errorf("Expected Name to be 'test-container', got '%s'", info.Name)
	}

	if info.Status != "RUNNING" {
		t.Errorf("Expected Status to be 'RUNNING', got '%s'", info.Status)
	}

	if info.Type != "container" {
		t.Errorf("Expected Type to be 'container', got '%s'", info.Type)
	}

	if info.Architecture != "x86_64" {
		t.Errorf("Expected Architecture to be 'x86_64', got '%s'", info.Architecture)
	}

	if info.PID != 7991 {
		t.Errorf("Expected PID to be 7991, got %d", info.PID)
	}

	// Validate Resources
	if info.Resources == nil {
		t.Fatal("Expected Resources to be non-nil for running container")
	}

	if info.Resources.Processes != 13 {
		t.Errorf("Expected Processes to be 13, got %d", info.Resources.Processes)
	}

	// Validate CPU usage
	if info.Resources.CPUUsage == nil {
		t.Fatal("Expected CPUUsage to be non-nil")
	}

	if info.Resources.CPUUsage.CPUUsageSeconds != 0 {
		t.Errorf("Expected CPUUsageSeconds to be 0, got %d", info.Resources.CPUUsage.CPUUsageSeconds)
	}

	// Validate Memory usage
	if info.Resources.MemoryUsage == nil {
		t.Fatal("Expected MemoryUsage to be non-nil")
	}

	if info.Resources.MemoryUsage.MemoryCurrent != "29.06MiB" {
		t.Errorf("Expected MemoryCurrent to be '29.06MiB', got '%s'", info.Resources.MemoryUsage.MemoryCurrent)
	}

	// Validate Network usage
	if info.Resources.NetworkUsage == nil {
		t.Fatal("Expected NetworkUsage to be non-nil")
	}

	eth0, exists := info.Resources.NetworkUsage["eth0"]
	if !exists {
		t.Fatal("Expected 'eth0' interface to exist in NetworkUsage")
	}

	if eth0.Type != "broadcast" {
		t.Errorf("Expected eth0 Type to be 'broadcast', got '%s'", eth0.Type)
	}

	if eth0.State != "UP" {
		t.Errorf("Expected eth0 State to be 'UP', got '%s'", eth0.State)
	}

	if eth0.HostInterface != "veth30e0ca59" {
		t.Errorf("Expected eth0 HostInterface to be 'veth30e0ca59', got '%s'", eth0.HostInterface)
	}

	if eth0.MACAddress != "00:16:3e:b1:91:7c" {
		t.Errorf("Expected eth0 MACAddress to be '00:16:3e:b1:91:7c', got '%s'", eth0.MACAddress)
	}

	if eth0.MTU != 1500 {
		t.Errorf("Expected eth0 MTU to be 1500, got %d", eth0.MTU)
	}

	if eth0.PacketsReceived != 19 {
		t.Errorf("Expected eth0 PacketsReceived to be 19, got %d", eth0.PacketsReceived)
	}

	if eth0.PacketsSent != 19 {
		t.Errorf("Expected eth0 PacketsSent to be 19, got %d", eth0.PacketsSent)
	}

	// Validate loopback interface
	lo, exists := info.Resources.NetworkUsage["lo"]
	if !exists {
		t.Fatal("Expected 'lo' interface to exist in NetworkUsage")
	}

	if lo.Type != "loopback" {
		t.Errorf("Expected lo Type to be 'loopback', got '%s'", lo.Type)
	}

	if lo.MTU != 65536 {
		t.Errorf("Expected lo MTU to be 65536, got %d", lo.MTU)
	}

	t.Log("Real running container test passed successfully!")
}

func TestParseIncusInfoRealStoppedContainer(t *testing.T) {
	// Real output from: incus info test-stopped
	yamlData := []byte(`Name: test-stopped
Status: STOPPED
Type: container
Architecture: x86_64
Created: 2025/10/07 19:10 EDT
Last Used: 1969/12/31 19:00 EST
`)

	info, err := ParseIncusInfo(yamlData)
	if err != nil {
		t.Fatalf("Failed to parse real stopped container YAML: %v", err)
	}

	if info.Name != "test-stopped" {
		t.Errorf("Expected Name to be 'test-stopped', got '%s'", info.Name)
	}

	if info.Status != "STOPPED" {
		t.Errorf("Expected Status to be 'STOPPED', got '%s'", info.Status)
	}

	if info.Type != "container" {
		t.Errorf("Expected Type to be 'container', got '%s'", info.Type)
	}

	if info.PID != 0 {
		t.Errorf("Expected PID to be 0 for stopped container, got %d", info.PID)
	}

	if info.Resources != nil {
		t.Error("Expected Resources to be nil for stopped container")
	}

	t.Log("Real stopped container test passed successfully!")
}
