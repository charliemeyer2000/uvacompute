package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"

	"vm-orchestration-service/lib"
	"vm-orchestration-service/structs"

	"github.com/go-playground/validator/v10"
)

var defaultCpus = 1                   // 1vCPU
var defaultRam = 1                    // 1GB ram
var defaultDisk = 64                  // 64GB disk
var defaultGpuType = structs.GPU_5090 // 5090 GPU

func RootHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Hello, World!!!!")
}

func CreateVMHandler(w http.ResponseWriter, r *http.Request) {
	var req structs.VMCreationRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		lib.SendValidationError(w, err.Error())
		return
	}

	validate := validator.New()
	if err := validate.Struct(&req); err != nil {
		lib.SendValidationError(w, err.Error())
		return
	}

	if !lib.ValidatePowerOfTwoOrError(w, *req.Cpus, "CPUs") ||
		!lib.ValidatePowerOfTwoOrError(w, *req.Ram, "RAM") ||
		!lib.ValidatePowerOfTwoOrError(w, *req.Disk, "Disk") {
		return
	}

	// For optional fields, set defaults if not provided.
	if req.Cpus == nil {
		req.Cpus = &defaultCpus
	}
	if req.Ram == nil {
		req.Ram = &defaultRam
	}
	if req.Disk == nil {
		req.Disk = &defaultDisk
	}
	if req.GpuType == nil {
		req.GpuType = &defaultGpuType
	}

	// Create the VM (right now just mock successful request)
	resp := structs.VMCreationResponse{
		Status: structs.VM_CREATION_SUCCESS,
		VMId:   "vm-12345",
		Msg:    "VM created successfully",
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
