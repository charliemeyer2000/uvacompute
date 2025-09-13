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

// should always return a VMCreationResponse
func createVMHandler(w http.ResponseWriter, r *http.Request) {
	var req VMCreationRequest

	// Ensure the request body is valid
	jsonDecoder := json.NewDecoder(r.Body).Decode(&req)
	if jsonDecoder != nil {
		resp := VMCreationResponse{
			Status: VM_CREATION_FAILED_VALIDATION,
			Msg:    jsonDecoder.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(resp)
		return
	}

	// Validate the request body against schema
	validate := validator.New()
	validationErr := validate.Struct(&req)
	if validationErr != nil {
		resp := VMCreationResponse{
			Status: VM_CREATION_FAILED_VALIDATION,
			Msg:    validationErr.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(resp)
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
