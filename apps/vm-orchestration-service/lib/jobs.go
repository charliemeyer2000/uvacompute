package lib

import (
	"context"
	"fmt"
	"io"
	"log"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	"vm-orchestration-service/structs"
)

type JobAdapterConfig struct {
	Namespace      string
	KubeconfigPath string
}

type JobAdapter struct {
	client    kubernetes.Interface
	namespace string
}

func NewJobAdapter(config JobAdapterConfig) (*JobAdapter, error) {
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

	client, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes client: %w", err)
	}

	return &JobAdapter{
		client:    client,
		namespace: config.Namespace,
	}, nil
}

func (j *JobAdapter) CreateJob(jobId string, image string, command []string, env map[string]string, cpus, ram, gpus, disk int, statusCallback structs.JobStatusCallback, expose *int, exposeSubdomain *string) error {
	ctx := context.Background()

	statusCallback(structs.JOB_STATUS_PENDING, nil, "", "")

	job, err := j.buildJobObject(jobId, image, command, env, cpus, ram, gpus, disk, expose, exposeSubdomain)
	if err != nil {
		return fmt.Errorf("failed to build job: %w", err)
	}

	statusCallback(structs.JOB_STATUS_SCHEDULED, nil, "", "")
	_, err = j.client.BatchV1().Jobs(j.namespace).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create job: %w", err)
	}

	// Status updates are now handled by SharedInformers (see lib/informers.go)
	// No need to spawn per-job polling goroutines

	return nil
}

func (j *JobAdapter) buildJobObject(jobId string, image string, command []string, env map[string]string, cpus, ram, gpus, disk int, expose *int, exposeSubdomain *string) (*batchv1.Job, error) {
	var backoffLimit int32 = 0
	var ttlSeconds int32 = 3600

	envVars := make([]corev1.EnvVar, 0, len(env))
	for k, v := range env {
		envVars = append(envVars, corev1.EnvVar{
			Name:  k,
			Value: v,
		})
	}

	resources := corev1.ResourceRequirements{
		Requests: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse(fmt.Sprintf("%d", cpus)),
			corev1.ResourceMemory: resource.MustParse(fmt.Sprintf("%dGi", ram)),
		},
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse(fmt.Sprintf("%d", cpus)),
			corev1.ResourceMemory: resource.MustParse(fmt.Sprintf("%dGi", ram)),
		},
	}

	if gpus > 0 {
		resources.Limits["nvidia.com/gpu"] = resource.MustParse(fmt.Sprintf("%d", gpus))
	}

	container := corev1.Container{
		Name:      "job",
		Image:     image,
		Env:       envVars,
		Resources: resources,
	}

	if len(command) > 0 {
		container.Command = command
	}

	// Add scratch volume mount if disk > 0
	if disk > 0 {
		container.VolumeMounts = []corev1.VolumeMount{
			{
				Name:      "scratch",
				MountPath: "/scratch",
			},
		}
	}

	containers := []corev1.Container{container}

	if expose != nil && exposeSubdomain != nil {
		frpcSidecar := buildFrpcSidecar(*expose, *exposeSubdomain)
		containers = append(containers, frpcSidecar)
	}

	podSpec := corev1.PodSpec{
		RestartPolicy: corev1.RestartPolicyNever,
		Containers:    containers,
		DNSPolicy:     corev1.DNSDefault, // Use node's DNS to avoid cluster DNS issues
	}

	// Add scratch volume if disk > 0
	if disk > 0 {
		diskQuantity := resource.MustParse(fmt.Sprintf("%dGi", disk))
		podSpec.Volumes = []corev1.Volume{
			{
				Name: "scratch",
				VolumeSource: corev1.VolumeSource{
					EmptyDir: &corev1.EmptyDirVolumeSource{
						SizeLimit: &diskQuantity,
					},
				},
			},
		}
	}

	if expose != nil && exposeSubdomain != nil {
		frpcConfig := GenerateFrpcConfig(*expose, *exposeSubdomain)
		if podSpec.Volumes == nil {
			podSpec.Volumes = []corev1.Volume{}
		}
		podSpec.Volumes = append(podSpec.Volumes, corev1.Volume{
			Name: "frpc-config",
			VolumeSource: corev1.VolumeSource{
				ConfigMap: &corev1.ConfigMapVolumeSource{
					LocalObjectReference: corev1.LocalObjectReference{
						Name: fmt.Sprintf("frpc-%s", jobId),
					},
				},
			},
		})
		if err := j.createFrpcConfigMap(jobId, frpcConfig); err != nil {
			return nil, fmt.Errorf("failed to create frpc ConfigMap: %w", err)
		}
	}

	if gpus > 0 {
		podSpec.NodeSelector = map[string]string{
			"uvacompute.com/has-gpu": "true",
		}
		runtimeClass := "nvidia"
		podSpec.RuntimeClassName = &runtimeClass
	}

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      jobId,
			Namespace: j.namespace,
			Labels: map[string]string{
				"app.kubernetes.io/name":       "uvacompute-job",
				"app.kubernetes.io/managed-by": "vm-orchestration-service",
				"uvacompute.io/job-id":         jobId,
			},
		},
		Spec: batchv1.JobSpec{
			BackoffLimit:            &backoffLimit,
			TTLSecondsAfterFinished: &ttlSeconds,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app.kubernetes.io/name": "uvacompute-job",
						"uvacompute.io/job-id":   jobId,
					},
				},
				Spec: podSpec,
			},
		},
	}

	return job, nil
}

