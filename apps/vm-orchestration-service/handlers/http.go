package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"vm-orchestration-service/lib"
	"vm-orchestration-service/structs"

	"github.com/go-playground/validator/v10"
)

func RootHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Hello, World!!!!")
}

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

	if !lib.ValidatePowerOfTwoOrError(w, structs.IntOrDefault(req.Cpus, structs.DefaultCpus), "CPUs") ||
		!lib.ValidatePowerOfTwoOrError(w, structs.IntOrDefault(req.Ram, structs.DefaultRam), "RAM") ||
		!lib.ValidatePowerOfTwoOrError(w, structs.IntOrDefault(req.Disk, structs.DefaultDisk), "Disk") {
		return
	}

	// add vm to manager
	vmId, err := app.VMManager.CreateVM(req)
	if err != nil {
		status := structs.VM_CREATION_FAILED_INTERNAL
		statusCode := http.StatusInternalServerError

		if strings.Contains(err.Error(), "insufficient") {
			status = structs.VM_CREATION_FAILED_RESOURCES_UNAVAILABLE
			statusCode = http.StatusConflict
		}

		resp := structs.VMCreationResponse{
			Status: status,
			Msg:    err.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(resp)
		return
	}

	// actually create vm in incus
	_, incusErr := lib.CreateIncusVM(vmId, req)
	if incusErr != nil {

		// remove vm from manager
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

	resp := structs.VMCreationResponse{
		Status: structs.VM_CREATION_SUCCESS,
		VMId:   vmId,
		Msg:    "VM created successfully",
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
