package structs

import (
	"sync"
	"time"

	"github.com/google/uuid"
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

func (vm *VMManager) CreateVM(req VMCreationRequest) (string, error) {
	vm.mu.Lock()
	defer vm.mu.Unlock()

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