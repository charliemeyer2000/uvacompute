package main

type VMCreationStatus string

const (
	VM_CREATION_SUCCESS                      VMCreationStatus = "success"
	VM_CREATION_FAILED_VALIDATION            VMCreationStatus = "validation_failed"
	VM_CREATION_FAILED_INTERNAL              VMCreationStatus = "internal_error"
	VM_CREATION_FAILED_RESOURCES_UNAVAILABLE VMCreationStatus = "resources_unavailable"
)

type VMCreationRequest struct {
	Hours   int     `json:"hours" validate:"required,min=1"`
	Gpus    int     `json:"gpus" validate:"required,min=0,max=1"`
	GpuType GPUType `json:"gpu-type" validate:"omitempty,oneof='5090'"`
	Cpus    int     `json:"cpus" validate:"omitempty,min=1,max=16"`
	Ram     int     `json:"ram" validate:"omitempty,min=1,max=64"`
	Disk    int     `json:"disk" validate:"omitempty,min=64,max=1000"`
	UserId  string  `json:"userId" validate:"required"`
}

type VMCreationResponse struct {
	Status VMCreationStatus `json:"status"`
	VMId   string           `json:"vmId,omitempty"`
	Msg    string           `json:"msg"`
}

type GPUType string

const (
	GPU_5090 GPUType = "5090"
)