func buildFrpcSidecar(port int, subdomain string) corev1.Container {
	return corev1.Container{
		Name:  "frpc",
		Image: "snowdreamtech/frpc:0.61.0",
		Args:  []string{"-c", "/etc/frp/frpc.toml"},
		Resources: corev1.ResourceRequirements{
			Requests: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("10m"),
				corev1.ResourceMemory: resource.MustParse("32Mi"),
			},
			Limits: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse("100m"),
				corev1.ResourceMemory: resource.MustParse("64Mi"),
			},
		},
		VolumeMounts: []corev1.VolumeMount{
			{
				Name:      "frpc-config",
				MountPath: "/etc/frp",
				ReadOnly:  true,
			},
		},
	}
}

// createFrpcConfigMap creates a ConfigMap with the frpc configuration
func (j *JobAdapter) createFrpcConfigMap(jobId string, config string) error {
	ctx := context.Background()

	configMap := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("frpc-%s", jobId),
			Namespace: j.namespace,
			Labels: map[string]string{
				"app.kubernetes.io/managed-by": "vm-orchestration-service",
				"uvacompute.io/job-id":         jobId,
			},
		},
		Data: map[string]string{
			"frpc.toml": config,
		},
	}

	_, err := j.client.CoreV1().ConfigMaps(j.namespace).Create(ctx, configMap, metav1.CreateOptions{})
	if err != nil {
		log.Printf("WARNING: Failed to create frpc ConfigMap for job %s: %v", jobId, err)
		return err
	}

	return nil
}

// watchJobStatus is deprecated - status updates are now handled by SharedInformers.
// The checkJobStatus function is still used for on-demand status checks.
// This function is kept for reference but is no longer called.
func (j *JobAdapter) watchJobStatusDeprecated(ctx context.Context, jobId string, statusCallback structs.JobStatusCallback) {
	// Deprecated: See lib/informers.go for event-driven status updates
	_ = ctx
	_ = jobId
	_ = statusCallback
}

