package handlers

import (
	"encoding/json"
	"net/http"
	"os/exec"
	"strings"

	"vm-orchestration-service/lib"
	"vm-orchestration-service/structs"

	"github.com/go-playground/validator/v10"
)

func RootHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "alive"})
}

func HealthHandler(w http.ResponseWriter, r *http.Request) {
	frpsRunning := exec.Command("pgrep", "-x", "frps").Run() == nil

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{
		"status": "alive",
		"services": map[string]any{
			"frps": map[string]any{
				"running": frpsRunning,
			},
		},
	})
}

func GetVMStatusHandler(app *structs.App, w http.ResponseWriter, r *http.Request, vmId string) {
	vmState, exists := app.VMManager.GetVM(vmId)
	if !exists {
		resp := structs.VMStatusResponse{
			Status: structs.VM_STATUS_NOT_FOUND,
			Msg:    "VM not found",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(resp)
		return
	}

	msg := "VM status retrieved successfully"
	if vmState.Status == structs.VM_STATUS_FAILED && vmState.ErrorMessage != "" {
		msg = vmState.ErrorMessage
	}

	resp := structs.VMStatusResponse{
		Status: vmState.Status,
		Msg:    msg,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
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

	cpus := structs.IntOrDefault(req.Cpus, structs.DefaultCpus)
	ram := structs.IntOrDefault(req.Ram, structs.DefaultRam)
	disk := structs.IntOrDefault(req.Disk, structs.DefaultDisk)

	if !lib.ValidatePowerOfTwoOrError(w, cpus, "CPUs") ||
		!lib.ValidatePowerOfTwoOrError(w, ram, "RAM") ||
		!lib.ValidatePowerOfTwoOrError(w, disk, "Disk") {
		return
	}

	vmId, err := app.VMManager.CreateVM(req)
	if err != nil {
		status := structs.VM_CREATION_FAILED_INTERNAL
		statusCode := http.StatusInternalServerError

		if strings.Contains(err.Error(), "insufficient") || strings.Contains(err.Error(), "no GPU") {
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

	resp := structs.VMCreationResponse{
		Status: structs.VM_CREATION_SUCCESS,
		VMId:   vmId,
		Msg:    "VM created successfully",
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func DeleteVMHandler(app *structs.App, w http.ResponseWriter, r *http.Request, vmId string) {
	err := app.VMManager.DeleteVM(vmId)
	if err != nil {
		status := structs.VM_DELETION_FAILED_INTERNAL
		statusCode := http.StatusInternalServerError

		if strings.Contains(err.Error(), "not found") {
			statusCode = http.StatusNotFound
		}

		resp := structs.VMDeletionResponse{
			Status: status,
			VMId:   vmId,
			Msg:    "VM deletion failed",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(resp)
		return
	}

	resp := structs.VMDeletionResponse{
		Status: structs.VM_DELETION_SUCCESS,
		VMId:   vmId,
		Msg:    "VM deletion successful",
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func ExtendVMHandler(app *structs.App, w http.ResponseWriter, r *http.Request, vmId string) {
	var req structs.VMExtendRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		resp := structs.VMExtendResponse{
			Status: structs.VM_EXTEND_FAILED_VALIDATION,
			VMId:   vmId,
			Msg:    err.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(resp)
		return
	}

	validate := validator.New()
	if err := validate.Struct(&req); err != nil {
		resp := structs.VMExtendResponse{
			Status: structs.VM_EXTEND_FAILED_VALIDATION,
			VMId:   vmId,
			Msg:    err.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(resp)
		return
	}

	expiresAt, err := app.VMManager.ExtendVM(vmId, req.Hours)
	if err != nil {
		statusCode := http.StatusInternalServerError
		status := structs.VM_EXTEND_FAILED_INTERNAL

		if strings.Contains(err.Error(), "not found") {
			statusCode = http.StatusNotFound
			status = structs.VM_EXTEND_FAILED_NOT_FOUND
		} else if strings.Contains(err.Error(), "expired") || strings.Contains(err.Error(), "not running") {
			statusCode = http.StatusBadRequest
			status = structs.VM_EXTEND_FAILED_VALIDATION
		}

		resp := structs.VMExtendResponse{
			Status: status,
			VMId:   vmId,
			Msg:    err.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(resp)
		return
	}

	resp := structs.VMExtendResponse{
		Status:    structs.VM_EXTEND_SUCCESS,
		VMId:      vmId,
		ExpiresAt: expiresAt,
		Msg:       "VM expiration extended",
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
