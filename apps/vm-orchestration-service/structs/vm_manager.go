package structs

import (
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type VMResourceLimits struct {
	MaxCpus int
	MaxRam  int
	MaxGpus int
}

type StatusCallback func(status VMStatus)

type IncusProvider interface {
	CreateVM(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string, statusCallback StatusCallback) error
	DestroyVM(vmId string) error
	GetVMStatus(vmId string) (string, error)
	GetVMInfo(vmId string) (*IncusVMInfo, error)
	ListVMs() ([]IncusListVM, error)
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

	go vm.createVMAsync(vmId, cpus, ram, disk, gpus, req.SSHPublicKeys, req.Hours)

	return vmId, nil
}

func (vm *VMManager) createVMAsync(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string, hours int) {
	statusCallback := func(status VMStatus) {
		vm.UpdateVMStatus(vmId, status, "")
	}

	if !IsDevelopment() {
		incusErr := vm.incusProvider.CreateVM(vmId, cpus, ram, disk, gpus, sshPublicKeys, statusCallback)
		if incusErr != nil {
			log.Printf("ERROR: Failed to create VM %s: %v", vmId, incusErr)
			vm.UpdateVMStatus(vmId, VM_STATUS_FAILED, incusErr.Error())
			return
		}
	} else {
		log.Printf("[DEV MODE] Skipping Incus VM creation for VM %s", vmId)
		statusCallback(VM_STATUS_INITIALIZING)
		time.Sleep(1 * time.Second)
		statusCallback(VM_STATUS_STARTING)
		time.Sleep(1 * time.Second)
		statusCallback(VM_STATUS_WAITING_FOR_AGENT)
		time.Sleep(1 * time.Second)
		statusCallback(VM_STATUS_CONFIGURING)
		time.Sleep(1 * time.Second)
	}

	vm.UpdateVMStatus(vmId, VM_STATUS_RUNNING, "")

	time.AfterFunc(time.Duration(hours*3600*int(time.Second)), func() {
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

		if vm.callbackClient != nil {
			go func() {
				if err := vm.callbackClient.NotifyVMDeleted(vmId); err != nil {
					log.Printf("ERROR: Failed to notify site about VM %s deletion: %v", vmId, err)
				}
			}()
		}
	})
}

func (vm *VMManager) GetVM(vmId string) (VMState, bool) {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	vmState, exists := vm.vmMap[vmId]
	return vmState, exists
}

func (vm *VMManager) WaitForStatus(vmId string, targetStatus VMStatus) VMState {
	for {
		vm.mu.Lock()
		vmState, exists := vm.vmMap[vmId]
		if exists && vmState.Status == targetStatus {
			vm.mu.Unlock()
			return vmState
		}
		vm.mu.Unlock()
		time.Sleep(1 * time.Millisecond)
	}
}

func (vm *VMManager) UpdateVMStatus(vmId string, status VMStatus, errorMessage string) {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	if vmState, exists := vm.vmMap[vmId]; exists {
		vmState.Status = status
		vmState.ErrorMessage = errorMessage
		vm.vmMap[vmId] = vmState
	}
}

func (vm *VMManager) DeleteVM(vmId string) error {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	_, exists := vm.vmMap[vmId]

	if !exists {
		if !IsDevelopment() {
			_, statusErr := vm.incusProvider.GetVMStatus(vmId)
			if statusErr == nil {
				log.Printf("VM %s found in Incus but not in memory, proceeding with deletion", vmId)
			} else {
				return fmt.Errorf("VM %s not found", vmId)
			}
		} else {
			return fmt.Errorf("VM %s not found", vmId)
		}
	}

	if exists {
		vmState := vm.vmMap[vmId]
		vmState.Status = VM_STATUS_DELETING
		vm.vmMap[vmId] = vmState
	}

	if !IsDevelopment() {
		incusErr := vm.incusProvider.DestroyVM(vmId)
		if incusErr != nil {
			return fmt.Errorf("failed to destroy VM in Incus: %w", incusErr)
		}
	} else {
		log.Printf("[DEV MODE] Skipping Incus VM deletion for VM %s", vmId)
	}

	if exists {
		vmState := vm.vmMap[vmId]
		vmState.Status = VM_STATUS_DELETED
		vm.vmMap[vmId] = vmState
		delete(vm.vmMap, vmId)
	}

	return nil
}

func (vm *VMManager) InitializeFromIncus() error {
	if IsDevelopment() {
		log.Printf("[DEV MODE] Skipping Incus state synchronization")
		return nil
	}

	log.Printf("Syncing VM state from Incus...")

	vms, err := vm.incusProvider.ListVMs()
	if err != nil {
		return fmt.Errorf("failed to list VMs from Incus: %w", err)
	}

	vm.mu.Lock()
	defer vm.mu.Unlock()

	syncedCount := 0
	skippedCount := 0
	for _, incusVM := range vms {
		if incusVM.Status != "Running" {
			log.Printf("Skipping VM %s (status: %s) - only running VMs are synced", incusVM.Name, incusVM.Status)
			skippedCount++
			continue
		}

		vmState := VMState{
			Id:           incusVM.Name,
			Name:         "",
			UserId:       "",
			CreationTime: time.Now(),
			Cpus:         1,
			Ram:          8,
			Disk:         64,
			Gpus:         0,
			GPUType:      DefaultGpuType,
			Status:       VM_STATUS_RUNNING,
		}

		if cpuStr, ok := incusVM.Config["limits.cpu"]; ok {
			if cpuVal, err := strconv.Atoi(cpuStr); err == nil {
				vmState.Cpus = cpuVal
			}
		}

		if ramStr, ok := incusVM.Config["limits.memory"]; ok {
			ramStr = strings.TrimSuffix(ramStr, "GiB")
			if ramVal, err := strconv.Atoi(ramStr); err == nil {
				vmState.Ram = ramVal
			}
		}

		vm.vmMap[incusVM.Name] = vmState
		syncedCount++
		log.Printf("Synced VM %s from Incus (status: %s, cpus: %d, ram: %dGB)",
			incusVM.Name, vmState.Status, vmState.Cpus, vmState.Ram)
	}

	log.Printf("Successfully synced %d running VMs from Incus (%d stopped/non-running VMs skipped)", syncedCount, skippedCount)
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
