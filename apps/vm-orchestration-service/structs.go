package main

import (
	"encoding/json"
)

type VMCreationStatus int

const (
	VM_CREATION_SUCCESS VMCreationStatus = iota
	VM_CREATION_FAILED_VALIDATION
	VM_CREATION_FAILED_INTERNAL
	VM_CREATION_FAILED_RESOURCES_UNAVAILABLE
)

var vmCreationStatuses = map[VMCreationStatus]string{
	VM_CREATION_SUCCESS:                      "VM creation successful",
	VM_CREATION_FAILED_VALIDATION:            "VM creation failed validation, invalid request body",
	VM_CREATION_FAILED_INTERNAL:              "VM creation failed internally",
	VM_CREATION_FAILED_RESOURCES_UNAVAILABLE: "VM creation failed, requested resources are unavailable",
}

func (s VMCreationStatus) MarshalJSON() ([]byte, error) {
	return json.Marshal(vmCreationStatuses[s])
}

func (s VMCreationStatus) String() string {
	return vmCreationStatuses[s]
}

type VMCreationRequest struct {
	Hours   int    `json:"hours" validate:"required,min=1"`
	Gpus    int    `json:"gpus" validate:"required,min=0,max=1"`
	GpuType string `json:"gpu-type" validate:"omitempty,oneof=5090"`
	Cpus    int    `json:"cpus" validate:"omitempty,min=1,max=16"`
	Ram     int    `json:"ram" validate:"omitempty,min=1,max=64"`
	Disk    int    `json:"disk" validate:"omitempty,min=64,max=1000"`
	UserId  string `json:"userId" validate:"required"`
}

type VMCreationResponse struct {
	Status VMCreationStatus `json:"status"`
	VMId   string           `json:"vmId,omitempty"`
	Msg    string           `json:"msg"`
}
