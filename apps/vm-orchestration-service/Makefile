.PHONY: run dev build fmt clean test lint check-types deps install uninstall

run:
	go run .

dev:
	ENV=development air && tailscale funnel --bg --https=443 8080

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
	@systemctl daemon-reload
	@echo "✅ Service uninstalled"