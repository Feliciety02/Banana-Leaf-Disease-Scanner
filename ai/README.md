# DahonMD AI Pipeline

This folder contains Python source code only. Actual images belong in the root `datasets/` directory and generated checkpoints belong in `ai/artifacts/`; neither is committed.

The thesis member responsible for data and model experiments should work through
the [dataset/model trainer checklist](../docs/dataset-model-trainer-todo.md) and
retain the evidence specified at every gate.

## Setup

Run commands from the repository root:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r ai\requirements.txt
Copy-Item ai\.env.example ai\.env
python -m ai.data.validate_dataset
```

`DATASET_ROOT` in `ai/.env` may be relative to the repository working directory or absolute. A CLI `--dataset-dir` value overrides it for one run.

## Input and Label Contract

The fixed output order is:

| Index | Model key | Display name |
| --- | --- | --- |
| 0 | `healthy` | Healthy |
| 1 | `moko-disease` | Moko disease |
| 2 | `black-sigatoka` | Black Sigatoka |
| 3 | `yellow-sigatoka` | Yellow Sigatoka |
| 4 | `cordana-leaf-spot` | Cordana leaf spot |

Unsplit and pre-split datasets must use these exact directory keys. The order is defined by `config/labels.py`, not alphabetically by folder name. Stored split manifests are rejected if an index and class name no longer match this contract.

TensorFlow 2.20 has been runtime-tested in this project with JPG, JPEG, PNG, BMP, and WEBP. `decode_and_resize` reads the file contents, produces RGB with three channels, resizes to `224 x 224`, converts to `float32`, and scales pixels to `[0, 1]`. The model does not receive the extension or MIME type. Images of different original sizes are accepted, although the current direct resize can distort unusually wide or tall images.

PNG inference after WEBP-only training is technically valid but may expose a distribution shift. The relevant differences are the decoded pixels and acquisition conditions—not the extension itself. WEBP/JPEG compression, phone processing, focus, illumination, background, disease stage, and camera model can affect accuracy. Test with genuine deployment captures rather than assuming cross-format performance.

Do not manufacture format diversity by converting the same images and distributing those copies across splits. PNG conversion cannot recover detail already lost in a WEBP source, and near-identical copies can inflate evaluation scores. When several non-identical photographs come from one leaf or plant, supply `data.group_manifest` so all of them stay in the same split.

## Training and Deployment Sequence

Run each command from the repository root after the real dataset has been approved:

```powershell
.venv\Scripts\python.exe -m ai.data.validate_dataset --dataset-dir datasets\banana_leaf_5class

.venv\Scripts\python.exe -m ai.training.train_teacher --dataset-dir datasets\banana_leaf_5class
.venv\Scripts\python.exe -m ai.evaluation.evaluate_teacher --dataset-dir datasets\banana_leaf_5class --teacher-model ai\artifacts\best_teacher.keras

.venv\Scripts\python.exe -m ai.training.train_student --dataset-dir datasets\banana_leaf_5class --teacher-model ai\artifacts\best_teacher.keras
.venv\Scripts\python.exe -m ai.evaluation.evaluate_student --dataset-dir datasets\banana_leaf_5class --student-model ai\artifacts\best_student.keras

.venv\Scripts\python.exe -m ai.deployment.convert_tflite --dataset-dir datasets\banana_leaf_5class --student-model ai\artifacts\best_student.keras
.venv\Scripts\python.exe -m ai.deployment.benchmark_tflite --dataset-dir datasets\banana_leaf_5class --tflite-model ai\artifacts\enhanced_mobilenetv3_int8.tflite
```

## Standard MobileNetV3 Baseline

The controlled baseline is the official Keras `MobileNetV3Small`, matching the
enhanced student's Small variant and width multiplier. It uses the same RGB
`224 x 224` float32 `[0, 1]` input, the same training-only augmentation, the
same fixed five-label order, and the exact same `split_manifest.json`. Its graph
contains a single `[0, 1]` to `[-1, 1]` rescaling operation, the stock
MobileNetV3-Small backbone (including its standard SE blocks), global average
pooling, dropout, and a five-logit classifier.

It intentionally contains no Coordinate Attention, ResNet-101, SSL objective,
knowledge distillation, or feature-distillation adapter.

Train and evaluate it only after the canonical manifest has been created by
dataset validation or the enhanced experiment:

```powershell
.venv\Scripts\python.exe -m ai.training.train_baseline `
  --dataset-dir datasets\banana_leaf_5class `
  --split-manifest ai\artifacts\split_manifest.json

.venv\Scripts\python.exe -m ai.evaluation.evaluate_baseline `
  --dataset-dir datasets\banana_leaf_5class `
  --split-manifest ai\artifacts\split_manifest.json `
  --baseline-model ai\artifacts\best_baseline.keras

.venv\Scripts\python.exe -m ai.deployment.convert_baseline_tflite `
  --dataset-dir datasets\banana_leaf_5class `
  --split-manifest ai\artifacts\split_manifest.json `
  --baseline-model ai\artifacts\best_baseline.keras

