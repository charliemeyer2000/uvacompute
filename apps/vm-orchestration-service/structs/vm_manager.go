package structs

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"
)

type VMResourceLimits struct {
	MaxCpus int
	MaxRam  int
	MaxGpus int
}

type StatusCallback func(status VMStatus)

type VMProvider interface {
	CreateVM(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string, statusCallback StatusCallback, startupScript, cloudInitConfig string) error
	DestroyVM(vmId string) error
	GetVMStatus(vmId string) (string, error)
	GetVMInfo(vmId string) (*VMInfo, error)
	ListVMs() ([]ListVM, error)
	HasVfioCapableNode(ctx context.Context) (bool, error)
}

type VMManager struct {
	mu             sync.Mutex
	vmMap          map[string]VMState
	limits         VMResourceLimits
	vmProvider     VMProvider
	callbackClient CallbackClient
}

func NewVMManager(limits VMResourceLimits, vmProvider VMProvider, callbackClient CallbackClient) *VMManager {
	return &VMManager{
		mu:             sync.Mutex{},
		vmMap:          make(map[string]VMState),
		limits:         limits,
		vmProvider:     vmProvider,
		callbackClient: callbackClient,
	}
}

func (vm *VMManager) CreateVM(req VMCreationRequest) (string, error) {
	vm.mu.Lock()

	if err := vm.checkResourceAvailability(req); err != nil {
		vm.mu.Unlock()
		return "", err
	}

	// Use the pre-generated vmId from the request
	vmId := req.VMId

	cpus := IntOrDefault(req.Cpus, DefaultCpus)
	ram := IntOrDefault(req.Ram, DefaultRam)
	disk := IntOrDefault(req.Disk, DefaultDisk)
	gpus := IntOrDefault(req.Gpus, DefaultGpus)
	gpuType := GpuTypeOrDefault(req.GpuType, DefaultGpuType)
	name := StringOrDefault(req.Name, "")
	startupScript := StringOrDefault(req.StartupScript, "")
	cloudInitConfig := StringOrDefault(req.CloudInitConfig, "")

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
		Status:       VM_STATUS_PENDING,
	}

	// Release lock before async VM creation
	vm.mu.Unlock()

	// Notify that we've moved to pending status
	vm.UpdateVMStatus(vmId, VM_STATUS_PENDING, "")

	// Create VM asynchronously - return immediately so UI shows "creating" status
	go func() {
		err := vm.createVMSync(vmId, cpus, ram, disk, gpus, req.SSHPublicKeys, req.Hours, startupScript, cloudInitConfig)
		if err != nil {
			// VM creation failed - update status to failed and notify
			log.Printf("ERROR: VM %s creation failed: %v", vmId, err)
			vm.mu.Lock()
			if vmState, exists := vm.vmMap[vmId]; exists {
				vmState.Status = VM_STATUS_FAILED
				vmState.ErrorMessage = err.Error()
				vm.vmMap[vmId] = vmState
			}
			vm.mu.Unlock()

			// Notify the site about the failure
			if vm.callbackClient != nil {
				if notifyErr := vm.callbackClient.NotifyVMStatusUpdate(vmId, string(VM_STATUS_FAILED), ""); notifyErr != nil {
					log.Printf("ERROR: Failed to notify site about VM %s failure: %v", vmId, notifyErr)
				}
			}
		}
	}()

	return vmId, nil
}

func (vm *VMManager) createVMSync(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string, hours int, startupScript, cloudInitConfig string) error {
	statusCallback := func(status VMStatus) {
		vm.UpdateVMStatus(vmId, status, "")
	}

	log.Printf("Starting VM creation for %s (cpus: %d, ram: %d, disk: %d, gpus: %d)", vmId, cpus, ram, disk, gpus)

	err := vm.vmProvider.CreateVM(vmId, cpus, ram, disk, gpus, sshPublicKeys, statusCallback, startupScript, cloudInitConfig)
	if err != nil {
		log.Printf("ERROR: Failed to create VM %s: %v", vmId, err)
		return err
	}

	vm.UpdateVMStatus(vmId, VM_STATUS_READY, "")
	log.Printf("VM %s successfully created and is now running", vmId)

	// Set up expiration timer
	expiresAt := time.Now().Add(time.Duration(hours) * time.Hour).UnixMilli()
	vm.StartExpirationTimer(vmId, expiresAt)

	return nil
}

