# DahonMD Balanced-Dataset Pilot Experiments

This file tracks only the current pilot series trained on the balanced,
quality-gated four-class dataset. Results from earlier exploratory splits are
not part of this series and must not be compared with the results below.

## Fixed pilot dataset

- Split version: `banana-leaf-thesis-split-2878-v1`
- Dataset root: `datasets/banana_leaf_thesis_4class`
- Split root: `datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1`
- Classes: healthy, sigatoka, panama disease, and cordana leaf spot
- Images per class: 2,878
- Total images: 11,512
- Training partition: 8,056 images (2,014 per class)
- Validation partition: 1,728 images (432 per class)
- Locked test partition: 1,728 images (432 per class)
- Split seed: 42
- Model-selection metric: validation macro-F1

The test partition remains locked until the model design, training settings,
teacher choice, and repeat seeds have all been finalized.

## Fresh-start rule

This is a new pilot series. Every supervised run must use the dataset and split
paths above and write to a new pilot-specific output directory. Earlier results
produced from `ai/artifacts/final_split` used the older 12,670-image exploratory
split and are excluded from this tracker.

The fresh SSL teacher experiment must perform SSL pretraining again using the
new pilot training partition. Do not pass `--initial-ssl-model`, because that
would reuse the encoder from the previous exploratory series.

The old exploratory experiment outputs and old `ai/artifacts/final_split`
directory were deleted on 2026-09-10. The source dataset, new balanced split,
and PILOT-01 artifacts were explicitly preserved.

## Current status

| ID | Sub-experiment | Status | Best validation result | Decision |
| --- | --- | --- | --- | --- |
| PILOT-01 | MobileNetV3-Small, ImageNet supervised baseline | **Complete** | Macro-F1 **0.92204**, accuracy **0.92245**, epoch 13 | New pilot baseline |
| PILOT-02 | Coordinate Attention MobileNetV3-Small, ImageNet supervised, no KD | **Complete** | Macro-F1 **0.94950**, accuracy **0.94965**, epoch 27 | Beat PILOT-01 by 0.02746 |
| PILOT-03 | ResNet-101 ImageNet-only teacher | **Run next** | Pending | Establishes the non-SSL teacher control |
| PILOT-04 | ResNet-101 fresh SSL pretraining plus supervised fine-tuning | Pending | Pending | Tests whether SSL helps on the new dataset |
| PILOT-05 | Teacher selection | Blocked by PILOT-03 and PILOT-04 | Pending | Select the higher validation macro-F1 teacher |
| PILOT-06 | Coordinate Attention student with KD from selected teacher | Blocked by PILOT-05 | Pending | Tests whether KD beats PILOT-02 |
| PILOT-07 | Multi-seed confirmation of the selected student | Blocked by PILOT-06 | Pending | Require a consistent result across declared seeds |
| PILOT-08 | One-time locked test evaluation | Blocked by PILOT-07 | Pending | Final reporting only; no further tuning afterward |

PILOT-01 and PILOT-02 used the new split and are the only completed results
currently eligible for comparisons in this series. Their checkpoints are:

```text
ai/artifacts/four_class/baseline/runs/20260909_mobilenetv3small_split2878_seed42_run01/best_baseline.keras
ai/artifacts/four_class/pilot_2878_v1/pilot_02_ca_supervised_seed42/best_supervised_student.keras
```

## Common WSL setup

Run this once in each new WSL shell before launching a sub-experiment:

```bash
cd "/mnt/d/Fe Anne's Repository/Banana Leaf Disease Scanner"
set -o pipefail

PYTHON_BIN="/home/feanne/.venvs/dahonmd-tf-gpu/bin/python"
DATASET_DIR="datasets/banana_leaf_thesis_4class"
SPLIT_DIR="datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1"
PILOT_ROOT="ai/artifacts/four_class/pilot_2878_v1"

mkdir -p "$PILOT_ROOT"

"$PYTHON_BIN" -c 'import tensorflow as tf; print(tf.config.list_physical_devices("GPU"))'
pgrep -af 'ai[.]training[.](train_baseline|train_enhanced_supervised|train_teacher|train_student)' || true
```

Launch only one GPU training process at a time.

## PILOT-01: supervised baseline — complete

The baseline was trained from ImageNet initialization with a 20-epoch frozen
backbone phase followed by a 10-epoch fine-tuning phase. The command that
produced the completed run was:

```bash
bash ai/training/run_baseline_frozen_split_gpu.sh
```

Do not rerun PILOT-01 unless performing a declared repeat seed. The best
validation checkpoint came from epoch 13 during the frozen-backbone phase.

## PILOT-02: Coordinate Attention without KD — complete

This run tests the student architecture alone. It must finish before knowledge
distillation so the effect of Coordinate Attention is not mixed with the effect
of a teacher.

