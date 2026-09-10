#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

PYTHON_BIN="${DAHONMD_GPU_PYTHON:-/home/feanne/.venvs/dahonmd-tf-gpu/bin/python}"
RUN_ID="${DAHONMD_BASELINE_RUN_ID:-20260909_mobilenetv3small_split2878_seed42_run01}"
RUN_DIR="ai/artifacts/four_class/baseline/runs/$RUN_ID"
CONFIG="ai/config/ablations/configuration_1_mobilenetv3_small_supervised.json"
DATASET_DIR="datasets/banana_leaf_thesis_4class"
SPLIT_DIR="datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1"
LOG_FILE="$RUN_DIR/training.log"
STATUS_FILE="$RUN_DIR/training_status.txt"
COMPLETE_FILE="$RUN_DIR/baseline_training.complete.json"

export TF_GPU_ALLOCATOR="${TF_GPU_ALLOCATOR:-cuda_malloc_async}"
export TF_CPP_MIN_LOG_LEVEL="${TF_CPP_MIN_LOG_LEVEL:-1}"

mkdir -p "$RUN_DIR"

write_status() {
  printf '%s\n' "$1" > "$STATUS_FILE"
}

trap 'write_status "failed_or_interrupted"' ERR INT TERM

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "GPU Python is missing or not executable: $PYTHON_BIN" >&2
  exit 1
fi

for required in "$CONFIG" "$DATASET_DIR" "$SPLIT_DIR/split_summary.json"; do
  if [[ ! -e "$required" ]]; then
    echo "Required input is missing: $required" >&2
    exit 1
  fi
done

"$PYTHON_BIN" -c 'import sys, tensorflow as tf; devices=tf.config.list_physical_devices("GPU"); print("TensorFlow GPU devices:", devices); sys.exit(0 if devices else "No TensorFlow GPU detected")'

if [[ -f "$COMPLETE_FILE" ]]; then
  echo "Baseline run is already complete: $COMPLETE_FILE"
  exit 0
fi

if [[ -e "$RUN_DIR/best_baseline.keras" || -e "$RUN_DIR/baseline_history.json" ]]; then
  echo "Incomplete artifacts already exist in $RUN_DIR." >&2
  echo "Preserving them. Set a new DAHONMD_BASELINE_RUN_ID and launch again." >&2
  exit 1
fi

write_status "training"
"$PYTHON_BIN" -u -m ai.training.train_baseline \
  --config "$CONFIG" \
  --dataset-dir "$DATASET_DIR" \
  --final-split-dir "$SPLIT_DIR" \
  --output-dir "$RUN_DIR" \
  2>&1 | tee -a "$LOG_FILE"

sha256sum \
  "$RUN_DIR/best_baseline.keras" \
  "$RUN_DIR/baseline_history.json" \
  "$RUN_DIR/baseline_experiment_config.json" \
  "$SPLIT_DIR/split_summary.json" \
  > "$RUN_DIR/checksums.sha256"

printf '{\n  "status": "complete",\n  "run_id": "%s",\n  "test_partition_evaluated": false,\n  "checkpoint": "best_baseline.keras",\n  "history": "baseline_history.json",\n  "checksums": "checksums.sha256"\n}\n' "$RUN_ID" > "$COMPLETE_FILE"
write_status "complete"

echo "Baseline training complete: $RUN_DIR"
echo "The locked test set has not been evaluated."
