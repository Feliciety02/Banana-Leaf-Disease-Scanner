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

| ID       | Sub-experiment                                                     | Status             | Best validation result                                                                                          | Decision                                        |
| -------- | ------------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| PILOT-01 | MobileNetV3-Small, ImageNet supervised baseline                    | **Complete** | Macro-F1**0.92204**, accuracy **0.92245**, epoch 13                                                 | New pilot baseline                              |
| PILOT-02 | Coordinate Attention MobileNetV3-Small, ImageNet supervised, no KD | **Complete** | Macro-F1**0.94950**, accuracy **0.94965**, epoch 27                                                 | Beat PILOT-01 by 0.02746                        |
| PILOT-03 | ResNet-101 ImageNet-only teacher                                   | **Complete** | Macro-F1**0.98320**, accuracy **0.98322**, epoch 20                                                 | Current teacher candidate                       |
| PILOT-04 | ResNet-101 fresh SSL pretraining plus supervised fine-tuning       | **Complete** | Macro-F1**0.65907**, accuracy **0.66551**, epoch 20                                                 | Did not beat the ImageNet-only teacher          |
| PILOT-05 | Teacher selection                                                  | **Complete** | Selected PILOT-03; lead over PILOT-04 is**0.32412** validation macro-F1                                   | Froze the higher validation macro-F1 teacher    |
| PILOT-06 | Coordinate Attention student with KD from selected teacher         | **Complete** | Macro-F1**0.96178**, epoch 29                                                                             | Beat PILOT-02 by 0.01228                        |
| PILOT-07 | Multi-seed confirmation of the selected student                    | **Complete** | Mean macro-F1**0.96229** ± **0.00097** across seeds 42/1337/2026; best seed 1337 **0.96341** | Froze PILOT-06 seed 42 as deployment checkpoint |
| PILOT-08 | One-time locked test evaluation                                    | **Complete** | Test macro-F1**0.96645**, accuracy **0.96644** on 1728 held-out images                              | Final result; no further tuning afterward       |

PILOT-01 through PILOT-06 used the new split and are eligible for comparisons
in this series. Their selected checkpoints are:

```text
ai/artifacts/four_class/baseline/runs/20260909_mobilenetv3small_split2878_seed42_run01/best_baseline.keras
ai/artifacts/four_class/pilot_2878_v1/pilot_02_ca_supervised_seed42/best_supervised_student.keras
ai/artifacts/four_class/pilot_2878_v1/pilot_03_teacher_imagenet_seed42/best_teacher.keras
ai/artifacts/four_class/pilot_2878_v1/pilot_06_ca_kd_imagenet_teacher_seed42/best_student.keras  ← frozen and deployed TFLite source
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

export TF_GPU_ALLOCATOR="${TF_GPU_ALLOCATOR:-BFC}"

"$PYTHON_BIN" -c 'import tensorflow as tf; print(tf.config.list_physical_devices("GPU"))'
pgrep -af 'ai[.]training[.](train_baseline|train_enhanced_supervised|train_teacher|train_student)' || true
nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free --format=csv,noheader
```

Launch only one GPU training process at a time. Close other GPU-heavy
applications if the memory check does not show most of the 4 GB GPU free.

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

## PILOT-03: ImageNet-only ResNet-101 teacher — complete

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

The run completed all 20 epochs. Its selected epoch was 20, with validation
macro-F1 **0.98320** and validation accuracy **0.98322**. The locked test set
was not evaluated.

## PILOT-04: fresh SSL ResNet-101 teacher — complete

This run performed new SSL pretraining on the new training partition and then
used the same supervised fine-tuning protocol as PILOT-03. It did not load the
old `resnet101_ssl_pretrained.keras` file.

