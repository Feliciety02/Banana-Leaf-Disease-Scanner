#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

PYTHON_BIN="${DAHONMD_GPU_PYTHON:-/home/feanne/.venvs/dahonmd-tf-gpu/bin/python}"
MODE="${1:-imagenet}"
SSL_SOURCE="ai/artifacts/four_class/teacher/runs/20260829_seed42_run01/resnet101_ssl_pretrained.keras"

export TF_GPU_ALLOCATOR="${TF_GPU_ALLOCATOR:-cuda_malloc_async}"
export TF_CPP_MIN_LOG_LEVEL="${TF_CPP_MIN_LOG_LEVEL:-1}"

if pgrep -af 'ai[.]training[.]train_teacher' >/dev/null; then
  echo "A teacher process is already running. Stop it before starting a diagnostic." >&2
  pgrep -af 'ai[.]training[.]train_teacher' >&2
  exit 1
fi

"$PYTHON_BIN" -c 'import sys, tensorflow as tf; devices = tf.config.list_physical_devices("GPU"); print("GPU devices:", devices); sys.exit(0 if devices else "No TensorFlow GPU detected")'

run_diagnostic() {
  local name="$1"
  local config="$2"
  local run_dir="$3"
  shift 3
  local status_file="$run_dir/training_status.txt"
  local completion_marker="$run_dir/teacher_training.complete.json"
  local args=(
    -u -m ai.training.train_teacher
    --config "$config"
    --status-file "$status_file"
  )

  mkdir -p "$run_dir"
  if [[ -f "$completion_marker" ]]; then
    echo "Diagnostic '$name' is already complete: $completion_marker"
    return
  fi

  if [[ -f "$run_dir/best_teacher.keras" && -f "$run_dir/teacher_finetune_history.json" ]]; then
    args+=(--resume-finetune)
  else
    args+=("$@")
  fi

  echo "Starting diagnostic '$name'"
  "$PYTHON_BIN" "${args[@]}" \
    > >(tee -a "$run_dir/diagnostic.out.log") \
    2> >(tee -a "$run_dir/diagnostic.err.log" >&2)
}

run_imagenet() {
  run_diagnostic \
    "imagenet_frozen_bn" \
    "ai/config/diagnostics/resnet101_imagenet_frozen_bn.json" \
    "ai/artifacts/four_class/teacher/diagnostics/imagenet_frozen_bn_seed42" \
    --imagenet-only
}

run_ssl() {
  if [[ ! -f "$SSL_SOURCE" ]]; then
    echo "Completed SSL source model not found: $SSL_SOURCE" >&2
    exit 1
  fi
  run_diagnostic \
    "ssl_frozen_bn" \
    "ai/config/diagnostics/resnet101_ssl_frozen_bn.json" \
    "ai/artifacts/four_class/teacher/diagnostics/ssl_frozen_bn_seed42" \
    --initial-ssl-model "$SSL_SOURCE"
}

case "$MODE" in
  imagenet)
    run_imagenet
    ;;
  ssl)
    run_ssl
    ;;
  all)
    run_imagenet
    run_ssl
    ;;
  *)
    echo "Usage: bash ai/training/run_teacher_diagnostics_gpu.sh [imagenet|ssl|all]" >&2
    exit 2
    ;;
esac
