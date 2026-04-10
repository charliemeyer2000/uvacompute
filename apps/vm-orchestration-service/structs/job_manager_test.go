package structs

import (
	"context"
	"fmt"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

type MockJobProvider struct {
	mu                sync.Mutex
	LastImage         string
	LastCommand       []string
	LastCpus          int
	LastRam           int
	LastGpus          int
	CreateJobError    error
	DeleteJobError    error
	AllGpuNodesBusy   bool
	GpuBusyCheckError error
}

func (m *MockJobProvider) CreateJob(jobId string, image string, command []string, env map[string]string, cpus, ram, gpus, disk int, statusCallback JobStatusCallback, expose *int, exposeSubdomain *string) error {
	m.mu.Lock()
	m.LastImage = image
	m.LastCommand = command
	m.LastCpus = cpus
	m.LastRam = ram
	m.LastGpus = gpus
	err := m.CreateJobError
	m.mu.Unlock()

	if err != nil {
		return err
	}

	statusCallback(JOB_STATUS_SCHEDULED, nil, "", "")
	statusCallback(JOB_STATUS_RUNNING, nil, "", "node-1")

	return nil
}

func (m *MockJobProvider) DeleteJob(jobId string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.DeleteJobError
}

func (m *MockJobProvider) GetJobStatus(jobId string) (JobStatus, error) {
	return JOB_STATUS_RUNNING, nil
}

func (m *MockJobProvider) GetJobLogs(jobId string) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader("test logs")), nil
}

func (m *MockJobProvider) StreamJobLogs(jobId string) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader("streaming logs")), nil
}

func (m *MockJobProvider) AreAllGpuNodesBusy(ctx context.Context) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.AllGpuNodesBusy, m.GpuBusyCheckError
}

func (m *MockJobProvider) GetClusterResources(ctx context.Context) (ClusterResources, error) {
	return ClusterResources{TotalCPUs: 32, TotalRAMGB: 128, TotalGPUs: 1, TotalStorageGB: 200}, nil
}

// MockCallbackClient for job tests
type MockJobCallbackClient struct {
	mu               sync.Mutex
	VMStatusUpdates  []string
	JobStatusUpdates []string
}

func (m *MockJobCallbackClient) NotifyVMStatusUpdate(vmId string, status string, nodeId string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.VMStatusUpdates = append(m.VMStatusUpdates, fmt.Sprintf("%s:%s", vmId, status))
	return nil
}
func (m *MockJobCallbackClient) NotifyJobStatusUpdate(jobId string, status string, exitCode *int, errorMsg string, nodeId string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.JobStatusUpdates = append(m.JobStatusUpdates, fmt.Sprintf("%s:%s", jobId, status))
	return nil
}
func (m *MockJobCallbackClient) UploadJobLogs(jobId string, logs string) error { return nil }
func (m *MockJobCallbackClient) EnqueueVMRetry(vmId, status, nodeId string)    {}
func (m *MockJobCallbackClient) EnqueueJobRetry(jobId, status string, exitCode *int, errorMsg, nodeId string) {
}

func TestCreateJob_Defaults(t *testing.T) {
	limits := JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockJobProvider{}
	jm := NewJobManager(limits, mockProvider, nil)

	req := JobCreationRequest{
		JobId:  uuid.New().String(),
		UserId: "test-user",
		Image:  "ubuntu:latest",
	}

	jobId, err := jm.CreateJob(req)
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}
	if jobId == "" {
		t.Fatal("jobId should not be empty")
	}

	// Wait for async creation to complete
	time.Sleep(50 * time.Millisecond)

	state, exists := jm.GetJob(jobId)
	if !exists {
		t.Fatal("job should exist")
	}
	if state.Cpus != DefaultJobCpus {
		t.Errorf("expected %d CPUs, got %d", DefaultJobCpus, state.Cpus)
	}
	if state.Ram != DefaultJobRam {
		t.Errorf("expected %d RAM, got %d", DefaultJobRam, state.Ram)
	}
	if state.Gpus != DefaultJobGpus {
		t.Errorf("expected %d GPUs, got %d", DefaultJobGpus, state.Gpus)
	}
	if state.Image != "ubuntu:latest" {
		t.Errorf("expected image 'ubuntu:latest', got %s", state.Image)
	}
}

