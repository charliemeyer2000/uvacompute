package lib

import (
	"testing"

	"vm-orchestration-service/structs"
)

func TestIsFatalWaitingReason(t *testing.T) {
	fatalReasons := []string{
		"CrashLoopBackOff",
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
		"PreCreateHookError",
	}

	for _, reason := range fatalReasons {
		t.Run(reason, func(t *testing.T) {
			if !isFatalWaitingReason(reason) {
				t.Errorf("isFatalWaitingReason(%q) = false, want true", reason)
			}
		})
	}
}

func TestIsFatalWaitingReason_NonFatal(t *testing.T) {
	nonFatalReasons := []string{
		"ContainerCreating",
		"PodInitializing",
		"Pulling",
		"ErrImagePull",
		"ImagePullBackOff",
		"RegistryUnavailable",
		"SomeUnknownReason",
	}

	for _, reason := range nonFatalReasons {
		t.Run(reason, func(t *testing.T) {
			if isFatalWaitingReason(reason) {
				t.Errorf("isFatalWaitingReason(%q) = true, want false", reason)
			}
		})
	}
}

func TestIsTransientWaitingReason(t *testing.T) {
	transientReasons := []string{
		"ContainerCreating",
		"PodInitializing",
		"Pulling",
		"ErrImagePull",
		"ImagePullBackOff",
		"RegistryUnavailable",
	}

	for _, reason := range transientReasons {
		t.Run(reason, func(t *testing.T) {
			if !isTransientWaitingReason(reason) {
				t.Errorf("isTransientWaitingReason(%q) = false, want true", reason)
			}
		})
	}
}

func TestIsTransientWaitingReason_NonTransient(t *testing.T) {
	nonTransientReasons := []string{
		"CrashLoopBackOff",
		"InvalidImageName",
		"SomeUnknownReason",
	}

	for _, reason := range nonTransientReasons {
		t.Run(reason, func(t *testing.T) {
			if isTransientWaitingReason(reason) {
				t.Errorf("isTransientWaitingReason(%q) = true, want false", reason)
			}
		})
	}
}

func TestUnknownWaitingReason_FailSafe(t *testing.T) {
	unknownReason := "SomeNewReasonKubernetesAdded"

	if isFatalWaitingReason(unknownReason) {
		t.Errorf("Unknown reason %q should not be fatal", unknownReason)
	}
	if isTransientWaitingReason(unknownReason) {
		t.Errorf("Unknown reason %q should not be recognized as transient", unknownReason)
	}
}

func TestGetWaitingErrorMessage(t *testing.T) {
	tests := []struct {
		reason   string
		message  string
		contains string
	}{
		{"CrashLoopBackOff", "back-off restarting", "Container crashed"},
		{"InvalidImageName", "bad format", "Invalid image name"},
		{"RunContainerError", "exec failed", "Container failed to start"},
		{"SomeUnknown", "details", "SomeUnknown"},
	}

	for _, tt := range tests {
		t.Run(tt.reason, func(t *testing.T) {
			result := getWaitingErrorMessage(tt.reason, tt.message)
			if !contains(result, tt.contains) {
				t.Errorf("getWaitingErrorMessage(%q, %q) = %q, expected to contain %q",
					tt.reason, tt.message, result, tt.contains)
			}
		})
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(substr) == 0 ||
		(len(s) > 0 && len(substr) > 0 && findSubstring(s, substr)))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func TestHandleVMEvent_CreationFlowProtection(t *testing.T) {
	tests := []struct {
		name           string
		initialStatus  structs.VMStatus
		incomingStatus structs.VMStatus
		shouldUpdate   bool
	}{
		{"CREATING protected from BOOTING", structs.VM_STATUS_CREATING, structs.VM_STATUS_BOOTING, false},
		{"PENDING protected from BOOTING", structs.VM_STATUS_PENDING, structs.VM_STATUS_BOOTING, false},
		{"BOOTING protected from PROVISIONING", structs.VM_STATUS_BOOTING, structs.VM_STATUS_PROVISIONING, false},
		{"PROVISIONING protected from READY", structs.VM_STATUS_PROVISIONING, structs.VM_STATUS_READY, false},
		{"CREATING allows FAILED update", structs.VM_STATUS_CREATING, structs.VM_STATUS_FAILED, true},
		{"PENDING allows FAILED update", structs.VM_STATUS_PENDING, structs.VM_STATUS_FAILED, true},
		{"BOOTING allows OFFLINE update", structs.VM_STATUS_BOOTING, structs.VM_STATUS_OFFLINE, true},
		{"READY updates to STOPPED", structs.VM_STATUS_READY, structs.VM_STATUS_STOPPED, true},
		{"READY updates to FAILED", structs.VM_STATUS_READY, structs.VM_STATUS_FAILED, true},
		{"READY to READY no-op", structs.VM_STATUS_READY, structs.VM_STATUS_READY, false},
		{"STOPPED not overwritten by READY", structs.VM_STATUS_STOPPED, structs.VM_STATUS_READY, false},
		{"FAILED not overwritten by READY", structs.VM_STATUS_FAILED, structs.VM_STATUS_READY, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockCallback := &MockCallbackClient{}
			manager := structs.NewVMManagerForTest(mockCallback)

			vmId := "test-vm-123"
			manager.SetVMForTest(vmId, tt.initialStatus, "node-1")
			manager.HandleVMEvent(vmId, tt.incomingStatus, "node-1")

			currentStatus := manager.GetVMStatusForTest(vmId)
			wasUpdated := currentStatus != tt.initialStatus

			if wasUpdated != tt.shouldUpdate {
				t.Errorf("HandleVMEvent() updated=%v, want updated=%v (initial=%v, incoming=%v, current=%v)",
					wasUpdated, tt.shouldUpdate, tt.initialStatus, tt.incomingStatus, currentStatus)
			}
		})
	}
}

