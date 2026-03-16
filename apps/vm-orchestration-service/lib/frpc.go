package lib

import (
	"fmt"
	"os"
	"strconv"
)

// GetFRPServerAddr returns the FRP server address from environment
func GetFRPServerAddr() string {
	addr := os.Getenv("FRP_SERVER_ADDR")
	if addr == "" {
		panic("FRP_SERVER_ADDR environment variable is required")
	}
	return addr
}

// GetFRPServerPort returns the FRP server port from environment
func GetFRPServerPort() int {
	portStr := os.Getenv("FRP_SERVER_PORT")
	if portStr == "" {
		return 7000
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		return 7000
	}
	return port
}

// GetFRPAuthToken returns the FRP authentication token from environment
func GetFRPAuthToken() string {
	token := os.Getenv("FRP_AUTH_TOKEN")
	if token == "" {
		panic("FRP_AUTH_TOKEN environment variable is required")
	}
	return token
}

// GenerateFrpcCloudInit generates cloud-init configuration for installing and running frpc.
// If includeCompletionMarker is true, the completion marker is created after frpc verification.
func GenerateFrpcCloudInit(port int, subdomain string, includeCompletionMarker bool) string {
	authToken := GetFRPAuthToken()

	completionRuncmd := ""
	if includeCompletionMarker {
		completionRuncmd = `
  - touch /var/run/uvacompute-provisioned
  - echo "UVACompute provisioning complete (with endpoint) at $(date)" >> /var/log/uvacompute-init.log
  - nohup nc -lk 9999 < /dev/null > /dev/null 2>&1 &
  - echo "Readiness port 9999 listening" >> /var/log/uvacompute-init.log`
	}

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

  - path: /usr/local/bin/install-frpc.sh
    permissions: '0755'
    content: |
      #!/bin/bash
      set -e
      LOG="/var/log/uvacompute-init.log"
      log() { echo "[$(date '+%%H:%%M:%%S')] [frpc] $1" >> $LOG; }

      # Wait for network (up to 60s)
      log "Waiting for network..."
      for i in $(seq 1 30); do
        if curl -sf --connect-timeout 2 https://github.com >/dev/null 2>&1; then
          log "Network ready"
          break
        fi
        if [ $i -eq 30 ]; then
          log "ERROR: Network timeout after 60s"
          exit 1
        fi
        sleep 2
      done

      # Download with retries
      log "Downloading frpc v0.61.0..."
      for i in $(seq 1 5); do
        if wget -q --timeout=30 -O /tmp/frp.tar.gz \
          https://github.com/fatedier/frp/releases/download/v0.61.0/frp_0.61.0_linux_amd64.tar.gz; then
          log "Download successful"
          break
        fi
        if [ $i -eq 5 ]; then
          log "ERROR: Download failed after 5 attempts"
          exit 1
        fi
        log "Download attempt $i failed, retrying in 5s..."
        sleep 5
      done

      # Extract and install
      log "Installing frpc..."
      cd /tmp && tar -xzf frp.tar.gz
      cp frp_0.61.0_linux_amd64/frpc /usr/local/bin/frpc
      chmod +x /usr/local/bin/frpc
      rm -rf frp_0.61.0_linux_amd64* frp.tar.gz

      # Verify binary works
      if /usr/local/bin/frpc --version >> $LOG 2>&1; then
        log "frpc installed successfully"
      else
        log "ERROR: frpc binary verification failed"
        exit 1
      fi

  - path: /usr/local/bin/verify-frpc.sh
    permissions: '0755'
    content: |
      #!/bin/bash
      LOG="/var/log/uvacompute-init.log"
      log() { echo "[$(date '+%%H:%%M:%%S')] [frpc-verify] $1" >> $LOG; }

      log "Waiting for frpc to connect to frps..."

      # Wait up to 2 minutes for frpc to connect
      for i in $(seq 1 24); do
        # Check if service is running
        if ! systemctl is-active --quiet frpc; then
          log "Attempt $i/24: frpc service not running yet"
          sleep 5
          continue
        fi

        # Check for successful proxy registration in frpc logs
        if journalctl -u frpc --no-pager -n 30 2>/dev/null | grep -q "start proxy success"; then
          log "frpc connected successfully!"
          exit 0
        fi

        log "Attempt $i/24: waiting for connection..."
        sleep 5
      done

      log "ERROR: frpc failed to connect after 2 minutes"
      log "frpc service status:"
      systemctl status frpc --no-pager >> $LOG 2>&1 || true
      log "Recent frpc logs:"
      journalctl -u frpc --no-pager -n 20 >> $LOG 2>&1 || true
      exit 1

runcmd:
  - mkdir -p /etc/frp
  - /usr/local/bin/install-frpc.sh
  - systemctl daemon-reload
  - systemctl enable frpc
  - systemctl start frpc
  - /usr/local/bin/verify-frpc.sh
  - echo "frpc started for subdomain %s on port %d" >> /var/log/uvacompute-init.log%s
`, GetFRPServerAddr(), GetFRPServerPort(), authToken, subdomain, port, subdomain, subdomain, port, completionRuncmd)
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
`, GetFRPServerAddr(), GetFRPServerPort(), authToken, subdomain, port, subdomain)
}
