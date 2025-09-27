package structs

import (
	"time"
)

type VMCreationStatus string

const (
	VM_CREATION_SUCCESS                      VMCreationStatus = "success"
	VM_CREATION_FAILED_VALIDATION            VMCreationStatus = "validation_failed"
	VM_CREATION_FAILED_INTERNAL              VMCreationStatus = "internal_error"
	VM_CREATION_FAILED_RESOURCES_UNAVAILABLE VMCreationStatus = "resources_unavailable"
)

type VMStatus string

const (
	VM_STATUS_CREATING VMStatus = "creating" // creating vm
	VM_STATUS_FAILED   VMStatus = "failed"   // vm failed to create
	VM_STATUS_RUNNING  VMStatus = "running"  // vm is running
	VM_STATUS_DELETING VMStatus = "deleting" // vm is being deleted
	VM_STATUS_DELETED  VMStatus = "deleted"  // vm is deleted (likely will never be used)
	VM_STATUS_UPDATING VMStatus = "updating" // vm is being updated (extended, update config)
)

type GPUType string

const (
	GPU_5090 GPUType = "5090"
)

type VMCreationRequest struct {
	Hours   int      `json:"hours" validate:"required,min=1"`
	UserId  string   `json:"userId" validate:"required"`
	Cpus    *int     `json:"cpus,omitempty" validate:"omitempty,min=1,max=16"`
	Ram     *int     `json:"ram,omitempty" validate:"omitempty,min=1,max=64"`
	Disk    *int     `json:"disk,omitempty" validate:"omitempty,min=64,max=1000"`
	Gpus    *int     `json:"gpus,omitempty" validate:"omitempty,min=0,max=1"`
	GpuType *GPUType `json:"gpu-type,omitempty" validate:"omitempty,oneof='5090'"`
}

const (
	DefaultCpus    = 1
	DefaultRam     = 8
	DefaultDisk    = 64
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

type VMCreationResponse struct {
	Status VMCreationStatus `json:"status"`
	VMId   string           `json:"vmId,omitempty"`
	Msg    string           `json:"msg"`
}

type VMState struct {
	Id     string `json:"id"`
	UserId string `json:"userId"`

	CreationTime time.Time `json:"creationTime"`

	Cpus    int     `json:"cpus"`
	Ram     int     `json:"ram"`
	Disk    int     `json:"disk"`
	Gpus    int     `json:"gpus"`
	GPUType GPUType `json:"gpu-type"`

	Status VMStatus `json:"status"`
}
