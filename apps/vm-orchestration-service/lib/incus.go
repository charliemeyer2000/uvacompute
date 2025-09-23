package lib

import (
	"errors"
	"os/exec"
	"strconv"
	"vm-orchestration-service/structs"

	"github.com/google/uuid"
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

	// create incus vm
	vmId := uuid.New().String()

	_, err := exec.Command("incus", "launch", "images:ubuntu/24.04", vmId, "--vm", "-c", "limits.cpu="+strconv.Itoa(*req.Cpus), "-c", "limits.memory="+strconv.Itoa(*req.Ram)+"GiB", "-c", "-d", "root,size="+strconv.Itoa(*req.Disk)+"GiB", "-d", "root,io.bus=nvme", "-d", "gpu0,gpu,gputype=physical").Output()
	if err != nil {
		switch e := err.(type) {
		case *exec.Error:
			return "", errors.New(e.Error())
		case *exec.ExitError:
			return "", errors.New(string(e.Stderr))
		default:
			return "", errors.New(e.Error())

		}
	}

	if req.Gpus > 0 {
		_, err = exec.Command("incus", "config", "set", vmId, "nvidia.runtime=true", "nvidia.driver.capabilities=all").Output()
		if err != nil {
			switch e := err.(type) {
			case *exec.Error:
				return "", errors.New(e.Error())
			case *exec.ExitError:
				return "", errors.New(string(e.Stderr))
			default:
				return "", errors.New(e.Error())
			}
		}
		_, err = exec.Command("incus", "config", "device", "add", vmId, "gpu0", "gpu", "gputype=physical").Output()
		if err != nil {
			switch e := err.(type) {
			case *exec.Error:
				return "", errors.New(e.Error())
			case *exec.ExitError:
				return "", errors.New(string(e.Stderr))
			default:
				return "", errors.New(e.Error())
			}
		}
	}

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
