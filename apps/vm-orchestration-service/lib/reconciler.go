package lib

import (
	"context"
	"log"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"vm-orchestration-service/structs"
)

type Reconciler struct {
	vmManager      *structs.VMManager
	vmProvider     structs.VMProvider
	jobManager     *structs.JobManager
	jobAdapter     *JobAdapter
	callbackClient *CallbackClient
	k8sClient      kubernetes.Interface
	namespace      string
	interval       time.Duration
	queueProcessor *QueueProcessor
}

type ReconcilerConfig struct {
	VMManager      *structs.VMManager
	VMProvider     structs.VMProvider
	JobManager     *structs.JobManager
	JobAdapter     *JobAdapter
	CallbackClient *CallbackClient
	K8sClient      kubernetes.Interface
	Namespace      string
	Interval       time.Duration
	QueueProcessor *QueueProcessor
}

func NewReconciler(config ReconcilerConfig) *Reconciler {
	interval := config.Interval
	if interval == 0 {
		// Default to 30 minutes - the reconciler is now a backup consistency check
		// since SharedInformers handle real-time status updates.
		interval = 30 * time.Minute
	}

	return &Reconciler{
		vmManager:      config.VMManager,
		vmProvider:     config.VMProvider,
		jobManager:     config.JobManager,
		jobAdapter:     config.JobAdapter,
		callbackClient: config.CallbackClient,
		k8sClient:      config.K8sClient,
		namespace:      config.Namespace,
		interval:       interval,
		queueProcessor: config.QueueProcessor,
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

	r.reconcileStoppingVMs()
	r.cleanupDeadPods()
	r.cleanupOrphanResources()

	if r.queueProcessor != nil {
		r.queueProcessor.TriggerProcessing()
	}
}

func (r *Reconciler) reconcileStoppingVMs() {
	if r.callbackClient == nil {
		return
	}

	stoppingVMs, err := r.callbackClient.FetchActiveVMs()
	if err != nil {
		log.Printf("Reconciler: failed to fetch active VMs from Convex: %v", err)
		return
	}

	stoppingCount := 0
	for _, vm := range stoppingVMs {
		if vm.Status != "stopping" {
			continue
		}

		_, err := r.vmProvider.GetVMStatus(vm.VMId)
		if err != nil {
			log.Printf("Reconciler: VM %s is stopping but not in K8s, marking as stopped", vm.VMId)
			if notifyErr := r.callbackClient.NotifyVMStatusUpdate(vm.VMId, "stopped", ""); notifyErr != nil {
				log.Printf("ERROR: Failed to notify site about stopped VM %s: %v", vm.VMId, notifyErr)
			}
		} else {
			log.Printf("Reconciler: retrying deletion of stopping VM %s", vm.VMId)
			if deleteErr := r.vmProvider.DestroyVM(vm.VMId); deleteErr == nil {
				if notifyErr := r.callbackClient.NotifyVMStatusUpdate(vm.VMId, "stopped", ""); notifyErr != nil {
					log.Printf("ERROR: Failed to notify site about stopped VM %s: %v", vm.VMId, notifyErr)
				}
			} else {
				log.Printf("ERROR: Failed to delete stopping VM %s: %v - will retry next sync", vm.VMId, deleteErr)
			}
		}
		stoppingCount++
	}

	if stoppingCount > 0 {
		log.Printf("Reconciler: processed %d stopping VMs", stoppingCount)
	}
}

func (r *Reconciler) cleanupDeadPods() {
	if r.k8sClient == nil {
		return
	}

	ctx := context.Background()
	namespaces := []string{r.namespace, "cdi"}
	totalDeleted := 0

	for _, ns := range namespaces {
		pods, err := r.k8sClient.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			log.Printf("Reconciler: failed to list pods in namespace %s: %v", ns, err)
			continue
		}

		for _, pod := range pods.Items {
			shouldDelete := false

			switch pod.Status.Phase {
			case corev1.PodFailed, corev1.PodSucceeded:
				shouldDelete = true
			case corev1.PodUnknown:
				shouldDelete = true
			case corev1.PodPending, corev1.PodRunning:
				for _, cs := range pod.Status.ContainerStatuses {
					if cs.State.Terminated != nil && cs.State.Terminated.Reason == "ContainerStatusUnknown" {
						shouldDelete = true
						break
					}
				}
			}

			if !shouldDelete {
				continue
			}

			err := r.k8sClient.CoreV1().Pods(ns).Delete(ctx, pod.Name, metav1.DeleteOptions{})
			if err != nil {
				log.Printf("Reconciler: failed to delete dead pod %s/%s: %v", ns, pod.Name, err)
			} else {
				totalDeleted++
			}
		}
	}

	if totalDeleted > 0 {
		log.Printf("Reconciler: cleaned up %d dead pods", totalDeleted)
	}
}

func (r *Reconciler) cleanupOrphanResources() {
	if r.k8sClient == nil {
		return
	}

	ctx := context.Background()
	cutoff := time.Now().Add(-30 * time.Minute)
	totalDeleted := 0

	secrets, err := r.k8sClient.CoreV1().Secrets(r.namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("Reconciler: failed to list secrets: %v", err)
	} else {
		kubeVMs, _ := r.vmProvider.ListVMs()
		knownVMs := make(map[string]bool)
		for _, vm := range kubeVMs {
			knownVMs[vm.Name] = true
		}
		for vmId := range r.vmManager.ListAllVMs() {
			knownVMs[vmId] = true
		}

		for _, secret := range secrets.Items {
			if !strings.HasPrefix(secret.Name, "cloudinit-") {
				continue
			}
			if secret.CreationTimestamp.Time.After(cutoff) {
				continue
			}
			vmId := strings.TrimPrefix(secret.Name, "cloudinit-")
			if knownVMs[vmId] {
				continue
			}
			if err := r.k8sClient.CoreV1().Secrets(r.namespace).Delete(ctx, secret.Name, metav1.DeleteOptions{}); err != nil {
				log.Printf("Reconciler: failed to delete orphan secret %s: %v", secret.Name, err)
			} else {
				totalDeleted++
			}
		}
	}

	pvcs, err := r.k8sClient.CoreV1().PersistentVolumeClaims(r.namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("Reconciler: failed to list PVCs: %v", err)
	} else {
		for _, pvc := range pvcs.Items {
			if pvc.Labels["uvacompute.io/golden-image"] == "true" {
				continue
			}
			if len(pvc.OwnerReferences) > 0 {
				continue
			}
			if pvc.CreationTimestamp.Time.After(cutoff) {
				continue
			}
			if err := r.k8sClient.CoreV1().PersistentVolumeClaims(r.namespace).Delete(ctx, pvc.Name, metav1.DeleteOptions{}); err != nil {
				log.Printf("Reconciler: failed to delete orphan PVC %s: %v", pvc.Name, err)
			} else {
				totalDeleted++
			}
		}
	}

	if totalDeleted > 0 {
		log.Printf("Reconciler: cleaned up %d orphan resources", totalDeleted)
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
