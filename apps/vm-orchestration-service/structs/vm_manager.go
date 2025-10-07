package structs

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
)

type VMResourceLimits struct {
	MaxCpus int
	MaxRam  int
	MaxGpus int
}

type IncusProvider interface {
	CreateVM(vmId string, cpus, ram, disk, gpus int) error
	DestroyVM(vmId string) error
	GetVMStatus(vmId string) (string, error)
	GetVMInfo(vmId string) (*IncusVMInfo, error)
}

type VMManager struct {
	mu            sync.Mutex
	vmMap         map[string]VMState
	limits        VMResourceLimits
	incusProvider IncusProvider
}

func NewVMManager(limits VMResourceLimits, incusProvider IncusProvider) *VMManager {
	return &VMManager{
		mu:            sync.Mutex{},
		vmMap:         make(map[string]VMState),
		limits:        limits,
		incusProvider: incusProvider,
	}
}

func (vm *VMManager) CreateVM(req VMCreationRequest) (string, error) {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	if err := vm.checkResourceAvailability(req); err != nil {
		return "", err
	}

	vmId := uuid.New().String()

	cpus := IntOrDefault(req.Cpus, DefaultCpus)
	ram := IntOrDefault(req.Ram, DefaultRam)
	disk := IntOrDefault(req.Disk, DefaultDisk)
	gpus := IntOrDefault(req.Gpus, DefaultGpus)
	gpuType := GpuTypeOrDefault(req.GpuType, DefaultGpuType)

	vm.vmMap[vmId] = VMState{
		Id:           vmId,
		UserId:       req.UserId,
		CreationTime: time.Now(),
		Cpus:         cpus,
		Ram:          ram,
		Disk:         disk,
		Gpus:         gpus,
		GPUType:      gpuType,
		Status:       VM_STATUS_CREATING,
	}

	incusErr := vm.incusProvider.CreateVM(vmId, cpus, ram, disk, gpus)

	if incusErr != nil {
		delete(vm.vmMap, vmId)
		return "", fmt.Errorf("failed to create VM in Incus: %w", incusErr)
	}

	vmState := vm.vmMap[vmId]
	vmState.Status = VM_STATUS_RUNNING
	vm.vmMap[vmId] = vmState

	return vmId, nil
}

func (vm *VMManager) GetVM(vmId string) (VMState, bool) {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	vmState, exists := vm.vmMap[vmId]
	return vmState, exists
}

func (vm *VMManager) DeleteVM(vmId string) error {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	_, exists := vm.vmMap[vmId]
	if !exists {
		return fmt.Errorf("VM %s not found", vmId)
	}

	vmState := vm.vmMap[vmId]
	vmState.Status = VM_STATUS_DELETING
	vm.vmMap[vmId] = vmState

	incusErr := vm.incusProvider.DestroyVM(vmId)
	if incusErr != nil {
		return fmt.Errorf("failed to destroy VM in Incus: %w", incusErr)
	}

	vmState = vm.vmMap[vmId]
	vmState.Status = VM_STATUS_DELETED
	vm.vmMap[vmId] = vmState

	delete(vm.vmMap, vmId)
	return nil
}

func (vm *VMManager) checkResourceAvailability(req VMCreationRequest) error {
	var totalCpus, totalRam, totalGpus int

	for _, vmState := range vm.vmMap {
		if vmState.Status == VM_STATUS_RUNNING || vmState.Status == VM_STATUS_CREATING {
			totalCpus += vmState.Cpus
			totalRam += vmState.Ram
			totalGpus += vmState.Gpus
		}
	}

	requestCpus := IntOrDefault(req.Cpus, DefaultCpus)
	requestRam := IntOrDefault(req.Ram, DefaultRam)
	requestGpus := IntOrDefault(req.Gpus, DefaultGpus)

	if totalCpus+requestCpus > vm.limits.MaxCpus {
		return fmt.Errorf("insufficient CPU resources: requested %d vCPUs, %d already allocated, limit is %d",
			requestCpus, totalCpus, vm.limits.MaxCpus)
	}

	if totalRam+requestRam > vm.limits.MaxRam {
		return fmt.Errorf("insufficient RAM: requested %d GiB, %d already allocated, limit is %d GiB",
			requestRam, totalRam, vm.limits.MaxRam)
	}

	if totalGpus+requestGpus > vm.limits.MaxGpus {
		return fmt.Errorf("insufficient GPU resources: requested %d GPUs, %d already allocated, limit is %d",
			requestGpus, totalGpus, vm.limits.MaxGpus)
	}

	return nil
}
