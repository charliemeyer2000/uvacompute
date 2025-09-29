package structs

import (
	"strings"
	"testing"
)

type MockIncusProvider struct{}

func (m *MockIncusProvider) CreateVM(vmId string, cpus, ram, disk, gpus int) error {
	return nil
}

func (m *MockIncusProvider) DestroyVM(vmId string) error {
	return nil
}

func TestCreateVM(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockIncus := &MockIncusProvider{}
	vm := NewVMManager(limits, mockIncus)

	req := VMCreationRequest{
		Hours:  24,
		UserId: "test-user",
	}

	vmId, err := vm.CreateVM(req)
	if err != nil {
		t.Fatalf("CreateVM failed: %v", err)
	}

	if vmId == "" {
		t.Fatal("vmId should not be empty")
	}

	if len(vm.vmMap) != 1 {
		t.Fatalf("expected 1 VM, got %d", len(vm.vmMap))
	}

	vmState := vm.vmMap[vmId]
	if vmState.UserId != "test-user" {
		t.Fatalf("expected userId 'test-user', got %s", vmState.UserId)
	}

	if vmState.Cpus != DefaultCpus {
		t.Fatalf("expected %d CPUs, got %d", DefaultCpus, vmState.Cpus)
	}
}

func TestCreateVMWithCustomValues(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockIncus := &MockIncusProvider{}
	vm := NewVMManager(limits, mockIncus)

	cpus := 4
	ram := 16
	req := VMCreationRequest{
		Hours:  12,
		UserId: "test-user-2",
		Cpus:   &cpus,
		Ram:    &ram,
	}

	vmId, err := vm.CreateVM(req)
	if err != nil {
		t.Fatalf("CreateVM failed: %v", err)
	}

	vmState := vm.vmMap[vmId]
	if vmState.Cpus != 4 {
		t.Fatalf("expected 4 CPUs, got %d", vmState.Cpus)
	}

	if vmState.Ram != 16 {
		t.Fatalf("expected 16 GB RAM, got %d", vmState.Ram)
	}

	if vmState.Disk != DefaultDisk {
		t.Fatalf("expected default disk %d, got %d", DefaultDisk, vmState.Disk)
	}
}

func TestDeleteVM(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockIncus := &MockIncusProvider{}
	vm := NewVMManager(limits, mockIncus)

	req := VMCreationRequest{
		Hours:  24,
		UserId: "test-user",
	}

	vmId, _ := vm.CreateVM(req)

	if len(vm.vmMap) != 1 {
		t.Fatal("VM should exist before delete")
	}

	err := vm.DeleteVM(vmId)
	if err != nil {
		t.Fatalf("DeleteVM failed: %v", err)
	}

	if len(vm.vmMap) != 0 {
		t.Fatal("VM should be deleted")
	}
}

func TestResourceLimits(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 4, MaxRam: 8, MaxGpus: 1}
	mockIncus := &MockIncusProvider{}
	vm := NewVMManager(limits, mockIncus)

	cpus := 4
	req := VMCreationRequest{
		Hours:  24,
		UserId: "test-user",
		Cpus:   &cpus,
	}

	_, err := vm.CreateVM(req)
	if err != nil {
		t.Fatalf("First VM should succeed: %v", err)
	}

	_, err = vm.CreateVM(req)
	if err == nil {
		t.Fatal("Second VM should fail due to resource limits")
	}

	if !strings.Contains(err.Error(), "insufficient CPU resources") {
		t.Fatalf("Expected CPU resource limit error, got: %v", err)
	}
}