func TestCreateJob_CustomValues(t *testing.T) {
	limits := JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockJobProvider{}
	jm := NewJobManager(limits, mockProvider, nil)

	cpus := 4
	ram := 16
	name := "my-job"
	req := JobCreationRequest{
		JobId:   uuid.New().String(),
		UserId:  "test-user",
		Image:   "python:3.11",
		Command: []string{"python", "-c", "print('hello')"},
		Name:    &name,
		Cpus:    &cpus,
		Ram:     &ram,
	}

	jobId, err := jm.CreateJob(req)
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}

	state, exists := jm.GetJob(jobId)
	if !exists {
		t.Fatal("job should exist")
	}
	if state.Cpus != 4 {
		t.Errorf("expected 4 CPUs, got %d", state.Cpus)
	}
	if state.Ram != 16 {
		t.Errorf("expected 16 RAM, got %d", state.Ram)
	}
	if state.Name != "my-job" {
		t.Errorf("expected name 'my-job', got %s", state.Name)
	}
	if len(state.Command) != 3 {
		t.Errorf("expected 3 command args, got %d", len(state.Command))
	}
}

func TestCreateJob_GeneratesIdIfMissing(t *testing.T) {
	limits := JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockJobProvider{}
	jm := NewJobManager(limits, mockProvider, nil)

	req := JobCreationRequest{
		// No JobId provided
		UserId: "test-user",
		Image:  "ubuntu:latest",
	}

	jobId, err := jm.CreateJob(req)
	if err != nil {
		t.Fatalf("CreateJob failed: %v", err)
	}
	if jobId == "" {
		t.Fatal("should generate a jobId when not provided")
	}
}

