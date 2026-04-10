package lib

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"vm-orchestration-service/structs"
)

// testJobProvider is a minimal JobProvider mock for queue processor tests.
type testJobProvider struct {
	mu             sync.Mutex
	createJobError error
}

func (p *testJobProvider) CreateJob(jobId, image string, command []string, env map[string]string, cpus, ram, gpus, disk int, cb structs.JobStatusCallback, expose *int, exposeSubdomain *string) error {
	p.mu.Lock()
	err := p.createJobError
	p.mu.Unlock()
	if err != nil {
		return err
	}
	cb(structs.JOB_STATUS_SCHEDULED, nil, "", "")
	return nil
}

func (p *testJobProvider) DeleteJob(string) error                     { return nil }
func (p *testJobProvider) GetJobStatus(string) (structs.JobStatus, error) { return structs.JOB_STATUS_RUNNING, nil }
func (p *testJobProvider) GetJobLogs(string) (io.ReadCloser, error)   { return io.NopCloser(strings.NewReader("")), nil }
func (p *testJobProvider) StreamJobLogs(string) (io.ReadCloser, error) { return io.NopCloser(strings.NewReader("")), nil }
func (p *testJobProvider) AreAllGpuNodesBusy(context.Context) (bool, error) { return false, nil }
func (p *testJobProvider) GetClusterResources(context.Context) (structs.ClusterResources, error) {
	return structs.ClusterResources{TotalCPUs: 32, TotalRAMGB: 128, TotalGPUs: 1, TotalStorageGB: 200}, nil
}

// mockQueueServer provides a test HTTP server that mimics the Convex API
// endpoints used by CallbackClient (FetchQueuedJobs, NotifyJobStatusUpdate).
type mockQueueServer struct {
	mu              sync.Mutex
	queuedJobs      []ConvexJob
	statusUpdates   []statusUpdate
	fetchQueuedHits int
}

type statusUpdate struct {
	JobId  string
	Status string
}

func newMockQueueServer() *mockQueueServer {
	return &mockQueueServer{}
}

func (m *mockQueueServer) handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/jobs/queued", func(w http.ResponseWriter, r *http.Request) {
		m.mu.Lock()
		m.fetchQueuedHits++
		jobs := m.queuedJobs
		m.mu.Unlock()

		resp := ActiveJobsResponse{Jobs: jobs}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	mux.HandleFunc("/api/jobs/", func(w http.ResponseWriter, r *http.Request) {
		// Catches /api/jobs/{id}/update-status
		if r.Method == "POST" {
			var payload map[string]interface{}
			json.NewDecoder(r.Body).Decode(&payload)

			m.mu.Lock()
			// Extract jobId from URL: /api/jobs/{id}/update-status
			// path segments: ["api", "jobs", "{id}", "update-status"]
			parts := splitPath(r.URL.Path)
			if len(parts) >= 3 {
				m.statusUpdates = append(m.statusUpdates, statusUpdate{
					JobId:  parts[2],
					Status: payload["status"].(string),
				})
			}
			m.mu.Unlock()
		}
		w.WriteHeader(http.StatusOK)
	})

	return mux
}

func splitPath(path string) []string {
	var parts []string
	for _, p := range split(path, '/') {
		if p != "" {
			parts = append(parts, p)
		}
	}
	return parts
}

func split(s string, sep byte) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	result = append(result, s[start:])
	return result
}

func (m *mockQueueServer) setQueuedJobs(jobs []ConvexJob) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.queuedJobs = jobs
}

func (m *mockQueueServer) getStatusUpdates() []statusUpdate {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([]statusUpdate, len(m.statusUpdates))
	copy(result, m.statusUpdates)
	return result
}

func setupQueueProcessorTest(mock *mockQueueServer) (*QueueProcessor, *structs.JobManager, *httptest.Server) {
	ts := httptest.NewServer(mock.handler())
	callbackClient := NewCallbackClient(ts.URL, "test-secret")
	mockProvider := &testJobProvider{}
	jm := structs.NewJobManager(
		structs.JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1},
		mockProvider,
		nil,
	)
	qp := NewQueueProcessor(jm, callbackClient)
	return qp, jm, ts
}

