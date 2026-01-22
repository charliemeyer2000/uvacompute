package lib

import (
	"fmt"
	"os"
)

const (
	FRPServerAddr = "***REDACTED_IP***"
	FRPServerPort = 7000
)

// GetFRPAuthToken returns the FRP authentication token from environment
func GetFRPAuthToken() string {
	token := os.Getenv("FRP_AUTH_TOKEN")
	if token == "" {
		return "default-token"
	}
	return token
}

// GenerateFrpcCloudInit generates cloud-init configuration for installing and running frpc
func GenerateFrpcCloudInit(port int, subdomain string) string {
	authToken := GetFRPAuthToken()

	return fmt.Sprintf(`#cloud-config
# frpc installation and configuration for ephemeral endpoint

write_files:
  - path: /etc/frp/frpc.toml
    permissions: '0644'
    content: |
      # frpc configuration for UVACompute ephemeral endpoint
      serverAddr = "%s"
      serverPort = %d
      auth.token = "%s"

      [[proxies]]
      name = "%s"
      type = "http"
      localPort = %d
      subdomain = "%s"

  - path: /etc/systemd/system/frpc.service
    permissions: '0644'
    content: |
      [Unit]
      Description=frp client for UVACompute ephemeral endpoint
      After=network-online.target
      Wants=network-online.target

      [Service]
      Type=simple
      ExecStart=/usr/local/bin/frpc -c /etc/frp/frpc.toml
      Restart=always
      RestartSec=5

      [Install]
      WantedBy=multi-user.target

runcmd:
  # Download and install frpc
  - mkdir -p /etc/frp
  - cd /tmp && wget -q https://github.com/fatedier/frp/releases/download/v0.61.0/frp_0.61.0_linux_amd64.tar.gz
  - cd /tmp && tar -xzf frp_0.61.0_linux_amd64.tar.gz
  - cp /tmp/frp_0.61.0_linux_amd64/frpc /usr/local/bin/frpc
  - chmod +x /usr/local/bin/frpc
  - rm -rf /tmp/frp_0.61.0_linux_amd64*
  # Enable and start frpc service
  - systemctl daemon-reload
  - systemctl enable frpc
  - systemctl start frpc
  - echo "frpc started for subdomain %s on port %d" >> /var/log/uvacompute-init.log
`, FRPServerAddr, FRPServerPort, authToken, subdomain, port, subdomain, subdomain, port)
}

// GenerateFrpcConfig generates just the frpc.toml configuration content
// This is used for jobs where we need to pass config via environment or ConfigMap
func GenerateFrpcConfig(port int, subdomain string) string {
	authToken := GetFRPAuthToken()

	return fmt.Sprintf(`serverAddr = "%s"
serverPort = %d
auth.token = "%s"

[[proxies]]
name = "%s"
type = "http"
localPort = %d
subdomain = "%s"
`, FRPServerAddr, FRPServerPort, authToken, subdomain, port, subdomain)
}
