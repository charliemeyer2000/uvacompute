package structs

import (
	"strings"
	"sync"
	"testing"
)

type MockIncusProvider struct {
	mu          sync.Mutex
	LastSSHKeys []string
}

func (m *MockIncusProvider) CreateVM(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string, statusCallback StatusCallback, startupScript, cloudInitConfig string) error {
	m.mu.Lock()
	m.LastSSHKeys = sshPublicKeys
	m.mu.Unlock()

	statusCallback(VM_STATUS_INITIALIZING)
	statusCallback(VM_STATUS_STARTING)
	statusCallback(VM_STATUS_WAITING_FOR_AGENT)
	statusCallback(VM_STATUS_CONFIGURING)

	return nil
}

func (m *MockIncusProvider) DestroyVM(vmId string) error {
	return nil
}

func (m *MockIncusProvider) GetVMStatus(vmId string) (string, error) {
	return "", nil
}

func (m *MockIncusProvider) GetVMInfo(vmId string) (*IncusVMInfo, error) {
	return &IncusVMInfo{}, nil
}

func (m *MockIncusProvider) ListVMs() ([]IncusListVM, error) {
	return []IncusListVM{}, nil
}

func TestCreateVM(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockIncus := &MockIncusProvider{}
	vm := NewVMManager(limits, mockIncus, nil)

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
	vm := NewVMManager(limits, mockIncus, nil)

	cpus := 4
	ram := 16
	name := "test-vm-2"
	req := VMCreationRequest{
		Hours:  12,
		Name:   &name,
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

	if vmState.Name != "test-vm-2" {
		t.Fatalf("expected name 'test-vm-2', got %s", vmState.Name)
	}
}

func TestDeleteVM(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockIncus := &MockIncusProvider{}
	vm := NewVMManager(limits, mockIncus, nil)

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
	vm := NewVMManager(limits, mockIncus, nil)

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

func TestCreateVMWithSSHKeys(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockIncus := &MockIncusProvider{}
	vm := NewVMManager(limits, mockIncus, nil)

	sshKeys := []string{
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... user@example.com",
		"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... user@example.com",
	}

	req := VMCreationRequest{
		Hours:         24,
		UserId:        "test-user",
		SSHPublicKeys: sshKeys,
	}

	vmId, err := vm.CreateVM(req)
	if err != nil {
		t.Fatalf("CreateVM with SSH keys failed: %v", err)
	}

	if vmId == "" {
		t.Fatal("vmId should not be empty")
	}

	vm.WaitForStatus(vmId, VM_STATUS_RUNNING)

	mockIncus.mu.Lock()
	keysCount := len(mockIncus.LastSSHKeys)
	keysMatch := keysCount == 2
	if keysMatch {
		keysMatch = mockIncus.LastSSHKeys[0] == sshKeys[0] && mockIncus.LastSSHKeys[1] == sshKeys[1]
	}
	mockIncus.mu.Unlock()

	if keysCount != 2 {
		t.Fatalf("expected 2 SSH keys passed to provider, got %d", keysCount)
	}

	if !keysMatch {
		t.Fatal("SSH keys not passed correctly to provider")
	}
}

func TestCreateVMWithoutSSHKeys(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockIncus := &MockIncusProvider{}
	vm := NewVMManager(limits, mockIncus, nil)

	req := VMCreationRequest{
		Hours:         24,
		UserId:        "test-user",
		SSHPublicKeys: []string{},
	}

	vmId, err := vm.CreateVM(req)
	if err != nil {
		t.Fatalf("CreateVM without SSH keys should succeed: %v", err)
	}

	if vmId == "" {
		t.Fatal("vmId should not be empty")
	}

	vm.WaitForStatus(vmId, VM_STATUS_RUNNING)

	mockIncus.mu.Lock()
	keysCount := len(mockIncus.LastSSHKeys)
	mockIncus.mu.Unlock()

	if keysCount != 0 {
		t.Fatalf("expected 0 SSH keys passed to provider, got %d", keysCount)
	}
}

func TestCreateVMWithSingleSSHKey(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockIncus := &MockIncusProvider{}
	vm := NewVMManager(limits, mockIncus, nil)

	sshKey := "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... user@example.com"

	req := VMCreationRequest{
		Hours:         24,
		UserId:        "test-user",
		SSHPublicKeys: []string{sshKey},
	}

	vmId, err := vm.CreateVM(req)
	if err != nil {
		t.Fatalf("CreateVM with single SSH key failed: %v", err)
	}

	if vmId == "" {
		t.Fatal("vmId should not be empty")
	}

	vm.WaitForStatus(vmId, VM_STATUS_RUNNING)

	mockIncus.mu.Lock()
	keysCount := len(mockIncus.LastSSHKeys)
	keyMatch := keysCount == 1 && mockIncus.LastSSHKeys[0] == sshKey
	mockIncus.mu.Unlock()

	if keysCount != 1 {
		t.Fatalf("expected 1 SSH key passed to provider, got %d", keysCount)
	}

	if !keyMatch {
		t.Fatal("SSH key not passed correctly to provider")
	}
}

func TestCreateVMWithSSHKeysAndCustomResources(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockIncus := &MockIncusProvider{}
	vm := NewVMManager(limits, mockIncus, nil)

	cpus := 4
	ram := 16
	name := "ssh-test-vm"
	sshKeys := []string{
		"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... user@example.com",
	}

	req := VMCreationRequest{
		Hours:         24,
		Name:          &name,
		UserId:        "test-user",
		Cpus:          &cpus,
		Ram:           &ram,
		SSHPublicKeys: sshKeys,
	}

	vmId, err := vm.CreateVM(req)
	if err != nil {
		t.Fatalf("CreateVM with SSH keys and custom resources failed: %v", err)
	}

	vmState := vm.WaitForStatus(vmId, VM_STATUS_RUNNING)
	if vmState.Cpus != 4 {
		t.Fatalf("expected 4 CPUs, got %d", vmState.Cpus)
	}

	if vmState.Ram != 16 {
		t.Fatalf("expected 16 GB RAM, got %d", vmState.Ram)
	}

	if vmState.Name != "ssh-test-vm" {
		t.Fatalf("expected name 'ssh-test-vm', got %s", vmState.Name)
	}

	mockIncus.mu.Lock()
	keysCount := len(mockIncus.LastSSHKeys)
	mockIncus.mu.Unlock()

	if keysCount != 1 {
		t.Fatalf("expected 1 SSH key passed to provider, got %d", keysCount)
	}
}
