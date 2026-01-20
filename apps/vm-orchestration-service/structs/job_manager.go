package structs

import (
	"fmt"
	"io"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
)

type JobStatusCallback func(status JobStatus, exitCode *int, errorMsg string, nodeId string)

type JobProvider interface {
	CreateJob(jobId string, image string, command []string, env map[string]string, cpus, ram, gpus int, statusCallback JobStatusCallback) error
	DeleteJob(jobId string) error
	GetJobStatus(jobId string) (JobStatus, error)
	GetJobLogs(jobId string) (io.ReadCloser, error)
	StreamJobLogs(jobId string) (io.ReadCloser, error)
}

type JobManager struct {
	mu             sync.Mutex
	jobMap         map[string]JobState
	limits         JobResourceLimits
	jobProvider    JobProvider
	callbackClient CallbackClient
}

func NewJobManager(limits JobResourceLimits, jobProvider JobProvider, callbackClient CallbackClient) *JobManager {
	return &JobManager{
		mu:             sync.Mutex{},
		jobMap:         make(map[string]JobState),
		limits:         limits,
		jobProvider:    jobProvider,
		callbackClient: callbackClient,
	}
}

func (jm *JobManager) CreateJob(req JobCreationRequest) (string, error) {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	if err := jm.checkResourceAvailability(req); err != nil {
		return "", err
	}

	jobId := uuid.New().String()

	cpus := IntOrDefault(req.Cpus, DefaultJobCpus)
	ram := IntOrDefault(req.Ram, DefaultJobRam)
	gpus := IntOrDefault(req.Gpus, DefaultJobGpus)
	name := StringOrDefault(req.Name, "")

	jm.jobMap[jobId] = JobState{
		Id:           jobId,
		Name:         name,
		UserId:       req.UserId,
		CreationTime: time.Now(),
		Image:        req.Image,
		Command:      req.Command,
		Env:          req.Env,
		Cpus:         cpus,
		Ram:          ram,
		Gpus:         gpus,
		Status:       JOB_STATUS_PENDING,
	}

	go jm.createJobAsync(jobId, req.Image, req.Command, req.Env, cpus, ram, gpus)

	return jobId, nil
}

func (jm *JobManager) createJobAsync(jobId string, image string, command []string, env map[string]string, cpus, ram, gpus int) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("ERROR: Panic in createJobAsync for Job %s: %v", jobId, r)
			jm.UpdateJobStatus(jobId, JOB_STATUS_FAILED, nil, fmt.Sprintf("Internal error: %v", r), "")
		}
	}()

	statusCallback := func(status JobStatus, exitCode *int, errorMsg string, nodeId string) {
		jm.UpdateJobStatus(jobId, status, exitCode, errorMsg, nodeId)
	}

	log.Printf("Starting async job creation for %s (image: %s, cpus: %d, ram: %d, gpus: %d)", jobId, image, cpus, ram, gpus)

	err := jm.jobProvider.CreateJob(jobId, image, command, env, cpus, ram, gpus, statusCallback)
	if err != nil {
		log.Printf("ERROR: Failed to create Job %s: %v", jobId, err)
		jm.UpdateJobStatus(jobId, JOB_STATUS_FAILED, nil, err.Error(), "")
		return
	}

	log.Printf("Job %s creation request completed", jobId)
}

func (jm *JobManager) GetJob(jobId string) (JobState, bool) {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	jobState, exists := jm.jobMap[jobId]
	return jobState, exists
}

func (jm *JobManager) GetJobLogs(jobId string) (io.ReadCloser, error) {
	jm.mu.Lock()
	_, exists := jm.jobMap[jobId]
	jm.mu.Unlock()

	if !exists {
		return nil, fmt.Errorf("job %s not found", jobId)
	}

	return jm.jobProvider.GetJobLogs(jobId)
}

func (jm *JobManager) StreamJobLogs(jobId string) (io.ReadCloser, error) {
	jm.mu.Lock()
	jobState, exists := jm.jobMap[jobId]
	jm.mu.Unlock()

	if !exists {
		return nil, fmt.Errorf("job %s not found", jobId)
	}

	if jobState.Status == JOB_STATUS_COMPLETED || jobState.Status == JOB_STATUS_FAILED || jobState.Status == JOB_STATUS_CANCELLED {
		return nil, fmt.Errorf("job %s is in terminal state, use GetJobLogs instead", jobId)
	}

	return jm.jobProvider.StreamJobLogs(jobId)
}

