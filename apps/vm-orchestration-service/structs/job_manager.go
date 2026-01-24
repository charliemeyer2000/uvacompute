package structs

import (
	"fmt"
	"io"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
)

const ImagePullTimeout = 15 * time.Minute

type JobStatusCallback func(status JobStatus, exitCode *int, errorMsg string, nodeId string)

type JobProvider interface {
	CreateJob(jobId string, image string, command []string, env map[string]string, cpus, ram, gpus, disk int, statusCallback JobStatusCallback, expose *int, exposeSubdomain *string) error
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

	// Use pre-generated jobId if provided, otherwise generate one
	jobId := req.JobId
	if jobId == "" {
		jobId = uuid.New().String()
	}

	cpus := IntOrDefault(req.Cpus, DefaultJobCpus)
	ram := IntOrDefault(req.Ram, DefaultJobRam)
	gpus := IntOrDefault(req.Gpus, DefaultJobGpus)
	disk := IntOrDefault(req.Disk, DefaultJobDisk)
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
		Disk:         disk,
		Status:       JOB_STATUS_PENDING,
	}

	go jm.createJobAsync(jobId, req.Image, req.Command, req.Env, cpus, ram, gpus, disk, req.Expose, req.ExposeSubdomain)

	return jobId, nil
}

func (jm *JobManager) createJobAsync(jobId string, image string, command []string, env map[string]string, cpus, ram, gpus, disk int, expose *int, exposeSubdomain *string) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("ERROR: Panic in createJobAsync for Job %s: %v", jobId, r)
			jm.UpdateJobStatus(jobId, JOB_STATUS_FAILED, nil, fmt.Sprintf("Internal error: %v", r), "")
		}
	}()

	statusCallback := func(status JobStatus, exitCode *int, errorMsg string, nodeId string) {
		jm.UpdateJobStatus(jobId, status, exitCode, errorMsg, nodeId)
	}

	log.Printf("Starting async job creation for %s (image: %s, cpus: %d, ram: %d, gpus: %d, disk: %d)", jobId, image, cpus, ram, gpus, disk)

	err := jm.jobProvider.CreateJob(jobId, image, command, env, cpus, ram, gpus, disk, statusCallback, expose, exposeSubdomain)
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

	if jm.jobProvider == nil {
		return nil, fmt.Errorf("job provider not available")
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

	if jm.jobProvider == nil {
		return nil, fmt.Errorf("job provider not available")
	}

	return jm.jobProvider.StreamJobLogs(jobId)
}

func (jm *JobManager) UpdateJobStatus(jobId string, status JobStatus, exitCode *int, errorMessage string, nodeId string) {
	jm.mu.Lock()
	jobState, exists := jm.jobMap[jobId]
	if !exists {
		jm.mu.Unlock()
		return
	}

	if jobState.Status == status {
		if nodeId != "" && jobState.NodeId != nodeId {
			jobState.NodeId = nodeId
			jm.jobMap[jobId] = jobState
		}
		jm.mu.Unlock()
		return
	}

	jobState.Status = status
	jobState.ExitCode = exitCode
	jobState.ErrorMessage = errorMessage
	if nodeId != "" {
		jobState.NodeId = nodeId
	}
	jm.jobMap[jobId] = jobState
	jm.mu.Unlock()

	isTerminal := status == JOB_STATUS_COMPLETED || status == JOB_STATUS_FAILED || status == JOB_STATUS_CANCELLED

	if jm.callbackClient != nil {
		go func() {
			if isTerminal {
				jm.archiveJobLogs(jobId)
			}
			if err := jm.callbackClient.NotifyJobStatusUpdate(jobId, string(status), exitCode, errorMessage, nodeId); err != nil {
				log.Printf("ERROR: Failed to notify site about Job %s status update: %v", jobId, err)
			}
		}()
	}
}

