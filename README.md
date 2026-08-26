# DahonMD thesis implementation

This repository implements **CA-MobileNetV3 with Self-Supervised Learning and Knowledge Distillation for Mobile Banana Leaf Disease Classification**.

The fixed output order is:

1. Healthy
2. Sigatoka
3. Panama Disease
4. Cordana Leaf Spot

Black and Yellow Sigatoka source labels are harmonized into `Sigatoka`. Moko and the preserved `dead/` inventory are excluded from every model output and research split.

## Thesis pipeline

The teacher is ImageNet-initialized ResNet-101, followed by banana-domain self-supervised pretraining with BYOL, Masked Image Modeling, and InfoNCE-style Contrastive Learning. The weighted SSL objective exposes `lambda_byol`, `lambda_mim`, and `lambda_cl` as candidate configuration values.

After four-class supervised fine-tuning, the validation-macro-F1-selected teacher is frozen. It supervises CA-MobileNetV3-Small with cross-entropy, temperature-scaled KL divergence including `T²`, and MSE feature matching over aligned near-final `[B, 7, 7, 2048]` feature maps. Coordinate Attention replaces the fixed MobileNetV3-Small SE positions; the stock baseline preserves its SE blocks.

The selected FP32 student is exported through full-integer INT8 TensorFlow Lite conversion. Calibration uses a stratified sample of training records only, and conversion writes `quantization_audit.json` rather than assuming a `.tflite` file is valid.

## Data protocol

The planned labeled dataset is 700 images per class (2,800 total), split 70%/15%/15%. The planned SSL inventory is 8,000 unlabeled images. These are research targets, not claims about acquired or validated data.

The currently present folders contain 4,000 Healthy, 4,000 Sigatoka, 4,000 Panama Disease, 670 Cordana Leaf Spot, and 745 quarantined dead-leaf files. Formal training is intentionally blocked while expert review, quality/species decisions, near-duplicate review, and biological/acquisition grouping remain incomplete. See [datasets/README.md](datasets/README.md).

Processing order is fixed as acquisition → label harmonization/quality control → exact and near-duplicate screening → biological/acquisition grouping → 70/15/15 split → training-only augmentation. Validation/test groups cannot enter SSL or INT8 calibration.

## Android application

The production entry point is [mobile-frontend/App.tsx](mobile-frontend/App.tsx). It is a stateless camera/gallery classifier with class plus relative model confidence. It imports no authentication, database, history, synchronization, remote inference, or Grad-CAM workflow. Classification is intended to run fully on-device.

The trained INT8 artifact and native `DahonMDTFLite` module are not present, so working device inference and device benchmarking remain **PENDING EXPERIMENTAL VALIDATION**. The application fails explicitly instead of returning a simulated classification. Legacy backend/web/account/history code remains in the repository but is outside the thesis mobile production path.

Grad-CAM is restricted to offline qualitative evaluation under `ai/evaluation/`; it is not a mobile output and does not prove lesion localization or diagnostic correctness.

## Key commands

```powershell
.venv\Scripts\python.exe -m ai.data.validate_dataset --dataset-dir datasets\banana_leaf_thesis_4class --group-manifest datasets\group_manifest.json --metadata-manifest datasets\image_metadata.json --formal
.venv\Scripts\python.exe -m unittest discover -s ai\tests -v
cd mobile-frontend
npm run typecheck
npm test
```

Explicit experiment configurations are in [ai/config/ablations](ai/config/ablations). No repository file contains claimed final accuracy, chosen loss weights, repeated-run statistics, expert validation, or Android benchmark results that have not been produced experimentally.

## Repository scope

- `ai/`: research pipeline, evaluation, quantization, and offline Grad-CAM.
- `datasets/`: acquired inventory, provenance, quarantine, and review manifests.
- `mobile-frontend/`: thesis mobile entry point plus isolated legacy modules.
- `backend/` and `web-frontend/`: legacy/research utilities; not required for installation or classification.
- `docs/thesis-compliance-audit.md`: traceable compliance and pending-work record.
