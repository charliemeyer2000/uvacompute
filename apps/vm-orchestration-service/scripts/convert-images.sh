#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="${WORK_DIR:-/tmp/kubevirt-images}"
REGISTRY="${REGISTRY:-localhost:5000}"

usage() {
    cat << EOF
Convert Incus images to KubeVirt ContainerDisk format

Usage: $0 <command> [options]

Commands:
    export <image-name>    Export an Incus image
    convert <image-file>   Convert qcow2 to ContainerDisk
    push <image-name>      Push to container registry
    all <incus-image>      Export, convert, and push

Options:
    --registry <url>       Container registry URL (default: localhost:5000)
    --work-dir <path>      Working directory (default: /tmp/kubevirt-images)
    --tag <tag>            Image tag (default: latest)

Examples:
    $0 all ubuntu24-dev-cpu --registry docker.io/myuser
    $0 export ubuntu24-dev-gpu
    $0 convert ubuntu24-dev-gpu.tar.gz --tag v1.0
EOF
    exit 1
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
    echo "[ERROR] $*" >&2
    exit 1
}

check_dependencies() {
    local deps=("incus" "docker" "qemu-img")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            error "Required command '$dep' not found. Please install it first."
        fi
    done
}

export_incus_image() {
    local image_name="$1"
    local output_file="$WORK_DIR/${image_name}.tar.gz"

    log "Exporting Incus image: $image_name"

    mkdir -p "$WORK_DIR"

    if [[ -f "$output_file" ]]; then
        log "Image already exported: $output_file"
        return
    fi

    incus image export "local:$image_name" "$WORK_DIR/$image_name"

    if [[ -f "$WORK_DIR/${image_name}.tar.gz" ]]; then
        log "Exported to: $output_file"
    else
        error "Failed to export image"
    fi
}

extract_qcow2() {
    local archive="$1"
    local output_dir="$WORK_DIR/extracted"

    log "Extracting image archive: $archive"

    mkdir -p "$output_dir"
    tar -xzf "$archive" -C "$output_dir"

    local qcow2_file
    qcow2_file=$(find "$output_dir" -name "*.qcow2" -o -name "rootfs.img" | head -1)

    if [[ -z "$qcow2_file" ]]; then
        qcow2_file=$(find "$output_dir" -type f -name "*.img" | head -1)
    fi

    if [[ -z "$qcow2_file" ]]; then
        error "No disk image found in archive"
    fi

    echo "$qcow2_file"
}

convert_to_raw() {
    local input="$1"
    local output="$2"

    log "Converting to raw format: $input -> $output"

    qemu-img convert -f qcow2 -O raw "$input" "$output"

    log "Converted successfully"
}

build_containerdisk() {
    local disk_image="$1"
    local image_name="$2"
    local tag="${3:-latest}"

    local full_image="$REGISTRY/$image_name:$tag"
    local dockerfile="$WORK_DIR/Dockerfile"

    log "Building ContainerDisk image: $full_image"

    cat > "$dockerfile" << 'DOCKERFILE'
FROM scratch
ADD --chown=107:107 disk.qcow2 /disk/
DOCKERFILE

    cp "$disk_image" "$WORK_DIR/disk.qcow2"

    docker build -t "$full_image" -f "$dockerfile" "$WORK_DIR"

    log "Built image: $full_image"

    rm -f "$WORK_DIR/disk.qcow2" "$dockerfile"
}

push_image() {
    local image_name="$1"
    local tag="${2:-latest}"

    local full_image="$REGISTRY/$image_name:$tag"

    log "Pushing image: $full_image"

    docker push "$full_image"

    log "Pushed successfully"
}

convert_all() {
    local incus_image="$1"
    local tag="${2:-latest}"

    log "Starting full conversion pipeline for: $incus_image"

    export_incus_image "$incus_image"

    local archive="$WORK_DIR/${incus_image}.tar.gz"
    local qcow2_file
    qcow2_file=$(extract_qcow2 "$archive")

    build_containerdisk "$qcow2_file" "$incus_image" "$tag"

    push_image "$incus_image" "$tag"

    rm -rf "$WORK_DIR/extracted"

    log "Conversion complete: $REGISTRY/$incus_image:$tag"
}

cleanup() {
    log "Cleaning up work directory: $WORK_DIR"
    rm -rf "$WORK_DIR"
}

TAG="latest"
while [[ $# -gt 0 ]]; do
    case $1 in
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --work-dir)
            WORK_DIR="$2"
            shift 2
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        export|convert|push|all|cleanup)
            COMMAND="$1"
            shift
            break
            ;;
        -h|--help)
            usage
            ;;
        *)
            break
            ;;
    esac
done

if [[ -z "${COMMAND:-}" ]]; then
    usage
fi

check_dependencies

case "$COMMAND" in
    export)
        [[ $# -lt 1 ]] && usage
        export_incus_image "$1"
        ;;
    convert)
        [[ $# -lt 1 ]] && usage
        qcow2_file=$(extract_qcow2 "$1")
        image_name=$(basename "$1" .tar.gz)
        build_containerdisk "$qcow2_file" "$image_name" "$TAG"
        ;;
    push)
        [[ $# -lt 1 ]] && usage
        push_image "$1" "$TAG"
        ;;
    all)
        [[ $# -lt 1 ]] && usage
        convert_all "$1" "$TAG"
        ;;
    cleanup)
        cleanup
        ;;
    *)
        usage
        ;;
esac

log "Done!"
