package structs

import (
	"errors"
	"github.com/google/uuid"
	"sync"
	"time"
)

type VMManager struct {
	mu    sync.Mutex
	vmMap map[string]VMState
}

func NewVMManager() *VMManager {
	return &VMManager{
		mu:    sync.Mutex{},
		vmMap: make(map[string]VMState),
	}
}

// CreateVM handles the full VM creation process
func (vm *VMManager) CreateVM(req VMCreationRequest) (string, error) {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	// 1. Check if we have available resources
	if !vm.hasAvailableResources(req) {
		return "", errors.New("insufficient resources available")
	}

	// 2. Generate VM ID (Incus integration will be called from handler)
	vmId := uuid.New().String()

	// 3. Update internal state
	vm.vmMap[vmId] = VMState{
		Id:           vmId,
		UserId:       req.UserId,
		CreationTime: time.Now(),
		Cpus:         *req.Cpus,
		Ram:          *req.Ram,
		Disk:         *req.Disk,
		Gpus:         req.Gpus,
		GPUType:      *req.GpuType,
		Status:       VM_STATUS_CREATING,
	}

	return vmId, nil
}

// GetVM retrieves a VM by ID
func (vm *VMManager) GetVM(vmId string) (VMState, bool) {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	vmState, exists := vm.vmMap[vmId]
	return vmState, exists
}

// ListVMs returns all VMs for a user
func (vm *VMManager) ListVMs(userId string) []VMState {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	var userVMs []VMState
	for _, vmState := range vm.vmMap {
		if vmState.UserId == userId {
			userVMs = append(userVMs, vmState)
		}
	}
	return userVMs
}

// UpdateVMStatus updates the status of a VM
func (vm *VMManager) UpdateVMStatus(vmId string, status VMStatus) error {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	vmState, exists := vm.vmMap[vmId]
	if !exists {
		return errors.New("VM not found")
	}

	vmState.Status = status
	vm.vmMap[vmId] = vmState
	return nil
}

// DeleteVM removes a VM from tracking
func (vm *VMManager) DeleteVM(vmId string) error {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	if _, exists := vm.vmMap[vmId]; !exists {
		return errors.New("VM not found")
	}

	delete(vm.vmMap, vmId)
	return nil
}

// hasAvailableResources checks if we have enough resources for the request
func (vm *VMManager) hasAvailableResources(req VMCreationRequest) bool {
	// TODO: Implement actual resource checking logic
	// For now, just return true
	// In the future, this would check:
	// - Total CPU allocation vs available
	// - Total RAM allocation vs available
	// - Total GPU allocation vs available
	// - Disk space availability

	totalCpus := vm.getTotalAllocatedCPUs()
	totalRam := vm.getTotalAllocatedRAM()
	totalGpus := vm.getTotalAllocatedGPUs()

	// Example limits (you'd configure these)
	maxCpus := 64
	maxRam := 256 // GB
	maxGpus := 4

	requestCpus := *req.Cpus
	requestRam := *req.Ram
	requestGpus := req.Gpus

	return (totalCpus+requestCpus <= maxCpus) &&
		(totalRam+requestRam <= maxRam) &&
		(totalGpus+requestGpus <= maxGpus)
}

// getTotalAllocatedCPUs returns total CPUs currently allocated
func (vm *VMManager) getTotalAllocatedCPUs() int {
	total := 0
	for _, vmState := range vm.vmMap {
		if vmState.Status == VM_STATUS_RUNNING || vmState.Status == VM_STATUS_CREATING {
			total += vmState.Cpus
		}
	}
	return total
}

// getTotalAllocatedRAM returns total RAM currently allocated
func (vm *VMManager) getTotalAllocatedRAM() int {
	total := 0
	for _, vmState := range vm.vmMap {
		if vmState.Status == VM_STATUS_RUNNING || vmState.Status == VM_STATUS_CREATING {
			total += vmState.Ram
		}
	}
	return total
}

// getTotalAllocatedGPUs returns total GPUs currently allocated
func (vm *VMManager) getTotalAllocatedGPUs() int {
	total := 0
	for _, vmState := range vm.vmMap {
		if vmState.Status == VM_STATUS_RUNNING || vmState.Status == VM_STATUS_CREATING {
			total += vmState.Gpus
		}
	}
	return total
}