func (j *JobAdapter) checkJobStatus(ctx context.Context, jobId string) (structs.JobStatus, *int, string, string, bool) {
	job, err := j.client.BatchV1().Jobs(j.namespace).Get(ctx, jobId, metav1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			return structs.JOB_STATUS_CANCELLED, nil, "job not found", "", true
		}
		log.Printf("Error getting job %s: %v", jobId, err)
		return structs.JOB_STATUS_PENDING, nil, "", "", false
	}

	pods, err := j.client.CoreV1().Pods(j.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("uvacompute.io/job-id=%s", jobId),
	})

	var nodeId string
	var pod *corev1.Pod
	if err == nil && len(pods.Items) > 0 {
		pod = &pods.Items[0]
		nodeId = pod.Spec.NodeName
	}

	for _, condition := range job.Status.Conditions {
		if condition.Type == batchv1.JobComplete && condition.Status == corev1.ConditionTrue {
			exitCode := 0
			return structs.JOB_STATUS_COMPLETED, &exitCode, "", nodeId, true
		}
		if condition.Type == batchv1.JobFailed && condition.Status == corev1.ConditionTrue {
			exitCode := 1
			return structs.JOB_STATUS_FAILED, &exitCode, condition.Message, nodeId, true
		}
	}

	if pod == nil {
		// Check if pod hasn't been created due to scheduling issues
		// This can happen when the job is created but no pod can be scheduled
		return structs.JOB_STATUS_SCHEDULED, nil, "", "", false
	}

	switch pod.Status.Phase {
	case corev1.PodPending:
		// First check pod conditions for scheduling failures
		for _, condition := range pod.Status.Conditions {
			if condition.Type == corev1.PodScheduled && condition.Status == corev1.ConditionFalse {
				if condition.Reason == "Unschedulable" {
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "Pod unschedulable: " + condition.Message, nodeId, true
				}
			}
		}

		// Check init container statuses for failures
		for _, containerStatus := range pod.Status.InitContainerStatuses {
			if containerStatus.State.Waiting != nil {
				reason := containerStatus.State.Waiting.Reason
				message := containerStatus.State.Waiting.Message

				// Check for fatal init container errors
				switch reason {
				case "CrashLoopBackOff", "RunContainerError", "StartError", "ContainerCannotRun":
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "Init container failed: " + message, nodeId, true
				case "CreateContainerConfigError", "CreateContainerError":
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "Init container creation error: " + message, nodeId, true
				case "InvalidImageName", "ErrImageNeverPull":
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "Init container image error: " + message, nodeId, true
				}
			}
			if containerStatus.State.Terminated != nil && containerStatus.State.Terminated.ExitCode != 0 {
				exitCode := int(containerStatus.State.Terminated.ExitCode)
				return structs.JOB_STATUS_FAILED, &exitCode, "Init container failed: " + containerStatus.State.Terminated.Message, nodeId, true
			}
		}

		// Check main container statuses
		for _, containerStatus := range pod.Status.ContainerStatuses {
			// Check for terminated containers first - this catches immediate startup failures
			// (e.g., "executable file not found in $PATH", command not found, etc.)
			if containerStatus.State.Terminated != nil && containerStatus.State.Terminated.ExitCode != 0 {
				exitCode := int(containerStatus.State.Terminated.ExitCode)
				errorMsg := containerStatus.State.Terminated.Message
				if errorMsg == "" {
					errorMsg = containerStatus.State.Terminated.Reason
				}
				return structs.JOB_STATUS_FAILED, &exitCode, "Container failed: " + errorMsg, nodeId, true
			}

			if containerStatus.State.Waiting != nil {
				reason := containerStatus.State.Waiting.Reason
				message := containerStatus.State.Waiting.Message

				// Fatal error states - these won't recover
				switch reason {
				case "CrashLoopBackOff":
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "Container crashed: " + message, nodeId, true
				case "CreateContainerConfigError", "CreateContainerError":
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "Container creation error: " + message, nodeId, true
				case "InvalidImageName":
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "Invalid image name: " + message, nodeId, true
				case "ErrImageNeverPull":
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "Image not present and pull policy is Never: " + message, nodeId, true
				case "RunContainerError":
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "Container failed to start: " + message, nodeId, true
				case "StartError":
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "Container start error: " + message, nodeId, true
				case "ContainerCannotRun":
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "Container cannot run: " + message, nodeId, true
				case "PreStartHookError":
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "PreStart hook failed: " + message, nodeId, true
				case "PostStartHookError":
					exitCode := 1
					return structs.JOB_STATUS_FAILED, &exitCode, "PostStart hook failed: " + message, nodeId, true
				}

				// Pulling/initialization states - these are transient
				// ContainerCreating: image pull or container setup in progress
				// Pulling: explicit image pull
				// ImagePullBackOff/ErrImagePull: pull failures (Kubernetes will retry)
				// PodInitializing: init containers running
				if reason == "ContainerCreating" || reason == "Pulling" || reason == "ImagePullBackOff" || reason == "ErrImagePull" || reason == "PodInitializing" {
					return structs.JOB_STATUS_PULLING, nil, "", nodeId, false
				}

				// Unknown waiting reason - log it and treat as pulling if we have a node
				log.Printf("Unknown container waiting reason for job %s: %s - %s", jobId, reason, message)
			}
		}
		if nodeId != "" {
			return structs.JOB_STATUS_PULLING, nil, "", nodeId, false
		}
		return structs.JOB_STATUS_SCHEDULED, nil, "", nodeId, false

	case corev1.PodRunning:
		// Check if any container has already terminated with an error
		// This can happen briefly before the pod phase updates to Failed
		for _, containerStatus := range pod.Status.ContainerStatuses {
			if containerStatus.Name == "job" && containerStatus.State.Terminated != nil {
				exitCode := int(containerStatus.State.Terminated.ExitCode)
				if exitCode != 0 {
					errorMsg := containerStatus.State.Terminated.Message
					if errorMsg == "" {
						errorMsg = containerStatus.State.Terminated.Reason
					}
					return structs.JOB_STATUS_FAILED, &exitCode, "Container failed: " + errorMsg, nodeId, true
				}
				// Container completed successfully
				return structs.JOB_STATUS_COMPLETED, &exitCode, "", nodeId, true
			}
		}
		return structs.JOB_STATUS_RUNNING, nil, "", nodeId, false

	case corev1.PodSucceeded:
		exitCode := 0
		if len(pod.Status.ContainerStatuses) > 0 && pod.Status.ContainerStatuses[0].State.Terminated != nil {
			exitCode = int(pod.Status.ContainerStatuses[0].State.Terminated.ExitCode)
		}
		return structs.JOB_STATUS_COMPLETED, &exitCode, "", nodeId, true

	case corev1.PodFailed:
		exitCode := 1
		errorMsg := ""
		if len(pod.Status.ContainerStatuses) > 0 && pod.Status.ContainerStatuses[0].State.Terminated != nil {
			exitCode = int(pod.Status.ContainerStatuses[0].State.Terminated.ExitCode)
			errorMsg = pod.Status.ContainerStatuses[0].State.Terminated.Message
		}
		return structs.JOB_STATUS_FAILED, &exitCode, errorMsg, nodeId, true

	case corev1.PodUnknown:
		// PodUnknown means the state of the pod could not be obtained,
		// typically due to an error in communicating with the node
		exitCode := 1
		return structs.JOB_STATUS_FAILED, &exitCode, "Pod state unknown - node communication error", nodeId, true
	}

	// Fallback for any unhandled phase
	log.Printf("Unknown pod phase for job %s: %s", jobId, pod.Status.Phase)
	return structs.JOB_STATUS_PENDING, nil, "", nodeId, false
}

