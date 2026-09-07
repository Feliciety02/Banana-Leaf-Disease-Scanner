#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

PYTHON_BIN="${DAHONMD_GPU_PYTHON:-/home/feanne/.venvs/dahonmd-tf-gpu/bin/python}"
CONFIG="ai/config/diagnostics/ca_mobilenetv3_supervised_imagenet.json"
RUN_DIR="ai/artifacts/four_class/enhanced/diagnostics/supervised_imagenet_seed42"
STATUS_FILE="$RUN_DIR/training_status.txt"
COMPLETE_FILE="$RUN_DIR/student_supervised_training.complete.json"

export TF_GPU_ALLOCATOR="${TF_GPU_ALLOCATOR:-cuda_malloc_async}"
export TF_CPP_MIN_LOG_LEVEL="${TF_CPP_MIN_LOG_LEVEL:-1}"

mkdir -p "$RUN_DIR"

write_status() {
  printf '%s\n' "$1" > "$STATUS_FILE"
}

trap 'write_status "failed"' ERR

"$PYTHON_BIN" -c 'import sys, tensorflow as tf; devices = tf.config.list_physical_devices("GPU"); print("GPU devices:", devices); sys.exit(0 if devices else "No TensorFlow GPU detected; CPU training is disabled for this run")'

if [[ -f "$COMPLETE_FILE" ]]; then
  echo "Enhanced supervised diagnostic is already complete: $COMPLETE_FILE"
  exit 0
fi

args=(
  -u -m ai.training.train_enhanced_supervised
  --config "$CONFIG"
)
if [[ -f "$RUN_DIR/latest_supervised_student.keras" && -f "$RUN_DIR/student_supervised_history.json" ]]; then
  args+=(--resume)
fi

write_status "training_enhanced_supervised"
"$PYTHON_BIN" "${args[@]}"
write_status "complete"
