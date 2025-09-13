package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-playground/validator/v10"
)

func handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Hello, World!")
}

func validatePowerOfTwo(w http.ResponseWriter, value int, fieldName string) bool {
	if value > 0 && (value&(value-1)) != 0 {
		resp := VMCreationResponse{
			Status: VM_CREATION_FAILED_VALIDATION,
			Msg:    fmt.Sprintf("%s must be a power of 2", fieldName),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(resp)
		return false
	}
	return true
}

func sendValidationError(w http.ResponseWriter, message string) {
	resp := VMCreationResponse{
		Status: VM_CREATION_FAILED_VALIDATION,
		Msg:    message,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(resp)
}

func createVMHandler(w http.ResponseWriter, r *http.Request) {
	var req VMCreationRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendValidationError(w, err.Error())
		return
	}

	validate := validator.New()
	if err := validate.Struct(&req); err != nil {
		sendValidationError(w, err.Error())
		return
	}

	if !validatePowerOfTwo(w, req.Cpus, "CPUs") ||
		!validatePowerOfTwo(w, req.Ram, "RAM") ||
		!validatePowerOfTwo(w, req.Disk, "Disk") {
		return
	}

	// Create the VM (right now just mock successful request)
	resp := VMCreationResponse{
		Status: VM_CREATION_SUCCESS,
		VMId:   "vm-12345",
		Msg:    "VM created successfully",
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)

}

func main() {
	fmt.Println("Starting server...")
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	r.Get("/", handler)
	r.Post("/vms", createVMHandler)

	fmt.Println("Routes configured, starting server on :8080")
	err := http.ListenAndServe(":8080", r)
	if err != nil {
		fmt.Printf("Server failed to start: %v\n", err)
	}
}
