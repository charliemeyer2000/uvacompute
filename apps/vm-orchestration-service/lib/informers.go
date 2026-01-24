package lib

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/dynamic/dynamicinformer"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/cache"
	"k8s.io/client-go/tools/clientcmd"

	"vm-orchestration-service/structs"
)

// InformerManager handles Kubernetes watch events for VMIs, Jobs, and Pods
// using SharedInformers for efficient, event-driven status updates.
type InformerManager struct {
	dynamicFactory dynamicinformer.DynamicSharedInformerFactory
	typedFactory   informers.SharedInformerFactory
	vmiInformer    cache.SharedIndexInformer
	jobInformer    cache.SharedIndexInformer
	podInformer    cache.SharedIndexInformer
	vmManager      *structs.VMManager
	jobManager     *structs.JobManager
	callbackClient structs.CallbackClient
	namespace      string
	stopCh         chan struct{}
	mu             sync.Mutex
	started        bool
}

// InformerConfig contains configuration for creating an InformerManager.
type InformerConfig struct {
	KubeconfigPath string
	Namespace      string
	ResyncPeriod   time.Duration // Default: 15 minutes
}

// NewInformerManager creates a new InformerManager with the given configuration.
func NewInformerManager(config InformerConfig, vmManager *structs.VMManager, jobManager *structs.JobManager, callbackClient structs.CallbackClient) (*InformerManager, error) {
	var restConfig *rest.Config
	var err error

	if config.KubeconfigPath != "" {
		restConfig, err = clientcmd.BuildConfigFromFlags("", config.KubeconfigPath)
		if err != nil {
			return nil, fmt.Errorf("failed to load kubeconfig: %w", err)
		}
	} else {
		restConfig, err = rest.InClusterConfig()
		if err != nil {
			restConfig, err = clientcmd.BuildConfigFromFlags("", clientcmd.RecommendedHomeFile)
			if err != nil {
				return nil, fmt.Errorf("failed to create config: %w", err)
			}
		}
	}

	dynamicClient, err := dynamic.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %w", err)
	}

	typedClient, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create typed client: %w", err)
	}

	resyncPeriod := config.ResyncPeriod
	if resyncPeriod == 0 {
		resyncPeriod = 15 * time.Minute
	}

	// Create dynamic informer factory for KubeVirt CRDs (VMI)
	dynamicFactory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(
		dynamicClient,
		resyncPeriod,
		config.Namespace,
		func(options *metav1.ListOptions) {
			// Only watch VMIs managed by our service
			options.LabelSelector = "app.kubernetes.io/managed-by=vm-orchestration-service"
		},
	)

	// Create typed informer factory for Jobs and Pods
	typedFactory := informers.NewSharedInformerFactoryWithOptions(
		typedClient,
		resyncPeriod,
		informers.WithNamespace(config.Namespace),
		informers.WithTweakListOptions(func(options *metav1.ListOptions) {
			// Only watch resources with our job label
			options.LabelSelector = "uvacompute.io/job-id"
		}),
	)

	return &InformerManager{
		dynamicFactory: dynamicFactory,
		typedFactory:   typedFactory,
		vmManager:      vmManager,
		jobManager:     jobManager,
		callbackClient: callbackClient,
		namespace:      config.Namespace,
		stopCh:         make(chan struct{}),
	}, nil
}

