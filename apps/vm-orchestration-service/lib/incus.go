package lib

import (
	"errors"
	"fmt"
	"vm-orchestration-service/structs"
)

// CreateIncusVM handles low-level Incus VM creation
// This function is pure - no state management, just external API calls
func CreateIncusVM(req structs.VMCreationRequest) (string, error) {
	// TODO: Implement actual Incus API integration
	// This would include:
	// 1. Create Incus container/VM with specified resources
	// 2. Configure networking
	// 3. Set up SSH access
	// 4. Configure Tailscale funnel for port forwarding
	// 5. Return the VM ID from Incus

	// For now, return a mock VM ID
	vmId := fmt.Sprintf("vm-%s-%d", req.UserId[:8], req.Hours)

	// Simulate the "not implemented" error for now
	return vmId, errors.New("Incus integration not implemented yet")
}

// DestroyIncusVM handles low-level Incus VM destruction
func DestroyIncusVM(vmId string) error {
	// TODO: Implement actual Incus VM destruction
	// This would include:
	// 1. Stop the VM
	// 2. Remove Tailscale funnel
	// 3. Delete the Incus container/VM
	// 4. Clean up any associated resources

	return errors.New("Incus VM destruction not implemented yet")
}

// GetIncusVMStatus gets the actual status from Incus
func GetIncusVMStatus(vmId string) (string, error) {
	// TODO: Query Incus for actual VM status
	// This would return the real status from Incus API

	return "unknown", errors.New("Incus status check not implemented yet")
}
