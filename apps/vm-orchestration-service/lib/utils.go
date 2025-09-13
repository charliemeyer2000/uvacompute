package lib

import (
	"encoding/json"
	"fmt"
	"net/http"

	"vm-orchestration-service/structs"
)

func ValidatePowerOfTwo(w http.ResponseWriter, value int, fieldName string) bool {
	if value > 0 && (value&(value-1)) != 0 {
		resp := structs.VMCreationResponse{
			Status: structs.VM_CREATION_FAILED_VALIDATION,
			Msg:    fmt.Sprintf("%s must be a power of 2", fieldName),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(resp)
		return false
	}
	return true
}

func SendValidationError(w http.ResponseWriter, message string) {
	resp := structs.VMCreationResponse{
		Status: structs.VM_CREATION_FAILED_VALIDATION,
		Msg:    message,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(resp)
}