```bash
cd "/mnt/d/Fe Anne's Repository/Banana Leaf Disease Scanner"
set -o pipefail

PYTHON_BIN="/home/feanne/.venvs/dahonmd-tf-gpu/bin/python"
DATASET_DIR="datasets/banana_leaf_thesis_4class"
SPLIT_DIR="datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1"
PILOT_ROOT="ai/artifacts/four_class/pilot_2878_v1"
OUT="$PILOT_ROOT/pilot_02_ca_supervised_seed42"

mkdir -p "$OUT"

"$PYTHON_BIN" -u -m ai.training.train_enhanced_supervised \
  --config ai/config/diagnostics/ca_mobilenetv3_supervised_imagenet.json \
  --dataset-dir "$DATASET_DIR" \
  --final-split-dir "$SPLIT_DIR" \
  --output-dir "$OUT" \
  2>&1 | tee "$OUT/training.log"
```

If interrupted after a completed epoch, use the same values and append
`--resume` to the command. Select by the `value` in
`student_supervised_validation_metrics.json` and compare it with **0.92204**.
The current completion file also contains a legacy `beats_baseline` Boolean
based on 0.91231; ignore that Boolean for this pilot.

The selected epoch was 27, with validation macro-F1 **0.94950** and validation
accuracy **0.94965**. This exceeded PILOT-01 by 0.02746 macro-F1.

## PILOT-03: ImageNet-only ResNet-101 teacher — run next

This is the teacher control: five head-warm-up epochs followed by backbone
fine-tuning, with transferred BatchNorm layers frozen.

```bash
cd "/mnt/d/Fe Anne's Repository/Banana Leaf Disease Scanner"
set -o pipefail

PYTHON_BIN="/home/feanne/.venvs/dahonmd-tf-gpu/bin/python"
DATASET_DIR="datasets/banana_leaf_thesis_4class"
SPLIT_DIR="datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1"
PILOT_ROOT="ai/artifacts/four_class/pilot_2878_v1"
OUT="$PILOT_ROOT/pilot_03_teacher_imagenet_seed42"

mkdir -p "$OUT"

"$PYTHON_BIN" -u -m ai.training.train_teacher \
  --config ai/config/diagnostics/resnet101_imagenet_frozen_bn.json \
  --dataset-dir "$DATASET_DIR" \
  --final-split-dir "$SPLIT_DIR" \
  --output-dir "$OUT" \
  --status-file "$OUT/training_status.txt" \
  --imagenet-only \
  2>&1 | tee "$OUT/training.log"
```

If supervised fine-tuning is interrupted after an epoch checkpoint, rerun the
same command with `--resume-finetune` in place of `--imagenet-only`.

## PILOT-04: fresh SSL ResNet-101 teacher

This run starts new SSL pretraining on the new training partition and then uses
the same supervised fine-tuning protocol as PILOT-03. It must not load the old
`resnet101_ssl_pretrained.keras` file.

```bash
cd "/mnt/d/Fe Anne's Repository/Banana Leaf Disease Scanner"
set -o pipefail

PYTHON_BIN="/home/feanne/.venvs/dahonmd-tf-gpu/bin/python"
DATASET_DIR="datasets/banana_leaf_thesis_4class"
SPLIT_DIR="datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1"
PILOT_ROOT="ai/artifacts/four_class/pilot_2878_v1"
OUT="$PILOT_ROOT/pilot_04_teacher_fresh_ssl_seed42"

mkdir -p "$OUT"

"$PYTHON_BIN" -u -m ai.training.train_teacher \
  --config ai/config/diagnostics/resnet101_ssl_frozen_bn.json \
  --dataset-dir "$DATASET_DIR" \
  --final-split-dir "$SPLIT_DIR" \
  --output-dir "$OUT" \
  --status-file "$OUT/training_status.txt" \
  2>&1 | tee "$OUT/training.log"
```

For an interruption during SSL pretraining, run the same command with
`--resume-ssl-intermediate`. If SSL pretraining finished and only supervised
fine-tuning remains, use `--resume-ssl`. If fine-tuning already wrote epoch
checkpoints, use `--resume-finetune`.

## PILOT-05: select the teacher

Read both validation-only result files:

```bash
cat "$PILOT_ROOT/pilot_03_teacher_imagenet_seed42/validation_metrics.json"
cat "$PILOT_ROOT/pilot_04_teacher_fresh_ssl_seed42/validation_metrics.json"
```

- If PILOT-04 is higher, SSL helped; use its `best_teacher.keras`.
- If PILOT-03 is equal or higher, SSL did not help; use the ImageNet-only
  `best_teacher.keras`.
- The selected teacher must beat the PILOT-01 baseline of **0.92204** before KD
  is allowed.

Do not use either teacher result from the old exploratory split.

## PILOT-06: Coordinate Attention student with KD

Choose the matching configuration and teacher path after PILOT-05. For an
ImageNet-only winner:

