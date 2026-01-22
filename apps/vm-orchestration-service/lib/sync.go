package lib

import (
	"log"
	"time"

	"vm-orchestration-service/structs"
)

func SyncFromConvex(vmManager *structs.VMManager, vmProvider structs.VMProvider, callbackClient *CallbackClient) error {
	if callbackClient == nil {
		log.Printf("Skipping Convex sync: callback client not configured")
		return nil
	}

	log.Printf("Starting Convex sync...")

	convexVMs, err := callbackClient.FetchActiveVMs()
	if err != nil {
		return err
	}

	if len(convexVMs) == 0 {
		log.Printf("No active VMs found in Convex")
		return nil
	}

	currentVMs := vmManager.ListAllVMs()

	syncedCount := 0
	orphanedCount := 0

	for _, cvm := range convexVMs {
		if existingVM, exists := currentVMs[cvm.VMId]; exists {
			if cvm.ExpiresAt > 0 &&
				cvm.ExpiresAt > time.Now().UnixMilli() &&
				existingVM.Status == structs.VM_STATUS_READY &&
				!vmManager.HasExpirationTimer(cvm.VMId) {
				vmManager.StartExpirationTimer(cvm.VMId, cvm.ExpiresAt)
			}
			continue
		}

		backendStatus, err := vmProvider.GetVMStatus(cvm.VMId)

		if err != nil {
			log.Printf("VM %s exists in Convex (status: %s) but not in KubeVirt - marking as failed", cvm.VMId, cvm.Status)
			if cvm.Status != "failed" && cvm.Status != "stopped" {
				if notifyErr := callbackClient.NotifyVMStatusUpdate(cvm.VMId, string(structs.VM_STATUS_FAILED), ""); notifyErr != nil {
					log.Printf("ERROR: Failed to notify site about orphaned VM %s: %v", cvm.VMId, notifyErr)
				}
				orphanedCount++
			}
			continue
		}

		status := mapConvexStatusToVMStatus(cvm.Status)
		if backendStatus == "Running" {
			status = structs.VM_STATUS_READY
		}

		name := ""
		if cvm.Name != nil {
			name = *cvm.Name
		}

		nodeId := ""
		if cvm.NodeId != nil {
			nodeId = *cvm.NodeId
		}

		vmState := structs.VMState{
			Id:           cvm.VMId,
			Name:         name,
			UserId:       cvm.UserId,
			CreationTime: time.Now(), // Approximate, actual time not available
			Cpus:         cvm.Cpus,
			Ram:          cvm.Ram,
			Disk:         cvm.Disk,
			Gpus:         cvm.Gpus,
			GPUType:      structs.GPUType(cvm.GpuType),
			Status:       status,
			NodeId:       nodeId,
			ExpiresAt:    cvm.ExpiresAt,
		}

		vmManager.AddVMFromExternal(cvm.VMId, vmState)

		// Start expiration timer for READY VMs
		if status == structs.VM_STATUS_READY &&
			cvm.ExpiresAt > 0 &&
			cvm.ExpiresAt > time.Now().UnixMilli() {
			vmManager.StartExpirationTimer(cvm.VMId, cvm.ExpiresAt)
		}

		if string(status) != cvm.Status {
			log.Printf("VM %s status mismatch (Convex: %s, actual: %s) - updating", cvm.VMId, cvm.Status, status)
			if notifyErr := callbackClient.NotifyVMStatusUpdate(cvm.VMId, string(status), nodeId); notifyErr != nil {
				log.Printf("ERROR: Failed to notify site about VM %s status: %v", cvm.VMId, notifyErr)
			}
		}

		syncedCount++
	}

	log.Printf("Convex sync complete: %d VMs synced, %d orphaned VMs marked as failed", syncedCount, orphanedCount)
	return nil
}

func mapConvexStatusToVMStatus(status string) structs.VMStatus {
	switch status {
	case "creating":
		return structs.VM_STATUS_CREATING
	case "pending":
		return structs.VM_STATUS_PENDING
	case "booting":
		return structs.VM_STATUS_BOOTING
	case "provisioning":
		return structs.VM_STATUS_PROVISIONING
	case "ready":
		return structs.VM_STATUS_READY
	case "stopping":
		return structs.VM_STATUS_STOPPING
	case "stopped":
		return structs.VM_STATUS_STOPPED
	case "failed":
		return structs.VM_STATUS_FAILED
	case "offline":
		return structs.VM_STATUS_OFFLINE
	default:
		return structs.VM_STATUS_PENDING
	}
}
