package structs

import (
	"fmt"
	"log"
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
	CreateVM(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string) error
	DestroyVM(vmId string) error
	GetVMStatus(vmId string) (string, error)
	GetVMInfo(vmId string) (*IncusVMInfo, error)
}

type VMManager struct {
	mu             sync.Mutex
	vmMap          map[string]VMState
	limits         VMResourceLimits
	incusProvider  IncusProvider
	callbackClient CallbackClient
}

func NewVMManager(limits VMResourceLimits, incusProvider IncusProvider, callbackClient CallbackClient) *VMManager {
	return &VMManager{
		mu:             sync.Mutex{},
		vmMap:          make(map[string]VMState),
		limits:         limits,
		incusProvider:  incusProvider,
		callbackClient: callbackClient,
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
	name := StringOrDefault(req.Name, "")

	vm.vmMap[vmId] = VMState{
		Id:           vmId,
		Name:         name,
		UserId:       req.UserId,
		CreationTime: time.Now(),
		Cpus:         cpus,
		Ram:          ram,
		Disk:         disk,
		Gpus:         gpus,
		GPUType:      gpuType,
		Status:       VM_STATUS_CREATING,
	}

	if !IsDevelopment() {
		incusErr := vm.incusProvider.CreateVM(vmId, cpus, ram, disk, gpus, req.SSHPublicKeys)
		if incusErr != nil {
			delete(vm.vmMap, vmId)
			return "", fmt.Errorf("failed to create VM in Incus: %w", incusErr)
		}
	} else {
		log.Printf("[DEV MODE] Skipping Incus VM creation for VM %s", vmId)
	}

	vmState := vm.vmMap[vmId]
	vmState.Status = VM_STATUS_RUNNING
	vm.vmMap[vmId] = vmState

	time.AfterFunc(time.Duration(req.Hours*3600*int(time.Second)), func() {
		log.Printf("VM %s expired, deleting from Incus", vmId)

		if !IsDevelopment() {
			vm.incusProvider.DestroyVM(vmId)
		} else {
			log.Printf("[DEV MODE] Skipping Incus VM deletion for VM %s", vmId)
		}

		vm.mu.Lock()
		vmState := vm.vmMap[vmId]
		vmState.Status = VM_STATUS_DELETED
		vm.vmMap[vmId] = vmState
		delete(vm.vmMap, vmId)
		vm.mu.Unlock()

		// notify in background
		if vm.callbackClient != nil {
			go func() {
				if err := vm.callbackClient.NotifyVMDeleted(vmId); err != nil {
					log.Printf("ERROR: Failed to notify site about VM %s deletion: %v", vmId, err)
				}
			}()
		}
	})

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

	// Only destroy actual Incus VM in production
	if !IsDevelopment() {
		incusErr := vm.incusProvider.DestroyVM(vmId)
		if incusErr != nil {
			return fmt.Errorf("failed to destroy VM in Incus: %w", incusErr)
		}
	} else {
		log.Printf("[DEV MODE] Skipping Incus VM deletion for VM %s", vmId)
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