// Start begins watching for Kubernetes events. This method blocks until
// the cache is synced, then returns. Events are processed in the background.
func (im *InformerManager) Start(ctx context.Context) error {
	im.mu.Lock()
	if im.started {
		im.mu.Unlock()
		return fmt.Errorf("informer manager already started")
	}
	im.started = true
	im.mu.Unlock()

	// Set up VMI informer
	vmiGVR := schema.GroupVersionResource{
		Group:    "kubevirt.io",
		Version:  "v1",
		Resource: "virtualmachineinstances",
	}
	im.vmiInformer = im.dynamicFactory.ForResource(vmiGVR).Informer()
	im.vmiInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    im.onVMIAdd,
		UpdateFunc: im.onVMIUpdate,
		DeleteFunc: im.onVMIDelete,
	})

	// Set up Job informer
	im.jobInformer = im.typedFactory.Batch().V1().Jobs().Informer()
	im.jobInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    im.onJobAdd,
		UpdateFunc: im.onJobUpdate,
		DeleteFunc: im.onJobDelete,
	})

	// Set up Pod informer for more granular job status
	im.podInformer = im.typedFactory.Core().V1().Pods().Informer()
	im.podInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    im.onPodAdd,
		UpdateFunc: im.onPodUpdate,
		DeleteFunc: im.onPodDelete,
	})

	// Start the factories
	im.dynamicFactory.Start(im.stopCh)
	im.typedFactory.Start(im.stopCh)

	// Wait for cache sync
	log.Printf("Informers: Waiting for cache sync...")

	syncCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	syncCh := make(chan bool, 1)
	go func() {
		dynamicSynced := im.dynamicFactory.WaitForCacheSync(im.stopCh)
		typedSynced := im.typedFactory.WaitForCacheSync(im.stopCh)

		allSynced := true
		for _, synced := range dynamicSynced {
			if !synced {
				allSynced = false
				break
			}
		}
		for _, synced := range typedSynced {
			if !synced {
				allSynced = false
				break
			}
		}
		syncCh <- allSynced
	}()

	select {
	case synced := <-syncCh:
		if !synced {
			return fmt.Errorf("failed to sync informer caches")
		}
	case <-syncCtx.Done():
		return fmt.Errorf("timeout waiting for informer cache sync")
	}

	log.Printf("Informers: Cache synced, now watching VMIs, Jobs, and Pods in namespace %s", im.namespace)
	return nil
}

// Stop shuts down the informers.
func (im *InformerManager) Stop() {
	im.mu.Lock()
	defer im.mu.Unlock()

	if !im.started {
		return
	}

	close(im.stopCh)
	im.started = false
	log.Printf("Informers: Stopped")
}

// VMI Event Handlers

func (im *InformerManager) onVMIAdd(obj interface{}) {
	vmi, ok := obj.(*unstructured.Unstructured)
	if !ok {
		log.Printf("Informers: WARNING: onVMIAdd received non-unstructured object")
		return
	}

	vmId := vmi.GetName()
	status, nodeId := im.extractVMIStatus(vmi)

	log.Printf("Informers: VMI ADD %s -> %s (node: %s)", vmId, status, nodeId)
	im.vmManager.HandleVMEvent(vmId, status, nodeId)
}

func (im *InformerManager) onVMIUpdate(oldObj, newObj interface{}) {
	vmi, ok := newObj.(*unstructured.Unstructured)
	if !ok {
		log.Printf("Informers: WARNING: onVMIUpdate received non-unstructured object")
		return
	}

	vmId := vmi.GetName()
	status, nodeId := im.extractVMIStatus(vmi)

	log.Printf("Informers: VMI UPDATE %s -> %s (node: %s)", vmId, status, nodeId)
	im.vmManager.HandleVMEvent(vmId, status, nodeId)
}

func (im *InformerManager) onVMIDelete(obj interface{}) {
	vmi, ok := obj.(*unstructured.Unstructured)
	if !ok {
		// Handle DeletedFinalStateUnknown (object deleted before informer synced)
		tombstone, ok := obj.(cache.DeletedFinalStateUnknown)
		if !ok {
			log.Printf("Informers: WARNING: onVMIDelete received unknown object type")
			return
		}
		vmi, ok = tombstone.Obj.(*unstructured.Unstructured)
		if !ok {
			log.Printf("Informers: WARNING: onVMIDelete tombstone contains non-unstructured object")
			return
		}
	}

	vmId := vmi.GetName()
	log.Printf("Informers: VMI DELETE %s -> STOPPED", vmId)
	im.vmManager.HandleVMEvent(vmId, structs.VM_STATUS_STOPPED, "")
}

