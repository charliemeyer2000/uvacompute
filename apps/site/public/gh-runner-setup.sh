#!/usr/bin/env bash
#
# gh-runner-setup.sh — install a GitHub Actions ephemeral runner inside a uvacompute VM
#
# usage (run inside the VM via ssh):
#   curl -fsSL https://uvacompute.com/gh-runner-setup.sh | bash -s -- \
#     --url https://github.com/OWNER/REPO \
#     --token AXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
#
# the runner will pick up ONE job, execute it, then exit.
#
set -euo pipefail

RUNNER_VERSION="2.322.0"
RUNNER_DIR="${HOME}/actions-runner"
RUNNER_LABELS="uvacompute,gpu"
RUNNER_NAME="uva-$(hostname)-$$"

usage() {
    cat <<EOF
usage: $0 --url <repo-or-org-url> --token <registration-token> [options]

required:
  --url      github repo or org url (e.g. https://github.com/OWNER/REPO)
  --token    runner registration token (from github settings)

optional:
  --labels   comma-separated labels (default: uvacompute,gpu)
  --name     runner name (default: auto-generated)
  --group    runner group (org-level only)
  --version  runner version (default: ${RUNNER_VERSION})

get a registration token:
  gh api -X POST repos/OWNER/REPO/actions/runners/registration-token --jq .token

or for an org:
  gh api -X POST orgs/ORG/actions/runners/registration-token --jq .token
EOF
    exit 1
}

GITHUB_URL=""
REG_TOKEN=""
RUNNER_GROUP=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --url)      GITHUB_URL="$2"; shift 2 ;;
        --token)    REG_TOKEN="$2"; shift 2 ;;
        --labels)   RUNNER_LABELS="$2"; shift 2 ;;
        --name)     RUNNER_NAME="$2"; shift 2 ;;
        --group)    RUNNER_GROUP="$2"; shift 2 ;;
        --version)  RUNNER_VERSION="$2"; shift 2 ;;
        -h|--help)  usage ;;
        *)          echo "unknown option: $1"; usage ;;
    esac
done

[[ -z "$GITHUB_URL" ]] && { echo "error: --url is required"; usage; }
[[ -z "$REG_TOKEN" ]] && { echo "error: --token is required"; usage; }

echo "==> installing github actions runner ${RUNNER_VERSION}"
echo "    url:    ${GITHUB_URL}"
echo "    name:   ${RUNNER_NAME}"
echo "    labels: ${RUNNER_LABELS}"
echo ""

# detect arch
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64|amd64) RUNNER_ARCH="x64" ;;
    aarch64|arm64) RUNNER_ARCH="arm64" ;;
    *) echo "error: unsupported architecture: $ARCH"; exit 1 ;;
esac

# install dependencies
if command -v apt-get &>/dev/null; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq curl tar jq libicu-dev >/dev/null 2>&1
elif command -v dnf &>/dev/null; then
    sudo dnf install -y -q curl tar jq libicu >/dev/null 2>&1
fi

# download runner
mkdir -p "${RUNNER_DIR}"
cd "${RUNNER_DIR}"

RUNNER_TAR="actions-runner-linux-${RUNNER_ARCH}-${RUNNER_VERSION}.tar.gz"
RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_TAR}"

if [[ ! -f ".runner_extracted" ]]; then
    echo "==> downloading runner..."
    curl -fsSL -o "${RUNNER_TAR}" "${RUNNER_URL}"
    tar xzf "${RUNNER_TAR}"
    rm -f "${RUNNER_TAR}"
    touch .runner_extracted
fi

# configure as ephemeral runner
echo "==> configuring ephemeral runner..."

CONFIGURE_ARGS=(
    --url "${GITHUB_URL}"
    --token "${REG_TOKEN}"
    --name "${RUNNER_NAME}"
    --labels "${RUNNER_LABELS}"
    --ephemeral
    --unattended
    --replace
)

[[ -n "$RUNNER_GROUP" ]] && CONFIGURE_ARGS+=(--runnergroup "${RUNNER_GROUP}")

./config.sh "${CONFIGURE_ARGS[@]}"

# run — the runner will pick up one job then exit (ephemeral mode)
echo "==> starting runner (ephemeral — will exit after one job)..."
echo ""
./run.sh
