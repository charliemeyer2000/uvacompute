package structs

import (
	"os"
	"strings"
	"time"

	"github.com/goccy/go-yaml"
)

type VMStatusResponse struct {
	Status VMStatus `json:"status"`
	Msg    string   `json:"msg"`
	Info   *VMInfo  `json:"info,omitempty"`
}

type VMCreationStatus string

const (
	VM_CREATION_SUCCESS                      VMCreationStatus = "success"
	VM_CREATION_FAILED_VALIDATION            VMCreationStatus = "validation_failed"
	VM_CREATION_FAILED_INTERNAL              VMCreationStatus = "internal_error"
	VM_CREATION_FAILED_RESOURCES_UNAVAILABLE VMCreationStatus = "resources_unavailable"
	VM_DELETION_SUCCESS                      VMCreationStatus = "deletion_success"
	VM_DELETION_FAILED_INTERNAL              VMCreationStatus = "deletion_failed_internal"
	VM_DELETION_FAILED_NOT_FOUND             VMCreationStatus = "deletion_failed_not_found"
)

type VMStatus string

const (
	VM_STATUS_NOT_FOUND    VMStatus = "not_found"    // vm not found (API response only)
	VM_STATUS_CREATING     VMStatus = "creating"     // VM creation initiated, waiting for orchestration
	VM_STATUS_PENDING      VMStatus = "pending"      // request received, queued
	VM_STATUS_BOOTING      VMStatus = "booting"      // VM is starting up (scheduling, booting, waiting for agent)
	VM_STATUS_PROVISIONING VMStatus = "provisioning" // cloud-init running, installing software
	VM_STATUS_READY        VMStatus = "ready"        // VM is ready to use
	VM_STATUS_STOPPING     VMStatus = "stopping"     // VM is being deleted
	VM_STATUS_STOPPED      VMStatus = "stopped"      // VM has stopped (deleted or expired)
	VM_STATUS_FAILED       VMStatus = "failed"       // VM failed to create
	VM_STATUS_OFFLINE      VMStatus = "offline"      // node hosting VM went offline
)

type GPUType string

const (
	GPU_5090 GPUType = "5090"
)

type VMCreationRequest struct {
	VMId            string   `json:"vmId" validate:"required"` // Pre-generated VM ID from frontend
	Hours           int      `json:"hours" validate:"required,min=1"`
	UserId          string   `json:"userId" validate:"required"`
	Name            *string  `json:"name,omitempty" validate:"omitempty,max=255"`
	Cpus            *int     `json:"cpus,omitempty" validate:"omitempty,min=1,max=16"`
	Ram             *int     `json:"ram,omitempty" validate:"omitempty,min=1,max=64"`
	Disk            *int     `json:"disk,omitempty" validate:"omitempty,min=10,max=500"`
	Gpus            *int     `json:"gpus,omitempty" validate:"omitempty,min=0,max=1"`
	GpuType         *GPUType `json:"gpu-type,omitempty" validate:"omitempty,oneof='5090'"`
	SSHPublicKeys   []string `json:"sshPublicKeys,omitempty"`
	StartupScript   *string  `json:"startupScript,omitempty" validate:"omitempty,max=1048576"`
	CloudInitConfig *string  `json:"cloudInitConfig,omitempty" validate:"omitempty,max=102400"`
}

const (
	DefaultCpus    = 1
	DefaultRam     = 8
	DefaultDisk    = 20 // 20GB default, using DataVolumeTemplates for actual storage
	DefaultGpus    = 0
	DefaultGpuType = GPU_5090
)

func IntOrDefault(ptr *int, defaultVal int) int {
	if ptr == nil {
		return defaultVal
	}
	return *ptr
}

func GpuTypeOrDefault(ptr *GPUType, defaultVal GPUType) GPUType {
	if ptr == nil {
		return defaultVal
	}
	return *ptr
}

func StringOrDefault(ptr *string, defaultVal string) string {
	if ptr == nil {
		return defaultVal
	}
	return *ptr
}

func IsDevelopment() bool {
	env := strings.ToLower(strings.TrimSpace(os.Getenv("ENV")))
	return env == "development" || env == "dev"
}