```bash
cd "/mnt/d/Fe Anne's Repository/Banana Leaf Disease Scanner"
set -o pipefail

PYTHON_BIN="/home/feanne/.venvs/dahonmd-tf-gpu/bin/python"
DATASET_DIR="datasets/banana_leaf_thesis_4class"
SPLIT_DIR="datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1"
PILOT_ROOT="ai/artifacts/four_class/pilot_2878_v1"
OUT="$PILOT_ROOT/pilot_04_teacher_fresh_ssl_seed42"

export TF_GPU_ALLOCATOR="${TF_GPU_ALLOCATOR:-BFC}"

pgrep -af 'ai[.]training[.](train_baseline|train_enhanced_supervised|train_teacher|train_student)' || true
nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free --format=csv,noheader
mkdir -p "$OUT"

"$PYTHON_BIN" -u -m ai.training.train_teacher \
  --config ai/config/diagnostics/resnet101_ssl_frozen_bn.json \
  --dataset-dir "$DATASET_DIR" \
  --final-split-dir "$SPLIT_DIR" \
  --output-dir "$OUT" \
  --status-file "$OUT/training_status.txt" \
  2>&1 | tee "$OUT/training.log"
```

The first launch failed before completing batch 1 because TensorFlow had only
1.76 GB of the 4 GB GPU available. It produced no SSL checkpoint. Keep
`batch_size` at 2: at batch size 1, this implementation has no in-batch
negatives for its contrastive loss. Later WSL GPU-context failures showed that
`cuda_malloc_async` is unstable on this machine, so recovery uses TensorFlow's
BFC allocator instead. This changes allocation strategy, not model mathematics.

For an interruption during SSL pretraining, run the same command with
`--resume-ssl-intermediate`. If SSL pretraining finished and only supervised
fine-tuning remains, use `--resume-ssl`. If fine-tuning already wrote epoch
checkpoints, use `--resume-finetune`.

SSL completed all 100 epochs, and supervised fine-tuning completed all 20 epochs
after several recoverable Windows/WSL GPU-service interruptions. The selected
epoch is 20: validation accuracy **0.66551** and validation macro-F1 **0.65907**.
`teacher_training.complete.json` and `reproducibility_manifest.json` were written
on 2026-09-16. The locked test set was not evaluated. PILOT-03 remains far ahead
at validation macro-F1 **0.98320**, so PILOT-05 should retain PILOT-03 as the
teacher unless the declared gate reports otherwise.

No resume is required for this completed run. The guarded helper is retained as
a recovery reference and exits without launching when it finds the completion
marker:

```bash
bash ai/training/resume_pilot04.sh
```

If the recorded trainer PID still exists but epoch progress has stopped and WSL
does not respond, reset only the Ubuntu distro from PowerShell and relaunch the
same guarded helper:

```powershell
wsl.exe --terminate Ubuntu
wsl.exe -d Ubuntu --cd "/mnt/d/Fe Anne's Repository/Banana Leaf Disease Scanner" --exec bash ai/training/resume_pilot04.sh
```

Terminating the distro stops all Ubuntu processes, but it does not remove the
dataset or checkpoints. Do not delete `latest_teacher.keras`,
`best_teacher.keras`, or `teacher_finetune_history.json`.

Before continuing, verify that `nvidia-smi` succeeds and shows most of the 4 GB
GPU free. If it does not, close GPU-heavy applications and restore the WSL GPU
before retrying. The helper appends resumed output to
`training_bfc_resume.log`.

Safest stop: press `Ctrl+C` once in the original WSL training terminal. If that
terminal is unavailable, first obtain the current PID with the process-check
command below and then send that specific PID `SIGINT`; do not reuse a PID from
an earlier run.

To watch only output produced by the resumed run, open a second WSL terminal
and run:

```bash
cd "/mnt/d/Fe Anne's Repository/Banana Leaf Disease Scanner"

tail -n 20 -F ai/artifacts/four_class/pilot_2878_v1/pilot_04_teacher_fresh_ssl_seed42/training_bfc_resume.log
```

Plain `tail -f` prints the final ten lines already in the file, so it initially
shows the previous CUDA stack trace. `tail -n 0 -F` skips those old lines and
waits for newly appended output. It can remain blank for 15–20 minutes while
the resume process validates the dataset; a blank screen during that preflight
is normal. Pressing `Ctrl+C` here stops **only the monitor**, not the training.

To confirm the training process anytime:

```
pgrep -af "ai[.]training[.]train_teacher"
```

## PILOT-05: select the teacher

PILOT-05 through PILOT-08 are controlled by a CPU-only stage gate. It imports no
TensorFlow code, refuses incomplete runs, freezes every selection in an
immutable JSON record, and does not reveal the locked-test command early. Check
readiness at any time:

```bash
python -m ai.evaluation.pilot_pipeline status
```

