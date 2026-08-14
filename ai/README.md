<div align="center">

# DahonMD AI Pipeline

Reproducible training, evaluation, comparison, and TensorFlow Lite tooling for five-class banana-leaf screening.

</div>

> [!IMPORTANT]
> Run every command from the repository root. Generated checkpoints belong in `ai/artifacts/`; dataset images belong in `datasets/`.

## Contents

- [Current results](#current-results)
- [Model designs](#model-designs)
- [Setup](#setup)
- [Label and input contract](#label-and-input-contract)
- [Train both models](#train-both-models)
- [Read the results](#read-the-results)
- [TensorFlow Lite export](#tensorflow-lite-export)
- [Research comparison service](#research-comparison-service)
- [Evaluation rules](#evaluation-rules)
- [Project layout](#project-layout)

## Current Results

The controlled baseline and improved enhanced model use the same 459-image dataset, class order, preprocessing, and fixed 322/68/69 split.

| Model | Test accuracy | Macro F1 | Correct / 69 |
| --- | ---: | ---: | ---: |
| MobileNetV3-Small baseline | 91.30% | 90.40% | 63 |
| Enhanced MobileNetV3-Small | **95.65%** | **96.05%** | **66** |

The enhanced model leads this run by **4.35 percentage points in accuracy** and **5.65 percentage points in macro F1**.

> [!CAUTION]
> This is exploratory thesis evidence. Yellow Sigatoka has only three test images from one source group, and those source labels still require expert confirmation. Do not present 95.65% as guaranteed field accuracy.

### Experiment history

| Run | Accuracy | Macro F1 | Status |
| --- | ---: | ---: | --- |
| Source-labeled baseline | 91.30% | 90.40% | Controlled reference |
| Earlier enhanced CPU pilot | 76.81% | 70.66% | Superseded training approach |
| ImageNet-transfer enhanced model | **95.65%** | **96.05%** | Current research leader |

The current comparison report is written to:

```text
ai/artifacts/source_labeled_enhanced_transfer_finetune/model_comparison.json
```

## Model Designs

| Baseline | Enhanced |
| --- | --- |
| Stock Keras MobileNetV3-Small | MobileNetV3-Small with Coordinate Attention |
| ImageNet initialization | Compatible ImageNet backbone transfer |
| Standard squeeze-and-excitation blocks | Coordinate-aware channel gating |
| Supervised classification | Supervised classification plus light teacher distillation |
| 942,005 parameters | 1,168,945 deployable parameters |

The frozen ResNet-101 teacher is used only during offline enhanced-model training. It is not packaged into the web or mobile clients.

## Setup

### Requirements

- Python supported by the pinned TensorFlow version
- A CUDA-capable GPU is recommended but not required
- Windows PowerShell commands shown below

Create the environment once:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r ai\requirements.txt
if (-not (Test-Path ai\.env)) { Copy-Item ai\.env.example ai\.env }
```

Validate the dataset before training:

```powershell
.venv\Scripts\python.exe -m ai.data.validate_dataset `
  --dataset-dir datasets\banana_leaf_5class
```

## Label and Input Contract

The output order is fixed in `ai/config/labels.py`.

| Index | Model key | Display name |
| ---: | --- | --- |
| 0 | `healthy` | Healthy |
| 1 | `dead` | Dead leaf |
| 2 | `black-sigatoka` | Black Sigatoka |
| 3 | `yellow-sigatoka` | Yellow Sigatoka |
| 4 | `cordana-leaf-spot` | Cordana leaf spot |

Every image is decoded as three-channel RGB, resized to `224 × 224`, converted to `float32`, and scaled to `[0, 1]`.

`dead` is a visual-condition class for a fully dried or necrotic leaf. It is not a Moko diagnosis or a claim about the cause of death.

### Supported training formats

| Format | Supported |
| --- | :---: |
| JPG/JPEG | Yes |
| PNG | Yes |
| WEBP | Yes |
| BMP | Yes |

The model receives pixels, not file extensions. Different compression, phones, lighting, focus, framing, backgrounds, and disease stages can still create distribution shift.

## Train Both Models

The following workflow creates a timestamped run and preserves the current best artifacts. It also copies the canonical split manifest so both models use exactly the same test images.

### 1. Create isolated output folders

```powershell
$run = Get-Date -Format "yyyyMMdd-HHmmss"
$baselineOut = "ai/artifacts/runs/$run/baseline"
$warmupOut = "ai/artifacts/runs/$run/enhanced-warmup"
$enhancedOut = "ai/artifacts/runs/$run/enhanced"

New-Item -ItemType Directory -Force $baselineOut, $warmupOut, $enhancedOut
Copy-Item "ai/artifacts/source_labeled_baseline/split_manifest.json" "$warmupOut/split_manifest.json"
Copy-Item "ai/artifacts/source_labeled_baseline/split_manifest.json" "$enhancedOut/split_manifest.json"
```

### 2. Train and evaluate the baseline

```powershell
.venv\Scripts\python.exe -m ai.training.train_baseline `
  --dataset-dir datasets\banana_leaf_5class `
  --config ai\config\source_labeled_baseline.json `
  --output-dir $baselineOut `
  --split-manifest ai\artifacts\source_labeled_baseline\split_manifest.json

.venv\Scripts\python.exe -m ai.evaluation.evaluate_baseline `
  --dataset-dir datasets\banana_leaf_5class `
  --config ai\config\source_labeled_baseline.json `
  --output-dir $baselineOut `
  --split-manifest ai\artifacts\source_labeled_baseline\split_manifest.json `
  --baseline-model "$baselineOut/best_baseline.keras"
```

### 3. Warm up the enhanced model

This stage transfers compatible ImageNet MobileNetV3 weights and initially freezes the shared backbone.

```powershell
.venv\Scripts\python.exe -m ai.training.train_student `
  --dataset-dir datasets\banana_leaf_5class `
  --config ai\config\source_labeled_enhanced_transfer.json `
  --output-dir $warmupOut `
  --teacher-model ai\artifacts\source_labeled_enhanced_cpu_pilot\best_teacher.keras
```

### 4. Fine-tune the enhanced model

```powershell
.venv\Scripts\python.exe -m ai.training.train_student `
  --dataset-dir datasets\banana_leaf_5class `
  --config ai\config\source_labeled_enhanced_transfer_finetune.json `
  --output-dir $enhancedOut `
  --teacher-model ai\artifacts\source_labeled_enhanced_cpu_pilot\best_teacher.keras `
  --initial-student-model "$warmupOut/best_student.keras"

.venv\Scripts\python.exe -m ai.evaluation.evaluate_student `
  --dataset-dir datasets\banana_leaf_5class `
  --config ai\config\source_labeled_enhanced_transfer_finetune.json `
  --output-dir $enhancedOut `
  --split-manifest ai\artifacts\source_labeled_baseline\split_manifest.json `
  --student-model "$enhancedOut/best_student.keras"
```

### 5. Compare the held-out reports

```powershell
.venv\Scripts\python.exe -m ai.evaluation.compare_models `
  --baseline-report "$baselineOut/baseline_evaluation.json" `
  --enhanced-report "$enhancedOut/student_evaluation.json" `
  --output "$enhancedOut/model_comparison.json"
```

The comparison command rejects mismatched preprocessing, label order, model variant, or split-manifest fingerprints.

### Optional: retrain the teacher

The commands above reuse the existing compatible teacher. Full ResNet-101 training is considerably slower, especially on a CPU.

```powershell
.venv\Scripts\python.exe -m ai.training.train_teacher `
  --dataset-dir datasets\banana_leaf_5class `
  --config ai\config\source_labeled_enhanced_cpu_pilot.json
```

Use the resulting `best_teacher.keras` path in both enhanced training commands.

## Read the Results

Training output shows validation accuracy. The thesis comparison must use the accuracy printed by the evaluation commands, which comes from the held-out test partition.

```powershell
$report = Get-Content "$enhancedOut/model_comparison.json" | ConvertFrom-Json

"Baseline accuracy: {0:P2}" -f $report.metrics.accuracy.baseline
"Enhanced accuracy: {0:P2}" -f $report.metrics.accuracy.enhanced
"Baseline macro F1: {0:P2}" -f $report.metrics.macro_f1.baseline
"Enhanced macro F1: {0:P2}" -f $report.metrics.macro_f1.enhanced
"Current leader: $($report.outcome.current_leader)"
```

Each evaluation folder contains:

| File | Meaning |
| --- | --- |
| `*_evaluation.json` | Overall and per-class test metrics |
| `*_confusion_matrix.png` | Correct and confused class counts |
| `*_history.json` | Per-epoch training and validation metrics |
| `best_*.keras` | Validation-selected checkpoint |
| `experiment_config.json` | Reproducible configuration snapshot |
| `split_manifest.json` | Exact train/validation/test membership |
| `label_map.json` | Output index-to-class mapping |

## TensorFlow Lite Export

Export and benchmark only after Keras evaluation is complete.

### Baseline

```powershell
.venv\Scripts\python.exe -m ai.deployment.convert_baseline_tflite `
  --dataset-dir datasets\banana_leaf_5class `
  --config ai\config\source_labeled_baseline.json `
  --output-dir $baselineOut `
  --split-manifest ai\artifacts\source_labeled_baseline\split_manifest.json `
  --baseline-model "$baselineOut/best_baseline.keras"
```

### Enhanced

```powershell
.venv\Scripts\python.exe -m ai.deployment.convert_tflite `
  --dataset-dir datasets\banana_leaf_5class `
  --config ai\config\source_labeled_enhanced_transfer_finetune.json `
  --output-dir $enhancedOut `
  --student-model "$enhancedOut/best_student.keras"
```

Run `ai.deployment.benchmark_tflite` on the generated FP32 and INT8 files before deployment. An INT8 conversion is not acceptable merely because conversion succeeded; its held-out accuracy, per-class recall, tensor quantization, and target-device latency must also pass review.

## Research Comparison Service

The optional local service runs the baseline and enhanced FP32 TFLite models sequentially on the same image.

Set these values in `ai/.env`:

```dotenv
DAHONMD_BASELINE_TFLITE=artifacts/source_labeled_baseline/baseline_mobilenetv3_small_fp32.tflite
DAHONMD_ENHANCED_TFLITE=artifacts/source_labeled_enhanced_transfer_finetune/enhanced_mobilenetv3_fp32.tflite
DAHONMD_LABEL_MAP=artifacts/source_labeled_baseline/label_map.json
DAHONMD_MODEL_COMPARISON_REPORT=artifacts/source_labeled_enhanced_transfer_finetune/model_comparison.json
```

Start the service:

```powershell
.venv\Scripts\python.exe -m uvicorn ai.deployment.comparison_service:app `
  --host 127.0.0.1 `
  --port 8100
```

Then set this in `backend/.env`:

```dotenv
AI_COMPARISON_URL=http://127.0.0.1:8100/compare
```

The comparison is clearly marked as research, is not a second diagnosis, and is never written to farmer history. A model with higher confidence on one photo is not automatically the more accurate model.

## Evaluation Rules

1. Keep related images from the same leaf, plant, plot, or capture session in one split.
2. Select checkpoints and hyperparameters using validation data only.
3. Open the held-out test set only after the experiment is frozen.
4. Compare both models using the same `split_manifest.json` fingerprint.
5. Report accuracy, macro precision/recall/F1, per-class metrics, support, and the confusion matrix.
6. Compare Keras, FP32 TFLite, and INT8 TFLite results before deployment.
7. Report target-phone latency; desktop Python latency is not a substitute.
8. Record TensorFlow version, hardware, seed, configuration, provenance, and artifact checksums.

Do not create format diversity by converting one image and distributing copies across different splits. PNG conversion cannot restore information lost from WEBP or JPEG, and near-identical copies can inflate metrics.

## Project Layout

| Folder | Responsibility |
| --- | --- |
| `config/` | Labels and reproducible experiment settings |
| `data/` | Discovery, validation, grouping, splitting, augmentation, and masking |
| `models/` | ResNet-101 teacher, baseline, and Coordinate Attention student |
| `losses/` | Classification, self-supervised, and distillation objectives |
| `training/` | Teacher, baseline, and student entry points |
| `evaluation/` | Metrics, latency, confusion matrices, comparison, and Grad-CAM |
| `deployment/` | TFLite conversion, parity benchmarking, and local inference service |
| `tests/` | AI contract and regression tests |

For dataset provenance and quality rules, read the [dataset guide](../datasets/README.md). For the required thesis evidence at each gate, use the [dataset/model trainer checklist](../docs/dataset-model-trainer-todo.md).