func (vm *VMManager) StartExpirationTimer(vmId string, expiresAt int64) {
	remaining := time.Until(time.UnixMilli(expiresAt))
	log.Printf("VM %s expiration timer set for %v from now", vmId, remaining)
	time.AfterFunc(remaining, func() {
		log.Printf("VM %s expired, deleting", vmId)

		vm.vmProvider.DestroyVM(vmId)

		vm.mu.Lock()
		vmState := vm.vmMap[vmId]
		vmState.Status = VM_STATUS_STOPPED
		vm.vmMap[vmId] = vmState
		vm.mu.Unlock()

		if vm.callbackClient != nil {
			go func() {
				if err := vm.callbackClient.NotifyVMStatusUpdate(vmId, string(VM_STATUS_STOPPED), ""); err != nil {
					log.Printf("ERROR: Failed to notify site about VM %s expiration: %v", vmId, err)
				}
			}()
		}

		vm.mu.Lock()
		delete(vm.vmMap, vmId)
		vm.mu.Unlock()
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
	var nodeId string
	if vmState, exists := vm.vmMap[vmId]; exists {
		vmState.Status = status
		vmState.ErrorMessage = errorMessage
		nodeId = vmState.NodeId
		vm.vmMap[vmId] = vmState
	}
	vm.mu.Unlock()

	if status == VM_STATUS_READY {
		if info, err := vm.vmProvider.GetVMInfo(vmId); err == nil && info.Location != "" {
			nodeId = info.Location
			vm.mu.Lock()
			if vmState, exists := vm.vmMap[vmId]; exists {
				vmState.NodeId = nodeId
				vm.vmMap[vmId] = vmState
			}
			vm.mu.Unlock()
		}
	}

	if vm.callbackClient != nil {
		go func() {
			if err := vm.callbackClient.NotifyVMStatusUpdate(vmId, string(status), nodeId); err != nil {
				log.Printf("ERROR: Failed to notify site about VM %s status update: %v", vmId, err)
			}
		}()
	}
}

func (vm *VMManager) DeleteVM(vmId string) error {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	_, exists := vm.vmMap[vmId]

	if !exists {
		_, statusErr := vm.vmProvider.GetVMStatus(vmId)
		if statusErr == nil {
			log.Printf("VM %s found in backend but not in memory, proceeding with deletion", vmId)
		} else {
			return fmt.Errorf("VM %s not found", vmId)
		}
	}

	if exists {
		vmState := vm.vmMap[vmId]
		vmState.Status = VM_STATUS_STOPPING
		vm.vmMap[vmId] = vmState
	}

	err := vm.vmProvider.DestroyVM(vmId)
	if err != nil {
		return fmt.Errorf("failed to destroy VM: %w", err)
	}

	if exists {
		vmState := vm.vmMap[vmId]
		vmState.Status = VM_STATUS_STOPPED
		vm.vmMap[vmId] = vmState
		delete(vm.vmMap, vmId)
	}

	return nil
}

func (vm *VMManager) InitializeFromBackend() error {
	log.Printf("Syncing VM state from backend...")

	vms, err := vm.vmProvider.ListVMs()
	if err != nil {
		return fmt.Errorf("failed to list VMs from backend: %w", err)
	}

	vm.mu.Lock()
	defer vm.mu.Unlock()

	syncedCount := 0
	skippedCount := 0
	var syncedVMs []string

	for _, backendVM := range vms {
		if backendVM.Status != "Running" {
			log.Printf("Skipping VM %s (status: %s) - only running VMs are synced", backendVM.Name, backendVM.Status)
			skippedCount++
			continue
		}

		vmState := VMState{
			Id:           backendVM.Name,
			Name:         "",
			UserId:       "",
			CreationTime: time.Now(),
			Cpus:         1,
			Ram:          8,
			Disk:         64,
			Gpus:         0,
			GPUType:      DefaultGpuType,
			Status:       VM_STATUS_READY,
		}

		if cpuStr, ok := backendVM.Config["limits.cpu"]; ok {
			if cpuVal, err := strconv.Atoi(cpuStr); err == nil {
				vmState.Cpus = cpuVal
			}
		}

		if ramStr, ok := backendVM.Config["limits.memory"]; ok {
			ramStr = strings.TrimSuffix(ramStr, "GiB")
			if ramVal, err := strconv.Atoi(ramStr); err == nil {
				vmState.Ram = ramVal
			}
		}

		vm.vmMap[backendVM.Name] = vmState
		syncedVMs = append(syncedVMs, backendVM.Name)
		syncedCount++
		log.Printf("Synced VM %s from backend (status: %s, cpus: %d, ram: %dGB)",
			backendVM.Name, vmState.Status, vmState.Cpus, vmState.Ram)
	}

	log.Printf("Successfully synced %d running VMs from backend (%d stopped/non-running VMs skipped)", syncedCount, skippedCount)

	if vm.callbackClient != nil {
		for _, vmId := range syncedVMs {
			go func(id string) {
				nodeId := ""
				if info, err := vm.vmProvider.GetVMInfo(id); err == nil && info.Location != "" {
					nodeId = info.Location
				}
				if err := vm.callbackClient.NotifyVMStatusUpdate(id, string(VM_STATUS_READY), nodeId); err != nil {
					log.Printf("ERROR: Failed to notify site about synced VM %s status: %v", id, err)
				}
			}(vmId)
		}
	}

	return nil
}

func (vm *VMManager) ListAllVMs() map[string]VMState {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	result := make(map[string]VMState)
	for k, v := range vm.vmMap {
		result[k] = v
	}
	return result
}

func (vm *VMManager) AddVMFromExternal(vmId string, state VMState) {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	if _, exists := vm.vmMap[vmId]; !exists {
		vm.vmMap[vmId] = state
		log.Printf("Added VM %s to vmMap from external source (status: %s)", vmId, state.Status)
	}
}

func (vm *VMManager) checkResourceAvailability(req VMCreationRequest) error {
	// Check GPU node availability first (before counting resources)
	requestGpus := IntOrDefault(req.Gpus, DefaultGpus)
	if requestGpus > 0 {
		ctx := context.Background()
		hasVfio, err := vm.vmProvider.HasVfioCapableNode(ctx)
		if err != nil {
			return fmt.Errorf("failed to check GPU node availability: %w", err)
		}
		if !hasVfio {
			return fmt.Errorf("no GPU nodes available for VM passthrough (all GPUs in container mode)")
		}
	}

	var totalCpus, totalRam, totalGpus int

	for _, vmState := range vm.vmMap {
		if vmState.Status == VM_STATUS_READY || vmState.Status == VM_STATUS_PENDING {
			totalCpus += vmState.Cpus
			totalRam += vmState.Ram
			totalGpus += vmState.Gpus
		}
	}

	requestCpus := IntOrDefault(req.Cpus, DefaultCpus)
	requestRam := IntOrDefault(req.Ram, DefaultRam)

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
