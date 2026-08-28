#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

PYTHON_BIN="${DAHONMD_GPU_PYTHON:-/home/feanne/.venvs/dahonmd-tf-gpu/bin/python}"
TEACHER_RUN="ai/artifacts/four_class/teacher/runs/20260829_seed42_run01"
TEACHER_SELECTED="ai/artifacts/four_class/teacher/selected"
ENHANCED_RUN="ai/artifacts/four_class/enhanced/runs/20260829_seed42_run01"
ENHANCED_SELECTED="ai/artifacts/four_class/enhanced/selected"
STATUS_FILE="ai/artifacts/four_class/training_status.txt"
SSL_INTERMEDIATE_GLOB="ssl_checkpoint_epoch_*.complete"

export TF_GPU_ALLOCATOR="${TF_GPU_ALLOCATOR:-cuda_malloc_async}"
export TF_CPP_MIN_LOG_LEVEL="${TF_CPP_MIN_LOG_LEVEL:-1}"

mkdir -p "$TEACHER_RUN" "$TEACHER_SELECTED" "$ENHANCED_RUN" "$ENHANCED_SELECTED"

write_status() {
  printf '%s\n' "$1" > "$STATUS_FILE"
}

trap 'write_status "failed"' ERR

"$PYTHON_BIN" -c 'import sys, tensorflow as tf; devices = tf.config.list_physical_devices("GPU"); print("GPU devices:", devices); sys.exit(0 if devices else "No TensorFlow GPU detected; CPU training is disabled for this run")'

if [[ ! -f "$TEACHER_RUN/best_teacher.keras" ]]; then
  write_status "training_teacher"
  teacher_args=(
    -u -m ai.training.train_teacher
    --config ai/config/four_class_teacher_gpu.json
  )
  if [[ -f "$TEACHER_RUN/resnet101_ssl_pretrained.keras" ]]; then
    teacher_args+=(--resume-ssl)
  elif compgen -G "$TEACHER_RUN/${SSL_INTERMEDIATE_GLOB}" > /dev/null; then
    teacher_args+=(--resume-ssl-intermediate)
  fi
  "$PYTHON_BIN" "${teacher_args[@]}"
fi

cp "$TEACHER_RUN/best_teacher.keras" "$TEACHER_SELECTED/best_teacher.keras"
cp "$TEACHER_RUN/teacher_history.json" "$TEACHER_SELECTED/teacher_history.json"
cp "$TEACHER_RUN/label_map.json" "$TEACHER_SELECTED/label_map.json"
cp "$TEACHER_RUN/experiment_config.json" "$TEACHER_SELECTED/experiment_config.json"

if [[ ! -f "$ENHANCED_RUN/best_student.keras" ]]; then
  write_status "training_enhanced_student"
  "$PYTHON_BIN" -u -m ai.training.train_student \
    --config ai/config/four_class_enhanced_gpu.json \
    --teacher-model "$TEACHER_RUN/best_teacher.keras"
fi

cp "$ENHANCED_RUN/best_student.keras" "$ENHANCED_SELECTED/best_student.keras"
cp "$ENHANCED_RUN/student_history.json" "$ENHANCED_SELECTED/student_history.json"
cp "$ENHANCED_RUN/label_map.json" "$ENHANCED_SELECTED/label_map.json"
cp "$ENHANCED_RUN/experiment_config.json" "$ENHANCED_SELECTED/experiment_config.json"

write_status "complete"