func TestQueueProcessor_EmptyQueue(t *testing.T) {
	mock := newMockQueueServer()
	qp, _, ts := setupQueueProcessorTest(mock)
	defer ts.Close()

	// processQueue with no queued jobs should be a no-op
	qp.processQueue()

	updates := mock.getStatusUpdates()
	if len(updates) != 0 {
		t.Errorf("expected no status updates, got %d", len(updates))
	}
}

func TestQueueProcessor_CreatesSingleJob(t *testing.T) {
	mock := newMockQueueServer()
	mock.setQueuedJobs([]ConvexJob{
		{
			JobId:  "job-1",
			UserId: "user-1",
			Image:  "ubuntu:latest",
			Cpus:   2,
			Ram:    4,
			Gpus:   0,
			Disk:   0,
			Status: "queued",
		},
	})

	qp, jm, ts := setupQueueProcessorTest(mock)
	defer ts.Close()

	qp.processQueue()

	// Job should now exist in the manager
	if !jm.HasJob("job-1") {
		t.Error("job-1 should exist in job manager after processing")
	}

	state, exists := jm.GetJob("job-1")
	if !exists {
		t.Fatal("job-1 should exist")
	}
	if state.Cpus != 2 {
		t.Errorf("expected 2 CPUs, got %d", state.Cpus)
	}
	if state.Ram != 4 {
		t.Errorf("expected 4 RAM, got %d", state.Ram)
	}
}

func TestQueueProcessor_FIFO_Order(t *testing.T) {
	mock := newMockQueueServer()
	mock.setQueuedJobs([]ConvexJob{
		{JobId: "first", UserId: "u1", Image: "img", Cpus: 2, Ram: 4},
		{JobId: "second", UserId: "u2", Image: "img", Cpus: 2, Ram: 4},
		{JobId: "third", UserId: "u3", Image: "img", Cpus: 2, Ram: 4},
	})

	qp, jm, ts := setupQueueProcessorTest(mock)
	defer ts.Close()

	qp.processQueue()

	// All three should be created (16 CPU limit, 2 each = 6 used)
	for _, id := range []string{"first", "second", "third"} {
		if !jm.HasJob(id) {
			t.Errorf("job %s should exist", id)
		}
	}
}

func TestQueueProcessor_BreaksOnInsufficientResources(t *testing.T) {
	mock := newMockQueueServer()
	mock.setQueuedJobs([]ConvexJob{
		{JobId: "big-1", UserId: "u1", Image: "img", Cpus: 10, Ram: 4},
		{JobId: "big-2", UserId: "u2", Image: "img", Cpus: 10, Ram: 4},
		{JobId: "small", UserId: "u3", Image: "img", Cpus: 2, Ram: 4},
	})

	qp, jm, ts := setupQueueProcessorTest(mock)
	defer ts.Close()

	qp.processQueue()

	// First job (10 CPU) should succeed
	if !jm.HasJob("big-1") {
		t.Error("big-1 should be created (fits in 16 CPU limit)")
	}

	// Second job (10 CPU) should fail — 10 used + 10 requested > 16
	if jm.HasJob("big-2") {
		t.Error("big-2 should NOT be created (exceeds CPU limit)")
	}

	// Third job (2 CPU) should NOT be created either — FIFO break means we
	// don't skip ahead to smaller jobs
	if jm.HasJob("small") {
		t.Error("small should NOT be created (FIFO break: don't skip ahead)")
	}
}

func TestQueueProcessor_SkipsExistingJobs(t *testing.T) {
	mock := newMockQueueServer()
	mock.setQueuedJobs([]ConvexJob{
		{JobId: "existing", UserId: "u1", Image: "img", Cpus: 2, Ram: 4},
		{JobId: "new-job", UserId: "u2", Image: "img", Cpus: 2, Ram: 4},
	})

	qp, jm, ts := setupQueueProcessorTest(mock)
	defer ts.Close()

	// Pre-populate "existing" job in the manager (simulates webhook handler's
	// optimistic path already creating it)
	jm.SetJobForTest("existing", structs.JOB_STATUS_RUNNING, "node-1")

	qp.processQueue()

	// "existing" should still be RUNNING (not re-created)
	state, _ := jm.GetJob("existing")
	if state.Status != structs.JOB_STATUS_RUNNING {
		t.Errorf("existing job should remain RUNNING, got %s", state.Status)
	}

	// "new-job" should be created
	if !jm.HasJob("new-job") {
		t.Error("new-job should be created")
	}

	// A status sync should have been sent for the existing job
	time.Sleep(50 * time.Millisecond) // let async HTTP complete
	updates := mock.getStatusUpdates()
	foundSync := false
	for _, u := range updates {
		if u.JobId == "existing" && u.Status == string(structs.JOB_STATUS_RUNNING) {
			foundSync = true
		}
	}
	if !foundSync {
		t.Error("expected status sync for existing job back to Convex")
	}
}

