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

// Grace period before treating Unschedulable as a terminal failure.
// Allows K8s scheduler to retry as resources free up (e.g., completing pods being cleaned up).
const unschedulableGracePeriod = 60 * time.Second

type InformerManager struct {
	dynamicFactory          dynamicinformer.DynamicSharedInformerFactory
	typedFactory            informers.SharedInformerFactory
	cdiFactory              informers.SharedInformerFactory
	vmiInformer             cache.SharedIndexInformer
	jobInformer             cache.SharedIndexInformer
	podInformer             cache.SharedIndexInformer
	cdiPodInformer          cache.SharedIndexInformer
	vmManager               *structs.VMManager
	jobManager              *structs.JobManager
	callbackClient          structs.CallbackClient
	k8sClient               kubernetes.Interface
	namespace               string
	stopCh                  chan struct{}
	mu                      sync.Mutex
	started                 bool
	pendingScheduleChecks   map[string]bool // tracks pending re-check goroutines by pod name
}

type InformerConfig struct {
	KubeconfigPath string
	Namespace      string
	ResyncPeriod   time.Duration // Default: 15 minutes
}

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

	dynamicFactory := dynamicinformer.NewFilteredDynamicSharedInformerFactory(
		dynamicClient,
		resyncPeriod,
		config.Namespace,
		func(options *metav1.ListOptions) {
			options.LabelSelector = "app.kubernetes.io/managed-by=vm-orchestration-service"
		},
	)

	typedFactory := informers.NewSharedInformerFactoryWithOptions(
		typedClient,
		resyncPeriod,
		informers.WithNamespace(config.Namespace),
		informers.WithTweakListOptions(func(options *metav1.ListOptions) {
			options.LabelSelector = "uvacompute.io/job-id"
		}),
	)

	cdiFactory := informers.NewSharedInformerFactoryWithOptions(
		typedClient,
		resyncPeriod,
		informers.WithNamespace("cdi"),
	)

	return &InformerManager{
		dynamicFactory:        dynamicFactory,
		typedFactory:          typedFactory,
		cdiFactory:            cdiFactory,
		vmManager:             vmManager,
		jobManager:            jobManager,
		callbackClient:        callbackClient,
		k8sClient:             typedClient,
		namespace:             config.Namespace,
		stopCh:                make(chan struct{}),
		pendingScheduleChecks: make(map[string]bool),
	}, nil
}

