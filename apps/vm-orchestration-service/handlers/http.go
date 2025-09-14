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

// CreateVMHandler now takes the App instance to access VMManager
func CreateVMHandler(app *structs.App, w http.ResponseWriter, r *http.Request) {
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

	// Set defaults for optional fields
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

	// Create VM in VMManager first
	vmId, err := app.VMManager.CreateVM(req)
	if err != nil {
		resp := structs.VMCreationResponse{
			Status: structs.VM_CREATION_FAILED_INTERNAL,
			Msg:    err.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(resp)
		return
	}

	// Now call Incus to actually create the VM
	_, incusErr := lib.CreateIncusVM(req)
	if incusErr != nil {
		// Remove from VMManager if Incus fails
		app.VMManager.DeleteVM(vmId)
		resp := structs.VMCreationResponse{
			Status: structs.VM_CREATION_FAILED_INTERNAL,
			Msg:    incusErr.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(resp)
		return
	}

	// Success response
	resp := structs.VMCreationResponse{
		Status: structs.VM_CREATION_SUCCESS,
		VMId:   vmId,
		Msg:    "VM created successfully",
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