func TestQueueProcessor_IdempotentCreateJob(t *testing.T) {
	mock := newMockQueueServer()
	mock.setQueuedJobs([]ConvexJob{
		{JobId: "job-1", UserId: "u1", Image: "img", Cpus: 8, Ram: 4},
	})

	qp, jm, ts := setupQueueProcessorTest(mock)
	defer ts.Close()

	// Process twice — the idempotent CreateJob should prevent double allocation
	qp.processQueue()
	qp.processQueue()

	if !jm.HasJob("job-1") {
		t.Error("job-1 should exist")
	}

	// Should be able to create another 8-CPU job (not double-counted)
	mock.setQueuedJobs([]ConvexJob{
		{JobId: "job-1", UserId: "u1", Image: "img", Cpus: 8, Ram: 4},
		{JobId: "job-2", UserId: "u2", Image: "img", Cpus: 8, Ram: 4},
	})
	qp.processQueue()

	if !jm.HasJob("job-2") {
		t.Error("job-2 should be created (job-1 not double-counted)")
	}
}

func TestQueueProcessor_ConcurrentProcessingGuard(t *testing.T) {
	mock := newMockQueueServer()
	mock.setQueuedJobs([]ConvexJob{
		{JobId: "job-1", UserId: "u1", Image: "img", Cpus: 2, Ram: 4},
	})

	qp, _, ts := setupQueueProcessorTest(mock)
	defer ts.Close()

	// Simulate concurrent processing by setting the flag
	qp.mu.Lock()
	qp.processing = true
	qp.mu.Unlock()

	qp.processQueue()

	// Should have been a no-op (processing flag was set)
	mock.mu.Lock()
	hits := mock.fetchQueuedHits
	mock.mu.Unlock()

	if hits != 0 {
		t.Errorf("expected 0 fetch hits (blocked by processing flag), got %d", hits)
	}
}

func TestQueueProcessor_TriggerProcessing_NonBlocking(t *testing.T) {
	mock := newMockQueueServer()
	qp, _, ts := setupQueueProcessorTest(mock)
	defer ts.Close()

	// TriggerProcessing should never block, even without Start()
	done := make(chan struct{})
	go func() {
		qp.TriggerProcessing()
		qp.TriggerProcessing() // second call should be a no-op (channel already has a pending trigger)
		close(done)
	}()

	select {
	case <-done:
		// OK — non-blocking
	case <-time.After(1 * time.Second):
		t.Fatal("TriggerProcessing blocked")
	}
}

func TestQueueProcessor_WithCommandAndEnv(t *testing.T) {
	mock := newMockQueueServer()
	mock.setQueuedJobs([]ConvexJob{
		{
			JobId:   "runner-1",
			UserId:  "u1",
			Image:   "ghcr.io/actions/runner:latest",
			Command: []string{"./run.sh", "--jitconfig", "abc123"},
			Env:     map[string]string{"JIT_CONFIG": "abc123"},
			Cpus:    4,
			Ram:     8,
			Gpus:    0,
			Disk:    10,
		},
	})

	qp, jm, ts := setupQueueProcessorTest(mock)
	defer ts.Close()

	qp.processQueue()

	state, exists := jm.GetJob("runner-1")
	if !exists {
		t.Fatal("runner-1 should exist")
	}
	if state.Cpus != 4 {
		t.Errorf("expected 4 CPUs, got %d", state.Cpus)
	}
	if state.Ram != 8 {
		t.Errorf("expected 8 RAM, got %d", state.Ram)
	}
}

func TestQueueProcessor_NilCallbackClient(t *testing.T) {
	mockProvider := &testJobProvider{}
	jm := structs.NewJobManager(
		structs.JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1},
		mockProvider,
		nil,
	)
	qp := NewQueueProcessor(jm, nil)

	// Should not panic with nil callbackClient
	qp.processQueue()
}
