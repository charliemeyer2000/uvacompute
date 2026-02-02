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
	CreateVM(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string, statusCallback StatusCallback, startupScript, cloudInitConfig string, expose *int, exposeSubdomain *string) error
	DestroyVM(vmId string) error
	GetVMStatus(vmId string) (string, error)
	GetVMInfo(vmId string) (*VMInfo, error)
	ListVMs() ([]ListVM, error)
	HasVfioCapableNode(ctx context.Context) (bool, error)
}

type VMManager struct {
	mu               sync.RWMutex
	vmMap            map[string]VMState
	expirationTimers map[string]*time.Timer
	limits           VMResourceLimits
	vmProvider       VMProvider
	callbackClient   CallbackClient
	vmCleanupFunc    func(vmId string)
}

func (vm *VMManager) SetVMCleanupFunc(f func(vmId string)) {
	vm.vmCleanupFunc = f
}

func NewVMManager(limits VMResourceLimits, vmProvider VMProvider, callbackClient CallbackClient) *VMManager {
	return &VMManager{
		vmMap:            make(map[string]VMState),
		expirationTimers: make(map[string]*time.Timer),
		limits:           limits,
		vmProvider:       vmProvider,
		callbackClient:   callbackClient,
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
		err := vm.createVMSync(vmId, cpus, ram, disk, gpus, req.SSHPublicKeys, req.Hours, startupScript, cloudInitConfig, req.Expose, req.ExposeSubdomain)
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

func (vm *VMManager) createVMSync(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string, hours int, startupScript, cloudInitConfig string, expose *int, exposeSubdomain *string) error {
	statusCallback := func(status VMStatus) {
		vm.UpdateVMStatus(vmId, status, "")
	}

	log.Printf("Starting VM creation for %s (cpus: %d, ram: %d, disk: %d, gpus: %d)", vmId, cpus, ram, disk, gpus)

	err := vm.vmProvider.CreateVM(vmId, cpus, ram, disk, gpus, sshPublicKeys, statusCallback, startupScript, cloudInitConfig, expose, exposeSubdomain)
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
	vm.mu.Lock()
	if vmState, exists := vm.vmMap[vmId]; exists {
		if vmState.ExpiresAt != expiresAt {
			vmState.ExpiresAt = expiresAt
			vm.vmMap[vmId] = vmState
		}
	}
	vm.stopExpirationTimerLocked(vmId)
	remaining := time.Until(time.UnixMilli(expiresAt))
	log.Printf("VM %s expiration timer set for %v from now", vmId, remaining)
	timer := time.AfterFunc(remaining, func() {
		vm.handleExpiration(vmId)
	})
	vm.expirationTimers[vmId] = timer
	vm.mu.Unlock()
}

func (vm *VMManager) HasExpirationTimer(vmId string) bool {
	vm.mu.RLock()
	defer vm.mu.RUnlock()
	_, exists := vm.expirationTimers[vmId]
	return exists
}

func (vm *VMManager) stopExpirationTimerLocked(vmId string) {
	if timer, exists := vm.expirationTimers[vmId]; exists {
		timer.Stop()
		delete(vm.expirationTimers, vmId)
	}
}

func (vm *VMManager) handleExpiration(vmId string) {
	log.Printf("VM %s expired, deleting", vmId)

	vm.mu.Lock()
	vmState, exists := vm.vmMap[vmId]
	if !exists {
		vm.mu.Unlock()
		return
	}

	if vmState.ExpiresAt > time.Now().UnixMilli() {
		vm.mu.Unlock()
		return
	}

	vm.stopExpirationTimerLocked(vmId)
	vm.mu.Unlock()

	err := vm.vmProvider.DestroyVM(vmId)
	if err != nil {
		log.Printf("ERROR: Failed to destroy expired VM %s: %v - reconciler will retry", vmId, err)
		return
	}

	vm.mu.Lock()
	delete(vm.vmMap, vmId)
	vm.mu.Unlock()

	if vm.callbackClient != nil {
		go func() {
			if err := vm.callbackClient.NotifyVMStatusUpdate(vmId, string(VM_STATUS_STOPPED), ""); err != nil {
				log.Printf("ERROR: Failed to notify site about VM %s expiration: %v", vmId, err)
			}
		}()
	}
}

func (vm *VMManager) GetVM(vmId string) (VMState, bool) {
	vm.mu.RLock()
	defer vm.mu.RUnlock()

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
		if status.IsTerminal() && vmState.TerminalSince == nil {
			now := time.Now()
			vmState.TerminalSince = &now
		}
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
				log.Printf("ERROR: Failed to notify site about VM %s status update: %v - enqueueing retry", vmId, err)
				vm.callbackClient.EnqueueVMRetry(vmId, string(status), nodeId)
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
		vm.stopExpirationTimerLocked(vmId)
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

func (vm *VMManager) ExtendVM(vmId string, hours int) (int64, error) {
	vm.mu.Lock()
	vmState, exists := vm.vmMap[vmId]
	if !exists {
		vm.mu.Unlock()
		return 0, fmt.Errorf("VM %s not found", vmId)
	}

	if vmState.Status.IsTerminal() || vmState.Status == VM_STATUS_OFFLINE {
		vm.mu.Unlock()
		return 0, fmt.Errorf("VM %s is not running", vmId)
	}

	now := time.Now().UnixMilli()
	if vmState.ExpiresAt <= 0 || vmState.ExpiresAt < now {
		vm.mu.Unlock()
		return 0, fmt.Errorf("VM %s already expired", vmId)
	}

	extension := time.Duration(hours) * time.Hour
	newExpiresAt := vmState.ExpiresAt + extension.Milliseconds()
	vmState.ExpiresAt = newExpiresAt
	vm.vmMap[vmId] = vmState
	vm.mu.Unlock()

	vm.StartExpirationTimer(vmId, newExpiresAt)

	return newExpiresAt, nil
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
	vm.mu.RLock()
	defer vm.mu.RUnlock()

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

// HandleVMEvent processes VM status updates from Kubernetes informers.
func (vm *VMManager) HandleVMEvent(vmId string, status VMStatus, nodeId string) {
	vm.mu.Lock()

	vmState, exists := vm.vmMap[vmId]
	if !exists {
		vm.mu.Unlock()
		return
	}

	if vmState.Status == VM_STATUS_CREATING ||
		vmState.Status == VM_STATUS_PENDING ||
		vmState.Status == VM_STATUS_BOOTING ||
		vmState.Status == VM_STATUS_PROVISIONING {
		if status != VM_STATUS_FAILED && status != VM_STATUS_OFFLINE && status != VM_STATUS_STOPPED {
			vm.mu.Unlock()
			return
		}
	}

	// No change - skip
	if vmState.Status == status {
		// Update node ID if changed and notify
		if nodeId != "" && vmState.NodeId != nodeId {
			oldNodeId := vmState.NodeId
			vmState.NodeId = nodeId
			vm.vmMap[vmId] = vmState
			vm.mu.Unlock()

			log.Printf("VMManager: HandleVMEvent %s: nodeId changed %s -> %s (status: %s)", vmId, oldNodeId, nodeId, status)
			if vm.callbackClient != nil {
				go func() {
					if err := vm.callbackClient.NotifyVMStatusUpdate(vmId, string(status), nodeId); err != nil {
						log.Printf("ERROR: Failed to notify site about VM %s nodeId change: %v", vmId, err)
					}
				}()
			}
			return
		}
		vm.mu.Unlock()
		return
	}

	if vmState.Status.IsTerminal() {
		vm.mu.Unlock()
		return
	}

	oldStatus := vmState.Status
	vmState.Status = status
	if nodeId != "" {
		vmState.NodeId = nodeId
	}
	if status.IsTerminal() && vmState.TerminalSince == nil {
		now := time.Now()
		vmState.TerminalSince = &now
	}
	vm.vmMap[vmId] = vmState
	vm.mu.Unlock()

	log.Printf("VMManager: HandleVMEvent %s: %s -> %s (node: %s)", vmId, oldStatus, status, nodeId)

	if status == VM_STATUS_READY {
		vm.mu.Lock()
		vmStateCheck, exists := vm.vmMap[vmId]
		vm.mu.Unlock()
		if exists && vmStateCheck.ExpiresAt > 0 && !vm.HasExpirationTimer(vmId) {
			if vmStateCheck.ExpiresAt <= time.Now().UnixMilli() {
				log.Printf("VMManager: VM %s is READY but already expired, triggering expiration", vmId)
				go vm.handleExpiration(vmId)
			} else {
				log.Printf("VMManager: VM %s is READY but missing expiration timer, restarting", vmId)
				vm.StartExpirationTimer(vmId, vmStateCheck.ExpiresAt)
			}
		}
	}

	if vm.callbackClient != nil {
		go func() {
			if err := vm.callbackClient.NotifyVMStatusUpdate(vmId, string(status), nodeId); err != nil {
				log.Printf("ERROR: Failed to notify site about VM %s status update from informer: %v - enqueueing retry", vmId, err)
				vm.callbackClient.EnqueueVMRetry(vmId, string(status), nodeId)
			}
		}()
	}

	if status.IsTerminal() && vm.vmCleanupFunc != nil {
		go vm.vmCleanupFunc(vmId)
	}
}

func (vm *VMManager) SetVMForTest(vmId string, status VMStatus, nodeId string) {
	vm.mu.Lock()
	defer vm.mu.Unlock()
	vm.vmMap[vmId] = VMState{
		Id:     vmId,
		Status: status,
		NodeId: nodeId,
	}
}

func (vm *VMManager) GetVMStatusForTest(vmId string) VMStatus {
	vm.mu.RLock()
	defer vm.mu.RUnlock()
	if state, exists := vm.vmMap[vmId]; exists {
		return state.Status
	}
	return ""
}

func (vm *VMManager) HasVM(vmId string) bool {
	vm.mu.RLock()
	defer vm.mu.RUnlock()
	_, exists := vm.vmMap[vmId]
	return exists
}

func NewVMManagerForTest(callbackClient CallbackClient) *VMManager {
	return &VMManager{
		vmMap:            make(map[string]VMState),
		expirationTimers: make(map[string]*time.Timer),
		limits:           VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1},
		callbackClient:   callbackClient,
	}
}

func (vm *VMManager) StartPruner(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				vm.pruneTerminalEntries()
			}
		}
	}()
}

func (vm *VMManager) pruneTerminalEntries() {
	vm.mu.Lock()
	defer vm.mu.Unlock()

	now := time.Now()
	pruned := 0
	for vmId, vmState := range vm.vmMap {
		if vmState.Status.IsTerminal() &&
			vmState.TerminalSince != nil && now.Sub(*vmState.TerminalSince) > 10*time.Minute {
			delete(vm.vmMap, vmId)
			if timer, exists := vm.expirationTimers[vmId]; exists {
				timer.Stop()
				delete(vm.expirationTimers, vmId)
			}
			pruned++
		}
	}
	if pruned > 0 {
		log.Printf("VMManager: pruned %d terminal entries from vmMap", pruned)
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
