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
	"github.com/joho/godotenv"
)

func loadEnvFile() {
	env := os.Getenv("ENV")
	if env == "" {
		env = "development"
	}

	envFile := fmt.Sprintf(".env.%s", env)
	if err := godotenv.Load(envFile); err != nil {
		panic(err)
	}

	fmt.Printf("Loaded environment from %s\n", envFile)
}

func main() {
	loadEnvFile()
	fmt.Println("Starting server...")

	if structs.IsDevelopment() {
		fmt.Println("Running in development (no incus calls)")
	} else {
		fmt.Println("Running in production.")
	}

	siteBaseUrl := os.Getenv("SITE_BASE_URL")
	sharedSecret := os.Getenv("ORCHESTRATION_SHARED_SECRET")

	if siteBaseUrl == "" || sharedSecret == "" {
		fmt.Println("ERROR: Missing required environment variables:")
		if siteBaseUrl == "" {
			fmt.Println("  - SITE_BASE_URL is not set")
		}
		if sharedSecret == "" {
			fmt.Println("  - ORCHESTRATION_SHARED_SECRET is not set")
		}
		panic("Cannot start without required configuration")
	}

	fmt.Printf("Callback client configured for: %s\n", siteBaseUrl)

	callbackClient := lib.NewCallbackClient(siteBaseUrl, sharedSecret)
	incusAdapter := lib.NewIncusAdapter()
	app := structs.NewApp(incusAdapter, callbackClient)

	if err := app.VMManager.InitializeFromIncus(); err != nil {
		fmt.Printf("Warning: Failed to sync state from Incus: %v\n", err)
	}

	app.Router.Use(middleware.Logger)
	app.Router.Use(middleware.RequestID)
	app.Router.Use(middleware.RealIP)
	app.Router.Use(middleware.Recoverer)
	app.Router.Use(middleware.Timeout(60 * time.Second))

	app.SetupRoutes(handlers.RootHandler, handlers.CreateVMHandler, handlers.GetVMStatusHandler, handlers.DeleteVMHandler, handlers.AuthMiddleware)

	fmt.Println("Routes configured, starting server on :8080")
	err := http.ListenAndServe(":8080", app.Router)
	if err != nil {
		fmt.Printf("Server failed to start: %v\n", err)
		panic(err)
	}
}
