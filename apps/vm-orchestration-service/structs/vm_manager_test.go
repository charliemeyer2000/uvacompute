package structs

import (
	"context"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
)

type MockVMProvider struct {
	mu          sync.Mutex
	LastSSHKeys []string
}

func (m *MockVMProvider) CreateVM(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string, statusCallback StatusCallback, startupScript, cloudInitConfig string, expose *int, exposeSubdomain *string) error {
	m.mu.Lock()
	m.LastSSHKeys = sshPublicKeys
	m.mu.Unlock()

	statusCallback(VM_STATUS_BOOTING)
	statusCallback(VM_STATUS_PROVISIONING)

	return nil
}

func (m *MockVMProvider) DestroyVM(vmId string) error {
	return nil
}

func (m *MockVMProvider) GetVMStatus(vmId string) (string, error) {
	return "", nil
}

func (m *MockVMProvider) GetVMInfo(vmId string) (*VMInfo, error) {
	return &VMInfo{}, nil
}

func (m *MockVMProvider) ListVMs() ([]ListVM, error) {
	return []ListVM{}, nil
}

func (m *MockVMProvider) HasVfioCapableNode(ctx context.Context) (bool, error) {
	return true, nil // Mock always returns true for tests
}

func (m *MockVMProvider) GetAvailableGPUs(ctx context.Context) (int, error) {
	return 1, nil // Mock always returns 1 available GPU for tests
}

