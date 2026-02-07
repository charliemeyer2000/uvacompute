package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

const testSecret = "test-shared-secret-1234"

// signTestRequest creates valid auth headers for testing
func signTestRequest(t *testing.T, method, path, body, secret string) (timestamp, signature string) {
	t.Helper()
	ts := strconv.FormatInt(time.Now().UnixMilli(), 10)
	payload := fmt.Sprintf("%s:%s:%s:%s", method, path, ts, body)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	return ts, hex.EncodeToString(mac.Sum(nil))
}

func TestVerifyRequest_Valid(t *testing.T) {
	t.Setenv("ORCHESTRATION_SHARED_SECRET", testSecret)

	body := `{"vmId":"test-123"}`
	req := httptest.NewRequest("POST", "/vms", bytes.NewBufferString(body))
	ts, sig := signTestRequest(t, "POST", "/vms", body, testSecret)
	req.Header.Set("X-Timestamp", ts)
	req.Header.Set("X-Signature", sig)

	if err := VerifyRequest(req, []byte(body)); err != nil {
		t.Fatalf("VerifyRequest() error = %v, want nil", err)
	}
}

func TestVerifyRequest_EmptyBody(t *testing.T) {
	t.Setenv("ORCHESTRATION_SHARED_SECRET", testSecret)

	req := httptest.NewRequest("GET", "/vms/list", nil)
	ts, sig := signTestRequest(t, "GET", "/vms/list", "", testSecret)
	req.Header.Set("X-Timestamp", ts)
	req.Header.Set("X-Signature", sig)

	if err := VerifyRequest(req, []byte("")); err != nil {
		t.Fatalf("VerifyRequest() error = %v, want nil", err)
	}
}

func TestVerifyRequest_MissingHeaders(t *testing.T) {
	t.Setenv("ORCHESTRATION_SHARED_SECRET", testSecret)

	tests := []struct {
		name      string
		timestamp string
		signature string
	}{
		{"missing both", "", ""},
		{"missing timestamp", "", "some-sig"},
		{"missing signature", strconv.FormatInt(time.Now().UnixMilli(), 10), ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/vms", nil)
			if tt.timestamp != "" {
				req.Header.Set("X-Timestamp", tt.timestamp)
			}
			if tt.signature != "" {
				req.Header.Set("X-Signature", tt.signature)
			}

			err := VerifyRequest(req, []byte(""))
			if err == nil {
				t.Error("VerifyRequest() expected error for missing headers")
			}
		})
	}
}

func TestVerifyRequest_NoSecret(t *testing.T) {
	t.Setenv("ORCHESTRATION_SHARED_SECRET", "")

	req := httptest.NewRequest("POST", "/vms", nil)
	req.Header.Set("X-Timestamp", "123")
	req.Header.Set("X-Signature", "abc")

	err := VerifyRequest(req, []byte(""))
	if err == nil {
		t.Error("VerifyRequest() expected error when secret not configured")
	}
}

func TestVerifyRequest_MalformedTimestamp(t *testing.T) {
	t.Setenv("ORCHESTRATION_SHARED_SECRET", testSecret)

	req := httptest.NewRequest("POST", "/vms", nil)
	req.Header.Set("X-Timestamp", "not-a-number")
	req.Header.Set("X-Signature", "some-sig")

	err := VerifyRequest(req, []byte(""))
	if err == nil {
		t.Error("VerifyRequest() expected error for malformed timestamp")
	}
}

func TestVerifyRequest_ExpiredTimestamp(t *testing.T) {
	t.Setenv("ORCHESTRATION_SHARED_SECRET", testSecret)

	// 10 minutes ago
	oldTs := strconv.FormatInt(time.Now().Add(-10*time.Minute).UnixMilli(), 10)
	body := ""
	payload := fmt.Sprintf("POST:/vms:%s:%s", oldTs, body)
	mac := hmac.New(sha256.New, []byte(testSecret))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))

	req := httptest.NewRequest("POST", "/vms", nil)
	req.Header.Set("X-Timestamp", oldTs)
	req.Header.Set("X-Signature", sig)

	err := VerifyRequest(req, []byte(body))
	if err == nil {
		t.Error("VerifyRequest() expected error for expired timestamp")
	}
}

