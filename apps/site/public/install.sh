#!/usr/bin/env sh

set -e # Exit on any error

# Define the base URL and the name of the binary.
BASE_URL="https://uvacompute.com"
BINARY_NAME="uva"

# Check the operating system
OS="$(uname -s)"
ARCH="$(uname -m)"

TARGET_DIR_UNEXPANDED="\${HOME}/.local/bin"
TARGET_DIR="${HOME}/.local/bin"

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Make sure the target dir exists
mkdir -p "${TARGET_DIR}" || { echo "Failed to create target directory"; exit 1; }

# Define the target file path for the 'uva' CLI binary.
TARGET_FILE="${TARGET_DIR}/${BINARY_NAME}"

# Determine the correct binary name based on OS
if [ "$OS" = "Linux" ]; then
  case "${ARCH}" in
    x86_64|amd64)
      BINARY_FILE="uvacompute-linux"
      ;;
    aarch64|arm64)
      echo "ARM64 Linux is not currently supported" >&2
      exit 1
      ;;
    *)
      echo "Unsupported Linux architecture: ${ARCH}" >&2
      exit 1
      ;;
  esac
elif [ "$OS" = "Darwin" ]; then
  case "${ARCH}" in
    x86_64|arm64)
      BINARY_FILE="uvacompute-macos"
      ;;
    *)
      echo "Unsupported macOS architecture: ${ARCH}" >&2
      exit 1
      ;;
  esac
else
  echo "Unsupported operating system: ${OS}" >&2
  echo "Supported systems: Linux (x86_64), macOS (x86_64, arm64)" >&2
  exit 1
fi

# Set up temporary directory for download
TMPDIR=$(mktemp -d) || { echo "Failed to create temporary directory"; exit 1; }

# For now, we only support latest version via API
# Version support can be added later if needed
DOWNLOAD_URL="$BASE_URL/api/downloads/cli/latest/$BINARY_FILE"

# Download the 'uva' CLI binary from the specified URL.
echo "Downloading '${BINARY_NAME}' CLI binary..."
echo "curl -L -o \"${TMPDIR}/${BINARY_FILE}\" \"${DOWNLOAD_URL}\""
curl -L -o "${TMPDIR}/${BINARY_FILE}" "${DOWNLOAD_URL}" || { 
    echo "Failed to download binary from ${DOWNLOAD_URL}"
    echo "Please check that the version exists or try again later."
    rm -rf "${TMPDIR}"
    exit 1
}

# Verify the downloaded file is executable
if [ ! -f "${TMPDIR}/${BINARY_FILE}" ]; then
    echo "Downloaded file does not exist. Installation failed."
    rm -rf "${TMPDIR}"
    exit 1
fi

# Move the binary to the target directory and rename it to 'uva'.
mv "${TMPDIR}/${BINARY_FILE}" "${TARGET_FILE}" || { echo "Failed to move binary to target location"; exit 1; }

# Make the downloaded binary executable.
chmod +x "${TARGET_FILE}" || { echo "Failed to make binary executable"; exit 1; }

# Clean up the temporary directory.
rm -rf "${TMPDIR}" || { echo "Failed to clean up temporary directory"; exit 1; }

# Verify that the 'uva' CLI binary is successfully installed.
if [ -f "${TARGET_FILE}" ]; then
    echo "Successfully installed '${BINARY_NAME}' CLI."
    echo "The binary is located at '${TARGET_FILE}'."

    # Test if the binary works
    if "${TARGET_FILE}" --version >/dev/null 2>&1; then
        VERSION_OUTPUT=$("${TARGET_FILE}" --version)
        echo "Installed version: ${VERSION_OUTPUT}"
    fi

    # Check if the target directory is already in PATH
    if echo ":${PATH}:" | grep -q ":${TARGET_DIR}:"; then
        echo ""
        printf "\033[0;32m✓ '${TARGET_DIR}' is already in your PATH.\033[0m\n"
        printf "\033[0;32m✓ You can now use the '${BINARY_NAME}' command!\033[0m\n"
        printf "\033[0;32m\nTo get started, run: '${BINARY_NAME} login'\033[0m\n"
    else
        # Provide instructions for adding the target directory to the PATH.
        printf "\033[0;32m\n"
        printf "To use the '${BINARY_NAME}' command, add '${TARGET_DIR_UNEXPANDED}' to your PATH.\n"
        printf "You can do this by running one of the following commands, depending on your shell\n"
        printf "\033[0m\n"
        printf "\033[0;32mFor sh:\n"
        printf "\033[1m  echo 'export PATH=\"${TARGET_DIR_UNEXPANDED}:\$PATH\"' >> ~/.profile && source ~/.profile\033[0m\n"
        printf "\033[0;32m\n"
        printf "\033[0;32mFor bash:\n"
        printf "\033[1m  echo 'export PATH=\"${TARGET_DIR_UNEXPANDED}:\$PATH\"' >> ~/.profile && echo 'export PATH=\"${TARGET_DIR_UNEXPANDED}:\$PATH\"' >> ~/.bashrc && source ~/.profile\033[0m\n"
        printf "\033[0;32m\n"
        printf "\033[0;32mFor zsh:\n"
        printf "\033[1m  echo 'export PATH=\"${TARGET_DIR_UNEXPANDED}:\$PATH\"' >> ~/.zshrc && source ~/.zshrc\033[0m\n"
        printf "\033[0;32m\n"
        printf "After running the appropriate command, you can use '${BINARY_NAME}'.\033[0m\n"
        printf "\033[0;32m\n"
        printf "To get started, run: '${BINARY_NAME} login'\033[0m\n"
    fi
    printf "\033[0m\n"

else
    echo "Installation failed. '${BINARY_NAME}' CLI could not be installed."
    exit 1
fi