func TestCreateVM(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	req := VMCreationRequest{
		VMId:   uuid.New().String(),
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

	vm.WaitForStatus(vmId, VM_STATUS_READY)

	vmState, exists := vm.GetVM(vmId)
	if !exists {
		t.Fatal("expected VM to exist")
	}

	if vmState.UserId != "test-user" {
		t.Fatalf("expected userId 'test-user', got %s", vmState.UserId)
	}

	if vmState.Cpus != DefaultCpus {
		t.Fatalf("expected %d CPUs, got %d", DefaultCpus, vmState.Cpus)
	}
}

func TestCreateVMWithCustomValues(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	cpus := 4
	ram := 16
	name := "test-vm-2"
	req := VMCreationRequest{
		VMId:   uuid.New().String(),
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

	vm.WaitForStatus(vmId, VM_STATUS_READY)

	vmState, exists := vm.GetVM(vmId)
	if !exists {
		t.Fatal("expected VM to exist")
	}

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
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	req := VMCreationRequest{
		VMId:   uuid.New().String(),
		Hours:  24,
		UserId: "test-user",
	}

	vmId, _ := vm.CreateVM(req)

	vm.WaitForStatus(vmId, VM_STATUS_READY)

	if !vm.HasVM(vmId) {
		t.Fatal("VM should exist before delete")
	}

	err := vm.DeleteVM(vmId)
	if err != nil {
		t.Fatalf("DeleteVM failed: %v", err)
	}

	if vm.HasVM(vmId) {
		t.Fatal("VM should be deleted")
	}
}

func TestResourceLimits(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 4, MaxRam: 8, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	cpus := 4
	req1 := VMCreationRequest{
		VMId:   uuid.New().String(),
		Hours:  24,
		UserId: "test-user",
		Cpus:   &cpus,
	}

	vmId1, err := vm.CreateVM(req1)
	if err != nil {
		t.Fatalf("First VM should succeed: %v", err)
	}

	vm.WaitForStatus(vmId1, VM_STATUS_READY)

	req2 := VMCreationRequest{
		VMId:   uuid.New().String(),
		Hours:  24,
		UserId: "test-user",
		Cpus:   &cpus,
	}
	_, err = vm.CreateVM(req2)
	if err == nil {
		t.Fatal("Second VM should fail due to resource limits")
	}

	if !strings.Contains(err.Error(), "insufficient CPU resources") {
		t.Fatalf("Expected CPU resource limit error, got: %v", err)
	}
}

func TestCreateVMWithSSHKeys(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	sshKeys := []string{
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... user@example.com",
		"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... user@example.com",
	}

	req := VMCreationRequest{
		VMId:          uuid.New().String(),
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

	vm.WaitForStatus(vmId, VM_STATUS_READY)

	mockProvider.mu.Lock()
	keysCount := len(mockProvider.LastSSHKeys)
	keysMatch := keysCount == 2
	if keysMatch {
		keysMatch = mockProvider.LastSSHKeys[0] == sshKeys[0] && mockProvider.LastSSHKeys[1] == sshKeys[1]
	}
	mockProvider.mu.Unlock()

	if keysCount != 2 {
		t.Fatalf("expected 2 SSH keys passed to provider, got %d", keysCount)
	}

	if !keysMatch {
		t.Fatal("SSH keys not passed correctly to provider")
	}
}

func TestCreateVMWithoutSSHKeys(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	req := VMCreationRequest{
		VMId:          uuid.New().String(),
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

	vm.WaitForStatus(vmId, VM_STATUS_READY)

	mockProvider.mu.Lock()
	keysCount := len(mockProvider.LastSSHKeys)
	mockProvider.mu.Unlock()

	if keysCount != 0 {
		t.Fatalf("expected 0 SSH keys passed to provider, got %d", keysCount)
	}
}

func TestCreateVMWithSingleSSHKey(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	sshKey := "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... user@example.com"

	req := VMCreationRequest{
		VMId:          uuid.New().String(),
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

	vm.WaitForStatus(vmId, VM_STATUS_READY)

	mockProvider.mu.Lock()
	keysCount := len(mockProvider.LastSSHKeys)
	keyMatch := keysCount == 1 && mockProvider.LastSSHKeys[0] == sshKey
	mockProvider.mu.Unlock()

	if keysCount != 1 {
		t.Fatalf("expected 1 SSH key passed to provider, got %d", keysCount)
	}

	if !keyMatch {
		t.Fatal("SSH key not passed correctly to provider")
	}
}

func TestCreateVMWithSSHKeysAndCustomResources(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	cpus := 4
	ram := 16
	name := "ssh-test-vm"
	sshKeys := []string{
		"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... user@example.com",
	}

	req := VMCreationRequest{
		VMId:          uuid.New().String(),
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

	vmState := vm.WaitForStatus(vmId, VM_STATUS_READY)
	if vmState.Cpus != 4 {
		t.Fatalf("expected 4 CPUs, got %d", vmState.Cpus)
	}

	if vmState.Ram != 16 {
		t.Fatalf("expected 16 GB RAM, got %d", vmState.Ram)
	}

	if vmState.Name != "ssh-test-vm" {
		t.Fatalf("expected name 'ssh-test-vm', got %s", vmState.Name)
	}

	mockProvider.mu.Lock()
	keysCount := len(mockProvider.LastSSHKeys)
	mockProvider.mu.Unlock()

	if keysCount != 1 {
		t.Fatalf("expected 1 SSH key passed to provider, got %d", keysCount)
	}
}

func TestExtendVM(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	req := VMCreationRequest{
		VMId:   uuid.New().String(),
		Hours:  1,
		UserId: "test-user",
	}

	vmId, err := vm.CreateVM(req)
	if err != nil {
		t.Fatalf("CreateVM failed: %v", err)
	}

	vm.WaitForStatus(vmId, VM_STATUS_READY)

	vmState, _ := vm.GetVM(vmId)
	originalExpiry := vmState.ExpiresAt

	newExpiry, err := vm.ExtendVM(vmId, 2)
	if err != nil {
		t.Fatalf("ExtendVM failed: %v", err)
	}

	if newExpiry <= originalExpiry {
		t.Errorf("new expiry %d should be greater than original %d", newExpiry, originalExpiry)
	}

	// Extension should be ~2 hours (7200000 ms)
	expectedDiff := int64(2 * 60 * 60 * 1000)
	actualDiff := newExpiry - originalExpiry
	// Allow 1 second tolerance
	if actualDiff < expectedDiff-1000 || actualDiff > expectedDiff+1000 {
		t.Errorf("extension diff %d should be ~%d", actualDiff, expectedDiff)
	}
}

func TestExtendVM_NotFound(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	_, err := vm.ExtendVM("nonexistent", 1)
	if err == nil {
		t.Error("ExtendVM should fail for nonexistent VM")
	}
}

func TestExtendVM_TerminalState(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	vmId := "test-terminal"
	vm.SetVMForTest(vmId, VM_STATUS_STOPPED, "")

	_, err := vm.ExtendVM(vmId, 1)
	if err == nil {
		t.Error("ExtendVM should fail for terminal VM")
	}
}

func TestResourceLimits_RAM(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 8, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	ram := 8
	req1 := VMCreationRequest{
		VMId:   uuid.New().String(),
		Hours:  24,
		UserId: "test-user",
		Ram:    &ram,
	}

	vmId1, err := vm.CreateVM(req1)
	if err != nil {
		t.Fatalf("First VM should succeed: %v", err)
	}

	vm.WaitForStatus(vmId1, VM_STATUS_READY)

	req2 := VMCreationRequest{
		VMId:   uuid.New().String(),
		Hours:  24,
		UserId: "test-user",
		Ram:    &ram,
	}
	_, err = vm.CreateVM(req2)
	if err == nil {
		t.Fatal("Second VM should fail due to RAM limits")
	}

	if !strings.Contains(err.Error(), "insufficient RAM") {
		t.Fatalf("Expected RAM resource limit error, got: %v", err)
	}
}

func TestResourceLimits_GPU(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	gpus := 1
	req1 := VMCreationRequest{
		VMId:   uuid.New().String(),
		Hours:  24,
		UserId: "test-user",
		Gpus:   &gpus,
	}

	vmId1, err := vm.CreateVM(req1)
	if err != nil {
		t.Fatalf("First GPU VM should succeed: %v", err)
	}

	vm.WaitForStatus(vmId1, VM_STATUS_READY)

	req2 := VMCreationRequest{
		VMId:   uuid.New().String(),
		Hours:  24,
		UserId: "test-user",
		Gpus:   &gpus,
	}
	_, err = vm.CreateVM(req2)
	if err == nil {
		t.Fatal("Second GPU VM should fail due to GPU limits")
	}

	if !strings.Contains(err.Error(), "insufficient GPU resources") {
		t.Fatalf("Expected GPU resource limit error, got: %v", err)
	}
}

func TestListAllVMs(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	req1 := VMCreationRequest{
		VMId:   uuid.New().String(),
		Hours:  24,
		UserId: "user-1",
	}
	req2 := VMCreationRequest{
		VMId:   uuid.New().String(),
		Hours:  24,
		UserId: "user-2",
	}

	vmId1, _ := vm.CreateVM(req1)
	vmId2, _ := vm.CreateVM(req2)

	vm.WaitForStatus(vmId1, VM_STATUS_READY)
	vm.WaitForStatus(vmId2, VM_STATUS_READY)

	all := vm.ListAllVMs()
	if len(all) != 2 {
		t.Fatalf("expected 2 VMs, got %d", len(all))
	}
	if _, exists := all[vmId1]; !exists {
		t.Error("VM 1 should be in the list")
	}
	if _, exists := all[vmId2]; !exists {
		t.Error("VM 2 should be in the list")
	}
}

func TestAddVMFromExternal(t *testing.T) {
	limits := VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockVMProvider{}
	vm := NewVMManager(limits, mockProvider, nil)

	vmId := "external-vm-1"
	vm.AddVMFromExternal(vmId, VMState{
		Id:     vmId,
		Status: VM_STATUS_READY,
		Cpus:   4,
		Ram:    16,
	})

	if !vm.HasVM(vmId) {
		t.Error("VM should exist after AddVMFromExternal")
	}

	state, exists := vm.GetVM(vmId)
	if !exists {
		t.Fatal("VM should exist")
	}
	if state.Cpus != 4 {
		t.Errorf("expected 4 CPUs, got %d", state.Cpus)
	}

	// Adding same VM again should not overwrite
	vm.AddVMFromExternal(vmId, VMState{
		Id:     vmId,
		Status: VM_STATUS_READY,
		Cpus:   8,
	})

	state, _ = vm.GetVM(vmId)
	if state.Cpus != 4 {
		t.Errorf("expected 4 CPUs (not overwritten), got %d", state.Cpus)
	}
}
