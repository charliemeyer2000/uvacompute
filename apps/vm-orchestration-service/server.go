package main

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"vm-orchestration-service/handlers"
	"vm-orchestration-service/lib"
	"vm-orchestration-service/structs"

	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	fmt.Println("Starting server...")

	if structs.IsDevelopment() {
		fmt.Println("Running in development (no incus calls)")
	} else {
		fmt.Println("Running in production.")
	}

	secret := os.Getenv("ORCHESTRATION_SHARED_SECRET")
	if secret == "" {
		fmt.Println("WARNING: ORCHESTRATION_SHARED_SECRET not set - running without authentication!")
	} else {
		fmt.Println("Authentication enabled (HMAC request signing)")
	}

	incusAdapter := lib.NewIncusAdapter()
	app := structs.NewApp(incusAdapter)

	app.Router.Use(middleware.Logger)
	app.Router.Use(middleware.RequestID)
	app.Router.Use(middleware.RealIP)
	app.Router.Use(middleware.Recoverer)
	app.Router.Use(middleware.Timeout(60 * time.Second))

	app.SetupRoutes(handlers.RootHandler, handlers.CreateVMHandler, handlers.DeleteVMHandler, handlers.AuthMiddleware)

	fmt.Println("Routes configured, starting server on :8080")
	err := http.ListenAndServe(":8080", app.Router)
	if err != nil {
		fmt.Printf("Server failed to start: %v\n", err)
		panic(err)
	}
}
