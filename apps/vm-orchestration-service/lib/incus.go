package lib

import (
	"errors"
	// "os/exec"
	// "strconv"
	"vm-orchestration-service/structs"

	"github.com/google/uuid"
)

func CreateIncusVM(req structs.VMCreationRequest) (string, error) {
	vmId := uuid.New().String()

	// _, err := exec.Command("incus", "launch", "images:ubuntu/24.04", vmId, "--vm", "-c", "limits.cpu="+strconv.Itoa(req.GetCpus()), "-c", "limits.memory="+strconv.Itoa(req.GetRam())+"GiB", "-c", "-d", "root,size="+strconv.Itoa(req.GetDisk())+"GiB", "-d", "root,io.bus=nvme", "-d", "gpu0,gpu,gputype=physical").Output()
	// if err != nil {
	// 	switch e := err.(type) {
	// 	case *exec.Error:
	// 		return "", errors.New(e.Error())
	// 	case *exec.ExitError:
	// 		return "", errors.New(string(e.Stderr))
	// 	default:
	// 		return "", errors.New(e.Error())
	// 	}
	// }

	return vmId, nil
}

func DestroyIncusVM(vmId string) error {
	return errors.New("Incus VM destruction not implemented yet")
}

func GetIncusVMStatus(vmId string) (string, error) {
	return "unknown", errors.New("Incus status check not implemented yet")
}