func TestCreateJob_ResourceLimits_CPU(t *testing.T) {
	limits := JobResourceLimits{MaxCpus: 4, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockJobProvider{}
	jm := NewJobManager(limits, mockProvider, nil)

	cpus := 4
	req1 := JobCreationRequest{
		JobId:  uuid.New().String(),
		UserId: "test-user",
		Image:  "ubuntu:latest",
		Cpus:   &cpus,
	}

	_, err := jm.CreateJob(req1)
	if err != nil {
		t.Fatalf("First job should succeed: %v", err)
	}

	req2 := JobCreationRequest{
		JobId:  uuid.New().String(),
		UserId: "test-user",
		Image:  "ubuntu:latest",
		Cpus:   &cpus,
	}
	_, err = jm.CreateJob(req2)
	if err == nil {
		t.Fatal("Second job should fail due to CPU limits")
	}
	if !strings.Contains(err.Error(), "insufficient CPU") {
		t.Fatalf("Expected CPU error, got: %v", err)
	}
}

func TestCreateJob_ResourceLimits_RAM(t *testing.T) {
	limits := JobResourceLimits{MaxCpus: 16, MaxRam: 8, MaxGpus: 1}
	mockProvider := &MockJobProvider{}
	jm := NewJobManager(limits, mockProvider, nil)

	ram := 8
	req1 := JobCreationRequest{
		JobId:  uuid.New().String(),
		UserId: "test-user",
		Image:  "ubuntu:latest",
		Ram:    &ram,
	}

	_, err := jm.CreateJob(req1)
	if err != nil {
		t.Fatalf("First job should succeed: %v", err)
	}

	req2 := JobCreationRequest{
		JobId:  uuid.New().String(),
		UserId: "test-user",
		Image:  "ubuntu:latest",
		Ram:    &ram,
	}
	_, err = jm.CreateJob(req2)
	if err == nil {
		t.Fatal("Second job should fail due to RAM limits")
	}
	if !strings.Contains(err.Error(), "insufficient RAM") {
		t.Fatalf("Expected RAM error, got: %v", err)
	}
}

func TestCreateJob_ResourceLimits_GPU(t *testing.T) {
	limits := JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockJobProvider{}
	jm := NewJobManager(limits, mockProvider, nil)

	gpus := 1
	req1 := JobCreationRequest{
		JobId:  uuid.New().String(),
		UserId: "test-user",
		Image:  "ubuntu:latest",
		Gpus:   &gpus,
	}

	_, err := jm.CreateJob(req1)
	if err != nil {
		t.Fatalf("First job should succeed: %v", err)
	}

	req2 := JobCreationRequest{
		JobId:  uuid.New().String(),
		UserId: "test-user",
		Image:  "ubuntu:latest",
		Gpus:   &gpus,
	}
	_, err = jm.CreateJob(req2)
	if err == nil {
		t.Fatal("Second job should fail due to GPU limits")
	}
	if !strings.Contains(err.Error(), "insufficient GPU") {
		t.Fatalf("Expected GPU error, got: %v", err)
	}
}

func TestHandleJobEvent_StatusProgression(t *testing.T) {
	jm := NewJobManagerForTest(nil)

	jobId := "test-job-1"
	jm.SetJobForTest(jobId, JOB_STATUS_PENDING, "")

	// pending -> scheduled
	jm.HandleJobEvent(jobId, JOB_STATUS_SCHEDULED, nil, "", "node-1")
	if got := jm.GetJobStatusForTest(jobId); got != JOB_STATUS_SCHEDULED {
		t.Errorf("expected SCHEDULED, got %s", got)
	}

	// scheduled -> pulling
	jm.HandleJobEvent(jobId, JOB_STATUS_PULLING, nil, "", "node-1")
	if got := jm.GetJobStatusForTest(jobId); got != JOB_STATUS_PULLING {
		t.Errorf("expected PULLING, got %s", got)
	}

	// pulling -> running
	jm.HandleJobEvent(jobId, JOB_STATUS_RUNNING, nil, "", "node-1")
	if got := jm.GetJobStatusForTest(jobId); got != JOB_STATUS_RUNNING {
		t.Errorf("expected RUNNING, got %s", got)
	}

	// running -> completed
	exitCode := 0
	jm.HandleJobEvent(jobId, JOB_STATUS_COMPLETED, &exitCode, "", "node-1")
	if got := jm.GetJobStatusForTest(jobId); got != JOB_STATUS_COMPLETED {
		t.Errorf("expected COMPLETED, got %s", got)
	}
}

func TestHandleJobEvent_RegressionPrevention(t *testing.T) {
	tests := []struct {
		name           string
		initialStatus  JobStatus
		incomingStatus JobStatus
		shouldRegress  bool
	}{
		{"RUNNING cannot go back to PENDING", JOB_STATUS_RUNNING, JOB_STATUS_PENDING, false},
		{"RUNNING cannot go back to SCHEDULED", JOB_STATUS_RUNNING, JOB_STATUS_SCHEDULED, false},
		{"PULLING cannot go back to PENDING", JOB_STATUS_PULLING, JOB_STATUS_PENDING, false},
		{"SCHEDULED cannot go back to PENDING", JOB_STATUS_SCHEDULED, JOB_STATUS_PENDING, false},
		{"PENDING can go to RUNNING (skip)", JOB_STATUS_PENDING, JOB_STATUS_RUNNING, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jm := NewJobManagerForTest(nil)
			jobId := "test-regress"
			jm.SetJobForTest(jobId, tt.initialStatus, "node-1")

			jm.HandleJobEvent(jobId, tt.incomingStatus, nil, "", "node-1")
			got := jm.GetJobStatusForTest(jobId)

			if tt.shouldRegress {
				if got != tt.incomingStatus {
					t.Errorf("expected status to change to %s, got %s", tt.incomingStatus, got)
				}
			} else {
				if got != tt.initialStatus {
					t.Errorf("expected status to remain %s, got %s", tt.initialStatus, got)
				}
			}
		})
	}
}

func TestHandleJobEvent_TerminalStickiness(t *testing.T) {
	terminalStatuses := []JobStatus{JOB_STATUS_COMPLETED, JOB_STATUS_FAILED, JOB_STATUS_CANCELLED}

	for _, terminal := range terminalStatuses {
		t.Run(string(terminal), func(t *testing.T) {
			jm := NewJobManagerForTest(nil)
			jobId := "test-sticky"
			jm.SetJobForTest(jobId, terminal, "node-1")

			// Try to move to running
			jm.HandleJobEvent(jobId, JOB_STATUS_RUNNING, nil, "", "node-1")
			if got := jm.GetJobStatusForTest(jobId); got != terminal {
				t.Errorf("terminal status %s should be sticky, got %s", terminal, got)
			}

			// Try to move to pending
			jm.HandleJobEvent(jobId, JOB_STATUS_PENDING, nil, "", "node-1")
			if got := jm.GetJobStatusForTest(jobId); got != terminal {
				t.Errorf("terminal status %s should be sticky, got %s", terminal, got)
			}
		})
	}
}

