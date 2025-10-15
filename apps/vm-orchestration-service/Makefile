.PHONY: run dev build fmt fmty clean test deps install uninstall

run:
	go run .

dev:
	air

build:
	mkdir -p dist
	go build -o dist/vm .

fmt:
	go fmt ./...

fmty:
	gofmt -w .

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