func TestVerifyRequest_FutureTimestamp(t *testing.T) {
	t.Setenv("ORCHESTRATION_SHARED_SECRET", testSecret)

	// 10 minutes in the future
	futureTs := strconv.FormatInt(time.Now().Add(10*time.Minute).UnixMilli(), 10)
	body := ""
	payload := fmt.Sprintf("POST:/vms:%s:%s", futureTs, body)
	mac := hmac.New(sha256.New, []byte(testSecret))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))

	req := httptest.NewRequest("POST", "/vms", nil)
	req.Header.Set("X-Timestamp", futureTs)
	req.Header.Set("X-Signature", sig)

	err := VerifyRequest(req, []byte(body))
	if err == nil {
		t.Error("VerifyRequest() expected error for future timestamp")
	}
}

func TestVerifyRequest_WrongSignature(t *testing.T) {
	t.Setenv("ORCHESTRATION_SHARED_SECRET", testSecret)

	body := `{"vmId":"test"}`
	req := httptest.NewRequest("POST", "/vms", bytes.NewBufferString(body))
	ts := strconv.FormatInt(time.Now().UnixMilli(), 10)
	req.Header.Set("X-Timestamp", ts)
	req.Header.Set("X-Signature", "deadbeef")

	err := VerifyRequest(req, []byte(body))
	if err == nil {
		t.Error("VerifyRequest() expected error for wrong signature")
	}
}

func TestVerifyRequest_TamperedBody(t *testing.T) {
	t.Setenv("ORCHESTRATION_SHARED_SECRET", testSecret)

	originalBody := `{"vmId":"test-123"}`
	req := httptest.NewRequest("POST", "/vms", nil)
	ts, sig := signTestRequest(t, "POST", "/vms", originalBody, testSecret)
	req.Header.Set("X-Timestamp", ts)
	req.Header.Set("X-Signature", sig)

	// Verify with tampered body
	tamperedBody := `{"vmId":"hacked"}`
	err := VerifyRequest(req, []byte(tamperedBody))
	if err == nil {
		t.Error("VerifyRequest() expected error for tampered body")
	}
}

func TestAuthMiddleware_NoSecret_PassesThrough(t *testing.T) {
	t.Setenv("ORCHESTRATION_SHARED_SECRET", "")

	called := false
	handler := AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("POST", "/vms", bytes.NewBufferString("{}"))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if !called {
		t.Error("AuthMiddleware should pass through when secret is empty")
	}
	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rr.Code, http.StatusOK)
	}
}

func TestAuthMiddleware_ValidRequest(t *testing.T) {
	t.Setenv("ORCHESTRATION_SHARED_SECRET", testSecret)

	called := false
	var receivedBody string
	handler := AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		called = true
		body, _ := io.ReadAll(r.Body)
		receivedBody = string(body)
		w.WriteHeader(http.StatusOK)
	})

	body := `{"vmId":"test"}`
	ts, sig := signTestRequest(t, "POST", "/vms", body, testSecret)

	req := httptest.NewRequest("POST", "/vms", bytes.NewBufferString(body))
	req.Header.Set("X-Timestamp", ts)
	req.Header.Set("X-Signature", sig)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if !called {
		t.Error("AuthMiddleware should call next handler for valid request")
	}
	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	// Body should be available to the next handler
	if receivedBody != body {
		t.Errorf("next handler received body %q, want %q", receivedBody, body)
	}
}

func TestAuthMiddleware_InvalidRequest(t *testing.T) {
	t.Setenv("ORCHESTRATION_SHARED_SECRET", testSecret)

	called := false
	handler := AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		called = true
	})

	req := httptest.NewRequest("POST", "/vms", bytes.NewBufferString("{}"))
	// No auth headers
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if called {
		t.Error("AuthMiddleware should not call next handler for invalid request")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAbs(t *testing.T) {
	tests := []struct {
		input    int64
		expected int64
	}{
		{0, 0},
		{5, 5},
		{-5, 5},
		{-1, 1},
	}
	for _, tt := range tests {
		if got := abs(tt.input); got != tt.expected {
			t.Errorf("abs(%d) = %d, want %d", tt.input, got, tt.expected)
		}
	}
}