func (im *InformerManager) Start(ctx context.Context) error {
	im.mu.Lock()
	if im.started {
		im.mu.Unlock()
		return fmt.Errorf("informer manager already started")
	}
	im.started = true
	im.mu.Unlock()

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

	im.jobInformer = im.typedFactory.Batch().V1().Jobs().Informer()
	im.jobInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    im.onJobAdd,
		UpdateFunc: im.onJobUpdate,
		DeleteFunc: im.onJobDelete,
	})

	im.podInformer = im.typedFactory.Core().V1().Pods().Informer()
	im.podInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    im.onPodAdd,
		UpdateFunc: im.onPodUpdate,
		DeleteFunc: im.onPodDelete,
	})

	im.cdiPodInformer = im.cdiFactory.Core().V1().Pods().Informer()
	im.cdiPodInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    im.onCDIPodEvent,
		UpdateFunc: func(_, newObj interface{}) { im.onCDIPodEvent(newObj) },
	})

	im.dynamicFactory.Start(im.stopCh)
	im.typedFactory.Start(im.stopCh)
	im.cdiFactory.Start(im.stopCh)

	log.Printf("Informers: Waiting for cache sync...")

	syncCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	syncCh := make(chan bool, 1)
	go func() {
		dynamicSynced := im.dynamicFactory.WaitForCacheSync(im.stopCh)
		typedSynced := im.typedFactory.WaitForCacheSync(im.stopCh)
		cdiSynced := im.cdiFactory.WaitForCacheSync(im.stopCh)

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
		for _, synced := range cdiSynced {
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

func (im *InformerManager) extractVMIStatus(vmi *unstructured.Unstructured) (structs.VMStatus, string) {
	vmId := vmi.GetName()

	statusObj, found, err := unstructured.NestedMap(vmi.Object, "status")
	if err != nil || !found {
		return structs.VM_STATUS_PENDING, ""
	}

	phase, _, _ := unstructured.NestedString(statusObj, "phase")
	nodeName, _, _ := unstructured.NestedString(statusObj, "nodeName")

	conditions, _, _ := unstructured.NestedSlice(statusObj, "conditions")
	readyCondition := im.findCondition(conditions, "Ready")

	// Skip status update during migration
	migrationState, migrationFound, _ := unstructured.NestedMap(statusObj, "migrationState")
	if migrationFound && migrationState != nil {
		completed, _, _ := unstructured.NestedBool(migrationState, "completed")
		if !completed {
			log.Printf("Informers: VMI %s migration in progress", vmId)
			return structs.VM_STATUS_READY, nodeName
		}
	}

	// Paused VMs are still considered ready
	pausedCondition := im.findCondition(conditions, "Paused")
	if pausedCondition != nil {
		pausedStatus, _, _ := unstructured.NestedString(pausedCondition, "status")
		if pausedStatus == "True" {
			return structs.VM_STATUS_READY, nodeName
		}
	}

	switch phase {
	case "":
		return structs.VM_STATUS_PENDING, nodeName
	case "Pending", "Scheduling", "Scheduled", "WaitingForSync":
		return structs.VM_STATUS_BOOTING, nodeName
	case "Running":
		if readyCondition != nil {
			status, _, _ := unstructured.NestedString(readyCondition, "status")
			if status == "True" {
				return structs.VM_STATUS_READY, nodeName
			}
		}
		return structs.VM_STATUS_PROVISIONING, nodeName
	case "Succeeded":
		return structs.VM_STATUS_STOPPED, nodeName
	case "Failed":
		reason := ""
		if readyCondition != nil {
			reason, _, _ = unstructured.NestedString(readyCondition, "reason")
		}
		log.Printf("Informers: VMI %s failed with reason: %s", vmId, reason)
		return structs.VM_STATUS_FAILED, nodeName
	case "Unknown":
		log.Printf("Informers: VMI %s in Unknown phase - node lost", vmId)
		return structs.VM_STATUS_OFFLINE, nodeName
	default:
		log.Printf("Informers: WARNING: Unhandled VMI phase %q for %s", phase, vmId)
		return structs.VM_STATUS_PENDING, nodeName
	}
}

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
	nodeId := ""

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
	nodeId := ""

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

func (im *InformerManager) extractJobId(job *batchv1.Job) string {
	if job.Labels == nil {
		return ""
	}
	return job.Labels["uvacompute.io/job-id"]
}

func (im *InformerManager) extractJobStatus(job *batchv1.Job) (structs.JobStatus, *int, string) {
	for _, condition := range job.Status.Conditions {
		if condition.Type == batchv1.JobComplete && condition.Status == corev1.ConditionTrue {
			return structs.JOB_STATUS_COMPLETED, nil, ""
		}
		if condition.Type == batchv1.JobFailed && condition.Status == corev1.ConditionTrue {
			return structs.JOB_STATUS_FAILED, nil, condition.Message
		}
	}

	return structs.JOB_STATUS_PENDING, nil, ""
}

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

	log.Printf("Informers: Pod DELETE for job %s", jobId)
}

// scheduleUnschedulableRecheck schedules a goroutine to re-fetch and re-process
// a pod's status after a delay. This handles the case where a pod is temporarily
// unschedulable (e.g., resources being freed from a completing job) and gives
// the K8s scheduler time to retry before we declare failure.
func (im *InformerManager) scheduleUnschedulableRecheck(podName, jobId string, delay time.Duration) {
	im.mu.Lock()
	if im.pendingScheduleChecks[podName] {
		im.mu.Unlock()
		return
	}
	im.pendingScheduleChecks[podName] = true
	im.mu.Unlock()

	go func() {
		select {
		case <-time.After(delay):
		case <-im.stopCh:
			im.mu.Lock()
			delete(im.pendingScheduleChecks, podName)
			im.mu.Unlock()
			return
		}

		im.mu.Lock()
		delete(im.pendingScheduleChecks, podName)
		im.mu.Unlock()

		pod, err := im.k8sClient.CoreV1().Pods(im.namespace).Get(context.Background(), podName, metav1.GetOptions{})
		if err != nil {
			log.Printf("Informers: Failed to re-check unschedulable pod %s (job %s): %v", podName, jobId, err)
			return
		}

		log.Printf("Informers: Re-checking unschedulable pod %s (job %s) after grace period", podName, jobId)
		im.handlePodEvent(pod)
	}()
}

func (im *InformerManager) extractPodJobId(pod *corev1.Pod) string {
	if pod.Labels == nil {
		return ""
	}
	return pod.Labels["uvacompute.io/job-id"]
}

const jobContainerName = "job"

func findContainerStatus(statuses []corev1.ContainerStatus, name string) *corev1.ContainerStatus {
	for i := range statuses {
		if statuses[i].Name == name {
			return &statuses[i]
		}
	}
	return nil
}

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

func (im *InformerManager) extractPodStatus(pod *corev1.Pod, jobId string) (structs.JobStatus, *int, string, bool) {
	nodeId := pod.Spec.NodeName

	switch pod.Status.Phase {
	case corev1.PodPending:
		return im.handlePendingPod(pod, jobId, nodeId)

	case corev1.PodRunning:
		return im.handleRunningPod(pod, jobId, nodeId)

	case corev1.PodSucceeded:
		exitCode := 0
		if cs := findContainerStatus(pod.Status.ContainerStatuses, jobContainerName); cs != nil && cs.State.Terminated != nil {
			exitCode = int(cs.State.Terminated.ExitCode)
		}
		return structs.JOB_STATUS_COMPLETED, &exitCode, "", true

	case corev1.PodFailed:
		exitCode := 1
		errorMsg := ""
		if cs := findContainerStatus(pod.Status.ContainerStatuses, jobContainerName); cs != nil && cs.State.Terminated != nil {
			exitCode = int(cs.State.Terminated.ExitCode)
			errorMsg = cs.State.Terminated.Message
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

func (im *InformerManager) handlePendingPod(pod *corev1.Pod, jobId, nodeId string) (structs.JobStatus, *int, string, bool) {
	for _, condition := range pod.Status.Conditions {
		if condition.Type == corev1.PodScheduled && condition.Status == corev1.ConditionFalse {
			if condition.Reason == "Unschedulable" {
				elapsed := time.Since(condition.LastTransitionTime.Time)
				if elapsed < unschedulableGracePeriod {
					log.Printf("Informers: Pod %s (job %s) unschedulable for %s, waiting (grace period: %s)",
						pod.Name, jobId, elapsed.Round(time.Second), unschedulableGracePeriod)
					im.scheduleUnschedulableRecheck(pod.Name, jobId, unschedulableGracePeriod-elapsed)
					return structs.JOB_STATUS_SCHEDULED, nil, "", false
				}
				exitCode := 1
				return structs.JOB_STATUS_FAILED, &exitCode, "Pod unschedulable: " + condition.Message, true
			}
		}
	}

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

	for _, containerStatus := range pod.Status.ContainerStatuses {
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

			log.Printf("Informers: WARNING: Unknown container waiting reason for job %s: %s - %s", jobId, reason, message)
		}
	}

	if nodeId != "" {
		return structs.JOB_STATUS_PULLING, nil, "", false
	}
	return structs.JOB_STATUS_SCHEDULED, nil, "", false
}

func (im *InformerManager) handleRunningPod(pod *corev1.Pod, jobId, nodeId string) (structs.JobStatus, *int, string, bool) {
	cs := findContainerStatus(pod.Status.ContainerStatuses, jobContainerName)
	if cs != nil && cs.State.Terminated != nil {
		exitCode := int(cs.State.Terminated.ExitCode)
		if exitCode != 0 {
			errorMsg := cs.State.Terminated.Message
			if errorMsg == "" {
				errorMsg = cs.State.Terminated.Reason
			}
			return structs.JOB_STATUS_FAILED, &exitCode, "Container failed: " + errorMsg, true
		}
		return structs.JOB_STATUS_COMPLETED, &exitCode, "", true
	}

	return structs.JOB_STATUS_RUNNING, nil, "", false
}

func isFatalWaitingReason(reason string) bool {
	switch reason {
	case "CrashLoopBackOff",
		"CreateContainerConfigError",
		"CreateContainerError",
		"InvalidImageName",
		"ErrImageNeverPull",
		"ImageInspectError",
		"RunContainerError",
		"StartError",
		"ContainerCannotRun",
		"PreStartHookError",
		"PostStartHookError",
		"PreCreateHookError":
		return true
	default:
		return false
	}
}

func isTransientWaitingReason(reason string) bool {
	switch reason {
	case "ContainerCreating",
		"PodInitializing",
		"Pulling",
		"ErrImagePull",
		"ImagePullBackOff",
		"RegistryUnavailable":
		return true
	default:
		return false
	}
}

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

func (im *InformerManager) onCDIPodEvent(obj interface{}) {
	pod, ok := obj.(*corev1.Pod)
	if !ok {
		return
	}

	switch pod.Status.Phase {
	case corev1.PodSucceeded, corev1.PodFailed, corev1.PodUnknown:
	case corev1.PodPending, corev1.PodRunning:
		shouldDelete := false
		for _, cs := range pod.Status.ContainerStatuses {
			if cs.State.Terminated != nil && cs.State.Terminated.Reason == "ContainerStatusUnknown" {
				shouldDelete = true
				break
			}
		}
		if !shouldDelete {
			return
		}
	default:
		return
	}

	ctx := context.Background()
	err := im.k8sClient.CoreV1().Pods("cdi").Delete(ctx, pod.Name, metav1.DeleteOptions{})
	if err != nil {
		log.Printf("Informers: failed to delete terminal CDI pod %s: %v", pod.Name, err)
	} else {
		log.Printf("Informers: deleted terminal CDI pod %s (phase: %s)", pod.Name, pod.Status.Phase)
	}
}
