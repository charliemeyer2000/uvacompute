package structs

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

type App struct {
	VMManager *VMManager
	Router    *chi.Mux
}

func NewApp() *App {
	return &App{
		VMManager: NewVMManager(),
		Router:    chi.NewRouter(),
	}
}

func (app *App) SetupRoutes(rootHandler http.HandlerFunc, createVMHandler func(*App, http.ResponseWriter, *http.Request)) {
	app.Router.Get("/", rootHandler)
	app.Router.Post("/vms", func(w http.ResponseWriter, r *http.Request) {
		createVMHandler(app, w, r)
	})
}