func TestHandleJobEvent_NodeIdUpdate(t *testing.T) {
	jm := NewJobManagerForTest(nil)
	jobId := "test-node"
	jm.SetJobForTest(jobId, JOB_STATUS_RUNNING, "")

	// Same status but with nodeId should update
	jm.HandleJobEvent(jobId, JOB_STATUS_RUNNING, nil, "", "node-1")

	state, _ := jm.GetJob(jobId)
	if state.NodeId != "node-1" {
		t.Errorf("expected nodeId 'node-1', got %s", state.NodeId)
	}
}

func TestCancelJob(t *testing.T) {
	limits := JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockJobProvider{}
	jm := NewJobManager(limits, mockProvider, nil)

	req := JobCreationRequest{
		JobId:  uuid.New().String(),
		UserId: "test-user",
		Image:  "ubuntu:latest",
	}

	jobId, _ := jm.CreateJob(req)
	time.Sleep(50 * time.Millisecond) // let async creation finish

	err := jm.CancelJob(jobId)
	if err != nil {
		t.Fatalf("CancelJob failed: %v", err)
	}

	state, exists := jm.GetJob(jobId)
	if !exists {
		t.Fatal("job should still exist after cancel")
	}
	if state.Status != JOB_STATUS_CANCELLED {
		t.Errorf("expected CANCELLED, got %s", state.Status)
	}
}

func TestCancelJob_NotFound(t *testing.T) {
	limits := JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockJobProvider{}
	jm := NewJobManager(limits, mockProvider, nil)

	err := jm.CancelJob("nonexistent")
	if err == nil {
		t.Error("CancelJob should fail for nonexistent job")
	}
}

func TestCancelJob_AlreadyTerminal(t *testing.T) {
	jm := NewJobManagerForTest(nil)

	jobId := "test-terminal"
	jm.SetJobForTest(jobId, JOB_STATUS_COMPLETED, "node-1")

	err := jm.CancelJob(jobId)
	if err == nil {
		t.Error("CancelJob should fail for terminal job")
	}
}

func TestListAllJobs(t *testing.T) {
	limits := JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockJobProvider{}
	jm := NewJobManager(limits, mockProvider, nil)

	req1 := JobCreationRequest{
		JobId: uuid.New().String(), UserId: "user-1", Image: "img1",
	}
	req2 := JobCreationRequest{
		JobId: uuid.New().String(), UserId: "user-2", Image: "img2",
	}

	jm.CreateJob(req1)
	jm.CreateJob(req2)

	all := jm.ListAllJobs()
	if len(all) != 2 {
		t.Fatalf("expected 2 jobs, got %d", len(all))
	}
}

func TestAddJobFromExternal(t *testing.T) {
	jm := NewJobManagerForTest(nil)

	jobId := "external-job-1"
	added := jm.AddJobFromExternal(jobId, JobState{
		Id:     jobId,
		Status: JOB_STATUS_RUNNING,
		Cpus:   2,
	})
	if !added {
		t.Error("first AddJobFromExternal should return true")
	}

	if !jm.HasJob(jobId) {
		t.Error("job should exist")
	}

	// Second add should be no-op
	added = jm.AddJobFromExternal(jobId, JobState{
		Id:     jobId,
		Status: JOB_STATUS_RUNNING,
		Cpus:   8,
	})
	if added {
		t.Error("second AddJobFromExternal should return false")
	}

	state, _ := jm.GetJob(jobId)
	if state.Cpus != 2 {
		t.Errorf("expected 2 CPUs (not overwritten), got %d", state.Cpus)
	}
}

func TestGetJobLogs_NotFound(t *testing.T) {
	limits := JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockJobProvider{}
	jm := NewJobManager(limits, mockProvider, nil)

	_, err := jm.GetJobLogs("nonexistent")
	if err == nil {
		t.Error("GetJobLogs should fail for nonexistent job")
	}
}

