package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

type GpuProcess struct {
	Pid     int
	Cmdline string
	IsK8s   bool
}

type Guardian struct {
	nodeName     string
	scanInterval time.Duration
	gpuDevices   []string

	mu          sync.Mutex
	labeledBusy bool
}

func main() {
	var nodeName string
	var scanInterval time.Duration
	flag.StringVar(&nodeName, "node-name", "", "Kubernetes node name (default: hostname)")
	flag.DurationVar(&scanInterval, "scan-interval", 10*time.Second, "Periodic scan interval")
	flag.Parse()

	if nodeName == "" {
		h, err := os.Hostname()
		if err != nil {
			log.Fatalf("Failed to get hostname: %v", err)
		}
		nodeName = h
	}

	if os.Getuid() != 0 {
		log.Fatal("gpu-guardian must run as root")
	}

	gpuDevices := discoverGpuDevices()
	if len(gpuDevices) == 0 {
		log.Fatal("No NVIDIA GPU devices found in /dev/")
	}
	log.Printf("Monitoring GPU devices: %v", gpuDevices)

	g := &Guardian{
		nodeName:     nodeName,
		scanInterval: scanInterval,
		gpuDevices:   gpuDevices,
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	scanCh := make(chan struct{}, 1)

	// Trigger initial scan
	triggerScan(scanCh)

	// Platform-specific event watcher (fanotify on Linux, no-op elsewhere)
	stopFanotify := g.startFanotify(scanCh)

	// Periodic backup scan
	ticker := time.NewTicker(g.scanInterval)
	defer ticker.Stop()

	go func() {
		for range ticker.C {
			triggerScan(scanCh)
		}
	}()

	// Main scan loop
	go func() {
		for range scanCh {
			g.doScan()
		}
	}()

	<-sigCh
	log.Println("Shutdown signal received")
	if stopFanotify != nil {
		stopFanotify()
	}
	g.cleanup()
}

func discoverGpuDevices() []string {
	matches, _ := filepath.Glob("/dev/nvidia[0-9]*")
	var devices []string
	for _, m := range matches {
		base := filepath.Base(m)
		trimmed := strings.TrimPrefix(base, "nvidia")
		if _, err := strconv.Atoi(trimmed); err == nil {
			devices = append(devices, m)
		}
	}
	return devices
}

func triggerScan(ch chan<- struct{}) {
	select {
	case ch <- struct{}{}:
	default:
	}
}

func (g *Guardian) doScan() {
	processes := scanGpuProcesses(g.gpuDevices)

	hasHostUser := false
	for _, p := range processes {
		if !p.IsK8s {
			hasHostUser = true
			break
		}
	}

	g.mu.Lock()
	changed := hasHostUser != g.labeledBusy
	g.mu.Unlock()

	if changed {
		if hasHostUser {
			log.Printf("Host GPU usage detected:")
			for _, p := range processes {
				if !p.IsK8s {
					log.Printf("  PID %d: %s", p.Pid, p.Cmdline)
				}
			}
		} else {
			log.Println("No host GPU usage detected — GPU is free")
		}
		g.updateLabel(hasHostUser)
	}
}

func scanGpuProcesses(gpuDevices []string) []GpuProcess {
	gpuDeviceSet := make(map[string]bool, len(gpuDevices))
	for _, d := range gpuDevices {
		gpuDeviceSet[d] = true
	}

	entries, err := os.ReadDir("/proc")
	if err != nil {
		log.Printf("Failed to read /proc: %v", err)
		return nil
	}

	seen := make(map[int]bool)
	var results []GpuProcess

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(entry.Name())
		if err != nil {
			continue
		}

		fdDir := fmt.Sprintf("/proc/%d/fd", pid)
		fds, err := os.ReadDir(fdDir)
		if err != nil {
			continue
		}

		for _, fd := range fds {
			target, err := os.Readlink(filepath.Join(fdDir, fd.Name()))
			if err != nil {
				continue
			}
			if gpuDeviceSet[target] && !seen[pid] {
				seen[pid] = true
				results = append(results, GpuProcess{
					Pid:     pid,
					Cmdline: getCmdline(pid),
					IsK8s:   isK8sProcess(pid),
				})
			}
		}
	}

	return results
}

func getCmdline(pid int) string {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
	if err != nil {
		return "<unknown>"
	}
	return strings.ReplaceAll(strings.TrimRight(string(data), "\x00"), "\x00", " ")
}

func isK8sProcess(pid int) bool {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/cgroup", pid))
	if err != nil {
		return false
	}
	return strings.Contains(string(data), "kubepods")
}

func (g *Guardian) updateLabel(busy bool) {
	var args []string
	if busy {
		args = []string{"label", "node", g.nodeName, "uvacompute.com/gpu-busy=true", "--overwrite"}
	} else {
		args = []string{"label", "node", g.nodeName, "uvacompute.com/gpu-busy-", "--overwrite"}
	}

	if err := runKubectl(args); err != nil {
		log.Printf("Failed to update label: %v", err)
		return
	}

	g.mu.Lock()
	g.labeledBusy = busy
	g.mu.Unlock()

	if busy {
		log.Println("Set uvacompute.com/gpu-busy=true")
	} else {
		log.Println("Removed uvacompute.com/gpu-busy label")
	}
}

func runKubectl(args []string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "kubectl", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("kubectl %v: %s: %w", args, strings.TrimSpace(string(output)), err)
	}
	return nil
}

func (g *Guardian) cleanup() {
	g.updateLabel(false)
	log.Println("Cleanup complete, exiting")
}