PILOT-04 has written `teacher_training.complete.json`. Freeze the teacher choice
and prepare the matching PILOT-06 configuration:

```bash
python -m ai.evaluation.pilot_pipeline select-teacher
python -m ai.evaluation.pilot_pipeline prepare-pilot6
```

PILOT-05 completed on 2026-09-16. It selected PILOT-03
(`pilot_03_imagenet`) with validation macro-F1 **0.98320** over PILOT-04's
**0.65907**, preserved the locked-test assertion, and generated the PILOT-06
configuration.

The controller compares validation macro-F1 only. PILOT-04 must be strictly
higher to win; a tie retains the PILOT-03 ImageNet-only control. The selection,
artifact hashes, and untouched-test assertion are recorded in
`pilot_05_teacher_selection.json`.

Do not use either teacher result from the old exploratory split.

## PILOT-06: Coordinate Attention student with KD — complete

The generated configuration copies PILOT-02's resolved student protocol, enables
KD as the declared experimental change, and uses a shared decoded-image cache on
native WSL storage. Because ResNet-101 plus a training student cannot safely use
physical batch 32 on the 4 GB GPU, it uses micro-batch 4 with eight-step gradient
accumulation. The optimizer still receives one sample-weighted update per 32
images, including a correctly weighted final partial group. Validation uses
batch 32 because it holds no teacher or student gradients and therefore does not
alter training behavior.

PILOT-05 selected the PILOT-03 ImageNet teacher. The generated PILOT-06 run
completed 30 epochs and selected epoch 29 with validation macro-F1
**0.96178**. This exceeds PILOT-02's **0.94950** by **0.01228**. The locked
test set was not evaluated.

The completed run is recorded at:

```text
ai/artifacts/four_class/pilot_2878_v1/pilot_06_ca_kd_imagenet_teacher_seed42
```

If reproducing the run from a clean output directory, ask the gate for the
concrete launch command:

```bash
python -m ai.evaluation.pilot_pipeline pilot6-command
```

Copy and run the printed command only in a new, empty output directory. The gate
refuses to print it while another repository trainer is active or when the
output directory is nonempty. For the completed pilot, freeze the student choice
and prepare PILOT-07:

```bash
python -m ai.evaluation.pilot_pipeline select-student
python -m ai.evaluation.pilot_pipeline prepare-pilot7
```

KD passes only if its validation macro-F1 is strictly higher than PILOT-02;
otherwise the supervised PILOT-02 model remains selected.

## PILOT-07: multi-seed confirmation — complete

Seed 42 is the completed PILOT-06 run and is reused, not retrained. Seeds 1337
and 2026 confirm that the KD result is not a lucky seed. All three seeds ran the
same 30-epoch protocol on the frozen split. `pilot_07_final_selection.json`
records the result:

| Seed                 | Validation macro-F1  |
| -------------------- | -------------------- |
| 42 (PILOT-06)        | 0.96178              |
| 1337                 | **0.96341**          |
| 2026                 | 0.96169              |
| mean ± sample stddev | **0.96229 ± 0.00097** |

Seed 42 is the predeclared deployment checkpoint; seeds 1337 and 2026 are
robustness confirmations. The spread is under 0.001 macro-F1, so the KD gain
does not depend on a lucky seed.

### Crash history and recovery tooling

Seed 2026 crashed twice on unstable WSL/TensorFlow GPU events
(`Unexpected Event status: 1` / `IOT instruction`): once on 2026-09-16 after 13
epochs, and once on 2026-09-17 before epoch 1. The second crash followed an
`rm -rf` that had already destroyed the 13-epoch checkpoint, so the run started
over. To prevent another total loss, `train_student` now writes a per-epoch
`latest_student.keras` and `student_history.json` and accepts `--resume`
(added 2026-09-17). Resume restores the epoch, stage, early-stop counters, and
learning rate from history. The rerun then completed all 30 epochs, recovering
once from a mid-run crash without losing progress. Confirm liveness from WSL
with:

```bash
pgrep -af 'ai[.]training[.]train_student'
```

### Restart seed 2026 (WSL, ~4 hours)

Clear the incomplete directory, then launch. Only one GPU trainer at a time.