// extractVMIStatus extracts the VM status and node ID from a VMI object.
// Handles all known VMI phases and conditions.
func (im *InformerManager) extractVMIStatus(vmi *unstructured.Unstructured) (structs.VMStatus, string) {
	vmId := vmi.GetName()

	statusObj, found, err := unstructured.NestedMap(vmi.Object, "status")
	if err != nil || !found {
		return structs.VM_STATUS_PENDING, ""
	}

	phase, _, _ := unstructured.NestedString(statusObj, "phase")
	nodeName, _, _ := unstructured.NestedString(statusObj, "nodeName")

	// Check conditions for more detailed status
	conditions, _, _ := unstructured.NestedSlice(statusObj, "conditions")
	readyCondition := im.findCondition(conditions, "Ready")

	// Check for migration in progress
	migrationState, migrationFound, _ := unstructured.NestedMap(statusObj, "migrationState")
	if migrationFound && migrationState != nil {
		completed, _, _ := unstructured.NestedBool(migrationState, "completed")
		if !completed {
			// Migration in progress - don't update status
			log.Printf("Informers: VMI %s migration in progress, skipping status update", vmId)
			return structs.VM_STATUS_READY, nodeName // Return current status
		}
	}

	switch phase {
	case "":
		// Unset phase - initial state
		return structs.VM_STATUS_PENDING, nodeName

	case "Pending":
		// Waiting for resources to be allocated
		return structs.VM_STATUS_BOOTING, nodeName

	case "Scheduling":
		// Being scheduled to a node
		return structs.VM_STATUS_BOOTING, nodeName

	case "Scheduled":
		// Scheduled, but VM process not yet started
		return structs.VM_STATUS_BOOTING, nodeName

	case "Running":
		// VM is running - check Ready condition to distinguish READY vs PROVISIONING
		if readyCondition != nil {
			status, _, _ := unstructured.NestedString(readyCondition, "status")
			if status == "True" {
				return structs.VM_STATUS_READY, nodeName
			}
			// Running but not Ready - cloud-init or agent not ready
			return structs.VM_STATUS_PROVISIONING, nodeName
		}
		// No Ready condition - assume provisioning
		return structs.VM_STATUS_PROVISIONING, nodeName

	case "Succeeded":
		// Clean shutdown
		return structs.VM_STATUS_STOPPED, nodeName

	case "Failed":
		// Error state - check conditions for more detail
		reason := ""
		if readyCondition != nil {
			reason, _, _ = unstructured.NestedString(readyCondition, "reason")
		}
		log.Printf("Informers: VMI %s failed with reason: %s", vmId, reason)
		return structs.VM_STATUS_FAILED, nodeName

	case "Unknown":
		// Node communication lost
		log.Printf("Informers: VMI %s in Unknown phase - node communication lost", vmId)
		return structs.VM_STATUS_OFFLINE, nodeName

	default:
		// Unknown phase - log and treat as pending
		log.Printf("Informers: WARNING: Unknown VMI phase %q for %s - treating as PENDING", phase, vmId)
		return structs.VM_STATUS_PENDING, nodeName
	}
}

// findCondition finds a condition by type in a conditions slice.
func (im *InformerManager) findCondition(conditions []interface{}, conditionType string) map[string]interface{} {
	for _, c := range conditions {
		condition, ok := c.(map[string]interface{})
		if !ok {
			continue
		}
		cType, _, _ := unstructured.NestedString(condition, "type")
		if cType == conditionType {
			return condition
		}
	}
	return nil
}

// Job Event Handlers

func (im *InformerManager) onJobAdd(obj interface{}) {
	job, ok := obj.(*batchv1.Job)
	if !ok {
		log.Printf("Informers: WARNING: onJobAdd received non-Job object")
		return
	}

	jobId := im.extractJobId(job)
	if jobId == "" {
		return
	}

	status, exitCode, errorMsg := im.extractJobStatus(job)
	nodeId := "" // Will be updated by pod events

	log.Printf("Informers: Job ADD %s -> %s", jobId, status)
	im.jobManager.HandleJobEvent(jobId, status, exitCode, errorMsg, nodeId)
}

