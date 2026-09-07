#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

PYTHON_BIN="${DAHONMD_GPU_PYTHON:-/home/feanne/.venvs/dahonmd-tf-gpu/bin/python}"
RUN_DIR="ai/artifacts/configuration_8_gpu"
CONFIG="ai/config/ablations/configuration_8_resnet101_thesis_teacher_gpu.json"
STATUS_FILE="ai/artifacts/configuration_8/training_status.txt"
SSL_INTERMEDIATE_GLOB="ssl_checkpoint_epoch_*.complete"

export TF_GPU_ALLOCATOR="${TF_GPU_ALLOCATOR:-cuda_malloc_async}"
export TF_CPP_MIN_LOG_LEVEL="${TF_CPP_MIN_LOG_LEVEL:-1}"

mkdir -p "$RUN_DIR"

write_status() {
  printf '%s\n' "$1" > "$STATUS_FILE"
}

trap 'write_status "failed"' ERR

"$PYTHON_BIN" -c 'import sys, tensorflow as tf; devices = tf.config.list_physical_devices("GPU"); print("GPU devices:", devices); sys.exit(0 if devices else "No TensorFlow GPU detected; CPU training is disabled for this run")'

write_status "training_teacher"
teacher_args=(
  -u -m ai.training.train_teacher
  --config "$CONFIG"
)
if [[ -f "$RUN_DIR/resnet101_ssl_pretrained.keras" ]]; then
  teacher_args+=(--resume-ssl)
elif compgen -G "$RUN_DIR/${SSL_INTERMEDIATE_GLOB}" > /dev/null; then
  teacher_args+=(--resume-ssl-intermediate)
fi
"$PYTHON_BIN" "${teacher_args[@]}"

write_status "complete"
