# BananaCare AI Pipeline

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

## Packages

- `config/`: reproducible experiment configuration
- `data/`: image discovery, validation, splitting, augmentation, and masking code
- `models/`: ResNet-101 teacher and Coordinate Attention MobileNetV3 student
- `losses/`: supervised, SSL, and distillation objectives
- `training/`: teacher and student training entry points
- `evaluation/`: metrics, latency, confusion matrices, and Grad-CAM
- `deployment/`: TFLite conversion, benchmarking, and one-image inference
