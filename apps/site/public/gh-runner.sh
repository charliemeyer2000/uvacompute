#!/usr/bin/env bash
#
# gh-runner.sh — spin up a uvacompute container job as an ephemeral GitHub Actions runner
#
# usage (run from your local machine):
#   ./gh-runner.sh --repo OWNER/REPO
#   ./gh-runner.sh --repo OWNER/REPO --gpu 1 --cpus 4 --ram 16
#   ./gh-runner.sh --org MY-ORG
#
# requires: uva cli (authenticated), gh cli (authenticated)
#
set -euo pipefail

VM_CPUS=4
VM_RAM=16
VM_DISK=64
VM_GPUS=0
VM_GPU_TYPE="5090"
REPO=""
ORG=""
RUNNER_LABELS="uvacompute"

usage() {
    cat <<EOF
usage: $0 --repo OWNER/REPO [options]
       $0 --org ORG [options]

required (one of):
  --repo     github repo (e.g. myorg/myrepo)
  --org      github org for org-level runner

options:
  --cpus     number of CPUs (default: ${VM_CPUS})
  --ram      RAM in GB (default: ${VM_RAM})
  --disk     disk in GB (default: ${VM_DISK})
  --gpu      number of GPUs (default: ${VM_GPUS})
  --gpu-type GPU type (default: ${VM_GPU_TYPE})

runner options:
  --labels   extra labels, comma-separated (default: ${RUNNER_LABELS})
EOF
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --repo)     REPO="$2"; shift 2 ;;
        --org)      ORG="$2"; shift 2 ;;
        --cpus)     VM_CPUS="$2"; shift 2 ;;
        --ram)      VM_RAM="$2"; shift 2 ;;
        --disk)     VM_DISK="$2"; shift 2 ;;
        --gpu)      VM_GPUS="$2"; shift 2 ;;
        --gpu-type) VM_GPU_TYPE="$2"; shift 2 ;;
        --labels)   RUNNER_LABELS="$2"; shift 2 ;;
        -h|--help)  usage ;;
        *)          echo "unknown option: $1"; usage ;;
    esac
done

[[ -z "$REPO" && -z "$ORG" ]] && { echo "error: --repo or --org is required"; usage; }

# check dependencies
command -v uva >/dev/null 2>&1 || { echo "error: uva cli not found. install: curl -fsSL https://uvacompute.com/install.sh | bash"; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "error: gh cli not found. install: https://cli.github.com"; exit 1; }

# get registration token from github
echo "==> getting runner registration token from github..."
if [[ -n "$REPO" ]]; then
    GITHUB_URL="https://github.com/${REPO}"
    REG_TOKEN="$(gh api -X POST "repos/${REPO}/actions/runners/registration-token" --jq .token)"
else
    GITHUB_URL="https://github.com/${ORG}"
    REG_TOKEN="$(gh api -X POST "orgs/${ORG}/actions/runners/registration-token" --jq .token)"
fi

# add gpu label if gpus requested
if [[ "$VM_GPUS" -gt 0 ]]; then
    RUNNER_LABELS="${RUNNER_LABELS},gpu"
fi

# generate job name
JOB_NAME="gh-runner-$(date +%s)-$$"

echo "==> creating uvacompute runner job: ${JOB_NAME}"
echo "    cpus=${VM_CPUS} ram=${VM_RAM}gb disk=${VM_DISK}gb gpus=${VM_GPUS}"

RUNNER_VERSION="2.331.0"

# build job args
JOB_ARGS=(
    -n "$JOB_NAME"
    -c "$VM_CPUS"
    -r "$VM_RAM"
    -d "$VM_DISK"
)

if [[ "$VM_GPUS" -gt 0 ]]; then
    JOB_ARGS+=(-g "$VM_GPUS" -t "$VM_GPU_TYPE")
fi

uva jobs run "${JOB_ARGS[@]}" ubuntu:22.04 -- /bin/bash -c "
set -ex
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq curl tar jq libicu-dev

useradd -m runner
mkdir -p /home/runner/actions-runner && cd /home/runner/actions-runner

ARCH=\$(uname -m)
case \"\$ARCH\" in
    x86_64|amd64) RUNNER_ARCH=\"x64\" ;;
    aarch64|arm64) RUNNER_ARCH=\"arm64\" ;;
    *) echo \"error: unsupported architecture: \$ARCH\"; exit 1 ;;
esac

RUNNER_TAR=\"actions-runner-linux-\${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz\"
curl -fsSL -o \"\${RUNNER_TAR}\" \"https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/\${RUNNER_TAR}\"
tar xzf \"\${RUNNER_TAR}\" && rm -f \"\${RUNNER_TAR}\"
chown -R runner:runner /home/runner/actions-runner

su - runner -c \"cd /home/runner/actions-runner && ./config.sh --url '${GITHUB_URL}' --token '${REG_TOKEN}' --name '${JOB_NAME}' --labels '${RUNNER_LABELS}' --ephemeral --unattended --replace\"
su - runner -c \"cd /home/runner/actions-runner && ./run.sh\"
"

echo "==> runner job started: ${JOB_NAME}"
echo "==> the runner will pick up one job then exit"
echo ""
echo "to monitor: uva jobs logs ${JOB_NAME}"
echo "to cancel:  uva jobs cancel ${JOB_NAME}"
