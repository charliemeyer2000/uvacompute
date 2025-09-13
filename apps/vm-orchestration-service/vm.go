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

func createVMHandler(w http.ResponseWriter, r *http.Request) {
	var req VMCreationRequest

	// Ensure the request body is valid
	jsonDecoder := json.NewDecoder(r.Body).Decode(&req)
	if jsonDecoder != nil {
		http.Error(w, jsonDecoder.Error(), http.StatusBadRequest)
		return
	}

	// Validate the request body against schema
	validate := validator.New()
	validationErr := validate.Struct(&req)
	if validationErr != nil {
		http.Error(w, validationErr.Error(), http.StatusBadRequest)
		return
	}

	// Create the VM (right now just mock successful request)
	w.Write([]byte("VM created successfully"))

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
