package statesync

import (
	"context"
	"log"
	"sync"
	"sync/atomic"
	"time"
)

// ResourceType distinguishes VMs from Jobs in the sync engine.
type ResourceType int

const (
	ResourceVM  ResourceType = iota
	ResourceJob
)

func (r ResourceType) String() string {
	if r == ResourceVM {
		return "vm"
	}
	return "job"
}

// SyncEntry holds the latest desired state for a single resource.
// Only the most recent update matters — earlier ones are coalesced away.
type SyncEntry struct {
	ResourceType ResourceType
	ResourceID   string
	Status       string
	NodeID       string
	ExitCode     *int
	ErrorMsg     string
	Generation   uint64
	EnqueuedAt   time.Time
}

// Notifier abstracts the actual HTTP callback delivery so the engine
// is testable without network calls.
type Notifier interface {
	NotifyVM(ctx context.Context, vmID, status, nodeID string) error
	NotifyJob(ctx context.Context, jobID, status string, exitCode *int, errorMsg, nodeID string) error
}

// StateSyncEngine coalesces status updates per resource and delivers them
// in generation order with at-most-one in-flight delivery per resource.
//
// Each call to Enqueue* bumps the resource's generation and overwrites
// its pending entry. A background loop drains the outbox, sending only
// the latest state per resource. Failed deliveries are re-enqueued with
// the same generation so newer updates still win.
type StateSyncEngine struct {
	mu       sync.Mutex
	outbox   map[string]*SyncEntry
	genMap   map[string]uint64
	inflight map[string]bool
	notifier Notifier

	genCounter atomic.Uint64

	batchInterval time.Duration
	maxRetries    int
	retryBackoff  time.Duration

	wakeup chan struct{}

	totalEnqueued  atomic.Uint64
	totalDelivered atomic.Uint64
	totalCoalesced atomic.Uint64
	totalFailed    atomic.Uint64
}

// Config configures a StateSyncEngine.
type Config struct {
	Notifier      Notifier
	BatchInterval time.Duration
	MaxRetries    int
	RetryBackoff  time.Duration
}

// New creates and returns a new engine. Call Start() to begin
// the background drain loop.
func New(cfg Config) *StateSyncEngine {
	batchInterval := cfg.BatchInterval
	if batchInterval == 0 {
		batchInterval = 500 * time.Millisecond
	}
	maxRetries := cfg.MaxRetries
	if maxRetries == 0 {
		maxRetries = 3
	}
	retryBackoff := cfg.RetryBackoff
	if retryBackoff == 0 {
		retryBackoff = 1 * time.Second
	}

	return &StateSyncEngine{
		outbox:        make(map[string]*SyncEntry),
		genMap:        make(map[string]uint64),
		inflight:      make(map[string]bool),
		notifier:      cfg.Notifier,
		batchInterval: batchInterval,
		maxRetries:    maxRetries,
		retryBackoff:  retryBackoff,
		wakeup:        make(chan struct{}, 1),
	}
}

func (e *StateSyncEngine) ResourceKey(rt ResourceType, id string) string {
	return rt.String() + ":" + id
}

func (e *StateSyncEngine) EnqueueVM(vmID, status, nodeID string) {
	key := e.ResourceKey(ResourceVM, vmID)
	gen := e.genCounter.Add(1)

	e.mu.Lock()
	if _, existed := e.outbox[key]; existed {
		e.totalCoalesced.Add(1)
	}
	e.outbox[key] = &SyncEntry{
		ResourceType: ResourceVM,
		ResourceID:   vmID,
		Status:       status,
		NodeID:       nodeID,
		Generation:   gen,
		EnqueuedAt:   time.Now(),
	}
	e.mu.Unlock()

	e.totalEnqueued.Add(1)
	e.poke()
}

func (e *StateSyncEngine) EnqueueJob(jobID, status string, exitCode *int, errorMsg, nodeID string) {
	key := e.ResourceKey(ResourceJob, jobID)
	gen := e.genCounter.Add(1)

	e.mu.Lock()
	if _, existed := e.outbox[key]; existed {
		e.totalCoalesced.Add(1)
	}
	e.outbox[key] = &SyncEntry{
		ResourceType: ResourceJob,
		ResourceID:   jobID,
		Status:       status,
		NodeID:       nodeID,
		ExitCode:     exitCode,
		ErrorMsg:     errorMsg,
		Generation:   gen,
		EnqueuedAt:   time.Now(),
	}
	e.mu.Unlock()

	e.totalEnqueued.Add(1)
	e.poke()
}

