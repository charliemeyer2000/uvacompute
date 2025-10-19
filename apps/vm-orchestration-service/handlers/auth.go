package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"
)

func VerifyRequest(r *http.Request, body []byte) error {
	secret := os.Getenv("ORCHESTRATION_SHARED_SECRET")
	if secret == "" {
		return errors.New("ORCHESTRATION_SHARED_SECRET not configured")
	}

	timestamp := r.Header.Get("X-Timestamp")
	signature := r.Header.Get("X-Signature")

	if timestamp == "" || signature == "" {
		return errors.New("missing authentication headers")
	}

	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return errors.New("invalid timestamp")
	}

	now := time.Now().UnixMilli()
	if abs(now-ts) > 5*60*1000 {
		return errors.New("request expired")
	}

	payload := fmt.Sprintf("%s:%s:%s:%s", r.Method, r.URL.Path, timestamp, string(body))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(signature), []byte(expectedSignature)) {
		return errors.New("invalid signature")
	}

	return nil
}

func abs(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}

func AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret := os.Getenv("ORCHESTRATION_SHARED_SECRET")
		if secret == "" {
			next(w, r)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Failed to read request body", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		if err := VerifyRequest(r, body); err != nil {
			http.Error(w, "Unauthorized: "+err.Error(), http.StatusUnauthorized)
			return
		}

		r.Body = io.NopCloser(bytes.NewBuffer(body))

		next(w, r)
	}
}
