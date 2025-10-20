package structs

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

type App struct {
	VMManager *VMManager
	Router    *chi.Mux
}

type CallbackClient interface {
	NotifyVMDeleted(vmId string) error
}

func NewApp(incusProvider IncusProvider, callbackClient CallbackClient) *App {
	limits := VMResourceLimits{
		MaxCpus: 16, // in vCPUs
		MaxRam:  64, // in GiB
		MaxGpus: 1,  // in GPUs
	}

	return &App{
		VMManager: NewVMManager(limits, incusProvider, callbackClient),
		Router:    chi.NewRouter(),
	}
}

func (app *App) SetupRoutes(
	rootHandler http.HandlerFunc,
	createVMHandler func(*App, http.ResponseWriter, *http.Request),
	deleteVMHandler func(*App, http.ResponseWriter, *http.Request, string),
	authMiddleware func(http.HandlerFunc) http.HandlerFunc,
) {
	app.Router.Get("/", rootHandler)

	app.Router.Post("/vms", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		createVMHandler(app, w, r)
	}))

	app.Router.Delete("/vms/{vmId}", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		vmId := chi.URLParam(r, "vmId")
		deleteVMHandler(app, w, r, vmId)
	}))
}