func (e *StateSyncEngine) AckedGeneration(rt ResourceType, id string) uint64 {
	key := e.ResourceKey(rt, id)
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.genMap[key]
}

func (e *StateSyncEngine) PendingCount() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return len(e.outbox)
}

func (e *StateSyncEngine) Stats() (enqueued, delivered, coalesced, failed uint64) {
	return e.totalEnqueued.Load(), e.totalDelivered.Load(),
		e.totalCoalesced.Load(), e.totalFailed.Load()
}

func (e *StateSyncEngine) BatchInterval() time.Duration { return e.batchInterval }

func (e *StateSyncEngine) MaxRetries() int { return e.maxRetries }

func (e *StateSyncEngine) RetryBackoff() time.Duration { return e.retryBackoff }

// Start launches the background drain loop. It blocks until ctx is cancelled.
func (e *StateSyncEngine) Start(ctx context.Context) {
	log.Printf("StateSyncEngine: started (batch=%v, retries=%d, backoff=%v)",
		e.batchInterval, e.maxRetries, e.retryBackoff)

	ticker := time.NewTicker(e.batchInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Printf("StateSyncEngine: stopped")
			return
		case <-ticker.C:
			e.drainOutbox(ctx)
		case <-e.wakeup:
			e.drainOutbox(ctx)
		}
	}
}

// DrainOnce runs a single drain pass synchronously (useful for testing).
func (e *StateSyncEngine) DrainOnce(ctx context.Context) {
	e.drainOutbox(ctx)
}

func (e *StateSyncEngine) poke() {
	select {
	case e.wakeup <- struct{}{}:
	default:
	}
}

func (e *StateSyncEngine) drainOutbox(ctx context.Context) {
	e.mu.Lock()
	snapshot := make(map[string]*SyncEntry, len(e.outbox))
	for k, v := range e.outbox {
		snapshot[k] = v
	}
	e.mu.Unlock()

	var wg sync.WaitGroup
	for key, entry := range snapshot {
		e.mu.Lock()
		if e.inflight[key] {
			e.mu.Unlock()
			continue
		}
		if ackedGen := e.genMap[key]; entry.Generation <= ackedGen {
			delete(e.outbox, key)
			e.mu.Unlock()
			continue
		}
		e.inflight[key] = true
		delete(e.outbox, key)
		e.mu.Unlock()

		wg.Add(1)
		go func(k string, ent *SyncEntry) {
			defer wg.Done()
			e.deliver(ctx, k, ent)
		}(key, entry)
	}

	wg.Wait()
}

func (e *StateSyncEngine) deliver(ctx context.Context, key string, entry *SyncEntry) {
	defer func() {
		e.mu.Lock()
		delete(e.inflight, key)
		e.mu.Unlock()
	}()

	var lastErr error
	for attempt := 0; attempt < e.maxRetries; attempt++ {
		if ctx.Err() != nil {
			return
		}

		if attempt > 0 {
			backoff := time.Duration(attempt) * e.retryBackoff
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return
			}
		}

		e.mu.Lock()
		if newer, exists := e.outbox[key]; exists && newer.Generation > entry.Generation {
			e.mu.Unlock()
			log.Printf("StateSyncEngine: %s %s gen=%d superseded by gen=%d, abandoning",
				entry.ResourceType, entry.ResourceID, entry.Generation, newer.Generation)
			return
		}
		e.mu.Unlock()

		var err error
		switch entry.ResourceType {
		case ResourceVM:
			err = e.notifier.NotifyVM(ctx, entry.ResourceID, entry.Status, entry.NodeID)
		case ResourceJob:
			err = e.notifier.NotifyJob(ctx, entry.ResourceID, entry.Status, entry.ExitCode, entry.ErrorMsg, entry.NodeID)
		}

		if err == nil {
			e.mu.Lock()
			if entry.Generation > e.genMap[key] {
				e.genMap[key] = entry.Generation
			}
			e.mu.Unlock()
			e.totalDelivered.Add(1)
			return
		}

		lastErr = err
		log.Printf("StateSyncEngine: delivery attempt %d/%d failed for %s %s: %v",
			attempt+1, e.maxRetries, entry.ResourceType, entry.ResourceID, err)
	}

	e.mu.Lock()
	if existing, exists := e.outbox[key]; !exists || existing.Generation < entry.Generation {
		e.outbox[key] = entry
	}
	e.mu.Unlock()
	e.totalFailed.Add(1)

	log.Printf("StateSyncEngine: all %d retries exhausted for %s %s gen=%d: %v",
		e.maxRetries, entry.ResourceType, entry.ResourceID, entry.Generation, lastErr)
}
