# DahonMD Model Experiments

This page tracks which techniques are worth testing and what to run next. All
experiments must use the same frozen split and select models using validation
macro-F1. Do not use the test set for tuning.

## Current evidence

| ID | Model and technique | Best validation result | Decision |
| --- | --- | --- | --- |
| EXP-01 | MobileNetV3-Small, supervised ImageNet transfer | Macro-F1 **0.91231**, accuracy **0.94108** | Baseline to beat |
| EXP-02 | ResNet-101, ImageNet + existing SSL + fine-tuning | Macro-F1 **0.55244** | Too weak for distillation |
| EXP-03 | Coordinate Attention student + ImageNet transfer, without KD | Macro-F1 **0.96045**, accuracy **0.97107** | **Current best model** |

EXP-02 shows that the current SSL setup was ineffective. It does not prove that
all SSL methods are ineffective. EXP-03 beat the baseline by **0.04814**
macro-F1, or about 4.81 percentage points, on the same validation split.

## Experiment order

| ID | Technique being tested | Status | Success rule |
| --- | --- | --- | --- |
| EXP-03 | Coordinate Attention student + ImageNet transfer, without KD | **Completed: passed** | Macro-F1 0.96045 > 0.91231 |
| EXP-04 | ResNet-101 ImageNet-only teacher with head warm-up and frozen BatchNorm | **Run next** | Beats EXP-02 and preferably EXP-01 |
| EXP-05 | Existing SSL encoder with corrected fine-tuning and frozen BatchNorm | Wait for EXP-04 | Beats EXP-04; otherwise SSL added no value |
| EXP-06 | Coordinate Attention student with knowledge distillation | Blocked | Teacher must beat EXP-01 and preferably EXP-03 |
| EXP-07 | Validation-only student tuning, changing one factor per run | Not currently needed | Use only if later confirmation is unstable |
| EXP-08 | Repeat the winner with multiple seeds | Required before final claim | Improvement is consistent, then test once |

## Run next: EXP-04

Inside WSL:

```bash
cd "/mnt/c/Users/Admin/Documents/Project Fe/DahonMD"

bash ai/training/run_teacher_diagnostics_gpu.sh imagenet
```

Do not start EXP-05 until the EXP-04 result has been reviewed.

## EXP-03: completed successfully

This is the strongest current student experiment because it does not learn from
the weak teacher. It uses Coordinate Attention, ImageNet weights, a 20-epoch
warm-up, a 10-epoch fine-tune, and frozen transferred BatchNorm statistics.

The selected checkpoint is from epoch 30. Its result file is:

```bash
cat ai/artifacts/four_class/enhanced/diagnostics/supervised_imagenet_seed42/student_supervised_training.complete.json
```

It records:

```json
"beats_baseline_validation_macro_f1": true
```

The saved model is:

```text
ai/artifacts/four_class/enhanced/diagnostics/supervised_imagenet_seed42/best_supervised_student.keras
```

## EXP-04 and EXP-05: check whether SSL helps

Run the stable ImageNet-only teacher first:

```bash
bash ai/training/run_teacher_diagnostics_gpu.sh imagenet
```

After reviewing EXP-04, run the same fine-tuning method using the existing SSL
encoder:

```bash
bash ai/training/run_teacher_diagnostics_gpu.sh ssl
```

Compare their validation macro-F1 values:

- EXP-05 > EXP-04: SSL helped.
- EXP-05 <= EXP-04: keep the ImageNet-only teacher and report that this SSL
  setup did not help.
- Neither beats EXP-01: do not run knowledge distillation.

## EXP-07: what to tune only if confirmation becomes unstable

Change only one item per experiment and use a new output directory each time:

1. Learning rate: try a lower fine-tuning rate.
2. Class balance: try class-weighted cross-entropy if the minority class has
   poor validation recall.
3. Augmentation: reduce or increase augmentation based on the train-validation
   gap.
4. Fine-tuning depth: unfreeze only the later backbone blocks.

Choose the variant using validation macro-F1 and per-class recall, not training
accuracy. Do not combine changes until their individual effects are known.

## EXP-08: final confirmation

After selecting one configuration, repeat it with at least three declared seeds
such as 42, 1337, and 2026. Report the mean and standard deviation. Evaluate the
untouched test set only after the configuration is locked.

## Rules for a fair claim

- Keep the same train, validation, and test assignments.
- Never tune from test results.
- Save every config and random seed.
- Compare validation macro-F1 and per-class metrics.
- Report failed experiments, including EXP-02.
- Treat EXP-03 as the current validation winner, not the final test result.