type VMCreationResponse struct {
	Status VMCreationStatus `json:"status"`
	VMId   string           `json:"vmId,omitempty"`
	Msg    string           `json:"msg"`
}

type VMDeletionResponse struct {
	Status VMCreationStatus `json:"status"`
	VMId   string           `json:"vmId,omitempty"`
	Msg    string           `json:"msg"`
}

type VMState struct {
	Id     string `json:"id"`
	Name   string `json:"name,omitempty"`
	UserId string `json:"userId"`

	CreationTime time.Time `json:"creationTime"`

	Cpus    int     `json:"cpus"`
	Ram     int     `json:"ram"`
	Disk    int     `json:"disk"`
	Gpus    int     `json:"gpus"`
	GPUType GPUType `json:"gpu-type"`

	Status       VMStatus `json:"status"`
	ErrorMessage string   `json:"errorMessage,omitempty"`
	NodeId       string   `json:"nodeId,omitempty"`
}

type ListVM struct {
	Name      string            `json:"name"`
	Status    string            `json:"status"`
	Type      string            `json:"type"`
	Config    map[string]string `json:"config"`
	CreatedAt string            `json:"created_at"`
}

type VMInfo struct {
	Name         string `yaml:"Name"`
	Description  string `yaml:"Description"`
	Status       string `yaml:"Status"`
	Type         string `yaml:"Type"`
	Architecture string `yaml:"Architecture"`
	Created      string `yaml:"Created"`
	LastUsed     string `yaml:"Last Used"`

	Location        string       `yaml:"Location,omitempty"`
	PID             int          `yaml:"PID,omitempty"`
	Started         string       `yaml:"Started,omitempty"`
	OperatingSystem *OSInfo      `yaml:"Operating System,omitempty"`
	Resources       *VMResources `yaml:"Resources,omitempty"`
}

type OSInfo struct {
	OS            string `yaml:"OS"`
	OSVersion     string `yaml:"OS Version"`
	KernelVersion string `yaml:"Kernel Version"`
	Hostname      string `yaml:"Hostname"`
	FQDN          string `yaml:"FQDN"`
}

type VMResources struct {
	Processes    int                       `yaml:"Processes,omitempty"`
	DiskUsage    map[string]string         `yaml:"Disk usage,omitempty"`
	CPUUsage     *CPUUsage                 `yaml:"CPU usage,omitempty"`
	MemoryUsage  *MemoryUsage              `yaml:"Memory usage,omitempty"`
	NetworkUsage map[string]*NetworkDevice `yaml:"Network usage,omitempty"`
}

type CPUUsage struct {
	CPUUsageSeconds int `yaml:"CPU usage (in seconds)"`
}

type MemoryUsage struct {
	MemoryCurrent string `yaml:"Memory (current),omitempty"`
	MemoryPeak    string `yaml:"Memory (peak),omitempty"`
	SwapCurrent   string `yaml:"Swap (current),omitempty"`
	SwapPeak      string `yaml:"Swap (peak),omitempty"`
}

type NetworkDevice struct {
	Type                   string        `yaml:"Type"`
	State                  string        `yaml:"State"`
	HostInterface          string        `yaml:"Host interface,omitempty"`
	MACAddress             string        `yaml:"MAC address,omitempty"`
	MTU                    int           `yaml:"MTU,omitempty"`
	BytesReceived          string        `yaml:"Bytes received,omitempty"`
	BytesSent              string        `yaml:"Bytes sent,omitempty"`
	PacketsReceived        int           `yaml:"Packets received,omitempty"`
	PacketsSent            int           `yaml:"Packets sent,omitempty"`
	ErrorsReceived         int           `yaml:"Errors received,omitempty"`
	ErrorsSent             int           `yaml:"Errors sent,omitempty"`
	PacketsDroppedInbound  int           `yaml:"Packets dropped inbound,omitempty"`
	PacketsDroppedOutbound int           `yaml:"Packets dropped outbound,omitempty"`
	IPAddresses            yaml.MapSlice `yaml:"IP addresses,omitempty"`
}