```bash
cd "/mnt/d/Fe Anne's Repository/Banana Leaf Disease Scanner"
rm -rf "ai/artifacts/four_class/pilot_2878_v1/pilot_07_selected_student_seed2026"
export TF_GPU_ALLOCATOR=BFC

"/home/feanne/.venvs/dahonmd-tf-gpu/bin/python" -u -m ai.training.train_student \
  --config "ai/config/pilot_2878_v1/pilot_07_kd_seed2026.json" \
  --dataset-dir "/home/feanne/dahonmd-data/banana_leaf_thesis_4class" \
  --final-split-dir "datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1" \
  --output-dir "ai/artifacts/four_class/pilot_2878_v1/pilot_07_selected_student_seed2026" \
  --teacher-model "ai/artifacts/four_class/pilot_2878_v1/pilot_03_teacher_imagenet_seed42/best_teacher.keras" \
  2>&1 | tee "ai/artifacts/four_class/pilot_2878_v1/pilot_07_selected_student_seed2026/training.log"
```

`TF_GPU_ALLOCATOR=BFC` is required — `cuda_malloc_async` is unstable on this
GPU. BFC changes only the allocation strategy, not model mathematics.

Do not include `--resume` for the first clean launch: with no
`latest_student.keras` present the trainer stops with a clear error. A clean
launch also refuses to start when `latest_student.keras` or
`student_history.json` already exists, so use `--resume` instead of a fresh run
once those files appear.

### Resume seed 2026 after a crash, manually (WSL, do not `rm -rf`)

Use this exact command only after at least one epoch has completed. It restores
the epoch, warm-up/fine-tune stage, early-stop counters, and learning rate from
`student_history.json`, then continues from `latest_student.keras`.

```bash
cd "/mnt/d/Fe Anne's Repository/Banana Leaf Disease Scanner"
export TF_GPU_ALLOCATOR=BFC

"/home/feanne/.venvs/dahonmd-tf-gpu/bin/python" -u -m ai.training.train_student \
  --config "ai/config/pilot_2878_v1/pilot_07_kd_seed2026.json" \
  --dataset-dir "/home/feanne/dahonmd-data/banana_leaf_thesis_4class" \
  --final-split-dir "datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1" \
  --output-dir "ai/artifacts/four_class/pilot_2878_v1/pilot_07_selected_student_seed2026" \
  --teacher-model "ai/artifacts/four_class/pilot_2878_v1/pilot_03_teacher_imagenet_seed42/best_teacher.keras" \
  --resume \
  2>&1 | tee -a "ai/artifacts/four_class/pilot_2878_v1/pilot_07_selected_student_seed2026/training.log"
```

### Automatic crash recovery (PowerShell, recommended)

Because this GPU crashes intermittently, a driver loop is available that
relaunches the run until it completes. Each attempt resumes from the latest
completed epoch, and after a crash it terminates the Ubuntu distro to reset the
GPU before retrying. Stop any manual run first; the driver refuses to start a
second trainer.

```powershell
cd "D:\Fe Anne's Repository\Banana Leaf Disease Scanner"
powershell -NoProfile -ExecutionPolicy Bypass -File ai\training\run_pilot07_seed2026_auto.ps1
```

Preview the exact WSL command without training with `-DryRun`. Tune the loop
with `-MaxAttempts` (default 20) and `-RetryDelaySeconds` (default 45); pass
`-NoGpuReset` to skip the distro reset. The driver records attempts in
`ai\artifacts\four_class\pilot_2878_v1\pilot_07_selected_student_seed2026\auto_rerun.log`;
epoch output still appends to that run's `training.log`. It exits `0` once
`student_training.complete.json` exists.

### Monitor (optional, second WSL terminal)

A blank screen for the first minutes is normal while the dataset loads.

```bash
tail -n 20 -F "ai/artifacts/four_class/pilot_2878_v1/pilot_07_selected_student_seed2026/training.log"
```

`Ctrl+C` stops only the monitor, not training. Confirm the trainer is alive:

```powershell
wsl.exe -d Ubuntu --exec bash -lc "pgrep -af 'ai.training.train_student' || true"
```

### Seed finished?

Complete when `student_training.complete.json` exists and the log ends with
`Best student saved to ...`. Check both seeds from PowerShell:

```powershell
Get-ChildItem "ai\artifacts\four_class\pilot_2878_v1\pilot_07_selected_student_seed1337\student_training.complete.json"
Get-ChildItem "ai\artifacts\four_class\pilot_2878_v1\pilot_07_selected_student_seed2026\student_training.complete.json"
```

Both must exist before proceeding to the freeze.

To check crash-recovery readiness instead, confirm the latest checkpoint and
history exist together:

```powershell
Get-ChildItem "ai\artifacts\four_class\pilot_2878_v1\pilot_07_selected_student_seed2026\latest_student.keras","ai\artifacts\four_class\pilot_2878_v1\pilot_07_selected_student_seed2026\student_history.json"
```

If both are present, use the resume command above rather than a clean rerun.

### Freeze PILOT-07 (after both seeds finish)

```powershell
wsl.exe -d Ubuntu --exec bash -lc "cd '/mnt/d/Fe Anne'"'"'s Repository/Banana Leaf Disease Scanner' && /home/feanne/.venvs/dahonmd-tf-gpu/bin/python -m ai.evaluation.pilot_pipeline freeze-pilot7"
```

Writes `pilot_07_final_selection.json` (mean and sample standard deviation
across seeds 42, 1337, and 2026). Seed 42 is the predeclared deployment
checkpoint. After this file exists, run `pilot8-command` for the locked test
evaluation.

## PILOT-08: locked test evaluation — complete

The test partition was evaluated once after PILOT-07 froze the final seed,
model, and configuration. The evaluated checkpoint is PILOT-06 seed 42
(`best_student.keras`), the predeclared deployment model. Results on all 1,728
held-out test images:

| Metric   | Value          |
| -------- | -------------- |
| Accuracy | **0.96644**    |
| Macro-F1 | **0.96645**    |

| Class             | Precision | Recall  | F1      |
| ----------------- | --------- | ------- | ------- |
| healthy           | 0.99535   | 0.99074 | 0.99304 |
| sigatoka          | 0.94737   | 0.95833 | 0.95282 |
| panama-disease    | 0.95444   | 0.96991 | 0.96211 |
| cordana-leaf-spot | 0.96919   | 0.94676 | 0.95785 |

Deployed model: 1,167,920 parameters, 119.02M FLOPs per 224x224 image, Keras
latency 350 ms mean / 431 ms p95 over 100 runs. Full report:
`ai/artifacts/four_class/pilot_2878_v1/pilot_08_locked_test/student_evaluation.json`.
The Davao field subset remains `PENDING EXPERIMENTAL VALIDATION`. Test results
must not trigger further tuning.

### Deployed export format (FP32, not INT8)

The same frozen checkpoint was run through the TFLite export benchmark on the
locked test partition. FP32 TFLite reproduced the Keras result exactly
(**0.96644**). Full-integer INT8 post-training quantization collapsed accuracy to
**0.84433** (macro-F1 **0.84813**; sigatoka precision 0.663, with 87
panama-disease and 99 cordana-leaf-spot images misrouted to sigatoka). Raising
calibration from 200 to 1000 training images made it worse (**0.78877**). A
weight-only export with float activations scored the same 0.84433, isolating int8
*weight* quantization as the cause rather than activation range, and 16x8-bit
activations are unavailable because the custom `HardSwish` op has no 16-bit
kernel. Per-layer weight statistics show no single pathological tensor,
so this checkpoint is simply int8-weight-sensitive.

Consequence: the phone ships the **FP32** model so on-device output matches the
evaluated result exactly. Recovering a small full-integer INT8 model requires
quantization-aware training, which would produce new weights, so it is recorded
as future work rather than applied after the locked test. Evidence:
`..._tflite/int8_evaluation.json`, `..._tflite/quantization_audit.json`.

## Updating the deployed model after a better result

The deployed model is the frozen, test-evaluated **seed 42** (PILOT-06,
validation macro-F1 **0.96178**, locked-test macro-F1 **0.96645**). Its TFLite
export lives in
`ai/artifacts/four_class/pilot_2878_v1/pilot_06_ca_kd_imagenet_teacher_seed42_tflite/`,
`ai/.env` points `DAHONMD_ENHANCED_TFLITE` (FP32) and `DAHONMD_LABEL_MAP` at it,
and the mobile assets were refreshed from it. The earlier seed 1337 TFLite is
superseded: seed 1337 (validation macro-F1 **0.96341**) is a robustness
confirmation only and was never run through the locked test. When a later pilot
beats this and is frozen, refresh the TFLite export and redeploy. Run everything
under WSL so the GPU stays free for training (`export CUDA_VISIBLE_DEVICES=-1`).