.venv\Scripts\python.exe -m ai.deployment.benchmark_tflite `
  --model-kind baseline `
  --dataset-dir datasets\banana_leaf_5class `
  --split-manifest ai\artifacts\split_manifest.json `
  --tflite-model ai\artifacts\baseline_mobilenetv3_small_int8.tflite
```

To attach the same fairness fingerprint to the enhanced evaluation report, run:

```powershell
.venv\Scripts\python.exe -m ai.evaluation.evaluate_student `
  --dataset-dir datasets\banana_leaf_5class `
  --split-manifest ai\artifacts\split_manifest.json `
  --student-model ai\artifacts\best_student.keras
```

Then combine actual held-out results. The command rejects reports unless their
variant, input contract, labels, and split-manifest SHA-256 are identical:

```powershell
.venv\Scripts\python.exe -m ai.evaluation.compare_models `
  --baseline-report ai\artifacts\baseline_evaluation.json `
  --enhanced-report ai\artifacts\student_evaluation.json `
  --output ai\artifacts\model_comparison.json
```

For a single-image research inspection, run both TFLite models sequentially on
one decoded tensor. The baseline interpreter is released before the enhanced
interpreter is created:

```powershell
.venv\Scripts\python.exe -m ai.deployment.compare_tflite `
  --baseline-model ai\artifacts\baseline_mobilenetv3_small_int8.tflite `
  --enhanced-model ai\artifacts\enhanced_mobilenetv3_int8.tflite `
  --label-map ai\artifacts\label_map.json `
  --image path\to\banana-leaf.jpg `
  --output ai\artifacts\single_image_comparison.json
```

The single-image report includes predictions, probabilities, confidence,
invocation latency, file size, timestamp, runtime, agreement, and raw
differences. It deliberately does not label either model "better" from
confidence alone.

To expose that same sequential runner to the admin comparison page, configure
the three `DAHONMD_*` artifact paths in `ai/.env`, then start the service:

```powershell
.venv\Scripts\python.exe -m uvicorn ai.deployment.comparison_service:app --host 127.0.0.1 --port 8100
```

Set `AI_COMPARISON_URL=http://127.0.0.1:8100/compare` in
`web-backend/.env`. The Laravel endpoint is administrator-only, validates the
returned research contract, and never writes comparison runs to `diagnoses`.
The service health endpoint remains `unconfigured` until all three real
artifacts exist.

### Model artifact locations

Generated weights remain untracked under `ai/artifacts/`:

| Purpose | Expected file |
| --- | --- |
| Baseline training checkpoint | `ai/artifacts/best_baseline.keras` |
| Baseline mobile FP32 | `ai/artifacts/baseline_mobilenetv3_small_fp32.tflite` |
| Baseline mobile INT8 | `ai/artifacts/baseline_mobilenetv3_small_int8.tflite` |
| Enhanced training checkpoint | `ai/artifacts/best_student.keras` |
| Enhanced mobile FP32 | `ai/artifacts/enhanced_mobilenetv3_fp32.tflite` |
| Enhanced mobile INT8 | `ai/artifacts/enhanced_mobilenetv3_int8.tflite` |
| Shared label map | `ai/artifacts/label_map.json` |
| Shared data partition | `ai/artifacts/split_manifest.json` |

No model file is generated or copied into the application until it has been
trained, evaluated, converted, and validated with its matching label map. The
current web and Expo inference adapters therefore remain explicitly
unconfigured rather than returning fabricated model predictions.

The first validation writes a persistent split manifest. Reuse the same dataset, manifest, configuration, and label map through teacher training, student distillation, evaluation, conversion, and deployment. Use a new output directory when intentionally starting a different split or experiment.

The INT8 converter calibrates with representative training images. The final client must read the TFLite input tensor's scale and zero point rather than assuming an INT8 conversion formula. Pair every deployed model with the exact `label_map.json` produced by its experiment.

Full ResNet-101 self-supervised training is computationally expensive. A CPU can execute the pipeline but may take substantially longer than a suitable training accelerator. Record the TensorFlow version, hardware, seed, configuration snapshots, dataset provenance, and final artifact checksums for reproducibility.

## Evaluation Expectations

Report held-out accuracy, macro precision/recall/F1, per-class metrics, support counts, and the confusion matrix. Compare the FP32 Keras student, FP32 TFLite export, and INT8 TFLite model on the same untouched test records. For deployment claims, measure latency on the target phone after warm-up; desktop Python latency is not a substitute for on-device latency.

Where the dataset permits, stratify results by capture device, image source, format, lighting or quality category, and field versus curated setting. Treat small subgroup results as exploratory and always publish their sample counts.

## Packages

- `config/`: reproducible experiment configuration
- `data/`: image discovery, validation, splitting, augmentation, and masking code
- `models/`: ResNet-101 teacher and Coordinate Attention MobileNetV3 student
- `losses/`: supervised, SSL, and distillation objectives
- `training/`: teacher and student training entry points
- `evaluation/`: metrics, latency, confusion matrices, and Grad-CAM
- `deployment/`: TFLite conversion, benchmarking, and one-image inference
