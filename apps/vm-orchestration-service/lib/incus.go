package lib

import (
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"vm-orchestration-service/structs"
)

type IncusAdapter struct{}

func NewIncusAdapter() *IncusAdapter {
	return &IncusAdapter{}
}

func (i *IncusAdapter) CreateVM(vmId string, cpus, ram, disk, gpus int, sshPublicKeys []string, statusCallback structs.StatusCallback, startupScript, cloudInitConfig string) error {
	return createIncusVM(vmId, cpus, ram, disk, gpus, sshPublicKeys, statusCallback, startupScript, cloudInitConfig)
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

func (i *IncusAdapter) ListVMs() ([]structs.IncusListVM, error) {
	return listIncusVMs()
}

func generateCloudInitUserData(sshPublicKeys []string, startupScript, cloudInitConfig string) string {
	sshConfig := generateSSHKeysConfig(sshPublicKeys)

	if startupScript == "" && cloudInitConfig == "" {
		return sshConfig
	}

	return generateMIMEMultipart(sshConfig, startupScript, cloudInitConfig)
}

func generateSSHKeysConfig(sshPublicKeys []string) string {
	var userLevelKeys []string
	for _, key := range sshPublicKeys {
		userLevelKeys = append(userLevelKeys, fmt.Sprintf("      - %s", key))
	}

	return fmt.Sprintf(`#cloud-config
users:
  - name: root
    ssh_authorized_keys:
%s
ssh_pwauth: false
disable_root: false`, strings.Join(userLevelKeys, "\n"))
}

func generateMIMEMultipart(sshConfig, startupScript, cloudInitConfig string) string {
	boundary := "==CLOUDCONFIG_BOUNDARY=="
	parts := []string{
		"Content-Type: multipart/mixed; boundary=\"" + boundary + "\"",
		"MIME-Version: 1.0",
		"",
		"--" + boundary,
		"Content-Type: text/cloud-config; charset=\"us-ascii\"",
		"MIME-Version: 1.0",
		"Content-Transfer-Encoding: 7bit",
		"Content-Disposition: attachment; filename=\"base-config.cfg\"",
		"",
		sshConfig,
	}

	if startupScript != "" {
		wrappedScript := `#!/bin/bash
export HOME=/root
export USER=root
export LOGNAME=root
cd /root

# Run user's script
` + startupScript

		parts = append(parts,
			"--"+boundary,
			"Content-Type: text/x-shellscript; charset=\"us-ascii\"",
			"MIME-Version: 1.0",
			"Content-Transfer-Encoding: 7bit",
			"Content-Disposition: attachment; filename=\"startup-script.sh\"",
			"",
			wrappedScript,
		)
	}

	if cloudInitConfig != "" {
		parts = append(parts,
			"--"+boundary,
			"Content-Type: text/cloud-config; charset=\"us-ascii\"",
			"MIME-Version: 1.0",
			"Content-Transfer-Encoding: 7bit",
			"Content-Disposition: attachment; filename=\"user-config.cfg\"",
			"Merge-Type: list(append)+dict(no_replace,recurse_list)+str()",
			"",
			cloudInitConfig,
		)
	}

	parts = append(parts, "--"+boundary+"--", "")

	return strings.Join(parts, "\n")
}

func createIncusVM(vmId string, cpus int, ram int, disk int, gpus int, sshPublicKeys []string, statusCallback structs.StatusCallback, startupScript, cloudInitConfig string) error {
	statusCallback(structs.VM_STATUS_INITIALIZING)

	var vmImage string
	if gpus > 0 {
		vmImage = "local:ubuntu24-dev-gpu"
	} else {
		vmImage = "local:ubuntu24-dev-cpu"
	}
	cmd := []string{"incus", "init", vmImage, vmId, "--vm", "-c", "limits.cpu=" + strconv.Itoa(cpus), "-c", "limits.memory=" + strconv.Itoa(ram) + "GiB", "-d", "root,size=" + strconv.Itoa(disk) + "GiB", "-d", "root,io.bus=nvme", "-c", "security.secureboot=false"}

	if len(sshPublicKeys) > 0 || startupScript != "" || cloudInitConfig != "" {
		cloudInitUserData := generateCloudInitUserData(sshPublicKeys, startupScript, cloudInitConfig)
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
		statusCallback(structs.VM_STATUS_CONFIGURING)
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

	statusCallback(structs.VM_STATUS_STARTING)
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

	statusCallback(structs.VM_STATUS_WAITING_FOR_AGENT)
	err = waitForCloudInit(vmId)
	if err != nil {
		_ = destroyIncusVM(vmId)
		return fmt.Errorf("cloud-init failed: %w", err)
	}

	return nil
}

func waitForCloudInit(vmId string) error {
	err := waitForVMAgent(vmId)
	if err != nil {
		return fmt.Errorf("VM agent failed to start: %w", err)
	}

	cmd := []string{"incus", "exec", vmId, "--", "cloud-init", "status", "--wait"}
	output, err := exec.Command(cmd[0], cmd[1:]...).CombinedOutput()
	if err != nil {
		logsCmd := []string{"incus", "exec", vmId, "--", "bash", "-c", "cloud-init status --long 2>&1 | grep -A 20 'errors:' || cloud-init status --long"}
		logsOutput, logsErr := exec.Command(logsCmd[0], logsCmd[1:]...).Output()

		errMsg := "cloud-init failed"
		if logsErr == nil && len(logsOutput) > 0 {
			errMsg = fmt.Sprintf("cloud-init failed:\n%s", string(logsOutput))
		} else if len(output) > 0 {
			errMsg = fmt.Sprintf("cloud-init failed: %s", string(output))
		}

		return errors.New(errMsg)
	}

	return nil
}

func waitForVMAgent(vmId string) error {
	cmd := []string{"incus", "exec", vmId, "--", "true"}

	for i := 0; i < 60; i++ {
		_, err := exec.Command(cmd[0], cmd[1:]...).Output()
		if err == nil {
			return nil
		}
		time.Sleep(1 * time.Second)
	}

	return errors.New("timeout waiting for VM agent to start")
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

func listIncusVMs() ([]structs.IncusListVM, error) {
	cmd := []string{"incus", "ls", "-f", "json"}
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

	var instances []structs.IncusListVM
	if err := json.Unmarshal(out, &instances); err != nil {
		return nil, fmt.Errorf("failed to parse incus list output: %w", err)
	}

	var vms []structs.IncusListVM
	for _, inst := range instances {
		if inst.Type == "virtual-machine" {
			vms = append(vms, inst)
		}
	}

	return vms, nil
}