**1. Convert the new best checkpoint:**

```bash
cd "/mnt/d/Fe Anne's Repository/Banana Leaf Disease Scanner"
export CUDA_VISIBLE_DEVICES=-1
OUT="ai/artifacts/four_class/pilot_2878_v1/<NEW_RUN_DIR>"

/home/feanne/.venvs/dahonmd-tf-gpu/bin/python -u -m ai.deployment.convert_tflite \
  --config "$OUT/student_experiment_config.json" \
  --student-model "$OUT/best_student.keras" \
  --dataset-dir "/home/feanne/dahonmd-data/banana_leaf_thesis_4class" \
  --final-split-dir "datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1" \
  --output-dir "${OUT}_tflite"
```

**2. Copy the exported models into the mobile assets (FP32 is the production
model; the int8 export is bundled only for the on-device benchmark):**

```bash
cp "${OUT}_tflite/enhanced_mobilenetv3_int8.tflite"  mobile-frontend/assets/models/ca_mobilenetv3_small_int8.tflite
cp "${OUT}_tflite/enhanced_mobilenetv3_fp32.tflite"  mobile-frontend/assets/models/ca_mobilenetv3_small_fp32.tflite
```

**3. Point `ai/.env` at the new TFLite:**

Set `DAHONMD_ENHANCED_TFLITE` to the new `..._tflite/enhanced_mobilenetv3_fp32.tflite`
path and, if the label map changed, update `DAHONMD_LABEL_MAP` as well. Use the
FP32 export unless a QAT-trained checkpoint is explicitly selected and
re-evaluated.

**4. Restart the comparison service:**

```bash
bash ai/deployment/start_comparison_service.sh
```

Verify: `curl http://127.0.0.1:8100/health` reports `"status": "ready"`.
Check the mobile with `npm run release:status` from `mobile-frontend/`.

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

## Future work: small-batch SSL recovery study

This is exploratory future work and is not part of PILOT-04 through PILOT-08.
Do not launch it while a current pilot trainer is active, and do not inspect the
locked test partition while designing or selecting these variants.

### Stage A: audit existing SSL checkpoints

Run frozen linear probes for the already saved SSL milestones (epochs 10, 20,
30, ..., 100). Extract and cache train/validation embeddings once per
checkpoint, train only a small classification head, and rank checkpoints by
validation macro-F1. This tests whether later SSL caused ImageNet feature
forgetting without repeating SSL. Estimated RTX 3050 time: **2-4 hours**.

Freeze the checkpoint-selection rule before running the probes. Test data must
remain inaccessible. If an existing checkpoint is promising, fine-tune only
that checkpoint under the same supervised protocol, estimated at **4-5 hours**.

### Stage B: one preregistered small-batch SSL candidate

Only if Stage A does not recover a competitive checkpoint, run a 30-epoch
diagnostic designed for the physical batch-size-2 constraint:

- keep pretrained ResNet BatchNorm statistics frozen during SSL;
- replace the batch-local NT-Xent negative set (only two negatives per anchor
  at batch size 2) with a declared MoCo-style queue;
- reduce the SSL backbone learning rate from `3e-4` to `3e-5` to limit
  catastrophic forgetting;
- retain the frozen split, deterministic seed, augmentations, and locked-test
  boundary.

Treat this as one preregistered package comparison; it does not isolate which
component helped. Estimated SSL time: **24-30 hours**, followed by **4-5 hours**
for supervised fine-tuning. Do not automatically extend it to 100 epochs.

### Stage C: data expansion and ablation

Later work may add a larger, genuinely external unlabeled banana-leaf inventory
only after exact/near-duplicate and group-overlap screening against validation
and test partitions. Separate queue, BatchNorm, learning-rate, BYOL, and MIM
ablations must receive new experiment IDs and validation-only selection rules.

The existing PILOT-03 ImageNet teacher remains the control. No SSL variant may
replace it unless validation macro-F1 is strictly greater than **0.98320**. A
selected candidate must then pass the existing multi-seed confirmation before
the one-time locked test evaluation.
