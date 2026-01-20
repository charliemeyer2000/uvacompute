package structs

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

type App struct {
	VMManager  *VMManager
	JobManager *JobManager
	Router     *chi.Mux
}

type CallbackClient interface {
	NotifyVMStatusUpdate(vmId string, status string, nodeId string) error
	NotifyJobStatusUpdate(jobId string, status string, exitCode *int, errorMsg string) error
	UploadJobLogs(jobId string, logs string) error
}

type AppConfig struct {
	VMProvider        VMProvider
	JobProvider       JobProvider
	CallbackClient    CallbackClient
	VMResourceLimits  VMResourceLimits
	JobResourceLimits JobResourceLimits
}

func NewApp(vmProvider VMProvider, callbackClient CallbackClient) *App {
	limits := VMResourceLimits{
		MaxCpus: 16,
		MaxRam:  64,
		MaxGpus: 1,
	}

	return &App{
		VMManager: NewVMManager(limits, vmProvider, callbackClient),
		Router:    chi.NewRouter(),
	}
}

func NewAppWithConfig(config AppConfig) *App {
	app := &App{
		Router: chi.NewRouter(),
	}

	if config.VMProvider != nil {
		vmLimits := config.VMResourceLimits
		if vmLimits.MaxCpus == 0 {
			vmLimits = VMResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
		}
		app.VMManager = NewVMManager(vmLimits, config.VMProvider, config.CallbackClient)
	}

	if config.JobProvider != nil {
		jobLimits := config.JobResourceLimits
		if jobLimits.MaxCpus == 0 {
			jobLimits = JobResourceLimits{MaxCpus: 16, MaxRam: 64, MaxGpus: 1}
		}
		app.JobManager = NewJobManager(jobLimits, config.JobProvider, config.CallbackClient)
	}

	return app
}

type VMHandlers struct {
	CreateVM  func(*App, http.ResponseWriter, *http.Request)
	GetStatus func(*App, http.ResponseWriter, *http.Request, string)
	DeleteVM  func(*App, http.ResponseWriter, *http.Request, string)
}

type JobHandlers struct {
	CreateJob  func(*App, http.ResponseWriter, *http.Request)
	GetStatus  func(*App, http.ResponseWriter, *http.Request, string)
	DeleteJob  func(*App, http.ResponseWriter, *http.Request, string)
	GetLogs    func(*App, http.ResponseWriter, *http.Request, string)
	StreamLogs func(*App, http.ResponseWriter, *http.Request, string)
}

func (app *App) SetupRoutes(
	rootHandler http.HandlerFunc,
	createVMHandler func(*App, http.ResponseWriter, *http.Request),
	getVMStatusHandler func(*App, http.ResponseWriter, *http.Request, string),
	deleteVMHandler func(*App, http.ResponseWriter, *http.Request, string),
	authMiddleware func(http.HandlerFunc) http.HandlerFunc,
) {
	app.Router.Get("/", rootHandler)

	app.Router.Post("/vms", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		createVMHandler(app, w, r)
	}))

	app.Router.Get("/vms/{vmId}", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		vmId := chi.URLParam(r, "vmId")
		getVMStatusHandler(app, w, r, vmId)
	}))

	app.Router.Delete("/vms/{vmId}", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		vmId := chi.URLParam(r, "vmId")
		deleteVMHandler(app, w, r, vmId)
	}))
}

func (app *App) SetupAllRoutes(
	rootHandler http.HandlerFunc,
	vmHandlers VMHandlers,
	jobHandlers JobHandlers,
	authMiddleware func(http.HandlerFunc) http.HandlerFunc,
) {
	app.Router.Get("/", rootHandler)

	app.Router.Post("/vms", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		vmHandlers.CreateVM(app, w, r)
	}))

	app.Router.Get("/vms/{vmId}", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		vmId := chi.URLParam(r, "vmId")
		vmHandlers.GetStatus(app, w, r, vmId)
	}))

	app.Router.Delete("/vms/{vmId}", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		vmId := chi.URLParam(r, "vmId")
		vmHandlers.DeleteVM(app, w, r, vmId)
	}))

	app.Router.Post("/jobs", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		jobHandlers.CreateJob(app, w, r)
	}))

	app.Router.Get("/jobs/{jobId}", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		jobId := chi.URLParam(r, "jobId")
		jobHandlers.GetStatus(app, w, r, jobId)
	}))

	app.Router.Delete("/jobs/{jobId}", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		jobId := chi.URLParam(r, "jobId")
		jobHandlers.DeleteJob(app, w, r, jobId)
	}))

	app.Router.Get("/jobs/{jobId}/logs", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		jobId := chi.URLParam(r, "jobId")
		jobHandlers.GetLogs(app, w, r, jobId)
	}))

	app.Router.Get("/jobs/{jobId}/logs/stream", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		jobId := chi.URLParam(r, "jobId")
		jobHandlers.StreamLogs(app, w, r, jobId)
	}))
}
