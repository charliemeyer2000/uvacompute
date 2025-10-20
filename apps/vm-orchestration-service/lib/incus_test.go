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
			result := generateCloudInitUserData(tt.sshKeys)

			if !strings.HasPrefix(result, "#cloud-config") {
				t.Error("Cloud-init data should start with #cloud-config")
			}

			if !strings.Contains(result, "ssh_authorized_keys:") {
				t.Error("Cloud-init data should contain ssh_authorized_keys section")
			}

			if !strings.Contains(result, "users:") {
				t.Error("Cloud-init data should contain users section")
			}

			if !strings.Contains(result, "name: root") {
				t.Error("Cloud-init data should configure root user")
			}

			for _, key := range tt.sshKeys {
				if !strings.Contains(result, key) {
					t.Errorf("Cloud-init data should contain SSH key: %s", key)
				}
			}

			if len(tt.sshKeys) > 0 {
				keyCount := strings.Count(result, "- "+tt.sshKeys[0])
				if keyCount != 2 {
					t.Errorf("Each SSH key should appear twice (once in ssh_authorized_keys and once in users section), got %d", keyCount)
				}
			}
		})
	}
}

func TestGenerateCloudInitUserDataFormat(t *testing.T) {
	sshKey := "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... test@example.com"
	result := generateCloudInitUserData([]string{sshKey})

	expectedSubstrings := []string{
		"#cloud-config",
		"ssh_authorized_keys:",
		"  - " + sshKey,
		"users:",
		"  - name: root",
		"    ssh_authorized_keys:",
		"      - " + sshKey,
	}

	for _, substr := range expectedSubstrings {
		if !strings.Contains(result, substr) {
			t.Errorf("Cloud-init data missing expected substring: %s\nGot:\n%s", substr, result)
		}
	}

	topLevelKey := "  - " + sshKey
	userLevelKey := "      - " + sshKey
	if !strings.Contains(result, topLevelKey) {
		t.Errorf("Cloud-init data should contain top-level key with 2-space indentation:\n%s", topLevelKey)
	}
	if !strings.Contains(result, userLevelKey) {
		t.Errorf("Cloud-init data should contain user-level key with 6-space indentation:\n%s", userLevelKey)
	}
}

func TestGenerateCloudInitUserDataMultipleKeys(t *testing.T) {
	sshKeys := []string{
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... user1@example.com",
		"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... user2@example.com",
		"ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQD... user3@example.com",
	}

	result := generateCloudInitUserData(sshKeys)

	for _, key := range sshKeys {
		count := strings.Count(result, key)
		if count != 2 {
			t.Errorf("SSH key should appear exactly twice in cloud-init, got %d times for key: %s", count, key)
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
	result := generateCloudInitUserData([]string{})

	if !strings.HasPrefix(result, "#cloud-config") {
		t.Error("Cloud-init data should start with #cloud-config even with no keys")
	}

	if !strings.Contains(result, "ssh_authorized_keys:") {
		t.Error("Cloud-init data should contain ssh_authorized_keys section even if empty")
	}
}
