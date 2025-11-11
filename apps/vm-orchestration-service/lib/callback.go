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

func (c *CallbackClient) NotifyVMStatusUpdate(vmId string, status string) error {
	url := fmt.Sprintf("%s/api/vms/%s/update-status", c.siteBaseUrl, vmId)
	body := fmt.Sprintf(`{"status":"%s"}`, status)
	log.Printf("Notifying site about VM %s status update: %s", vmId, status)

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

func (c *CallbackClient) makeRequest(method string, url string, body string) error {
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)

	req, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
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
