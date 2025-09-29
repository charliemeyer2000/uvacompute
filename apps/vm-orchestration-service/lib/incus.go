package lib

import (
	"errors"
	"os/exec"
	"strconv"
)

type IncusAdapter struct{}

func NewIncusAdapter() *IncusAdapter {
	return &IncusAdapter{}
}

func (i *IncusAdapter) CreateVM(vmId string, cpus, ram, disk, gpus int) error {
	return createIncusVM(vmId, cpus, ram, disk, gpus)
}

func (i *IncusAdapter) DestroyVM(vmId string) error {
	return destroyIncusVM(vmId)
}

func (i *IncusAdapter) GetVMStatus(vmId string) (string, error) {
	return getIncusVMStatus(vmId)
}

func createIncusVM(vmId string, cpus int, ram int, disk int, gpus int) error {
	cmd := []string{"incus", "init", "images:ubuntu/24.04", vmId, "--vm", "-c", "limits.cpu=" + strconv.Itoa(cpus), "-c", "limits.memory=" + strconv.Itoa(ram) + "GiB", "-d", "root,size=" + strconv.Itoa(disk) + "GiB", "-d", "root,io.bus=nvme", "-c", "security.secureboot=false"}

	_, err := exec.Command(cmd[0], cmd[1:]...).Output()
	if err != nil {
		switch e := err.(type) {
		case *exec.Error:
			return errors.New(e.Error())
		case *exec.ExitError:
			return errors.New(string(e.Stderr))
		default:
			return errors.New(e.Error())
		}
	}

	if gpus > 0 {

		var cmd = []string{"incus", "device", "add", vmId, "gpu0", "type=gpu", "gputype=physical", "pci=0000:c1:00.0"}
		_, err = exec.Command(cmd[0], cmd[1:]...).Output()
		if err != nil {
			_ = destroyIncusVM(vmId)
			return err
		}
	}

	cmd = []string{"incus", "start", vmId}
	_, err = exec.Command(cmd[0], cmd[1:]...).Output()
	if err != nil {
		_ = destroyIncusVM(vmId)
		return err
	}

	return nil
}

func destroyIncusVM(vmId string) error {
	cmd := []string{"incus", "delete", vmId, "--force"}
	_, err := exec.Command(cmd[0], cmd[1:]...).Output()
	if err != nil {
		switch e := err.(type) {
		case *exec.Error:
			return errors.New(e.Error())
		case *exec.ExitError:
			return errors.New(string(e.Stderr))
		default:
			return errors.New(e.Error())
		}
	}

	return nil
}

func getIncusVMStatus(vmId string) (string, error) {

	cmd := []string{"incus", "info", vmId}
	out, err := exec.Command(cmd[0], cmd[1:]...).Output()
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

	return string(out), nil
}
