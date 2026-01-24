package lib

import (
	"context"
	"log"
	"time"

	"vm-orchestration-service/structs"
)

type Reconciler struct {
	vmManager      *structs.VMManager
	vmProvider     structs.VMProvider
	jobManager     *structs.JobManager
	jobAdapter     *JobAdapter
	callbackClient *CallbackClient
	interval       time.Duration
}

type ReconcilerConfig struct {
	VMManager      *structs.VMManager
	VMProvider     structs.VMProvider
	JobManager     *structs.JobManager
	JobAdapter     *JobAdapter
	CallbackClient *CallbackClient
	Interval       time.Duration
}

func NewReconciler(config ReconcilerConfig) *Reconciler {
	interval := config.Interval
	if interval == 0 {
		interval = 5 * time.Minute
	}

	return &Reconciler{
		vmManager:      config.VMManager,
		vmProvider:     config.VMProvider,
		jobManager:     config.JobManager,
		jobAdapter:     config.JobAdapter,
		callbackClient: config.CallbackClient,
		interval:       interval,
	}
}

func (r *Reconciler) Start(ctx context.Context) {
	log.Printf("Reconciler started with interval: %v", r.interval)

	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("Reconciler stopped")
			return
		case <-ticker.C:
			r.reconcile()
		}
	}
}

func (r *Reconciler) reconcile() {
	log.Printf("Reconciler: starting reconciliation pass...")

	kubeVMs, err := r.vmProvider.ListVMs()
	if err != nil {
		log.Printf("Reconciler: failed to list VMs from KubeVirt: %v", err)
		return
	}

	vmMapVMs := r.vmManager.ListAllVMs()

	kubeVMMap := make(map[string]structs.ListVM)
	for _, kvm := range kubeVMs {
		kubeVMMap[kvm.Name] = kvm
	}

	addedCount := 0
	updatedCount := 0

	for _, kvm := range kubeVMs {
		if _, exists := vmMapVMs[kvm.Name]; !exists {
			log.Printf("Reconciler: VM %s found in KubeVirt but not in vmMap, adding", kvm.Name)

			status := mapKubeVirtStatusToVMStatus(kvm.Status)
			vmState := structs.VMState{
				Id:           kvm.Name,
				UserId:       "",
				CreationTime: time.Now(),
				Status:       status,
			}

			r.vmManager.AddVMFromExternal(kvm.Name, vmState)

			if r.callbackClient != nil {
				if err := r.callbackClient.NotifyVMStatusUpdate(kvm.Name, string(status), ""); err != nil {
					log.Printf("Reconciler: failed to notify site about VM %s: %v", kvm.Name, err)
				}
			}

			addedCount++
		}
	}

	for vmId, vmState := range vmMapVMs {
		if vmState.Status == structs.VM_STATUS_READY {
			if _, exists := kubeVMMap[vmId]; !exists {
				log.Printf("Reconciler: VM %s marked as ready but not found in KubeVirt, marking as stopped", vmId)

				r.vmManager.UpdateVMStatus(vmId, structs.VM_STATUS_STOPPED, "")

				updatedCount++
			}
		}
	}

	if addedCount > 0 || updatedCount > 0 {
		log.Printf("Reconciler: VM pass complete - added %d VMs, updated %d VMs", addedCount, updatedCount)
	}

	if r.jobManager != nil && r.jobAdapter != nil {
		if err := SyncJobsFromConvex(r.jobManager, r.jobAdapter, r.callbackClient); err != nil {
			log.Printf("Reconciler: failed to sync jobs from Convex: %v", err)
		}
	}
}

func mapKubeVirtStatusToVMStatus(status string) structs.VMStatus {
	switch status {
	case "Running":
		return structs.VM_STATUS_READY
	case "Stopped":
		return structs.VM_STATUS_STOPPED
	case "Starting", "Scheduling", "Scheduled", "Pending":
		return structs.VM_STATUS_BOOTING
	case "Failed":
		return structs.VM_STATUS_FAILED
	default:
		return structs.VM_STATUS_PENDING
	}
}
