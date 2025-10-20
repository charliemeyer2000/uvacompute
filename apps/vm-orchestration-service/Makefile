.PHONY: run dev prod build fmt clean test lint check-types deps install uninstall

run:
	ENV=development go run .

dev:
	ENV=development $(shell go env GOPATH)/bin/air && tailscale funnel --bg --https=443 8080

prod:
	ENV=production go run .

build:
	mkdir -p dist
	go build -o dist/vm .

fmt:
	go fmt ./...

lint:
	go fmt ./... && go vet ./...

check-types:
	go vet ./...

clean:
	rm -rf dist/

test:
	go test ./...

deps:
	go mod tidy

install:
	@echo "Building and installing vm-orchestration service..."
	@go build -o /usr/local/bin/vm-orchestration .
	@mkdir -p /opt/vm-orchestration-service
	@cp .env.production /opt/vm-orchestration-service/
	@cp vm-orchestration.service /etc/systemd/system/
	@systemctl daemon-reload
	@systemctl enable vm-orchestration
	@systemctl restart vm-orchestration
	@echo "✅ Service installed and running"
	@echo "View logs: journalctl -u vm-orchestration -f"

uninstall:
	@systemctl stop vm-orchestration || true
	@systemctl disable vm-orchestration || true
	@rm -f /etc/systemd/system/vm-orchestration.service
	@rm -f /usr/local/bin/vm-orchestration
	@rm -rf /opt/vm-orchestration-service
	@systemctl daemon-reload
	@echo "✅ Service uninstalled"