func (j *JobAdapter) DeleteJob(jobId string) error {
	ctx := context.Background()

	propagationPolicy := metav1.DeletePropagationBackground
	err := j.client.BatchV1().Jobs(j.namespace).Delete(ctx, jobId, metav1.DeleteOptions{
		PropagationPolicy: &propagationPolicy,
	})
	if err != nil && !errors.IsNotFound(err) {
		return fmt.Errorf("failed to delete job: %w", err)
	}

	return nil
}

func (j *JobAdapter) GetJobStatus(jobId string) (structs.JobStatus, error) {
	ctx := context.Background()

	_, err := j.client.BatchV1().Jobs(j.namespace).Get(ctx, jobId, metav1.GetOptions{})
	if err != nil {
		return structs.JOB_STATUS_CANCELLED, err
	}

	status, _, _, _, _ := j.checkJobStatus(ctx, jobId)
	return status, nil
}

func (j *JobAdapter) GetJobLogs(jobId string) (io.ReadCloser, error) {
	ctx := context.Background()

	pods, err := j.client.CoreV1().Pods(j.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("uvacompute.io/job-id=%s", jobId),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list pods for job: %w", err)
	}

	if len(pods.Items) == 0 {
		return nil, fmt.Errorf("no pods found for job %s", jobId)
	}

	podName := pods.Items[0].Name

	req := j.client.CoreV1().Pods(j.namespace).GetLogs(podName, &corev1.PodLogOptions{
		Container: "job",
	})

	stream, err := req.Stream(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get logs: %w", err)
	}

	return stream, nil
}

func (j *JobAdapter) StreamJobLogs(jobId string) (io.ReadCloser, error) {
	ctx := context.Background()

	pods, err := j.client.CoreV1().Pods(j.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("uvacompute.io/job-id=%s", jobId),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list pods for job: %w", err)
	}

	if len(pods.Items) == 0 {
		return nil, fmt.Errorf("no pods found for job %s", jobId)
	}

	podName := pods.Items[0].Name

	req := j.client.CoreV1().Pods(j.namespace).GetLogs(podName, &corev1.PodLogOptions{
		Container: "job",
		Follow:    true,
	})

	stream, err := req.Stream(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to stream logs: %w", err)
	}

	return stream, nil
}

func (j *JobAdapter) Ping() error {
	ctx := context.Background()
	_, err := j.client.BatchV1().Jobs(j.namespace).List(ctx, metav1.ListOptions{Limit: 1})
	return err
}

func (j *JobAdapter) EnsureNamespace() error {
	ctx := context.Background()

	_, err := j.client.CoreV1().Namespaces().Get(ctx, j.namespace, metav1.GetOptions{})
	if err == nil {
		return nil
	}

	if !errors.IsNotFound(err) {
		return fmt.Errorf("failed to check namespace: %w", err)
	}

	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: j.namespace,
			Labels: map[string]string{
				"app.kubernetes.io/managed-by": "vm-orchestration-service",
			},
		},
	}

	_, err = j.client.CoreV1().Namespaces().Create(ctx, ns, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return fmt.Errorf("failed to create namespace: %w", err)
	}

	log.Printf("Created namespace %s", j.namespace)
	return nil
}

// WatchJobStatusRecovered is deprecated - status updates are now handled by SharedInformers.
// This function is kept for backward compatibility but does nothing.
func (j *JobAdapter) WatchJobStatusRecovered(ctx context.Context, jobId string, statusCallback structs.JobStatusCallback) {
	// No-op: Informers handle status updates now
}
