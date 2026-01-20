package lib

import (
	"context"
	"fmt"
	"io"
	"log"
	"time"

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

func (j *JobAdapter) CreateJob(jobId string, image string, command []string, env map[string]string, cpus, ram, gpus int, statusCallback structs.JobStatusCallback) error {
	ctx := context.Background()

	statusCallback(structs.JOB_STATUS_PENDING, nil, "")

	job := j.buildJobObject(jobId, image, command, env, cpus, ram, gpus)

	statusCallback(structs.JOB_STATUS_SCHEDULED, nil, "")
	_, err := j.client.BatchV1().Jobs(j.namespace).Create(ctx, job, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create job: %w", err)
	}

	go j.watchJobStatus(ctx, jobId, statusCallback)

	return nil
}

func (j *JobAdapter) buildJobObject(jobId string, image string, command []string, env map[string]string, cpus, ram, gpus int) *batchv1.Job {
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
				Spec: corev1.PodSpec{
					RestartPolicy: corev1.RestartPolicyNever,
					Containers:    []corev1.Container{container},
				},
			},
		},
	}

	return job
}

func (j *JobAdapter) watchJobStatus(ctx context.Context, jobId string, statusCallback structs.JobStatusCallback) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	timeout := time.After(24 * time.Hour)

	for {
		select {
		case <-ctx.Done():
			return
		case <-timeout:
			statusCallback(structs.JOB_STATUS_FAILED, nil, "job watcher timeout")
			return
		case <-ticker.C:
			status, exitCode, errorMsg, done := j.checkJobStatus(ctx, jobId)
			if done {
				statusCallback(status, exitCode, errorMsg)
				return
			}
			statusCallback(status, nil, "")
		}
	}
}

func (j *JobAdapter) checkJobStatus(ctx context.Context, jobId string) (structs.JobStatus, *int, string, bool) {
	job, err := j.client.BatchV1().Jobs(j.namespace).Get(ctx, jobId, metav1.GetOptions{})
	if err != nil {
		if errors.IsNotFound(err) {
			return structs.JOB_STATUS_CANCELLED, nil, "job not found", true
		}
		log.Printf("Error getting job %s: %v", jobId, err)
		return structs.JOB_STATUS_PENDING, nil, "", false
	}

	for _, condition := range job.Status.Conditions {
		if condition.Type == batchv1.JobComplete && condition.Status == corev1.ConditionTrue {
			exitCode := 0
			return structs.JOB_STATUS_COMPLETED, &exitCode, "", true
		}
		if condition.Type == batchv1.JobFailed && condition.Status == corev1.ConditionTrue {
			exitCode := 1
			return structs.JOB_STATUS_FAILED, &exitCode, condition.Message, true
		}
	}

	pods, err := j.client.CoreV1().Pods(j.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("uvacompute.io/job-id=%s", jobId),
	})
	if err != nil || len(pods.Items) == 0 {
		return structs.JOB_STATUS_SCHEDULED, nil, "", false
	}

	pod := pods.Items[0]
	switch pod.Status.Phase {
	case corev1.PodPending:
		for _, containerStatus := range pod.Status.ContainerStatuses {
			if containerStatus.State.Waiting != nil {
				reason := containerStatus.State.Waiting.Reason
				if reason == "ImagePullBackOff" || reason == "ErrImagePull" || reason == "Pulling" {
					return structs.JOB_STATUS_PULLING, nil, "", false
				}
			}
		}
		return structs.JOB_STATUS_SCHEDULED, nil, "", false
	case corev1.PodRunning:
		return structs.JOB_STATUS_RUNNING, nil, "", false
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
	}

	return structs.JOB_STATUS_PENDING, nil, "", false
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

	status, _, _, _ := j.checkJobStatus(ctx, jobId)
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