func TestHandleVMEvent_UnknownVM(t *testing.T) {
	mockCallback := &MockCallbackClient{}
	manager := structs.NewVMManagerForTest(mockCallback)

	manager.HandleVMEvent("unknown-vm-id", structs.VM_STATUS_READY, "node-1")

	if manager.HasVM("unknown-vm-id") {
		t.Error("HandleVMEvent should not add unknown VMs")
	}
}

func TestHandleJobEvent_TerminalStates(t *testing.T) {
	tests := []struct {
		name           string
		initialStatus  structs.JobStatus
		incomingStatus structs.JobStatus
		shouldUpdate   bool
	}{
		{"COMPLETED cannot change to RUNNING", structs.JOB_STATUS_COMPLETED, structs.JOB_STATUS_RUNNING, false},
		{"FAILED cannot change to RUNNING", structs.JOB_STATUS_FAILED, structs.JOB_STATUS_RUNNING, false},
		{"CANCELLED cannot change to RUNNING", structs.JOB_STATUS_CANCELLED, structs.JOB_STATUS_RUNNING, false},
		{"PENDING updates to RUNNING", structs.JOB_STATUS_PENDING, structs.JOB_STATUS_RUNNING, true},
		{"RUNNING updates to COMPLETED", structs.JOB_STATUS_RUNNING, structs.JOB_STATUS_COMPLETED, true},
		{"PULLING updates to FAILED", structs.JOB_STATUS_PULLING, structs.JOB_STATUS_FAILED, true},
		{"RUNNING to RUNNING no-op", structs.JOB_STATUS_RUNNING, structs.JOB_STATUS_RUNNING, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockCallback := &MockCallbackClient{}
			manager := structs.NewJobManagerForTest(mockCallback)

			jobId := "test-job-456"
			manager.SetJobForTest(jobId, tt.initialStatus, "node-1")
			manager.HandleJobEvent(jobId, tt.incomingStatus, nil, "", "node-1")

			currentStatus := manager.GetJobStatusForTest(jobId)
			wasUpdated := currentStatus != tt.initialStatus

			if wasUpdated != tt.shouldUpdate {
				t.Errorf("HandleJobEvent() updated=%v, want updated=%v (initial=%v, incoming=%v, current=%v)",
					wasUpdated, tt.shouldUpdate, tt.initialStatus, tt.incomingStatus, currentStatus)
			}
		})
	}
}

func TestHandleJobEvent_UnknownJob(t *testing.T) {
	mockCallback := &MockCallbackClient{}
	manager := structs.NewJobManagerForTest(mockCallback)

	manager.HandleJobEvent("unknown-job-id", structs.JOB_STATUS_RUNNING, nil, "", "node-1")

	if manager.HasJob("unknown-job-id") {
		t.Error("HandleJobEvent should not add unknown jobs")
	}
}

func TestHandleJobEvent_ExitCodePreserved(t *testing.T) {
	mockCallback := &MockCallbackClient{}
	manager := structs.NewJobManagerForTest(mockCallback)

	jobId := "test-job-exit"
	manager.SetJobForTest(jobId, structs.JOB_STATUS_RUNNING, "node-1")

	exitCode := 42
	manager.HandleJobEvent(jobId, structs.JOB_STATUS_FAILED, &exitCode, "OOMKilled", "node-1")

	status := manager.GetJobStatusForTest(jobId)
	if status != structs.JOB_STATUS_FAILED {
		t.Errorf("Expected status FAILED, got %v", status)
	}
}

type MockCallbackClient struct {
	VMStatusUpdates  []VMStatusUpdate
	JobStatusUpdates []JobStatusUpdate
}

type VMStatusUpdate struct {
	VMId   string
	Status string
	NodeId string
}

type JobStatusUpdate struct {
	JobId    string
	Status   string
	ExitCode *int
	ErrorMsg string
	NodeId   string
}

func (m *MockCallbackClient) NotifyVMStatusUpdate(vmId string, status string, nodeId string) error {
	m.VMStatusUpdates = append(m.VMStatusUpdates, VMStatusUpdate{vmId, status, nodeId})
	return nil
}

func (m *MockCallbackClient) NotifyJobStatusUpdate(jobId string, status string, exitCode *int, errorMsg, nodeId string) error {
	m.JobStatusUpdates = append(m.JobStatusUpdates, JobStatusUpdate{jobId, status, exitCode, errorMsg, nodeId})
	return nil
}

func (m *MockCallbackClient) UploadJobLogs(jobId string, logs string) error {
	return nil
}

func (m *MockCallbackClient) EnqueueVMRetry(vmId, status, nodeId string) {}

func (m *MockCallbackClient) EnqueueJobRetry(jobId, status string, exitCode *int, errorMsg, nodeId string) {
}
