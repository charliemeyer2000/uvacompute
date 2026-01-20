//go:build integration
// +build integration

package lib

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"

	"vm-orchestration-service/structs"
)

func getIntegrationConfig() KubeVirtConfig {
	config := DefaultKubeVirtConfig()
	config.Namespace = getEnvOrDefault("TEST_NAMESPACE", "uvacompute-test")
	return config
}

func TestKubeVirtAdapterIntegration_Ping(t *testing.T) {
	config := getIntegrationConfig()

	adapter, err := NewKubeVirtAdapter(config)
	if err != nil {
		t.Fatalf("Failed to create adapter: %v", err)
	}

	if err := adapter.Ping(); err != nil {
		t.Fatalf("Ping failed: %v", err)
	}

	t.Log("Successfully connected to Kubernetes cluster")
}

func TestKubeVirtAdapterIntegration_EnsureNamespace(t *testing.T) {
	config := getIntegrationConfig()

	adapter, err := NewKubeVirtAdapter(config)
	if err != nil {
		t.Fatalf("Failed to create adapter: %v", err)
	}

	if err := adapter.EnsureNamespace(); err != nil {
		t.Fatalf("EnsureNamespace failed: %v", err)
	}

	t.Logf("Namespace %s exists", config.Namespace)
}

func TestKubeVirtAdapterIntegration_VMLifecycle(t *testing.T) {
	if os.Getenv("RUN_VM_TESTS") != "true" {
		t.Skip("Skipping VM lifecycle test (set RUN_VM_TESTS=true to run)")
	}

	config := getIntegrationConfig()

	adapter, err := NewKubeVirtAdapter(config)
	if err != nil {
		t.Fatalf("Failed to create adapter: %v", err)
	}

	if err := adapter.EnsureNamespace(); err != nil {
		t.Fatalf("Failed to ensure namespace: %v", err)
	}

	vmId := fmt.Sprintf("test-vm-%d", time.Now().Unix())

	t.Cleanup(func() {
		t.Logf("Cleaning up VM %s", vmId)
		_ = adapter.DestroyVM(vmId)
	})

	var lastStatus structs.VMStatus
	statusCallback := func(status structs.VMStatus) {
		lastStatus = status
		t.Logf("VM status: %s", status)
	}

	sshKeys := []string{"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC test@example.com"}

	t.Logf("Creating VM %s", vmId)
	err = adapter.CreateVM(vmId, 1, 1, 10, 0, sshKeys, statusCallback, "", "")
	if err != nil {
		t.Fatalf("CreateVM failed: %v", err)
	}

	t.Log("VM created, checking status...")

	status, err := adapter.GetVMStatus(vmId)
	if err != nil {
		t.Fatalf("GetVMStatus failed: %v", err)
	}
	t.Logf("VM status from GetVMStatus: %s", status)

	info, err := adapter.GetVMInfo(vmId)
	if err != nil {
		t.Fatalf("GetVMInfo failed: %v", err)
	}
	t.Logf("VM info: Name=%s, Status=%s, Type=%s", info.Name, info.Status, info.Type)

	vms, err := adapter.ListVMs()
	if err != nil {
		t.Fatalf("ListVMs failed: %v", err)
	}

	found := false
	for _, vm := range vms {
		if vm.Name == vmId {
			found = true
			t.Logf("Found VM in list: %+v", vm)
			break
		}
	}
	if !found {
		t.Error("VM not found in ListVMs output")
	}

	t.Log("Destroying VM...")
	err = adapter.DestroyVM(vmId)
	if err != nil {
		t.Fatalf("DestroyVM failed: %v", err)
	}

	t.Log("Verifying VM is deleted...")
	time.Sleep(2 * time.Second)

	_, err = adapter.GetVMStatus(vmId)
	if err == nil {
		t.Error("Expected error when getting status of deleted VM")
	}

	t.Log("VM lifecycle test completed successfully")
}

func TestKubeVirtAdapterIntegration_ListVMs(t *testing.T) {
	config := getIntegrationConfig()

	adapter, err := NewKubeVirtAdapter(config)
	if err != nil {
		t.Fatalf("Failed to create adapter: %v", err)
	}

	vms, err := adapter.ListVMs()
	if err != nil {
		t.Fatalf("ListVMs failed: %v", err)
	}

	t.Logf("Found %d VMs", len(vms))
	for _, vm := range vms {
		t.Logf("  - %s (Status: %s, Type: %s)", vm.Name, vm.Status, vm.Type)
	}
}

