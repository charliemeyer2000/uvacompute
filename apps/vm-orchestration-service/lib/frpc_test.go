package lib

import (
	"strings"
	"testing"
)

func TestGenerateFrpcCloudInit_Basic(t *testing.T) {
	t.Setenv("FRP_AUTH_TOKEN", "test-token")
	t.Setenv("FRP_SERVER_ADDR", "10.0.0.1")
	t.Setenv("FRP_SERVER_PORT", "7000")

	result := GenerateFrpcCloudInit(8080, "my-app", false)

	if !strings.HasPrefix(result, "#cloud-config") {
		t.Error("should start with #cloud-config")
	}

	if !strings.Contains(result, `serverAddr = "10.0.0.1"`) {
		t.Error("should contain server address from env")
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
	t.Setenv("FRP_SERVER_ADDR", "10.0.0.1")

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
	t.Setenv("FRP_SERVER_ADDR", "10.0.0.1")

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

func TestGetFRPAuthToken_Panics(t *testing.T) {
	t.Setenv("FRP_AUTH_TOKEN", "")

	defer func() {
		if r := recover(); r == nil {
			t.Error("GetFRPAuthToken should panic when FRP_AUTH_TOKEN is empty")
		}
	}()
	GetFRPAuthToken()
}

func TestGenerateFrpcConfig(t *testing.T) {
	t.Setenv("FRP_AUTH_TOKEN", "my-token")
	t.Setenv("FRP_SERVER_ADDR", "10.0.0.1")

	result := GenerateFrpcConfig(9090, "my-subdomain")

	if !strings.Contains(result, `serverAddr = "10.0.0.1"`) {
		t.Error("should contain server address from env")
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
}

func TestGetFRPServerAddr(t *testing.T) {
	t.Run("returns env value", func(t *testing.T) {
		t.Setenv("FRP_SERVER_ADDR", "1.2.3.4")
		if got := GetFRPServerAddr(); got != "1.2.3.4" {
			t.Errorf("GetFRPServerAddr() = %q, want %q", got, "1.2.3.4")
		}
	})

	t.Run("panics when empty", func(t *testing.T) {
		t.Setenv("FRP_SERVER_ADDR", "")
		defer func() {
			if r := recover(); r == nil {
				t.Error("GetFRPServerAddr should panic when empty")
			}
		}()
		GetFRPServerAddr()
	})
}

func TestGetFRPServerPort(t *testing.T) {
	t.Run("returns env value", func(t *testing.T) {
		t.Setenv("FRP_SERVER_PORT", "8000")
		if got := GetFRPServerPort(); got != 8000 {
			t.Errorf("GetFRPServerPort() = %d, want %d", got, 8000)
		}
	})

	t.Run("returns default when empty", func(t *testing.T) {
		t.Setenv("FRP_SERVER_PORT", "")
		if got := GetFRPServerPort(); got != 7000 {
			t.Errorf("GetFRPServerPort() = %d, want %d", got, 7000)
		}
	})
}