func ParseVMInfo(yamlData []byte) (*VMInfo, error) {
	var info VMInfo
	err := yaml.UnmarshalWithOptions(yamlData, &info, yaml.AllowDuplicateMapKey())
	if err != nil {
		return nil, err
	}
	return &info, nil
}

// Job-related types

type JobStatus string

const (
	JOB_STATUS_PENDING      JobStatus = "pending"
	JOB_STATUS_SCHEDULED    JobStatus = "scheduled"
	JOB_STATUS_PULLING      JobStatus = "pulling"
	JOB_STATUS_RUNNING      JobStatus = "running"
	JOB_STATUS_COMPLETED    JobStatus = "completed"
	JOB_STATUS_FAILED       JobStatus = "failed"
	JOB_STATUS_CANCELLED    JobStatus = "cancelled"
	JOB_STATUS_NODE_OFFLINE JobStatus = "node_offline" // node hosting job went offline
)

type JobCreationStatus string

const (
	JOB_CREATION_SUCCESS                      JobCreationStatus = "success"
	JOB_CREATION_FAILED_VALIDATION            JobCreationStatus = "validation_failed"
	JOB_CREATION_FAILED_INTERNAL              JobCreationStatus = "internal_error"
	JOB_CREATION_FAILED_RESOURCES_UNAVAILABLE JobCreationStatus = "resources_unavailable"
	JOB_CANCELLATION_SUCCESS                  JobCreationStatus = "cancellation_success"
	JOB_CANCELLATION_FAILED_INTERNAL          JobCreationStatus = "cancellation_failed_internal"
	JOB_CANCELLATION_FAILED_NOT_FOUND         JobCreationStatus = "cancellation_failed_not_found"
	JOB_CANCELLATION_FAILED_NOT_CANCELLABLE   JobCreationStatus = "cancellation_failed_not_cancellable"
)

type JobCreationRequest struct {
	UserId  string            `json:"userId" validate:"required"`
	Image   string            `json:"image" validate:"required"`
	Command []string          `json:"command,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	Name    *string           `json:"name,omitempty" validate:"omitempty,max=255"`
	Cpus    *int              `json:"cpus,omitempty" validate:"omitempty,min=1,max=16"`
	Ram     *int              `json:"ram,omitempty" validate:"omitempty,min=1,max=64"`
	Gpus    *int              `json:"gpus,omitempty" validate:"omitempty,min=0,max=1"`
	Disk    *int              `json:"disk,omitempty" validate:"omitempty,min=0,max=100"`
}

type JobCreationResponse struct {
	Status JobCreationStatus `json:"status"`
	JobId  string            `json:"jobId,omitempty"`
	Msg    string            `json:"msg"`
}

type JobCancellationResponse struct {
	Status JobCreationStatus `json:"status"`
	JobId  string            `json:"jobId,omitempty"`
	Msg    string            `json:"msg"`
}

type JobStatusResponse struct {
	Status       JobStatus `json:"status"`
	Msg          string    `json:"msg"`
	ExitCode     *int      `json:"exitCode,omitempty"`
	ErrorMessage string    `json:"errorMessage,omitempty"`
}

type JobState struct {
	Id     string `json:"id"`
	Name   string `json:"name,omitempty"`
	UserId string `json:"userId"`

	CreationTime time.Time `json:"creationTime"`

	Image   string            `json:"image"`
	Command []string          `json:"command,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	Cpus    int               `json:"cpus"`
	Ram     int               `json:"ram"`
	Gpus    int               `json:"gpus"`
	Disk    int               `json:"disk"`

	Status       JobStatus `json:"status"`
	ExitCode     *int      `json:"exitCode,omitempty"`
	ErrorMessage string    `json:"errorMessage,omitempty"`
	NodeId       string    `json:"nodeId,omitempty"`
}

type JobResourceLimits struct {
	MaxCpus int
	MaxRam  int
	MaxGpus int
}

const (
	DefaultJobCpus = 1
	DefaultJobRam  = 4
	DefaultJobGpus = 0
	DefaultJobDisk = 0
)
