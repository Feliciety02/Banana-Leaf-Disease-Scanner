#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

PYTHON_BIN="/home/feanne/.venvs/dahonmd-tf-gpu/bin/python"
DATASET_DIR="/home/feanne/dahonmd-data/banana_leaf_thesis_4class"
SPLIT_DIR="datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1"
OUTPUT_DIR="ai/artifacts/four_class/pilot_2878_v1/pilot_04_teacher_fresh_ssl_seed42"
STATUS_FILE="$OUTPUT_DIR/training_status.txt"
LOG_FILE="$OUTPUT_DIR/training_bfc_resume.log"
PID_FILE="$OUTPUT_DIR/training.pid"
HISTORY_FILE="$OUTPUT_DIR/teacher_finetune_history.json"
NVIDIA_SMI="/usr/lib/wsl/lib/nvidia-smi"
COMPLETION_FILE="$OUTPUT_DIR/teacher_training.complete.json"

if [[ -f "$COMPLETION_FILE" ]]; then
  printf 'PILOT-04 is already complete: %s\n' "$COMPLETION_FILE"
  exit 0
fi

if active="$(pgrep -af 'ai[.]training[.]train_' || true)" && [[ -n "$active" ]]; then
  printf 'BLOCKED: a repository trainer is already active:\n%s\n' "$active" >&2
  exit 1
fi

for required in \
  "$PYTHON_BIN" \
  "$DATASET_DIR/cordana-leaf-spot/01hh.png" \
  "$SPLIT_DIR/split_summary.json" \
  "$OUTPUT_DIR/latest_teacher.keras" \
  "$HISTORY_FILE"
do
  if [[ ! -e "$required" ]]; then
    printf 'BLOCKED: required recovery artifact is missing: %s\n' "$required" >&2
    exit 1
  fi
done

completed_epochs="$("$PYTHON_BIN" -c 'import json, sys; print(len(json.load(open(sys.argv[1], encoding="utf-8"))))' "$HISTORY_FILE")"
if [[ ! "$completed_epochs" =~ ^[0-9]+$ ]] || (( completed_epochs < 1 )); then
  printf 'BLOCKED: fine-tuning history does not contain a valid completed epoch.\n' >&2
  exit 1
fi
printf 'Checkpoint verified: %s fine-tuning epochs complete; resume will start at epoch %s.\n' \
  "$completed_epochs" "$((completed_epochs + 1))"

if [[ ! -x "$NVIDIA_SMI" ]] || ! "$NVIDIA_SMI" --query-gpu=name --format=csv,noheader >/dev/null 2>&1; then
  printf 'BLOCKED: WSL cannot currently see the NVIDIA GPU.\n' >&2
  exit 1
fi

printf '\n===== PILOT-04 BFC FINE-TUNING RESUME %s =====\n' "$(date --iso-8601=seconds)" >> "$LOG_FILE"

# Clear a stale `failed` value before the child finishes TensorFlow startup.
printf 'training_teacher\n' > "$STATUS_FILE.tmp"
mv "$STATUS_FILE.tmp" "$STATUS_FILE"

TF_GPU_ALLOCATOR=BFC nohup "$PYTHON_BIN" -u -m ai.training.train_teacher \
  --config ai/config/diagnostics/resnet101_ssl_frozen_bn.json \
  --dataset-dir "$DATASET_DIR" \
  --final-split-dir "$SPLIT_DIR" \
  --output-dir "$OUTPUT_DIR" \
  --status-file "$STATUS_FILE" \
  --resume-finetune \
  >> "$LOG_FILE" 2>&1 &

trainer_pid=$!
printf '%s\n' "$trainer_pid" > "$PID_FILE"
sleep 3

if ! kill -0 "$trainer_pid" 2>/dev/null; then
  printf 'FAILED: trainer exited during startup. Latest log output:\n' >&2
  tail -n 40 "$LOG_FILE" >&2
  exit 1
fi

printf 'PILOT-04 resumed as PID %s.\n' "$trainer_pid"
printf 'Status: '
cat "$STATUS_FILE" 2>/dev/null || printf 'initializing\n'
printf 'Monitor with: tail -n 20 -F %s\n' "$LOG_FILE"