func TestKubeVirtAdapterIntegration_WatchVMs(t *testing.T) {
	config := getIntegrationConfig()

	adapter, err := NewKubeVirtAdapter(config)
	if err != nil {
		t.Fatalf("Failed to create adapter: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	events, err := adapter.WatchVMs(ctx)
	if err != nil {
		t.Fatalf("WatchVMs failed: %v", err)
	}

	t.Log("Watch started successfully (will timeout after 5 seconds)")

	eventCount := 0
	for {
		select {
		case event, ok := <-events:
			if !ok {
				t.Log("Watch channel closed")
				return
			}
			eventCount++
			t.Logf("Received event: Type=%s", event.Type)
		case <-ctx.Done():
			t.Logf("Watch completed, received %d events", eventCount)
			return
		}
	}
}

func TestKubeVirtAdapterIntegration_VMWithGPU(t *testing.T) {
	if os.Getenv("RUN_GPU_TESTS") != "true" {
		t.Skip("Skipping GPU test (set RUN_GPU_TESTS=true to run)")
	}

	config := getIntegrationConfig()

	adapter, err := NewKubeVirtAdapter(config)
	if err != nil {
		t.Fatalf("Failed to create adapter: %v", err)
	}

	if err := adapter.EnsureNamespace(); err != nil {
		t.Fatalf("Failed to ensure namespace: %v", err)
	}

	vmId := fmt.Sprintf("test-gpu-vm-%d", time.Now().Unix())

	t.Cleanup(func() {
		t.Logf("Cleaning up GPU VM %s", vmId)
		_ = adapter.DestroyVM(vmId)
	})

	statusCallback := func(status structs.VMStatus) {
		t.Logf("GPU VM status: %s", status)
	}

	sshKeys := []string{"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC test@example.com"}

	t.Logf("Creating GPU VM %s", vmId)
	err = adapter.CreateVM(vmId, 2, 4, 20, 1, sshKeys, statusCallback, "", "")
	if err != nil {
		t.Fatalf("CreateVM with GPU failed: %v", err)
	}

	info, err := adapter.GetVMInfo(vmId)
	if err != nil {
		t.Fatalf("GetVMInfo failed: %v", err)
	}

	t.Logf("GPU VM created: %+v", info)
}

func TestKubeVirtAdapterIntegration_CloudInit(t *testing.T) {
	if os.Getenv("RUN_VM_TESTS") != "true" {
		t.Skip("Skipping cloud-init test (set RUN_VM_TESTS=true to run)")
	}

	config := getIntegrationConfig()

	adapter, err := NewKubeVirtAdapter(config)
	if err != nil {
		t.Fatalf("Failed to create adapter: %v", err)
	}

	if err := adapter.EnsureNamespace(); err != nil {
		t.Fatalf("Failed to ensure namespace: %v", err)
	}

	vmId := fmt.Sprintf("test-cloudinit-vm-%d", time.Now().Unix())

	t.Cleanup(func() {
		t.Logf("Cleaning up VM %s", vmId)
		_ = adapter.DestroyVM(vmId)
	})

	statusCallback := func(status structs.VMStatus) {
		t.Logf("VM status: %s", status)
	}

	sshKeys := []string{
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC user1@example.com",
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD user2@example.com",
	}

	startupScript := `#!/bin/bash
echo "VM started at $(date)" >> /var/log/startup.log
hostname test-vm
`

	customConfig := `packages:
  - htop
  - vim
runcmd:
  - echo "Custom config applied" >> /var/log/cloud-init.log
`

	t.Logf("Creating VM %s with cloud-init", vmId)
	err = adapter.CreateVM(vmId, 1, 2, 10, 0, sshKeys, statusCallback, startupScript, customConfig)
	if err != nil {
		t.Fatalf("CreateVM with cloud-init failed: %v", err)
	}

	info, err := adapter.GetVMInfo(vmId)
	if err != nil {
		t.Fatalf("GetVMInfo failed: %v", err)
	}

	t.Logf("VM with cloud-init created: Name=%s, Status=%s", info.Name, info.Status)
}

func TestKubeVirtAdapterIntegration_VerifyKubeVirtInstalled(t *testing.T) {
	config := getIntegrationConfig()

	adapter, err := NewKubeVirtAdapter(config)
	if err != nil {
		t.Fatalf("Failed to create adapter: %v", err)
	}

	ctx := context.Background()

	kubevirtGVR := schema.GroupVersionResource{
		Group:    "kubevirt.io",
		Version:  "v1",
		Resource: "kubevirts",
	}

	_, err = adapter.client.Resource(kubevirtGVR).Namespace("kubevirt").List(ctx, metav1.ListOptions{})
	if err != nil {
		t.Logf("Warning: KubeVirt may not be installed: %v", err)
		t.Skip("KubeVirt not installed in cluster")
	}

	t.Log("KubeVirt is installed in the cluster")
}
