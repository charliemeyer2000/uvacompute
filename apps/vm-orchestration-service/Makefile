.PHONY: run dev prod build build-linux fmt clean test test-integration lint check-types deps install uninstall \
       install-k3s install-kubevirt install-kubevirt-stack install-gpu-operator convert-images deploy-hub \
       install-cdi install-local-path configure-local-path

run:
	ENV=development go run .

dev:
	ENV=development $(shell go env GOPATH)/bin/air && tailscale funnel --bg --https=443 8080

prod:
	ENV=production go run .

build:
	mkdir -p dist
	go build -o dist/vm .

build-linux:
	@echo "Cross-compiling for Linux AMD64..."
	mkdir -p dist
	GOOS=linux GOARCH=amd64 go build -o dist/vm-orchestration-linux .
	@echo "✅ Built dist/vm-orchestration-linux"

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

# KubeVirt Backend Installation Targets

install-k3s:
	@echo "Installing k3s..."
	@curl -sfL https://get.k3s.io | sh -s - --disable=traefik
	@echo "✅ k3s installed"
	@echo "Kubeconfig: /etc/rancher/k3s/k3s.yaml"

install-k3s-cluster:
	@echo "Installing k3s with cluster-init (multi-node ready)..."
	@curl -sfL https://get.k3s.io | sh -s - --cluster-init --disable=traefik
	@echo "✅ k3s cluster initialized"
	@echo "To join nodes: curl -sfL https://get.k3s.io | K3S_URL=https://<IP>:6443 K3S_TOKEN=<token> sh -"

install-kubevirt:
	@echo "Installing KubeVirt..."
	@export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
		kubectl apply -f https://github.com/kubevirt/kubevirt/releases/download/v1.3.0/kubevirt-operator.yaml && \
		kubectl wait --for=condition=available --timeout=300s deployment/virt-operator -n kubevirt && \
		kubectl apply -f https://github.com/kubevirt/kubevirt/releases/download/v1.3.0/kubevirt-cr.yaml && \
		kubectl wait --for=condition=Available --timeout=600s kubevirt/kubevirt -n kubevirt
	@echo "✅ KubeVirt installed"

install-gpu-operator:
	@echo "Installing NVIDIA GPU Operator..."
	@helm repo add nvidia https://helm.ngc.nvidia.com/nvidia || true
	@helm repo update
	@export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
		helm install --wait gpu-operator nvidia/gpu-operator \
			--namespace gpu-operator --create-namespace \
			--set driver.enabled=true \
			--set toolkit.enabled=true \
			--set devicePlugin.enabled=true
	@echo "✅ GPU Operator installed"

install-kubevirt-stack:
	@echo "Installing full KubeVirt stack..."
	@./scripts/install-kubevirt-stack.sh --cluster-init
	@echo "✅ Full stack installed"

install-kubevirt-stack-gpu:
	@echo "Installing full KubeVirt stack with GPU support..."
	@./scripts/install-kubevirt-stack.sh --cluster-init --with-gpu
	@echo "✅ Full stack with GPU installed"

install-kubevirt-backend: build
	@echo "Installing service with KubeVirt backend..."
	@go build -o /usr/local/bin/vm-orchestration .
	@mkdir -p /opt/vm-orchestration-service
	@cp .env.production /opt/vm-orchestration-service/
	@sed -i 's/VM_BACKEND=incus/VM_BACKEND=kubevirt/' /opt/vm-orchestration-service/.env.production || true
	@cp vm-orchestration.service /etc/systemd/system/
	@systemctl daemon-reload
	@systemctl enable vm-orchestration
	@systemctl restart vm-orchestration
	@echo "✅ Service installed with KubeVirt backend"

convert-images:
	@echo "Converting Incus images to ContainerDisk format..."
	@./scripts/convert-images.sh all ubuntu24-dev-cpu --registry localhost:30500
	@./scripts/convert-images.sh all ubuntu24-dev-gpu --registry localhost:30500
	@echo "✅ Images converted"

test-integration:
	@echo "Running integration tests..."
	@go test -tags=integration ./lib/... -v
	@echo "✅ Integration tests complete"

# Show cluster info
cluster-info:
	@export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
		kubectl get nodes && \
		echo "" && \
		kubectl get kubevirt -n kubevirt && \
		echo "" && \
		kubectl get pods -n kubevirt

# Show VM status
vm-status:
	@export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
		kubectl get vm -n uvacompute && \
		echo "" && \
		kubectl get vmi -n uvacompute

# Deploy to hub (DO VPS)
deploy-hub: build-linux
	@echo "Deploying vm-orchestration to hub (24.199.85.26)..."
	scp dist/vm-orchestration-linux root@24.199.85.26:/usr/local/bin/vm-orchestration
	scp hub.service root@24.199.85.26:/etc/systemd/system/vm-orchestration.service
	ssh root@24.199.85.26 "systemctl daemon-reload && systemctl enable vm-orchestration && systemctl restart vm-orchestration"
	@echo "✅ Deployed to hub"
	@echo "Check status: ssh root@24.199.85.26 'systemctl status vm-orchestration'"

# CDI and Storage Provisioner
CDI_VERSION ?= v1.59.0

install-cdi:
	@echo "Installing CDI (Containerized Data Importer) ${CDI_VERSION}..."
	@export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
		kubectl apply -f https://github.com/kubevirt/containerized-data-importer/releases/download/${CDI_VERSION}/cdi-operator.yaml && \
		kubectl wait --for=condition=available --timeout=300s deployment/cdi-operator -n cdi && \
		kubectl apply -f https://github.com/kubevirt/containerized-data-importer/releases/download/${CDI_VERSION}/cdi-cr.yaml && \
		kubectl wait --for=condition=Available --timeout=600s cdi/cdi -n cdi
	@echo "✅ CDI installed"

install-local-path:
	@echo "Installing local-path-provisioner..."
	@export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
		kubectl apply -f https://raw.githubusercontent.com/rancher/local-path-provisioner/v0.0.26/deploy/local-path-storage.yaml && \
		kubectl patch storageclass local-path -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
	@echo "✅ local-path-provisioner installed"

configure-local-path:
	@echo "Configuring local-path-provisioner for UVACompute storage..."
	@export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
		kubectl patch configmap local-path-config -n local-path-storage --type=merge -p '{ \
			"data": { \
				"config.json": "{\"nodePathMap\":[{\"node\":\"DEFAULT_PATH_FOR_NON_LISTED_NODES\",\"paths\":[\"/var/lib/uvacompute/storage\"]}]}" \
			} \
		}'
	@echo "✅ local-path-provisioner configured"

install-storage-stack: install-cdi install-local-path configure-local-path
	@echo "✅ Full storage stack installed (CDI + local-path-provisioner)"

# Show storage status
storage-status:
	@export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
		echo "=== CDI Status ===" && \
		kubectl get cdi -n cdi && \
		echo "" && \
		kubectl get pods -n cdi && \
		echo "" && \
		echo "=== Storage Classes ===" && \
		kubectl get sc && \
		echo "" && \
		echo "=== local-path-provisioner ===" && \
		kubectl get pods -n local-path-storage