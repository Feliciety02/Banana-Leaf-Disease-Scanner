# DahonMD AI Pipeline

This folder contains Python source code only. Actual images belong in the root `datasets/` directory and generated checkpoints belong in `ai/artifacts/`; neither is committed.

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
