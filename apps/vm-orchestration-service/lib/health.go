package lib

import (
	"context"
	"fmt"
	"log"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type NodeHealthStatus struct {
	NodeId        string `json:"nodeId"`
	K8sNodeName   string `json:"k8sNodeName"`
	Ready         bool   `json:"ready"`
	GpuBusy       bool   `json:"gpuBusy"`
	LastHeartbeat int64  `json:"lastHeartbeat"`
	Reason        string `json:"reason,omitempty"`
}

type HealthMonitorConfig struct {
	KubeconfigPath string
	Interval       time.Duration
}

type HealthMonitor struct {
	client         kubernetes.Interface
	callbackClient *CallbackClient
	interval       time.Duration
}

func NewHealthMonitor(config HealthMonitorConfig, callbackClient *CallbackClient) (*HealthMonitor, error) {
	var restConfig *rest.Config
	var err error

	if config.KubeconfigPath != "" {
		restConfig, err = clientcmd.BuildConfigFromFlags("", config.KubeconfigPath)
		if err != nil {
			return nil, fmt.Errorf("failed to load kubeconfig: %w", err)
		}
	} else {
		restConfig, err = rest.InClusterConfig()
		if err != nil {
			restConfig, err = clientcmd.BuildConfigFromFlags("", clientcmd.RecommendedHomeFile)
			if err != nil {
				return nil, fmt.Errorf("failed to create config: %w", err)
			}
		}
	}

	client, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create kubernetes client: %w", err)
	}

	interval := config.Interval
	if interval == 0 {
		interval = 30 * time.Second
	}

	return &HealthMonitor{
		client:         client,
		callbackClient: callbackClient,
		interval:       interval,
	}, nil
}

func (h *HealthMonitor) Start(ctx context.Context) {
	log.Printf("Starting health monitor with %v interval", h.interval)

	ticker := time.NewTicker(h.interval)
	defer ticker.Stop()

	h.runHealthCheck(ctx)

	for {
		select {
		case <-ctx.Done():
			log.Println("Health monitor stopped")
			return
		case <-ticker.C:
			h.runHealthCheck(ctx)
		}
	}
}

func (h *HealthMonitor) runHealthCheck(ctx context.Context) {
	statuses, err := h.checkNodeHealth(ctx)
	if err != nil {
		log.Printf("Error checking node health: %v", err)
		return
	}

	if len(statuses) == 0 {
		log.Println("No nodes found in cluster")
		return
	}

	readyCount := 0
	for _, s := range statuses {
		if s.Ready {
			readyCount++
		}
	}
	log.Printf("Health check: %d/%d nodes ready", readyCount, len(statuses))

	if err := h.callbackClient.NotifyNodeHealth(statuses); err != nil {
		log.Printf("Error notifying site of node health: %v", err)
	}
}

func (h *HealthMonitor) checkNodeHealth(ctx context.Context) ([]NodeHealthStatus, error) {
	nodes, err := h.client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to list nodes: %w", err)
	}

	var statuses []NodeHealthStatus

	for _, node := range nodes.Items {
		status := NodeHealthStatus{
			K8sNodeName: node.Name,
			NodeId:      getNodeId(&node),
		}

		if node.Labels["uvacompute.com/gpu-busy"] == "true" {
			status.GpuBusy = true
		}

		for _, condition := range node.Status.Conditions {
			if condition.Type == corev1.NodeReady {
				status.Ready = condition.Status == corev1.ConditionTrue
				status.LastHeartbeat = condition.LastHeartbeatTime.UnixMilli()
				if !status.Ready {
					status.Reason = condition.Reason
				}
				break
			}
		}

		statuses = append(statuses, status)
	}

	return statuses, nil
}

func getNodeId(node *corev1.Node) string {
	if nodeId, ok := node.Labels["uvacompute.com/node-id"]; ok {
		return nodeId
	}
	return node.Name
}