func (jm *JobManager) UpdateJobStatus(jobId string, status JobStatus, exitCode *int, errorMessage string, nodeId string) {
	jm.mu.Lock()
	if jobState, exists := jm.jobMap[jobId]; exists {
		jobState.Status = status
		jobState.ExitCode = exitCode
		jobState.ErrorMessage = errorMessage
		if nodeId != "" {
			jobState.NodeId = nodeId
		}
		jm.jobMap[jobId] = jobState
	}
	jm.mu.Unlock()

	isTerminal := status == JOB_STATUS_COMPLETED || status == JOB_STATUS_FAILED || status == JOB_STATUS_CANCELLED

	if jm.callbackClient != nil {
		go func() {
			if err := jm.callbackClient.NotifyJobStatusUpdate(jobId, string(status), exitCode, errorMessage, nodeId); err != nil {
				log.Printf("ERROR: Failed to notify site about Job %s status update: %v", jobId, err)
			}

			if isTerminal {
				jm.archiveJobLogs(jobId)
			}
		}()
	}
}

func (jm *JobManager) archiveJobLogs(jobId string) {
	if jm.callbackClient == nil {
		return
	}

	logs, err := jm.GetJobLogs(jobId)
	if err != nil {
		log.Printf("WARNING: Failed to get logs for Job %s archival: %v", jobId, err)
		return
	}
	defer logs.Close()

	logsBytes, err := io.ReadAll(logs)
	if err != nil {
		log.Printf("WARNING: Failed to read logs for Job %s archival: %v", jobId, err)
		return
	}

	if len(logsBytes) == 0 {
		log.Printf("INFO: No logs to archive for Job %s", jobId)
		return
	}

	if err := jm.callbackClient.UploadJobLogs(jobId, string(logsBytes)); err != nil {
		log.Printf("WARNING: Failed to upload logs for Job %s: %v", jobId, err)
	}
}

func (jm *JobManager) CancelJob(jobId string) error {
	jm.mu.Lock()
	jobState, exists := jm.jobMap[jobId]
	if !exists {
		jm.mu.Unlock()
		return fmt.Errorf("job %s not found", jobId)
	}

	if jobState.Status == JOB_STATUS_COMPLETED || jobState.Status == JOB_STATUS_FAILED || jobState.Status == JOB_STATUS_CANCELLED {
		jm.mu.Unlock()
		return fmt.Errorf("job %s is already in terminal state: %s", jobId, jobState.Status)
	}

	jobState.Status = JOB_STATUS_CANCELLED
	jm.jobMap[jobId] = jobState
	jm.mu.Unlock()

	err := jm.jobProvider.DeleteJob(jobId)
	if err != nil {
		log.Printf("Warning: Failed to delete job %s from backend: %v", jobId, err)
	}

	if jm.callbackClient != nil {
		go func() {
			if err := jm.callbackClient.NotifyJobStatusUpdate(jobId, string(JOB_STATUS_CANCELLED), nil, "", ""); err != nil {
				log.Printf("ERROR: Failed to notify site about Job %s cancellation: %v", jobId, err)
			}
		}()
	}

	return nil
}

func (jm *JobManager) checkResourceAvailability(req JobCreationRequest) error {
	var totalCpus, totalRam, totalGpus int

	for _, jobState := range jm.jobMap {
		if jobState.Status == JOB_STATUS_PENDING || jobState.Status == JOB_STATUS_SCHEDULED ||
			jobState.Status == JOB_STATUS_PULLING || jobState.Status == JOB_STATUS_RUNNING {
			totalCpus += jobState.Cpus
			totalRam += jobState.Ram
			totalGpus += jobState.Gpus
		}
	}

	requestCpus := IntOrDefault(req.Cpus, DefaultJobCpus)
	requestRam := IntOrDefault(req.Ram, DefaultJobRam)
	requestGpus := IntOrDefault(req.Gpus, DefaultJobGpus)

	if totalCpus+requestCpus > jm.limits.MaxCpus {
		return fmt.Errorf("insufficient CPU resources: requested %d vCPUs, %d already allocated, limit is %d",
			requestCpus, totalCpus, jm.limits.MaxCpus)
	}

	if totalRam+requestRam > jm.limits.MaxRam {
		return fmt.Errorf("insufficient RAM: requested %d GiB, %d already allocated, limit is %d GiB",
			requestRam, totalRam, jm.limits.MaxRam)
	}

	if totalGpus+requestGpus > jm.limits.MaxGpus {
		return fmt.Errorf("insufficient GPU resources: requested %d GPUs, %d already allocated, limit is %d",
			requestGpus, totalGpus, jm.limits.MaxGpus)
	}

	return nil
}