func (jm *JobManager) archiveJobLogs(jobId string) {
	if jm.callbackClient == nil {
		return
	}

	const maxRetries = 3
	var logsBytes []byte

	// Retry getting logs with exponential backoff
	for attempt := 0; attempt < maxRetries; attempt++ {
		logs, err := jm.GetJobLogs(jobId)
		if err != nil {
			if attempt < maxRetries-1 {
				time.Sleep(time.Duration(1<<attempt) * time.Second)
				continue
			}
			log.Printf("WARNING: Failed to get logs for Job %s archival after %d attempts: %v", jobId, maxRetries, err)
			return
		}

		logsBytes, err = io.ReadAll(logs)
		logs.Close()
		if err != nil {
			if attempt < maxRetries-1 {
				time.Sleep(time.Duration(1<<attempt) * time.Second)
				continue
			}
			log.Printf("WARNING: Failed to read logs for Job %s archival after %d attempts: %v", jobId, maxRetries, err)
			return
		}

		// Success
		break
	}

	if len(logsBytes) == 0 {
		log.Printf("INFO: No logs to archive for Job %s", jobId)
		return
	}

	// Retry uploading logs with exponential backoff
	for attempt := 0; attempt < maxRetries; attempt++ {
		if err := jm.callbackClient.UploadJobLogs(jobId, string(logsBytes)); err != nil {
			if attempt < maxRetries-1 {
				log.Printf("WARNING: Upload attempt %d failed for Job %s logs: %v, retrying...", attempt+1, jobId, err)
				time.Sleep(time.Duration(1<<attempt) * time.Second)
				continue
			}
			log.Printf("WARNING: Failed to upload logs for Job %s after %d attempts: %v", jobId, maxRetries, err)
			return
		}
		log.Printf("INFO: Successfully archived logs for Job %s", jobId)
		return
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
	jm.mu.Unlock()

	err := jm.jobProvider.DeleteJob(jobId)
	if err != nil {
		log.Printf("ERROR: Failed to delete job %s from backend: %v", jobId, err)
		return fmt.Errorf("failed to cancel job: %w", err)
	}

	jm.mu.Lock()
	jobState, exists = jm.jobMap[jobId]
	if !exists {
		jm.mu.Unlock()
		return nil
	}
	if jobState.Status == JOB_STATUS_COMPLETED || jobState.Status == JOB_STATUS_FAILED || jobState.Status == JOB_STATUS_CANCELLED {
		jm.mu.Unlock()
		log.Printf("Job %s reached terminal state %s before cancellation completed", jobId, jobState.Status)
		return nil
	}
	jobState.Status = JOB_STATUS_CANCELLED
	jm.jobMap[jobId] = jobState
	jm.mu.Unlock()

	if jm.callbackClient != nil {
		go func() {
			jm.archiveJobLogs(jobId)
			if err := jm.callbackClient.NotifyJobStatusUpdate(jobId, string(JOB_STATUS_CANCELLED), nil, "", ""); err != nil {
				log.Printf("ERROR: Failed to notify site about Job %s cancellation: %v", jobId, err)
			}
		}()
	}

	return nil
}

func (jm *JobManager) HandleJobEvent(jobId string, status JobStatus, exitCode *int, errorMsg string, nodeId string) {
	jm.mu.Lock()

	jobState, exists := jm.jobMap[jobId]
	if !exists {
		jm.mu.Unlock()
		return
	}

	if jobState.Status == JOB_STATUS_COMPLETED ||
		jobState.Status == JOB_STATUS_FAILED ||
		jobState.Status == JOB_STATUS_CANCELLED {
		jm.mu.Unlock()
		return
	}

	// Prevent status regression
	statusOrder := map[JobStatus]int{
		JOB_STATUS_PENDING:   1,
		JOB_STATUS_SCHEDULED: 2,
		JOB_STATUS_PULLING:   3,
		JOB_STATUS_RUNNING:   4,
	}
	currentOrder := statusOrder[jobState.Status]
	newOrder := statusOrder[status]
	if newOrder > 0 && currentOrder > 0 && newOrder < currentOrder {
		if nodeId != "" && jobState.NodeId != nodeId {
			jobState.NodeId = nodeId
			jm.jobMap[jobId] = jobState
		}
		jm.mu.Unlock()
		return
	}

	if jobState.Status == status {
		if status == JOB_STATUS_PULLING {
			if jobState.PullingStartedAt == nil {
				now := time.Now()
				jobState.PullingStartedAt = &now
				jm.jobMap[jobId] = jobState
			} else if time.Since(*jobState.PullingStartedAt) > ImagePullTimeout {
				exitCode := 1
				exitCodePtr := &exitCode
				errorMessage := "Image pull timeout: unable to pull image after 15 minutes"
				jobState.Status = JOB_STATUS_FAILED
				jobState.ExitCode = exitCodePtr
				jobState.ErrorMessage = errorMessage
				if nodeId != "" {
					jobState.NodeId = nodeId
				}
				jm.jobMap[jobId] = jobState
				jm.mu.Unlock()

				log.Printf("JobManager: HandleJobEvent %s: PULLING -> FAILED (image pull timeout)", jobId)

				if jm.callbackClient != nil {
					go func(exitCodePtr *int, errorMessage, nodeId string) {
						jm.archiveJobLogs(jobId)
						if err := jm.callbackClient.NotifyJobStatusUpdate(jobId, string(JOB_STATUS_FAILED), exitCodePtr, errorMessage, nodeId); err != nil {
							log.Printf("ERROR: Failed to notify site about Job %s pull timeout: %v", jobId, err)
						}
					}(exitCodePtr, errorMessage, nodeId)
				}
				return
			}
		}

		if nodeId != "" && jobState.NodeId != nodeId {
			jobState.NodeId = nodeId
			jm.jobMap[jobId] = jobState
		}
		jm.mu.Unlock()
		return
	}

	oldStatus := jobState.Status
	jobState.Status = status

	if status == JOB_STATUS_PULLING && jobState.PullingStartedAt == nil {
		now := time.Now()
		jobState.PullingStartedAt = &now
	}
	if oldStatus == JOB_STATUS_PULLING && status != JOB_STATUS_PULLING {
		jobState.PullingStartedAt = nil
	}
	if exitCode != nil {
		jobState.ExitCode = exitCode
	}
	if errorMsg != "" {
		jobState.ErrorMessage = errorMsg
	}
	if nodeId != "" {
		jobState.NodeId = nodeId
	}
	jm.jobMap[jobId] = jobState
	jm.mu.Unlock()

	log.Printf("JobManager: HandleJobEvent %s: %s -> %s (node: %s)", jobId, oldStatus, status, nodeId)

	isTerminal := status == JOB_STATUS_COMPLETED || status == JOB_STATUS_FAILED || status == JOB_STATUS_CANCELLED

	if jm.callbackClient != nil {
		go func() {
			if isTerminal {
				jm.archiveJobLogs(jobId)
			}

			if err := jm.callbackClient.NotifyJobStatusUpdate(jobId, string(status), exitCode, errorMsg, nodeId); err != nil {
				log.Printf("ERROR: Failed to notify site about Job %s status update from informer: %v", jobId, err)
			}
		}()
	}
}

func (jm *JobManager) SetJobForTest(jobId string, status JobStatus, nodeId string) {
	jm.mu.Lock()
	defer jm.mu.Unlock()
	jm.jobMap[jobId] = JobState{
		Id:     jobId,
		Status: status,
		NodeId: nodeId,
	}
}

func (jm *JobManager) GetJobStatusForTest(jobId string) JobStatus {
	jm.mu.Lock()
	defer jm.mu.Unlock()
	if state, exists := jm.jobMap[jobId]; exists {
		return state.Status
	}
	return ""
}

func (jm *JobManager) HasJob(jobId string) bool {
	jm.mu.Lock()
	defer jm.mu.Unlock()
	_, exists := jm.jobMap[jobId]
	return exists
}

func NewJobManagerForTest(callbackClient CallbackClient) *JobManager {
	return &JobManager{
		mu:             sync.Mutex{},
		jobMap:         make(map[string]JobState),
		limits:         JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1},
		jobProvider:    nil,
		callbackClient: callbackClient,
	}
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

func (jm *JobManager) ListAllJobs() map[string]JobState {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	result := make(map[string]JobState, len(jm.jobMap))
	for k, v := range jm.jobMap {
		result[k] = v
	}
	return result
}

func (jm *JobManager) AddJobFromExternal(jobId string, state JobState) bool {
	jm.mu.Lock()
	defer jm.mu.Unlock()

	if _, exists := jm.jobMap[jobId]; exists {
		return false
	}

	jm.jobMap[jobId] = state
	log.Printf("Added job %s from external source (status: %s)", jobId, state.Status)
	return true
}
