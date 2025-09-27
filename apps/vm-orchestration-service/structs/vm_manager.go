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

type VMManager struct {
	mu     sync.Mutex
	vmMap  map[string]VMState
	limits VMResourceLimits
}

func NewVMManager(limits VMResourceLimits) *VMManager {
	return &VMManager{
		mu:     sync.Mutex{},
		vmMap:  make(map[string]VMState),
		limits: limits,
	}
}

func (vm *VMManager) CreateVM(req VMCreationRequest) (string, error) {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	if err := vm.checkResourceAvailability(req); err != nil {
		return "", err
	}

	vmId := uuid.New().String()
	vm.vmMap[vmId] = VMState{
		Id:           vmId,
		UserId:       req.UserId,
		CreationTime: time.Now(),
		Cpus:         IntOrDefault(req.Cpus, DefaultCpus),
		Ram:          IntOrDefault(req.Ram, DefaultRam),
		Disk:         IntOrDefault(req.Disk, DefaultDisk),
		Gpus:         IntOrDefault(req.Gpus, DefaultGpus),
		GPUType:      GpuTypeOrDefault(req.GpuType, DefaultGpuType),
		Status:       VM_STATUS_CREATING,
	}

	return vmId, nil
}

func (vm *VMManager) DeleteVM(vmId string) {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	delete(vm.vmMap, vmId)
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
