package lib

import (
	"strings"
	"testing"
)

func TestGenerateCloudInitUserData(t *testing.T) {
	tests := []struct {
		name        string
		sshKeys     []string
		expectEmpty bool
	}{
		{
			name: "Single SSH key",
			sshKeys: []string{
				"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... user@example.com",
			},
			expectEmpty: false,
		},
		{
			name: "Multiple SSH keys",
			sshKeys: []string{
				"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... user@example.com",
				"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... user@example.com",
			},
			expectEmpty: false,
		},
		{
			name:        "Empty SSH keys",
			sshKeys:     []string{},
			expectEmpty: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := generateCloudInitUserData(tt.sshKeys, "", "")

			if !strings.HasPrefix(result, "#cloud-config") {
				t.Error("Cloud-init data should start with #cloud-config")
			}

			if !strings.Contains(result, "users:") {
				t.Error("Cloud-init data should contain users section")
			}

			if !strings.Contains(result, "name: root") {
				t.Error("Cloud-init data should configure root user")
			}

			if !strings.Contains(result, "ssh_pwauth: false") {
				t.Error("Cloud-init data should disable password authentication")
			}

			if !strings.Contains(result, "disable_root: false") {
				t.Error("Cloud-init data should explicitly allow root login")
			}

			for _, key := range tt.sshKeys {
				if !strings.Contains(result, key) {
					t.Errorf("Cloud-init data should contain SSH key: %s", key)
				}
			}

			if len(tt.sshKeys) > 0 {
				keyCount := strings.Count(result, "- "+tt.sshKeys[0])
				if keyCount != 1 {
					t.Errorf("Each SSH key should appear once in users section, got %d", keyCount)
				}
			}
		})
	}
}

func TestGenerateCloudInitUserDataFormat(t *testing.T) {
	sshKey := "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... test@example.com"
	result := generateCloudInitUserData([]string{sshKey}, "", "")

	expectedSubstrings := []string{
		"#cloud-config",
		"users:",
		"  - name: root",
		"    ssh_authorized_keys:",
		"      - " + sshKey,
		"ssh_pwauth: false",
		"disable_root: false",
	}

	for _, substr := range expectedSubstrings {
		if !strings.Contains(result, substr) {
			t.Errorf("Cloud-init data missing expected substring: %s\nGot:\n%s", substr, result)
		}
	}

	userLevelKey := "      - " + sshKey
	if !strings.Contains(result, userLevelKey) {
		t.Errorf("Cloud-init data should contain user-level key with 6-space indentation:\n%s", userLevelKey)
	}

	if strings.Count(result, sshKey) != 1 {
		t.Errorf("SSH key should appear exactly once, found %d occurrences", strings.Count(result, sshKey))
	}
}

func TestGenerateCloudInitUserDataMultipleKeys(t *testing.T) {
	sshKeys := []string{
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... user1@example.com",
		"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... user2@example.com",
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD... user3@example.com",
	}

	result := generateCloudInitUserData(sshKeys, "", "")

	for _, key := range sshKeys {
		count := strings.Count(result, key)
		if count != 1 {
			t.Errorf("SSH key should appear exactly once in cloud-init, got %d times for key: %s", count, key)
		}
	}

	lines := strings.Split(result, "\n")
	rootUserLineFound := false
	for _, line := range lines {
		if strings.Contains(line, "- name: root") {
			rootUserLineFound = true
			break
		}
	}

	if !rootUserLineFound {
		t.Error("Root user configuration not found in cloud-init")
	}
}

func TestGenerateCloudInitUserDataNoKeys(t *testing.T) {
	result := generateCloudInitUserData([]string{}, "", "")

	if !strings.HasPrefix(result, "#cloud-config") {
		t.Error("Cloud-init data should start with #cloud-config even with no keys")
	}

	if !strings.Contains(result, "users:") {
		t.Error("Cloud-init data should contain users section even if empty")
	}
}

func TestGenerateCloudInitWithScript(t *testing.T) {
	sshKey := "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... test@example.com"
	script := "#!/bin/bash\napt-get update\napt-get install -y vim"

	result := generateCloudInitUserData([]string{sshKey}, script, "")

	if !strings.Contains(result, "Content-Type: multipart/mixed") {
		t.Error("Cloud-init should use MIME multipart format when script is provided")
	}

	if !strings.Contains(result, "text/x-shellscript") {
		t.Error("Cloud-init should contain shellscript content type for startup script")
	}

	if !strings.Contains(result, sshKey) {
		t.Error("Cloud-init should contain SSH key in base config")
	}

	if !strings.Contains(result, "apt-get update") {
		t.Error("Cloud-init should contain startup script content")
	}
}

func TestGenerateCloudInitWithCustomConfig(t *testing.T) {
	sshKey := "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... test@example.com"
	customConfig := `#cloud-config
packages:
  - vim
  - git
runcmd:
  - echo "custom setup"
`

	result := generateCloudInitUserData([]string{sshKey}, "", customConfig)

	if !strings.Contains(result, "Content-Type: multipart/mixed") {
		t.Error("Cloud-init should use MIME multipart format when custom config is provided")
	}

	if !strings.Contains(result, "Merge-Type: list(append)+dict(no_replace,recurse_list)") {
		t.Error("Cloud-init should include merge type for proper merging")
	}

	if !strings.Contains(result, sshKey) {
		t.Error("Cloud-init should contain SSH key in base config")
	}

	if !strings.Contains(result, "packages:") {
		t.Error("Cloud-init should preserve custom config sections")
	}

	if !strings.Contains(result, "vim") {
		t.Error("Cloud-init should preserve custom config values")
	}
}

func TestGenerateMIMEMultipartStructure(t *testing.T) {
	sshKey := "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... test@example.com"
	script := "#!/bin/bash\necho hello"
	customConfig := "#cloud-config\npackages:\n  - vim"

	result := generateCloudInitUserData([]string{sshKey}, script, customConfig)

	if !strings.Contains(result, "==CLOUDCONFIG_BOUNDARY==") {
		t.Error("MIME multipart should use boundary marker")
	}

	boundaryCount := strings.Count(result, "--==CLOUDCONFIG_BOUNDARY==")
	if boundaryCount < 4 {
		t.Errorf("Expected at least 4 boundary markers (start + 2 parts + end), got %d", boundaryCount)
	}

	if !strings.Contains(result, "base-config.cfg") {
		t.Error("Should contain SSH keys config part")
	}

	if !strings.Contains(result, "startup-script.sh") {
		t.Error("Should contain startup script part")
	}

	if !strings.Contains(result, "user-config.cfg") {
		t.Error("Should contain user config part")
	}
}

func TestGenerateSSHKeysConfig(t *testing.T) {
	sshKeys := []string{
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... user1@example.com",
		"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... user2@example.com",
	}

	result := generateSSHKeysConfig(sshKeys)

	if !strings.HasPrefix(result, "#cloud-config") {
		t.Error("SSH keys config should start with #cloud-config")
	}

	for _, key := range sshKeys {
		if !strings.Contains(result, key) {
			t.Errorf("SSH keys config should contain key: %s", key)
		}
	}

	if !strings.Contains(result, "disable_root: false") {
		t.Error("SSH keys config should allow root login")
	}
}
