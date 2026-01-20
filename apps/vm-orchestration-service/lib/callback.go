package lib

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type CallbackClient struct {
	siteBaseUrl  string
	sharedSecret string
	httpClient   *http.Client
}

const MAX_ATTEMPTS int = 3
const BACKOFF_BASE time.Duration = 1 * time.Second

func NewCallbackClient(siteBaseUrl string, sharedSecret string) *CallbackClient {
	return &CallbackClient{
		siteBaseUrl:  siteBaseUrl,
		sharedSecret: sharedSecret,
		httpClient:   &http.Client{},
	}
}

func (c *CallbackClient) NotifyVMStatusUpdate(vmId string, status string, nodeId string) error {
	url := fmt.Sprintf("%s/api/vms/%s/update-status", c.siteBaseUrl, vmId)
	var body string
	if nodeId != "" {
		body = fmt.Sprintf(`{"status":"%s","nodeId":"%s"}`, status, nodeId)
	} else {
		body = fmt.Sprintf(`{"status":"%s"}`, status)
	}
	log.Printf("Notifying site about VM %s status update: %s (node: %s)", vmId, status, nodeId)

	for attempt := 0; attempt < MAX_ATTEMPTS; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(attempt) * BACKOFF_BASE
			log.Printf("Retrying callback after %v for VM %s", backoff, vmId)
			time.Sleep(backoff)
		}

		err := c.makeRequest("POST", url, body)
		if err == nil {
			log.Printf("Successfully notified site about VM status update for VM %s: %s", vmId, status)
			return nil
		}

		log.Printf("Attempt %d to notify site about VM status update for VM %s failed: %v", attempt+1, vmId, err)
	}

	return fmt.Errorf("failed to notify site about VM status update for VM %s after %d attempts", vmId, 3)
}

func (c *CallbackClient) NotifyJobStatusUpdate(jobId string, status string, exitCode *int, errorMsg string) error {
	url := fmt.Sprintf("%s/api/jobs/%s/update-status", c.siteBaseUrl, jobId)

	body := fmt.Sprintf(`{"status":"%s"`, status)
	if exitCode != nil {
		body += fmt.Sprintf(`,"exitCode":%d`, *exitCode)
	}
	if errorMsg != "" {
		body += fmt.Sprintf(`,"errorMessage":"%s"`, errorMsg)
	}
	body += "}"

	log.Printf("Notifying site about Job %s status update: %s", jobId, status)

	for attempt := 0; attempt < MAX_ATTEMPTS; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(attempt) * BACKOFF_BASE
			log.Printf("Retrying callback after %v for Job %s", backoff, jobId)
			time.Sleep(backoff)
		}

		err := c.makeRequest("POST", url, body)
		if err == nil {
			log.Printf("Successfully notified site about Job status update for Job %s: %s", jobId, status)
			return nil
		}

		log.Printf("Attempt %d to notify site about Job status update for Job %s failed: %v", attempt+1, jobId, err)
	}

	return fmt.Errorf("failed to notify site about Job status update for Job %s after %d attempts", jobId, MAX_ATTEMPTS)
}

func (c *CallbackClient) UploadJobLogs(jobId string, logs string) error {
	url := fmt.Sprintf("%s/api/jobs/%s/logs/upload", c.siteBaseUrl, jobId)

	log.Printf("Uploading logs for Job %s (%d bytes)", jobId, len(logs))

	for attempt := 0; attempt < MAX_ATTEMPTS; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(attempt) * BACKOFF_BASE
			log.Printf("Retrying log upload after %v for Job %s", backoff, jobId)
			time.Sleep(backoff)
		}

		err := c.makeRequestWithContentType("POST", url, logs, "text/plain")
		if err == nil {
			log.Printf("Successfully uploaded logs for Job %s", jobId)
			return nil
		}

		log.Printf("Attempt %d to upload logs for Job %s failed: %v", attempt+1, jobId, err)
	}

	return fmt.Errorf("failed to upload logs for Job %s after %d attempts", jobId, MAX_ATTEMPTS)
}

func (c *CallbackClient) makeRequest(method string, url string, body string) error {
	return c.makeRequestWithContentType(method, url, body, "application/json")
}

func (c *CallbackClient) makeRequestWithContentType(method string, url string, body string, contentType string) error {
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)

	req, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", contentType)
	req.Header.Set("X-Timestamp", timestamp)

	signature := c.signRequest(timestamp, body)
	req.Header.Set("X-Signature", signature)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to make request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to make request: %s", resp.Status)
	}

	return nil
}

func (c *CallbackClient) signRequest(timestamp string, body string) string {
	payload := fmt.Sprintf("%s:%s", timestamp, body)
	h := hmac.New(sha256.New, []byte(c.sharedSecret))
	h.Write([]byte(payload))
	return hex.EncodeToString(h.Sum(nil))
}