func (im *InformerManager) onJobUpdate(oldObj, newObj interface{}) {
	job, ok := newObj.(*batchv1.Job)
	if !ok {
		log.Printf("Informers: WARNING: onJobUpdate received non-Job object")
		return
	}

	jobId := im.extractJobId(job)
	if jobId == "" {
		return
	}

	status, exitCode, errorMsg := im.extractJobStatus(job)
	nodeId := "" // Will be updated by pod events

	log.Printf("Informers: Job UPDATE %s -> %s", jobId, status)
	im.jobManager.HandleJobEvent(jobId, status, exitCode, errorMsg, nodeId)
}

func (im *InformerManager) onJobDelete(obj interface{}) {
	job, ok := obj.(*batchv1.Job)
	if !ok {
		tombstone, ok := obj.(cache.DeletedFinalStateUnknown)
		if !ok {
			log.Printf("Informers: WARNING: onJobDelete received unknown object type")
			return
		}
		job, ok = tombstone.Obj.(*batchv1.Job)
		if !ok {
			log.Printf("Informers: WARNING: onJobDelete tombstone contains non-Job object")
			return
		}
	}

	jobId := im.extractJobId(job)
	if jobId == "" {
		return
	}

	log.Printf("Informers: Job DELETE %s -> CANCELLED", jobId)
	im.jobManager.HandleJobEvent(jobId, structs.JOB_STATUS_CANCELLED, nil, "Job deleted", "")
}

// extractJobId gets the job ID from the label.
func (im *InformerManager) extractJobId(job *batchv1.Job) string {
	if job.Labels == nil {
		return ""
	}
	return job.Labels["uvacompute.io/job-id"]
}

// extractJobStatus determines job status from Job conditions.
func (im *InformerManager) extractJobStatus(job *batchv1.Job) (structs.JobStatus, *int, string) {
	for _, condition := range job.Status.Conditions {
		if condition.Type == batchv1.JobComplete && condition.Status == corev1.ConditionTrue {
			exitCode := 0
			return structs.JOB_STATUS_COMPLETED, &exitCode, ""
		}
		if condition.Type == batchv1.JobFailed && condition.Status == corev1.ConditionTrue {
			exitCode := 1
			return structs.JOB_STATUS_FAILED, &exitCode, condition.Message
		}
	}

	// Not terminal - status will be determined by pod events
	return structs.JOB_STATUS_PENDING, nil, ""
}

// Pod Event Handlers - provide more granular job status

func (im *InformerManager) onPodAdd(obj interface{}) {
	pod, ok := obj.(*corev1.Pod)
	if !ok {
		log.Printf("Informers: WARNING: onPodAdd received non-Pod object")
		return
	}

	im.handlePodEvent(pod)
}

func (im *InformerManager) onPodUpdate(oldObj, newObj interface{}) {
	pod, ok := newObj.(*corev1.Pod)
	if !ok {
		log.Printf("Informers: WARNING: onPodUpdate received non-Pod object")
		return
	}

	im.handlePodEvent(pod)
}

func (im *InformerManager) onPodDelete(obj interface{}) {
	pod, ok := obj.(*corev1.Pod)
	if !ok {
		tombstone, ok := obj.(cache.DeletedFinalStateUnknown)
		if !ok {
			log.Printf("Informers: WARNING: onPodDelete received unknown object type")
			return
		}
		pod, ok = tombstone.Obj.(*corev1.Pod)
		if !ok {
			log.Printf("Informers: WARNING: onPodDelete tombstone contains non-Pod object")
			return
		}
	}

	jobId := im.extractPodJobId(pod)
	if jobId == "" {
		return
	}

	// Pod deletion - the Job controller will handle the final status
	log.Printf("Informers: Pod DELETE for job %s", jobId)
}

// extractPodJobId gets the job ID from pod labels.
func (im *InformerManager) extractPodJobId(pod *corev1.Pod) string {
	if pod.Labels == nil {
		return ""
	}
	return pod.Labels["uvacompute.io/job-id"]
}

