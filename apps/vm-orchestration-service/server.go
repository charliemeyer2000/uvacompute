package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"vm-orchestration-service/structs"

	"vm-orchestration-service/lib"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-playground/validator/v10"
)

func rootHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Hello, World!!!!")
}

func createVMHandler(w http.ResponseWriter, r *http.Request) {
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

	if !lib.ValidatePowerOfTwo(w, req.Cpus, "CPUs") ||
		!lib.ValidatePowerOfTwo(w, req.Ram, "RAM") ||
		!lib.ValidatePowerOfTwo(w, req.Disk, "Disk") {
		return
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

func main() {
	fmt.Println("Starting server...")
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	r.Get("/", rootHandler)
	r.Post("/vms", createVMHandler)

	fmt.Println("Routes configured, starting server on :8080")
	err := http.ListenAndServe(":8080", r)
	if err != nil {
		fmt.Printf("Server failed to start: %v\n", err)
	}
}
