package lib

import (
	"log"
	"strings"
	"sync"
	"time"

	"vm-orchestration-service/structs"
)

// QueueProcessor handles dequeuing GitHub runner jobs that were saved to Convex
// as "queued" because the orchestration service didn't have enough resources at
// the time the webhook arrived. When resources free up (a job completes), the
// processor fetches queued jobs and creates them in FIFO order.
type QueueProcessor struct {
	jobManager     *structs.JobManager
	callbackClient *CallbackClient
	mu             sync.Mutex
	processing     bool
	triggerCh      chan struct{}
}

func NewQueueProcessor(jobManager *structs.JobManager, callbackClient *CallbackClient) *QueueProcessor {
	return &QueueProcessor{
		jobManager:     jobManager,
		callbackClient: callbackClient,
		triggerCh:      make(chan struct{}, 1),
	}
}

// Start begins the background goroutine that processes queue triggers.
// Multiple rapid calls to TriggerProcessing collapse into a single processing
// run after a 2-second debounce.
func (qp *QueueProcessor) Start() {
	go func() {
		for range qp.triggerCh {
			// Debounce: wait a short time for additional triggers to arrive
			time.Sleep(2 * time.Second)
			// Drain any extra triggers that arrived during the sleep
			for {
				select {
				case <-qp.triggerCh:
				default:
					goto process
				}
			}
		process:
			qp.processQueue()
		}
	}()
}

// TriggerProcessing signals the queue processor to check for queued jobs.
// Non-blocking: if a trigger is already pending, this is a no-op.
func (qp *QueueProcessor) TriggerProcessing() {
	select {
	case qp.triggerCh <- struct{}{}:
	default:
		// Trigger already pending
	}
}

func (qp *QueueProcessor) processQueue() {
	qp.mu.Lock()
	if qp.processing {
		qp.mu.Unlock()
		return
	}
	qp.processing = true
	qp.mu.Unlock()

	defer func() {
		qp.mu.Lock()
		qp.processing = false
		qp.mu.Unlock()
	}()

	if qp.callbackClient == nil {
		return
	}

	queuedJobs, err := qp.callbackClient.FetchQueuedJobs()
	if err != nil {
		log.Printf("QueueProcessor: failed to fetch queued jobs: %v", err)
		return
	}

	if len(queuedJobs) == 0 {
		return
	}

	log.Printf("QueueProcessor: processing %d queued job(s)", len(queuedJobs))

	for _, cjob := range queuedJobs {
		// If the job already exists in memory (webhook handler's optimistic path
		// succeeded), sync status back to Convex and skip.
		if qp.jobManager.HasJob(cjob.JobId) {
			jobState, _ := qp.jobManager.GetJob(cjob.JobId)
			log.Printf("QueueProcessor: job %s already exists (status: %s), syncing to Convex", cjob.JobId, jobState.Status)
			if err := qp.callbackClient.NotifyJobStatusUpdate(cjob.JobId, string(jobState.Status), jobState.ExitCode, jobState.ErrorMessage, jobState.NodeId); err != nil {
				log.Printf("QueueProcessor: failed to sync status for job %s: %v", cjob.JobId, err)
			}
			continue
		}

		req := structs.JobCreationRequest{
			JobId:  cjob.JobId,
			UserId: cjob.UserId,
			Image:  cjob.Image,
			Name:   cjob.Name,
			Cpus:   &cjob.Cpus,
			Ram:    &cjob.Ram,
			Gpus:   &cjob.Gpus,
			Disk:   &cjob.Disk,
		}
		if cjob.Command != nil {
			req.Command = cjob.Command
		}
		if cjob.Env != nil {
			req.Env = cjob.Env
		}

		_, err := qp.jobManager.CreateJob(req)
		if err != nil {
			if strings.Contains(err.Error(), "insufficient") {
				log.Printf("QueueProcessor: insufficient resources for job %s, will retry later", cjob.JobId)
				// Stop processing: FIFO ordering means we don't skip ahead
				break
			}
			log.Printf("QueueProcessor: failed to create job %s: %v", cjob.JobId, err)
			continue
		}

		log.Printf("QueueProcessor: successfully dequeued and created job %s", cjob.JobId)
	}
}