// handlePodEvent processes a pod event to determine job status.
// This logic is adapted from jobs.go checkJobStatus.
func (im *InformerManager) handlePodEvent(pod *corev1.Pod) {
	jobId := im.extractPodJobId(pod)
	if jobId == "" {
		return
	}

	nodeId := pod.Spec.NodeName
	status, exitCode, errorMsg, isTerminal := im.extractPodStatus(pod, jobId)

	if isTerminal {
		log.Printf("Informers: Pod %s (job %s) -> TERMINAL %s (exit: %v, error: %s)", pod.Name, jobId, status, exitCode, errorMsg)
	} else {
		log.Printf("Informers: Pod %s (job %s) -> %s (node: %s)", pod.Name, jobId, status, nodeId)
	}

	im.jobManager.HandleJobEvent(jobId, status, exitCode, errorMsg, nodeId)
}

// extractPodStatus determines job status from pod state.
// Returns status, exitCode, errorMsg, and whether the status is terminal.
func (im *InformerManager) extractPodStatus(pod *corev1.Pod, jobId string) (structs.JobStatus, *int, string, bool) {
	nodeId := pod.Spec.NodeName

	switch pod.Status.Phase {
	case corev1.PodPending:
		return im.handlePendingPod(pod, jobId, nodeId)

	case corev1.PodRunning:
		return im.handleRunningPod(pod, jobId, nodeId)

	case corev1.PodSucceeded:
		exitCode := 0
		if len(pod.Status.ContainerStatuses) > 0 && pod.Status.ContainerStatuses[0].State.Terminated != nil {
			exitCode = int(pod.Status.ContainerStatuses[0].State.Terminated.ExitCode)
		}
		return structs.JOB_STATUS_COMPLETED, &exitCode, "", true

	case corev1.PodFailed:
		exitCode := 1
		errorMsg := ""
		if len(pod.Status.ContainerStatuses) > 0 && pod.Status.ContainerStatuses[0].State.Terminated != nil {
			exitCode = int(pod.Status.ContainerStatuses[0].State.Terminated.ExitCode)
			errorMsg = pod.Status.ContainerStatuses[0].State.Terminated.Message
		}
		return structs.JOB_STATUS_FAILED, &exitCode, errorMsg, true

	case corev1.PodUnknown:
		exitCode := 1
		return structs.JOB_STATUS_FAILED, &exitCode, "Pod state unknown - node communication error", true

	default:
		log.Printf("Informers: WARNING: Unknown pod phase %q for job %s - treating as PENDING", pod.Status.Phase, jobId)
		return structs.JOB_STATUS_PENDING, nil, "", false
	}
}

// handlePendingPod handles the PodPending phase with detailed container state checking.
func (im *InformerManager) handlePendingPod(pod *corev1.Pod, jobId, nodeId string) (structs.JobStatus, *int, string, bool) {
	// Check pod conditions for scheduling failures
	for _, condition := range pod.Status.Conditions {
		if condition.Type == corev1.PodScheduled && condition.Status == corev1.ConditionFalse {
			if condition.Reason == "Unschedulable" {
				exitCode := 1
				return structs.JOB_STATUS_FAILED, &exitCode, "Pod unschedulable: " + condition.Message, true
			}
		}
	}

	// Check init container statuses for failures
	for _, containerStatus := range pod.Status.InitContainerStatuses {
		if containerStatus.State.Waiting != nil {
			reason := containerStatus.State.Waiting.Reason
			message := containerStatus.State.Waiting.Message

			if isFatalWaitingReason(reason) {
				exitCode := 1
				return structs.JOB_STATUS_FAILED, &exitCode, "Init container failed: " + message, true
			}
		}
		if containerStatus.State.Terminated != nil && containerStatus.State.Terminated.ExitCode != 0 {
			exitCode := int(containerStatus.State.Terminated.ExitCode)
			return structs.JOB_STATUS_FAILED, &exitCode, "Init container failed: " + containerStatus.State.Terminated.Message, true
		}
	}

	// Check main container statuses
	for _, containerStatus := range pod.Status.ContainerStatuses {
		// Check for terminated containers first (immediate startup failures)
		if containerStatus.State.Terminated != nil && containerStatus.State.Terminated.ExitCode != 0 {
			exitCode := int(containerStatus.State.Terminated.ExitCode)
			errorMsg := containerStatus.State.Terminated.Message
			if errorMsg == "" {
				errorMsg = containerStatus.State.Terminated.Reason
			}
			return structs.JOB_STATUS_FAILED, &exitCode, "Container failed: " + errorMsg, true
		}

		if containerStatus.State.Waiting != nil {
			reason := containerStatus.State.Waiting.Reason
			message := containerStatus.State.Waiting.Message

			if isFatalWaitingReason(reason) {
				exitCode := 1
				return structs.JOB_STATUS_FAILED, &exitCode, getWaitingErrorMessage(reason, message), true
			}

			if isTransientWaitingReason(reason) {
				return structs.JOB_STATUS_PULLING, nil, "", false
			}

			// Unknown waiting reason - log it
			log.Printf("Informers: WARNING: Unknown container waiting reason for job %s: %s - %s", jobId, reason, message)
		}
	}

	// Default for pending pods
	if nodeId != "" {
		return structs.JOB_STATUS_PULLING, nil, "", false
	}
	return structs.JOB_STATUS_SCHEDULED, nil, "", false
}