```bash
KD_CONFIG="ai/config/ablations/configuration_7_optional_ca_kd_non_ssl_teacher.json"
TEACHER_MODEL="$PILOT_ROOT/pilot_03_teacher_imagenet_seed42/best_teacher.keras"
OUT="$PILOT_ROOT/pilot_06_ca_kd_imagenet_teacher_seed42"
```

For a fresh-SSL winner:

```bash
KD_CONFIG="ai/config/ablations/configuration_4_ca_mobilenetv3_small_kd_ssl_teacher.json"
TEACHER_MODEL="$PILOT_ROOT/pilot_04_teacher_fresh_ssl_seed42/best_teacher.keras"
OUT="$PILOT_ROOT/pilot_06_ca_kd_ssl_teacher_seed42"
```

Then launch the selected branch with:

```bash
mkdir -p "$OUT"

"$PYTHON_BIN" -u -m ai.training.train_student \
  --config "$KD_CONFIG" \
  --dataset-dir "$DATASET_DIR" \
  --final-split-dir "$SPLIT_DIR" \
  --output-dir "$OUT" \
  --teacher-model "$TEACHER_MODEL" \
  2>&1 | tee "$OUT/training.log"
```

Compare `student_validation_metrics.json` with PILOT-02. KD passes only if its
validation macro-F1 is higher. Otherwise retain the supervised PILOT-02 model.

## PILOT-07: multi-seed confirmation

After selecting either PILOT-02 or PILOT-06, create frozen copies of its resolved
config for seeds 42, 1337, and 2026 under `ai/config/pilot_2878_v1/`. In each
copy, change only `runtime.seed`; the CLI `--output-dir` below keeps artifacts
separate. Do not change augmentation, learning rate, epoch limits, teacher, or
any other setting between seeds.

If PILOT-02 is selected, run:

```bash
for SEED in 42 1337 2026; do
  CONFIG="ai/config/pilot_2878_v1/ca_supervised_seed${SEED}.json"
  OUT="$PILOT_ROOT/pilot_07_selected_student_seed${SEED}"
  mkdir -p "$OUT"

  "$PYTHON_BIN" -u -m ai.training.train_enhanced_supervised \
    --config "$CONFIG" \
    --dataset-dir "$DATASET_DIR" \
    --final-split-dir "$SPLIT_DIR" \
    --output-dir "$OUT" \
    2>&1 | tee "$OUT/training.log"
done
```

If PILOT-06 is selected, set `TEACHER_MODEL` to the PILOT-05 winner and run:

```bash
for SEED in 42 1337 2026; do
  CONFIG="ai/config/pilot_2878_v1/ca_kd_selected_teacher_seed${SEED}.json"
  OUT="$PILOT_ROOT/pilot_07_selected_student_seed${SEED}"
  mkdir -p "$OUT"

  "$PYTHON_BIN" -u -m ai.training.train_student \
    --config "$CONFIG" \
    --dataset-dir "$DATASET_DIR" \
    --final-split-dir "$SPLIT_DIR" \
    --output-dir "$OUT" \
    --teacher-model "$TEACHER_MODEL" \
    2>&1 | tee "$OUT/training.log"
done
```

Run only the branch selected after PILOT-06. Report the mean and standard
deviation of validation macro-F1 across the three seeds.

## PILOT-08: locked test evaluation

Run the test partition exactly once after PILOT-07 has frozen the final seed,
model, and configuration. Set the three paths to the selected artifacts, then
run:

```bash
FINAL_CONFIG="path/to/selected/resolved_config.json"
FINAL_MODEL="path/to/selected/best_student.keras"
TEST_OUT="$PILOT_ROOT/pilot_08_locked_test"

mkdir -p "$TEST_OUT"

"$PYTHON_BIN" -u -m ai.evaluation.evaluate_student \
  --config "$FINAL_CONFIG" \
  --dataset-dir "$DATASET_DIR" \
  --final-split-dir "$SPLIT_DIR" \
  --output-dir "$TEST_OUT" \
  --student-model "$FINAL_MODEL" \
  --gradcam-count 5 \
  --latency-runs 100 \
  2>&1 | tee "$TEST_OUT/evaluation.log"
```

For a supervised winner, the model filename is
`best_supervised_student.keras`; for a KD winner, it is `best_student.keras`.
Record the concrete selected paths in this file before running the command.
Test results must not trigger more tuning.

## Rules for a valid pilot claim

- Use only `banana-leaf-thesis-split-2878-v1` for every pilot sub-experiment.
- Keep the exact train, validation, and test assignments unchanged.
- Never use validation or test images for SSL pretraining.
- Never use the test partition for model selection or hyperparameter tuning.
- Start every non-resume run in a new, empty output directory.
- Save the resolved config, random seed, history, validation result, and best
  checkpoint for every run.
- Change one experimental factor at a time.
- Report unsuccessful runs as well as the winner.
- Do not compare numerical results from the older exploratory split with this
  balanced-dataset pilot.
