package lib

import (
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"

	"vm-orchestration-service/structs"
)

type IncusAdapter struct{}

func NewIncusAdapter() *IncusAdapter {
	return &IncusAdapter{}
}

func (i *IncusAdapter) CreateVM(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string) error {
	return createIncusVM(vmId, cpus, ram, disk, gpus, sshPublicKeys)
}

func (i *IncusAdapter) DestroyVM(vmId string) error {
	return destroyIncusVM(vmId)
}

func (i *IncusAdapter) GetVMStatus(vmId string) (string, error) {
	return getIncusVMStatus(vmId)
}

func (i *IncusAdapter) GetVMInfo(vmId string) (*structs.IncusVMInfo, error) {
	return getIncusVMInfo(vmId)
}

func generateCloudInitUserData(sshPublicKeys []string) string {
	var userLevelKeys []string
	for _, key := range sshPublicKeys {
		userLevelKeys = append(userLevelKeys, fmt.Sprintf("      - %s", key))
	}

	cloudInit := fmt.Sprintf(`#cloud-config
users:
  - name: root
    ssh_authorized_keys:
%s
ssh_pwauth: false
disable_root: false`, strings.Join(userLevelKeys, "\n"))

	return cloudInit
}

func createIncusVM(vmId string, cpus int, ram int, disk int, gpus int, sshPublicKeys []string) error {
	cmd := []string{"incus", "init", "images:ubuntu/24.04/cloud", vmId, "--vm", "-c", "limits.cpu=" + strconv.Itoa(cpus), "-c", "limits.memory=" + strconv.Itoa(ram) + "GiB", "-d", "root,size=" + strconv.Itoa(disk) + "GiB", "-d", "root,io.bus=nvme", "-c", "security.secureboot=false"}

	if len(sshPublicKeys) > 0 {
		cloudInitUserData := generateCloudInitUserData(sshPublicKeys)
		cmd = append(cmd, "-c", "user.user-data="+cloudInitUserData)
	}

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

		var cmd = []string{"incus", "config", "device", "add", vmId, "gpu0", "gpu", "gputype=physical", "pci=0000:c1:00.0"}
		_, err = exec.Command(cmd[0], cmd[1:]...).Output()
		if err != nil {
			_ = destroyIncusVM(vmId)
			switch e := err.(type) {
			case *exec.Error:
				return errors.New(e.Error())
			case *exec.ExitError:
				return errors.New(string(e.Stderr))
			default:
				return errors.New(e.Error())
			}
		}
	}

	cmd = []string{"incus", "start", vmId}
	_, err = exec.Command(cmd[0], cmd[1:]...).Output()
	if err != nil {
		_ = destroyIncusVM(vmId)
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

func getIncusVMInfo(vmId string) (*structs.IncusVMInfo, error) {
	cmd := []string{"incus", "info", vmId, "--resources"}
	out, err := exec.Command(cmd[0], cmd[1:]...).Output()
	if err != nil {
		switch e := err.(type) {
		case *exec.Error:
			return nil, errors.New(e.Error())
		case *exec.ExitError:
			return nil, errors.New(string(e.Stderr))
		default:
			return nil, errors.New(e.Error())
		}
	}

	info, parseErr := structs.ParseIncusInfo(out)
	if parseErr != nil {
		return nil, parseErr
	}

	return info, nil
}