// handleRunningPod handles the PodRunning phase.
func (im *InformerManager) handleRunningPod(pod *corev1.Pod, jobId, nodeId string) (structs.JobStatus, *int, string, bool) {
	// Check if any container has already terminated
	for _, containerStatus := range pod.Status.ContainerStatuses {
		if containerStatus.Name == "job" && containerStatus.State.Terminated != nil {
			exitCode := int(containerStatus.State.Terminated.ExitCode)
			if exitCode != 0 {
				errorMsg := containerStatus.State.Terminated.Message
				if errorMsg == "" {
					errorMsg = containerStatus.State.Terminated.Reason
				}
				return structs.JOB_STATUS_FAILED, &exitCode, "Container failed: " + errorMsg, true
			}
			// Container completed successfully
			return structs.JOB_STATUS_COMPLETED, &exitCode, "", true
		}
	}

	return structs.JOB_STATUS_RUNNING, nil, "", false
}

// isFatalWaitingReason returns true if the waiting reason indicates a non-recoverable error.
func isFatalWaitingReason(reason string) bool {
	switch reason {
	case "CrashLoopBackOff",
		"CreateContainerConfigError",
		"CreateContainerError",
		"InvalidImageName",
		"ErrImageNeverPull",
		"RunContainerError",
		"StartError",
		"ContainerCannotRun",
		"PreStartHookError",
		"PostStartHookError",
		"PreCreateHookError",
		"ImageInspectError":
		return true
	default:
		return false
	}
}

// isTransientWaitingReason returns true if the waiting reason is transient and will resolve.
func isTransientWaitingReason(reason string) bool {
	switch reason {
	case "ContainerCreating",
		"Pulling",
		"ImagePullBackOff",
		"ErrImagePull",
		"PodInitializing":
		return true
	default:
		return false
	}
}

// getWaitingErrorMessage returns a descriptive error message for a fatal waiting reason.
func getWaitingErrorMessage(reason, message string) string {
	switch reason {
	case "CrashLoopBackOff":
		return "Container crashed: " + message
	case "CreateContainerConfigError", "CreateContainerError":
		return "Container creation error: " + message
	case "InvalidImageName":
		return "Invalid image name: " + message
	case "ErrImageNeverPull":
		return "Image not present and pull policy is Never: " + message
	case "RunContainerError":
		return "Container failed to start: " + message
	case "StartError":
		return "Container start error: " + message
	case "ContainerCannotRun":
		return "Container cannot run: " + message
	case "PreStartHookError":
		return "PreStart hook failed: " + message
	case "PostStartHookError":
		return "PostStart hook failed: " + message
	case "PreCreateHookError":
		return "PreCreate hook failed: " + message
	case "ImageInspectError":
		return "Cannot inspect image: " + message
	default:
		return reason + ": " + message
	}
}
