package structs

import (
	"net/http"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
)

type VMCreationStatus string

const (
	VM_CREATION_SUCCESS                      VMCreationStatus = "success"
	VM_CREATION_FAILED_VALIDATION            VMCreationStatus = "validation_failed"
	VM_CREATION_FAILED_INTERNAL              VMCreationStatus = "internal_error"
	VM_CREATION_FAILED_RESOURCES_UNAVAILABLE VMCreationStatus = "resources_unavailable"
)

type VMStatus string

const (
	VM_STATUS_CREATING VMStatus = "creating" // creating vm
	VM_STATUS_FAILED   VMStatus = "failed"   // vm failed to create
	VM_STATUS_RUNNING  VMStatus = "running"  // vm is running
	VM_STATUS_DELETING VMStatus = "deleting" // vm is being deleted
	VM_STATUS_DELETED  VMStatus = "deleted"  // vm is deleted (likely will never be used)
	VM_STATUS_UPDATING VMStatus = "updating" // vm is being updated (extended, update config)
)

type VMCreationRequest struct {
	Hours   int      `json:"hours" validate:"required,min=1"`
	Gpus    int      `json:"gpus" validate:"required,min=0,max=1"`
	GpuType *GPUType `json:"gpu-type" validate:"omitempty,oneof='5090'"`
	Cpus    *int     `json:"cpus" validate:"omitempty,min=1,max=16"`
	Ram     *int     `json:"ram" validate:"omitempty,min=1,max=64"`
	Disk    *int     `json:"disk" validate:"omitempty,min=64,max=1000"`
	UserId  string   `json:"userId" validate:"required"`
}

type VMCreationResponse struct {
	Status VMCreationStatus `json:"status"`
	VMId   string           `json:"vmId,omitempty"`
	Msg    string           `json:"msg"`
}

type GPUType string

const (
	GPU_5090 GPUType = "5090"
)

type VMState struct {
	Id     string `json:"id"`
	UserId string `json:"userId"`

	CreationTime time.Time `json:"creationTime"`

	Cpus    int     `json:"cpus"`
	Ram     int     `json:"ram"`
	Disk    int     `json:"disk"`
	Gpus    int     `json:"gpus"`
	GPUType GPUType `json:"gpu-type"`

	Status VMStatus `json:"status"`
}

type VMManager struct {
	mu    sync.Mutex
	vmMap map[string]VMState
}

func NewVMManager() *VMManager {
	return &VMManager{
		mu:    sync.Mutex{},
		vmMap: make(map[string]VMState),
	}
}

type App struct {
	VMManager VMManager
	Router    *chi.Mux
}

func NewApp() *App {
	return &App{
		VMManager: *NewVMManager(),
		Router:    chi.NewRouter(),
	}
}

func (app *App) SetupRoutes(rootHandler, createVMHandler http.HandlerFunc) {
	app.Router.Get("/", rootHandler)
	app.Router.Post("/vms", createVMHandler)
}
