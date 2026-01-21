package main

import (
	"context"
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
		fmt.Println("Running in development mode")
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

	fmt.Println("Using KubeVirt backend for VMs")
	kubeVirtConfig := lib.DefaultKubeVirtConfig()

	vmAdapter, err := lib.NewKubeVirtAdapter(kubeVirtConfig)
	if err != nil {
		panic(fmt.Sprintf("Failed to create KubeVirt adapter: %v", err))
	}

	if err := vmAdapter.EnsureNamespace(); err != nil {
		fmt.Printf("Warning: Failed to ensure namespace: %v\n", err)
	}

	if err := vmAdapter.Ping(); err != nil {
		panic(fmt.Sprintf("Failed to connect to Kubernetes: %v", err))
	}

	fmt.Printf("Connected to Kubernetes, using namespace: %s\n", kubeVirtConfig.Namespace)

	fmt.Println("Using Kubernetes Jobs backend for container jobs")
	jobAdapterConfig := lib.JobAdapterConfig{
		Namespace:      kubeVirtConfig.Namespace,
		KubeconfigPath: kubeVirtConfig.KubeconfigPath,
	}

	jobAdapter, err := lib.NewJobAdapter(jobAdapterConfig)
	if err != nil {
		panic(fmt.Sprintf("Failed to create Job adapter: %v", err))
	}

	if err := jobAdapter.EnsureNamespace(); err != nil {
		fmt.Printf("Warning: Failed to ensure namespace for jobs: %v\n", err)
	}

	if err := jobAdapter.Ping(); err != nil {
		panic(fmt.Sprintf("Failed to connect to Kubernetes for jobs: %v", err))
	}

	fmt.Println("Job adapter initialized successfully")

	healthMonitor, err := lib.NewHealthMonitor(lib.HealthMonitorConfig{
		KubeconfigPath: kubeVirtConfig.KubeconfigPath,
		Interval:       30 * time.Second,
	}, callbackClient)
	if err != nil {
		fmt.Printf("Warning: Failed to create health monitor: %v\n", err)
	} else {
		ctx := context.Background()
		go healthMonitor.Start(ctx)
		fmt.Println("Health monitor started")
	}

	app := structs.NewAppWithConfig(structs.AppConfig{
		VMProvider:     vmAdapter,
		JobProvider:    jobAdapter,
		CallbackClient: callbackClient,
		VMResourceLimits: structs.VMResourceLimits{
			MaxCpus: 16,
			MaxRam:  64,
			MaxGpus: 1,
		},
		JobResourceLimits: structs.JobResourceLimits{
			MaxCpus: 16,
			MaxRam:  64,
			MaxGpus: 1,
		},
	})

	if err := app.VMManager.InitializeFromBackend(); err != nil {
		fmt.Printf("Warning: Failed to sync state from backend: %v\n", err)
	}

	// Sync with Convex to recover VMs that may have been lost during restart
	if err := lib.SyncFromConvex(app.VMManager, vmAdapter, callbackClient); err != nil {
		fmt.Printf("Warning: Failed to sync from Convex: %v\n", err)
	}

	// Start the periodic reconciler
	reconciler := lib.NewReconciler(lib.ReconcilerConfig{
		VMManager:      app.VMManager,
		VMProvider:     vmAdapter,
		CallbackClient: callbackClient,
		Interval:       5 * time.Minute,
	})
	go reconciler.Start(context.Background())
	fmt.Println("Reconciler started")

	app.Router.Use(middleware.Logger)
	app.Router.Use(middleware.RequestID)
	app.Router.Use(middleware.RealIP)
	app.Router.Use(middleware.Recoverer)
	app.Router.Use(middleware.Timeout(60 * time.Second))

	app.SetupAllRoutes(
		handlers.RootHandler,
		structs.VMHandlers{
			CreateVM:  handlers.CreateVMHandler,
			GetStatus: handlers.GetVMStatusHandler,
			DeleteVM:  handlers.DeleteVMHandler,
		},
		structs.JobHandlers{
			CreateJob:  handlers.CreateJobHandler,
			GetStatus:  handlers.GetJobStatusHandler,
			DeleteJob:  handlers.DeleteJobHandler,
			GetLogs:    handlers.GetJobLogsHandler,
			StreamLogs: handlers.StreamJobLogsHandler,
		},
		handlers.AuthMiddleware,
	)

	fmt.Println("Routes configured, starting server on :8080")
	err = http.ListenAndServe(":8080", app.Router)
	if err != nil {
		fmt.Printf("Server failed to start: %v\n", err)
		panic(err)
	}
}
