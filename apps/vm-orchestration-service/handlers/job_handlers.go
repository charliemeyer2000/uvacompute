package handlers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"vm-orchestration-service/structs"

	"github.com/go-playground/validator/v10"
)

func CreateJobHandler(app *structs.App, w http.ResponseWriter, r *http.Request) {
	if app.JobManager == nil {
		sendJobError(w, structs.JOB_CREATION_FAILED_INTERNAL, "", "Job manager not initialized", http.StatusInternalServerError)
		return
	}

	var req structs.JobCreationRequest

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendJobError(w, structs.JOB_CREATION_FAILED_VALIDATION, "", err.Error(), http.StatusBadRequest)
		return
	}

	validate := validator.New()
	if err := validate.Struct(&req); err != nil {
		sendJobError(w, structs.JOB_CREATION_FAILED_VALIDATION, "", err.Error(), http.StatusBadRequest)
		return
	}

	jobId, err := app.JobManager.CreateJob(req)
	if err != nil {
		status := structs.JOB_CREATION_FAILED_INTERNAL
		statusCode := http.StatusInternalServerError

		if strings.Contains(err.Error(), "insufficient") {
			status = structs.JOB_CREATION_FAILED_RESOURCES_UNAVAILABLE
			statusCode = http.StatusConflict
		}

		sendJobError(w, status, "", err.Error(), statusCode)
		return
	}

	resp := structs.JobCreationResponse{
		Status: structs.JOB_CREATION_SUCCESS,
		JobId:  jobId,
		Msg:    "Job created successfully",
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func GetJobStatusHandler(app *structs.App, w http.ResponseWriter, r *http.Request, jobId string) {
	if app.JobManager == nil {
		resp := structs.JobStatusResponse{
			Status: structs.JOB_STATUS_FAILED,
			Msg:    "Job manager not initialized",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(resp)
		return
	}

	jobState, exists := app.JobManager.GetJob(jobId)
	if !exists {
		resp := structs.JobStatusResponse{
			Status: structs.JOB_STATUS_FAILED,
			Msg:    "Job not found",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(resp)
		return
	}

	msg := "Job status retrieved successfully"
	if jobState.Status == structs.JOB_STATUS_FAILED && jobState.ErrorMessage != "" {
		msg = jobState.ErrorMessage
	}

	resp := structs.JobStatusResponse{
		Status:       jobState.Status,
		Msg:          msg,
		ExitCode:     jobState.ExitCode,
		ErrorMessage: jobState.ErrorMessage,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func DeleteJobHandler(app *structs.App, w http.ResponseWriter, r *http.Request, jobId string) {
	if app.JobManager == nil {
		resp := structs.JobCancellationResponse{
			Status: structs.JOB_CANCELLATION_FAILED_INTERNAL,
			JobId:  jobId,
			Msg:    "Job manager not initialized",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(resp)
		return
	}

	err := app.JobManager.CancelJob(jobId)
	if err != nil {
		status := structs.JOB_CANCELLATION_FAILED_INTERNAL
		statusCode := http.StatusInternalServerError

		if strings.Contains(err.Error(), "not found") {
			status = structs.JOB_CANCELLATION_FAILED_NOT_FOUND
			statusCode = http.StatusNotFound
		} else if strings.Contains(err.Error(), "terminal state") {
			status = structs.JOB_CANCELLATION_FAILED_NOT_CANCELLABLE
			statusCode = http.StatusConflict
		}

		resp := structs.JobCancellationResponse{
			Status: status,
			JobId:  jobId,
			Msg:    err.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(resp)
		return
	}

	resp := structs.JobCancellationResponse{
		Status: structs.JOB_CANCELLATION_SUCCESS,
		JobId:  jobId,
		Msg:    "Job cancelled successfully",
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func GetJobLogsHandler(app *structs.App, w http.ResponseWriter, r *http.Request, jobId string) {
	if app.JobManager == nil {
		http.Error(w, "Job manager not initialized", http.StatusInternalServerError)
		return
	}

	logs, err := app.JobManager.GetJobLogs(jobId)
	if err != nil {
		statusCode := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			statusCode = http.StatusNotFound
		}
		http.Error(w, err.Error(), statusCode)
		return
	}
	defer logs.Close()

	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	io.Copy(w, logs)
}

func sendJobError(w http.ResponseWriter, status structs.JobCreationStatus, jobId string, msg string, statusCode int) {
	resp := structs.JobCreationResponse{
		Status: status,
		JobId:  jobId,
		Msg:    msg,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(resp)
}

func StreamJobLogsHandler(app *structs.App, w http.ResponseWriter, r *http.Request, jobId string) {
	if app.JobManager == nil {
		http.Error(w, "Job manager not initialized", http.StatusInternalServerError)
		return
	}

	stream, err := app.JobManager.StreamJobLogs(jobId)
	if err != nil {
		statusCode := http.StatusInternalServerError
		if strings.Contains(err.Error(), "not found") {
			statusCode = http.StatusNotFound
		} else if strings.Contains(err.Error(), "terminal state") {
			statusCode = http.StatusConflict
		}
		http.Error(w, err.Error(), statusCode)
		return
	}
	defer stream.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	scanner := bufio.NewScanner(stream)
	for scanner.Scan() {
		line := scanner.Text()
		fmt.Fprintf(w, "data: %s\n\n", line)
		flusher.Flush()

		if r.Context().Err() != nil {
			return
		}
	}

	if err := scanner.Err(); err != nil && err != io.EOF {
		fmt.Fprintf(w, "event: error\ndata: %s\n\n", err.Error())
		flusher.Flush()
	}

	fmt.Fprintf(w, "event: done\ndata: stream ended\n\n")
	flusher.Flush()
}
