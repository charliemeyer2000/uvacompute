#!/usr/bin/env bash

set -euo pipefail

BASE_URL="https://uvacompute.com"
BINARY_NAME="uva"
TARGET_DIR="${HOME}/.local/bin"
MAN_DIR="${HOME}/.local/share/man/man1"

die() {
    echo "Error: $*" >&2
    exit 1
}

detect_platform() {
    local os arch
    os="$(uname -s)"
    arch="$(uname -m)"

    case "$os" in
        Linux)
            case "$arch" in
                x86_64|amd64) echo "uvacompute-linux" ;;
                aarch64|arm64) die "ARM64 Linux is not currently supported" ;;
                *) die "Unsupported Linux architecture: $arch" ;;
            esac
            ;;
        Darwin)
            case "$arch" in
                x86_64|arm64) echo "uvacompute-macos" ;;
                *) die "Unsupported macOS architecture: $arch" ;;
            esac
            ;;
        *)
            die "Unsupported operating system: $os (supported: Linux x86_64, macOS x86_64/arm64)"
            ;;
    esac
}

show_success() {
    echo
    echo -e "\033[0;32m✓ Installation complete!\033[0m"
    
    if [[ -f "${MAN_DIR}/uva.1" ]]; then
        echo -e "\033[0;32mFor help: man ${BINARY_NAME}\033[0m"
    fi
    
    echo -e "\033[0;32mTo get started: ${BINARY_NAME} login\033[0m"
    echo
}

show_path_instructions() {
    echo
    echo -e "\033[0;32mTo use the '${BINARY_NAME}' command, add '\${HOME}/.local/bin' to your PATH:\033[0m"
    echo
    
    case "${SHELL##*/}" in
        bash)
            echo -e "\033[1m  echo 'export PATH=\"\${HOME}/.local/bin:\$PATH\"' >> ~/.bashrc && source ~/.bashrc\033[0m"
            ;;
        zsh)
            echo -e "\033[1m  echo 'export PATH=\"\${HOME}/.local/bin:\$PATH\"' >> ~/.zshrc && source ~/.zshrc\033[0m"
            ;;
        *)
            echo -e "\033[1m  echo 'export PATH=\"\${HOME}/.local/bin:\$PATH\"' >> ~/.profile && source ~/.profile\033[0m"
            ;;
    esac
    
    echo
    if [[ -f "${MAN_DIR}/uva.1" ]]; then
        echo -e "\033[0;32mFor help: man ${BINARY_NAME}\033[0m"
    fi
    echo -e "\033[0;32mTo get started: ${BINARY_NAME} login\033[0m"
    echo
}

main() {
    local binary_file tmpdir target_file
    
    binary_file="$(detect_platform)"
    tmpdir="$(mktemp -d)" || die "Failed to create temporary directory"
    trap 'rm -rf "${tmpdir:-}"' EXIT
    
    target_file="${TARGET_DIR}/${BINARY_NAME}"
    
    mkdir -p "$TARGET_DIR" || die "Failed to create $TARGET_DIR"
    mkdir -p "$MAN_DIR" || die "Failed to create $MAN_DIR"
    
    echo "Downloading ${BINARY_NAME} CLI..."
    curl -fsSL -o "${tmpdir}/${binary_file}" \
        "${BASE_URL}/api/downloads/cli/latest/${binary_file}" \
        || die "Failed to download binary"
    
    mv "${tmpdir}/${binary_file}" "$target_file" || die "Failed to install binary"
    chmod +x "$target_file" || die "Failed to make binary executable"
    
    echo "Downloading man page..."
    if curl -fsSL -o "${tmpdir}/uva.1" "${BASE_URL}/api/downloads/cli/latest/uva.1" 2>/dev/null; then
        mv "${tmpdir}/uva.1" "${MAN_DIR}/uva.1" 2>/dev/null || true
    fi
    
    echo "Successfully installed ${BINARY_NAME} CLI"
    
    if "$target_file" --version >/dev/null 2>&1; then
        echo "Version: $("$target_file" --version)"
    fi
    
    if [[ ":$PATH:" == *":$TARGET_DIR:"* ]]; then
        show_success
    else
        show_path_instructions
    fi
}

main "$@"