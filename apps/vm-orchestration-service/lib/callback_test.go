package lib

import (
	"encoding/json"
	"testing"
)

func TestBuildVMStatusPayload_Basic(t *testing.T) {
	t.Parallel()
	client := NewCallbackClient("https://example.com", "test-secret")
	body := client.buildVMStatusPayload("running", "")

	if !json.Valid([]byte(body)) {
		t.Fatalf("buildVMStatusPayload() produced invalid JSON: %s", body)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		t.Fatalf("failed to parse JSON: %v", err)
	}

	if parsed["status"] != "running" {
		t.Errorf("status = %v, want %q", parsed["status"], "running")
	}

	if _, exists := parsed["nodeId"]; exists {
		t.Error("nodeId should not be present when empty")
	}
}

func TestBuildVMStatusPayload_WithNodeId(t *testing.T) {
	t.Parallel()
	client := NewCallbackClient("https://example.com", "test-secret")
	body := client.buildVMStatusPayload("ready", "node-1")

	if !json.Valid([]byte(body)) {
		t.Fatalf("produced invalid JSON: %s", body)
	}

	var parsed map[string]interface{}
	json.Unmarshal([]byte(body), &parsed)

	if parsed["nodeId"] != "node-1" {
		t.Errorf("nodeId = %v, want %q", parsed["nodeId"], "node-1")
	}
}

func TestBuildVMStatusPayload_SpecialCharsInStatus(t *testing.T) {
	t.Parallel()
	client := NewCallbackClient("https://example.com", "test-secret")

	specialStrings := []string{
		`status with "quotes"`,
		`status with \backslash`,
		"status with\nnewline",
		`status with <html> tags`,
		`{"injection":"attempt"}`,
	}

	for _, s := range specialStrings {
		body := client.buildVMStatusPayload(s, "")
		if !json.Valid([]byte(body)) {
			t.Errorf("buildVMStatusPayload(%q) produced invalid JSON: %s", s, body)
		}
	}
}

func TestBuildJobStatusPayload_Basic(t *testing.T) {
	t.Parallel()
	client := NewCallbackClient("https://example.com", "test-secret")
	body := client.buildJobStatusPayload("running", nil, "", "")

	if !json.Valid([]byte(body)) {
		t.Fatalf("produced invalid JSON: %s", body)
	}

	var parsed map[string]interface{}
	json.Unmarshal([]byte(body), &parsed)

	if parsed["status"] != "running" {
		t.Errorf("status = %v, want %q", parsed["status"], "running")
	}
}

func TestBuildJobStatusPayload_WithExitCode(t *testing.T) {
	t.Parallel()
	client := NewCallbackClient("https://example.com", "test-secret")
	exitCode := 42
	body := client.buildJobStatusPayload("failed", &exitCode, "OOMKilled", "node-1")

	if !json.Valid([]byte(body)) {
		t.Fatalf("produced invalid JSON: %s", body)
	}

	var parsed map[string]interface{}
	json.Unmarshal([]byte(body), &parsed)

	if parsed["status"] != "failed" {
		t.Errorf("status = %v, want %q", parsed["status"], "failed")
	}
	if int(parsed["exitCode"].(float64)) != 42 {
		t.Errorf("exitCode = %v, want 42", parsed["exitCode"])
	}
	if parsed["errorMessage"] != "OOMKilled" {
		t.Errorf("errorMessage = %v, want %q", parsed["errorMessage"], "OOMKilled")
	}
	if parsed["nodeId"] != "node-1" {
		t.Errorf("nodeId = %v, want %q", parsed["nodeId"], "node-1")
	}
}

func TestBuildJobStatusPayload_SpecialCharsInErrorMsg(t *testing.T) {
	t.Parallel()
	client := NewCallbackClient("https://example.com", "test-secret")

	specialErrors := []string{
		`error with "quotes" in message`,
		`error with \backslash`,
		"error with\nnewline\ttab",
		`{"injection":"attempt"}`,
	}

	for _, s := range specialErrors {
		body := client.buildJobStatusPayload("failed", nil, s, "")
		if !json.Valid([]byte(body)) {
			t.Errorf("buildJobStatusPayload with errorMsg=%q produced invalid JSON: %s", s, body)
		}
	}
}

func TestSignRequest_Deterministic(t *testing.T) {
	t.Parallel()
	client := NewCallbackClient("https://example.com", "test-secret")

	sig1 := client.signRequest("12345", `{"test":true}`)
	sig2 := client.signRequest("12345", `{"test":true}`)

	if sig1 != sig2 {
		t.Error("signRequest should produce deterministic signatures")
	}
}

func TestSignRequest_DifferentBodies(t *testing.T) {
	t.Parallel()
	client := NewCallbackClient("https://example.com", "test-secret")

	sig1 := client.signRequest("12345", "body1")
	sig2 := client.signRequest("12345", "body2")

	if sig1 == sig2 {
		t.Error("different bodies should produce different signatures")
	}
}

func TestSignRequest_DifferentTimestamps(t *testing.T) {
	t.Parallel()
	client := NewCallbackClient("https://example.com", "test-secret")

	sig1 := client.signRequest("12345", "body")
	sig2 := client.signRequest("12346", "body")

	if sig1 == sig2 {
		t.Error("different timestamps should produce different signatures")
	}
}

func TestSignRequest_DifferentSecrets(t *testing.T) {
	t.Parallel()
	client1 := NewCallbackClient("https://example.com", "secret-1")
	client2 := NewCallbackClient("https://example.com", "secret-2")

	sig1 := client1.signRequest("12345", "body")
	sig2 := client2.signRequest("12345", "body")

	if sig1 == sig2 {
		t.Error("different secrets should produce different signatures")
	}
}

func TestSignRequest_EmptyBody(t *testing.T) {
	t.Parallel()
	client := NewCallbackClient("https://example.com", "test-secret")

	sig := client.signRequest("12345", "")
	if sig == "" {
		t.Error("signRequest should produce non-empty signature for empty body")
	}

	if len(sig) != 64 { // SHA-256 hex = 64 chars
		t.Errorf("signature length = %d, want 64 (SHA-256 hex)", len(sig))
	}
}