func TestStreamJobLogs_TerminalState(t *testing.T) {
	limits := JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
	mockProvider := &MockJobProvider{}
	jm := NewJobManager(limits, mockProvider, nil)

	jobId := "terminal-job"
	jm.SetJobForTest(jobId, JOB_STATUS_COMPLETED, "node-1")

	_, err := jm.StreamJobLogs(jobId)
	if err == nil {
		t.Error("StreamJobLogs should fail for terminal job")
	}
}

func TestCreateJob_GpuBusy(t *testing.T) {
	limits := JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}

	t.Run("rejects when all GPU nodes busy", func(t *testing.T) {
		mockProvider := &MockJobProvider{AllGpuNodesBusy: true}
		jm := NewJobManager(limits, mockProvider, nil)

		gpus := 1
		req := JobCreationRequest{
			JobId:  uuid.New().String(),
			UserId: "test-user",
			Image:  "nvidia/cuda:latest",
			Gpus:   &gpus,
		}

		_, err := jm.CreateJob(req)
		if err == nil {
			t.Fatal("Should reject GPU job when all nodes are busy")
		}
		if !strings.Contains(err.Error(), "insufficient GPU") {
			t.Fatalf("Expected GPU error, got: %v", err)
		}
		if !strings.Contains(err.Error(), "in use by their owners") {
			t.Fatalf("Expected owner-in-use message, got: %v", err)
		}
	})

	t.Run("allows when GPU nodes available", func(t *testing.T) {
		mockProvider := &MockJobProvider{AllGpuNodesBusy: false}
		jm := NewJobManager(limits, mockProvider, nil)

		gpus := 1
		req := JobCreationRequest{
			JobId:  uuid.New().String(),
			UserId: "test-user",
			Image:  "nvidia/cuda:latest",
			Gpus:   &gpus,
		}

		_, err := jm.CreateJob(req)
		if err != nil {
			t.Fatalf("Should allow GPU job when nodes available: %v", err)
		}
	})

	t.Run("skips check for non-GPU jobs", func(t *testing.T) {
		mockProvider := &MockJobProvider{AllGpuNodesBusy: true}
		jm := NewJobManager(limits, mockProvider, nil)

		req := JobCreationRequest{
			JobId:  uuid.New().String(),
			UserId: "test-user",
			Image:  "ubuntu:latest",
		}

		_, err := jm.CreateJob(req)
		if err != nil {
			t.Fatalf("Non-GPU job should succeed even when GPU nodes busy: %v", err)
		}
	})
}

func TestCreateJob_DynamicResourceLimits(t *testing.T) {
	// All zeros = read limits dynamically from GetClusterResources
	// Mock returns TotalCPUs: 32, TotalRAMGB: 128, TotalGPUs: 1
	limits := JobResourceLimits{MaxCpus: 0, MaxRam: 0, MaxGpus: 0}
	mockProvider := &MockJobProvider{}
	jm := NewJobManager(limits, mockProvider, nil)

	// Create jobs consuming 16 CPUs each — first two should succeed
	cpus16 := 16
	ram16 := 16
	req1 := JobCreationRequest{
		JobId:  uuid.New().String(),
		UserId: "test-user",
		Image:  "ubuntu:latest",
		Cpus:   &cpus16,
		Ram:    &ram16,
	}
	_, err := jm.CreateJob(req1)
	if err != nil {
		t.Fatalf("First job (16 CPUs) should succeed with 32 dynamic limit: %v", err)
	}

	req2 := JobCreationRequest{
		JobId:  uuid.New().String(),
		UserId: "test-user",
		Image:  "ubuntu:latest",
		Cpus:   &cpus16,
		Ram:    &ram16,
	}
	_, err = jm.CreateJob(req2)
	if err != nil {
		t.Fatalf("Second job (16 CPUs, total 32) should succeed: %v", err)
	}

	// Third job should fail — exceeds 32 CPU dynamic limit
	req3 := JobCreationRequest{
		JobId:  uuid.New().String(),
		UserId: "test-user",
		Image:  "ubuntu:latest",
		Cpus:   &cpus16,
		Ram:    &ram16,
	}
	_, err = jm.CreateJob(req3)
	if err == nil {
		t.Fatal("Third job should fail (48 CPUs > 32 dynamic limit)")
	}
	if !strings.Contains(err.Error(), "insufficient CPU resources") {
		t.Fatalf("Expected CPU resource limit error, got: %v", err)
	}
}
