package main

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
	Status int    `json:"status"`
	VMId   string `json:"vmId"`
	Msg    string `json:"msg"`
}
