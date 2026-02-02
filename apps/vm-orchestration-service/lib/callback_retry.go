package lib

import (
	"context"
	"log"
	"sync"
	"time"
)

const (
	retryQueueSize    = 100
	retryInterval     = 60 * time.Second
	maxRetryAttempts  = 10
)

type RetryItemType string

const (
	RetryItemVM  RetryItemType = "vm"
	RetryItemJob RetryItemType = "job"
)

type RetryItem struct {
	Type     RetryItemType
	Id       string
	Status   string
	NodeId   string
	ExitCode *int
	ErrorMsg string
	Attempts int
}

type RetryQueue struct {
	mu    sync.Mutex
	items []RetryItem
}

func NewRetryQueue() *RetryQueue {
	return &RetryQueue{}
}

func (q *RetryQueue) Enqueue(item RetryItem) {
	q.mu.Lock()
	defer q.mu.Unlock()

	if len(q.items) >= retryQueueSize {
		log.Printf("CRITICAL: Callback retry queue full (%d items), dropping oldest", retryQueueSize)
		q.items = q.items[1:]
	}
	q.items = append(q.items, item)
	log.Printf("Callback retry queue: enqueued %s %s status=%s (attempt %d)", item.Type, item.Id, item.Status, item.Attempts)
}

func (q *RetryQueue) drain() []RetryItem {
	q.mu.Lock()
	defer q.mu.Unlock()

	items := q.items
	q.items = nil
	return items
}

func (c *CallbackClient) StartRetryQueue(ctx context.Context) {
	if c.retryQueue == nil {
		c.retryQueue = NewRetryQueue()
	}

	go func() {
		ticker := time.NewTicker(retryInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				c.processRetryQueue()
			}
		}
	}()

	log.Printf("Callback retry queue started (interval: %v, max attempts: %d)", retryInterval, maxRetryAttempts)
}

func (c *CallbackClient) processRetryQueue() {
	items := c.retryQueue.drain()
	if len(items) == 0 {
		return
	}

	log.Printf("Callback retry queue: processing %d items", len(items))

	for _, item := range items {
		var err error
		switch item.Type {
		case RetryItemVM:
			err = c.NotifyVMStatusUpdate(item.Id, item.Status, item.NodeId)
		case RetryItemJob:
			err = c.NotifyJobStatusUpdate(item.Id, item.Status, item.ExitCode, item.ErrorMsg, item.NodeId)
		}

		if err != nil {
			item.Attempts++
			if item.Attempts >= maxRetryAttempts {
				log.Printf("CRITICAL: Callback for %s %s status=%s failed after %d attempts, giving up", item.Type, item.Id, item.Status, item.Attempts)
			} else {
				c.retryQueue.Enqueue(item)
			}
		} else {
			log.Printf("Callback retry queue: successfully retried %s %s status=%s", item.Type, item.Id, item.Status)
		}
	}
}

func (c *CallbackClient) EnqueueVMRetry(vmId, status, nodeId string) {
	if c.retryQueue == nil {
		return
	}
	c.retryQueue.Enqueue(RetryItem{
		Type:     RetryItemVM,
		Id:       vmId,
		Status:   status,
		NodeId:   nodeId,
		Attempts: 1,
	})
}

func (c *CallbackClient) EnqueueJobRetry(jobId, status string, exitCode *int, errorMsg, nodeId string) {
	if c.retryQueue == nil {
		return
	}
	c.retryQueue.Enqueue(RetryItem{
		Type:     RetryItemJob,
		Id:       jobId,
		Status:   status,
		ExitCode: exitCode,
		ErrorMsg: errorMsg,
		NodeId:   nodeId,
		Attempts: 1,
	})
}
