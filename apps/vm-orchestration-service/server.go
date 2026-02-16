package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
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

	// Create cancellable context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

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
			MaxDisk: 0, // 0 = read dynamically from node labels
			MaxGpus: 1,
		},
		JobResourceLimits: structs.JobResourceLimits{
			MaxCpus: 16,
			MaxRam:  64,
			MaxGpus: 1,
		},
	})

	callbackClient.StartRetryQueue(ctx)
	app.VMManager.StartPruner(ctx)
	app.JobManager.StartPruner(ctx)

	app.JobManager.SetJobCleanupFunc(func(jobId string) {
		if err := jobAdapter.DeleteJob(jobId); err != nil {
			log.Printf("Job cleanup: failed to delete K8s Job %s: %v", jobId, err)
		}
	})
	app.VMManager.SetVMCleanupFunc(func(vmId string) {
		if err := vmAdapter.DestroyVM(vmId); err != nil {
			log.Printf("VM cleanup: failed to destroy K8s VM %s: %v", vmId, err)
		}
	})

	if err := app.VMManager.InitializeFromBackend(); err != nil {
		fmt.Printf("Warning: Failed to sync state from backend: %v\n", err)
	}

	// Sync with Convex to recover VMs that may have been lost during restart
	if err := lib.SyncFromConvex(app.VMManager, vmAdapter, callbackClient); err != nil {
		fmt.Printf("Warning: Failed to sync from Convex: %v\n", err)
	}

	// Sync jobs with Convex to recover jobs that may have been lost during restart
	if err := lib.SyncJobsFromConvex(app.JobManager, jobAdapter, callbackClient); err != nil {
		fmt.Printf("Warning: Failed to sync jobs from Convex: %v\n", err)
	}

	// Start the event-driven informer manager
	// This handles real-time status updates for VMIs, Jobs, and Pods
	var informerManager *lib.InformerManager
	informerManager, err = lib.NewInformerManager(lib.InformerConfig{
		KubeconfigPath: kubeVirtConfig.KubeconfigPath,
		Namespace:      kubeVirtConfig.Namespace,
		ResyncPeriod:   15 * time.Minute,
	}, app.VMManager, app.JobManager, callbackClient)
	if err != nil {
		fmt.Printf("Warning: Failed to create informer manager: %v\n", err)
	} else {
		// Start AFTER SyncFromConvex/SyncJobsFromConvex to avoid race conditions
		if err := informerManager.Start(ctx); err != nil {
			fmt.Printf("Warning: Failed to start informers: %v\n", err)
		} else {
			fmt.Println("Informer manager started - watching VMIs, Jobs, and Pods")
		}
	}

	// Start the periodic reconciler as a backup consistency check
	// Interval increased to 30 minutes since informers handle real-time updates
	reconciler := lib.NewReconciler(lib.ReconcilerConfig{
		VMManager:      app.VMManager,
		VMProvider:     vmAdapter,
		JobManager:     app.JobManager,
		JobAdapter:     jobAdapter,
		CallbackClient: callbackClient,
		K8sClient:      jobAdapter.K8sClient(),
		Namespace:      kubeVirtConfig.Namespace,
		Interval:       30 * time.Minute,
	})
	go reconciler.Start(ctx)
	fmt.Println("Reconciler started (30 min backup interval)")

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
			ExtendVM:  handlers.ExtendVMHandler,
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

	server := &http.Server{
		Addr:    ":8080",
		Handler: app.Router,
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		<-sigCh
		log.Println("Shutdown signal received")
		cancel()
		if informerManager != nil {
			informerManager.Stop()
		}
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer shutdownCancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("HTTP server shutdown error: %v", err)
		}
	}()

	fmt.Println("Routes configured, starting server on :8080")
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Printf("Server failed to start: %v\n", err)
		panic(err)
	}

	log.Println("Server stopped gracefully")
}
