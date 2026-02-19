package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRootHandler(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	rr := httptest.NewRecorder()
	RootHandler(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var body map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["status"] != "alive" {
		t.Errorf("status = %q, want %q", body["status"], "alive")
	}
}

func TestHealthHandler(t *testing.T) {
	req := httptest.NewRequest("GET", "/health", nil)
	rr := httptest.NewRecorder()
	HealthHandler(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var body struct {
		Status   string `json:"status"`
		Services struct {
			Frps struct {
				Running bool `json:"running"`
			} `json:"frps"`
		} `json:"services"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if body.Status != "alive" {
		t.Errorf("status = %q, want %q", body.Status, "alive")
	}
	// frps won't be running in test environment, so Running should be false
	if body.Services.Frps.Running {
		t.Error("expected frps.running = false in test environment")
	}
}
