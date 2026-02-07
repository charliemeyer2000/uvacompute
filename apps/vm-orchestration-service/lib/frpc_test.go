package lib

import (
	"strings"
	"testing"
)

func TestGenerateFrpcCloudInit_Basic(t *testing.T) {
	t.Setenv("FRP_AUTH_TOKEN", "test-token")

	result := GenerateFrpcCloudInit(8080, "my-app", false)

	if !strings.HasPrefix(result, "#cloud-config") {
		t.Error("should start with #cloud-config")
	}

	if !strings.Contains(result, `serverAddr = "***REDACTED_IP***"`) {
		t.Error("should contain server address")
	}
	if !strings.Contains(result, "serverPort = 7000") {
		t.Error("should contain server port")
	}
	if !strings.Contains(result, `auth.token = "test-token"`) {
		t.Error("should contain auth token")
	}
	if !strings.Contains(result, `name = "my-app"`) {
		t.Error("should contain subdomain as proxy name")
	}
	if !strings.Contains(result, "localPort = 8080") {
		t.Error("should contain local port")
	}
	if !strings.Contains(result, `subdomain = "my-app"`) {
		t.Error("should contain subdomain")
	}

	// Without completion marker
	if strings.Contains(result, "uvacompute-provisioned") {
		t.Error("should NOT contain completion marker when includeCompletionMarker=false")
	}
}

func TestGenerateFrpcCloudInit_WithCompletionMarker(t *testing.T) {
	t.Setenv("FRP_AUTH_TOKEN", "test-token")

	result := GenerateFrpcCloudInit(3000, "test-sub", true)

	if !strings.Contains(result, "uvacompute-provisioned") {
		t.Error("should contain completion marker when includeCompletionMarker=true")
	}
	if !strings.Contains(result, "nohup nc -lk 9999") {
		t.Error("should contain readiness port listener")
	}
}

func TestGenerateFrpcCloudInit_FrpcInstallScripts(t *testing.T) {
	t.Setenv("FRP_AUTH_TOKEN", "test-token")

	result := GenerateFrpcCloudInit(8080, "test", false)

	if !strings.Contains(result, "/usr/local/bin/install-frpc.sh") {
		t.Error("should contain install script path")
	}
	if !strings.Contains(result, "/usr/local/bin/verify-frpc.sh") {
		t.Error("should contain verify script path")
	}
	if !strings.Contains(result, "systemctl enable frpc") {
		t.Error("should enable frpc service")
	}
	if !strings.Contains(result, "systemctl start frpc") {
		t.Error("should start frpc service")
	}
}

func TestGenerateFrpcCloudInit_DefaultToken(t *testing.T) {
	t.Setenv("FRP_AUTH_TOKEN", "")

	result := GenerateFrpcCloudInit(8080, "test", false)

	if !strings.Contains(result, `auth.token = "default-token"`) {
		t.Error("should use default token when FRP_AUTH_TOKEN is empty")
	}
}

func TestGenerateFrpcConfig(t *testing.T) {
	t.Setenv("FRP_AUTH_TOKEN", "my-token")

	result := GenerateFrpcConfig(9090, "my-subdomain")

	if !strings.Contains(result, `serverAddr = "***REDACTED_IP***"`) {
		t.Error("should contain server address")
	}
	if !strings.Contains(result, "localPort = 9090") {
		t.Error("should contain local port")
	}
	if !strings.Contains(result, `subdomain = "my-subdomain"`) {
		t.Error("should contain subdomain")
	}
	if !strings.Contains(result, `auth.token = "my-token"`) {
		t.Error("should contain auth token")
	}

	// Should NOT contain cloud-init directives
	if strings.Contains(result, "#cloud-config") {
		t.Error("GenerateFrpcConfig should not contain cloud-init directives")
	}
}

func TestGetFRPAuthToken(t *testing.T) {
	t.Run("returns env value", func(t *testing.T) {
		t.Setenv("FRP_AUTH_TOKEN", "custom-token")
		if got := GetFRPAuthToken(); got != "custom-token" {
			t.Errorf("GetFRPAuthToken() = %q, want %q", got, "custom-token")
		}
	})

	t.Run("returns default when empty", func(t *testing.T) {
		t.Setenv("FRP_AUTH_TOKEN", "")
		if got := GetFRPAuthToken(); got != "default-token" {
			t.Errorf("GetFRPAuthToken() = %q, want %q", got, "default-token")
		}
	})
}
