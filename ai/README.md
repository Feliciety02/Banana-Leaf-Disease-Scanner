# Thesis ML pipeline

The `ai` package implements four-class banana leaf disease classification with a ResNet-101 teacher and CA-MobileNetV3-Small student.

## Fixed contracts

- Input: 224 × 224 RGB, decoded and resized deterministically to float32 `[0,1]`.
- Output: `healthy`, `sigatoka`, `panama-disease`, `cordana-leaf-spot`.
- Teacher: ImageNet ResNet-101 → banana-domain BYOL + MIM + Contrastive Learning → supervised fine-tuning.
- Student: MobileNetV3-Small with Coordinate Attention at every predetermined former-SE block.
- KD: `alpha*L_CE + beta*T²*L_KD + gamma*L_feat`, with MSE-aligned near-final feature maps.
- Selection: validation macro F1 for both teacher and student.
- Deployment: full-integer INT8 TensorFlow Lite; calibration from training only.

Configuration defaults and values in `ai/config/` are candidate starting points pending validation, not claimed optimal settings.

## Code Map

| Path | Responsibility |
| --- | --- |
| `config/` | Serializable experiment contracts, validation, and versioned candidate configurations |
| `data/records.py` | Shared dataset record and split types |
| `data/image_fingerprints.py` | Public exact/perceptual fingerprint primitives used by ingestion and adjudication |
| `data/dataset.py` | Dataset validation and split orchestration plus TensorFlow input pipelines |
| `data/build_*.py` | Explicit cohort, split, SSL, and Davao manifest builders |
| `models/` and `losses/` | Teacher/student architectures and thesis loss functions |
| [`training/ENHANCED_MODEL_RUNBOOK.md`](training/ENHANCED_MODEL_RUNBOOK.md) | Short copy-paste runbook for the recommended enhanced model |
| [`training/GPU_TRAINING_GUIDE.md`](training/GPU_TRAINING_GUIDE.md) | Complete GPU guide, teacher diagnostics, and troubleshooting |
| `evaluation/` | Metrics, comparisons, Grad-CAM, and final evaluation reports |
| `deployment/` | TFLite conversion, quantization audit, inference, and benchmark tooling |
| `tests/` | Source-contract, model, dataset, and deployment protocol checks |

`config/config.py` remains one compatibility module because its schema,
validation, JSON loading/saving, and determinism functions are imported together
throughout training, evaluation, models, and tests.

## Current GPU training workflow

The root [model experiment roadmap](../MODEL_EXPERIMENTS.md) records the numbered
experiments, current evidence, and decision rules.

The recommended next run is the supervised ImageNet-initialized Coordinate
Attention student:

- `ai/config/diagnostics/ca_mobilenetv3_supervised_imagenet.json`
- `ai/training/run_enhanced_supervised_gpu.sh`
- `ai/training/monitor_training.ps1` for live batch and epoch progress

It uses the baseline's 20-epoch warm-up and 10-epoch fine-tuning schedule while
keeping transferred BatchNorm statistics frozen. It does not use the current
teacher because that teacher did not beat the baseline.

Training runs inside WSL with Linux GPU Python. The launcher defaults to
`/home/feanne/.venvs/dahonmd-tf-gpu/bin/python`. On another member's computer,
set the correct interpreter before starting:

```bash
export DAHONMD_GPU_PYTHON="/home/<your-wsl-user>/.venvs/dahonmd-tf-gpu/bin/python"
```

Replace `<your-wsl-user>` with the member's WSL username. Do not activate or
use the repository's Windows `.venv` for WSL GPU training.

Use the exact start, monitor, stop, and resume commands in the
[enhanced model runbook](training/ENHANCED_MODEL_RUNBOOK.md). Normal restarts
use the same launcher.

If the SSL teacher underperforms the baseline, use the isolated
[teacher recovery diagnostic](training/GPU_TRAINING_GUIDE.md#teacher-recovery-diagnostic).
It compares stable ImageNet-only and SSL-initialized fine-tuning without using
the test partition or overwriting the original run.

## Dataset validation

```powershell
.venv\Scripts\python.exe -m ai.data.validate_dataset `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --group-manifest datasets\metadata\group_manifest.json `
  --metadata-manifest datasets\metadata\image_metadata.json `
  --formal
```

Formal validation fails until every admitted image has the required species, visibility/quality, inclusion, and expert label decisions and every near-duplicate pair is resolved. Acquisition identifiers are used to group leaf, plant, and session captures where available.

After those gates pass, `ai.data.build_labeled_cohort` creates the exact
versioned, group-indivisible labeled cohort before any 70/15/15 split. Its
configuration is `ai/config/cohort_labeled_2878_v1.json`. A shortage or unresolved
review writes a blocked diagnostic manifest, selects no paths, and exits
nonzero; augmented or derived records can never fill the quota.

The final split is then created by `ai.data.build_final_split` using
`ai/config/final_split_2878_v1.json`. It closes exact, adjudicated-related, explicit
group, leaf, plant, and acquisition-session relations transitively before a
seeded stratified assignment. It writes partition manifests only when all
gates pass and the configured stratification tolerance is achievable without
relaxing a group. See `datasets/docs/final-split.md` for the current frozen result.

External unlabeled imagery is admitted only through
`ai.data.build_ssl_manifest`; a raw directory is rejected. The versioned
manifest requires source/license provenance, confirmed banana-leaf relevance,
integrity and duplicate screening, resolved perceptual candidates, and the
frozen validation/test SSL exclusions. See `datasets/docs/ssl-ingestion.md`. The
current external SSL-ready count is 0, not the planned target of 8,000.

Davao field acquisition uses `ai.data.build_davao_field_manifest`. Farmer or
worker labels are notes only; they do not become final labels. A photo becomes
eligible only after documented expert validation, quality and duplicate checks,
and leaf/plant/session grouping. Eligible Davao photos are final-test-only.
See `datasets/docs/davao-field-workflow.md`. The current validated Davao count is 0.

## Explicit ablations

| Configuration | Config | Entry point |
| --- | --- | --- |
| 1 MobileNetV3-Small supervised | `configuration_1_*` | `ai.training.train_baseline` |
| 2 CA-MobileNetV3-Small supervised | `configuration_2_*` | `ai.training.train_supervised_ablation` |
| 3 MobileNetV3-Small KD from SSL teacher | `configuration_3_*` | `ai.training.train_student` |
| 4 CA-MobileNetV3-Small KD from SSL teacher | `configuration_4_*` | `ai.training.train_student` |
| 5 ResNet-101 supervised without SSL | `configuration_5_*` | `ai.training.train_supervised_ablation` |
| 6 ResNet-101 SSL + supervised fine-tuning | `configuration_6_*` | `ai.training.train_teacher` |
| 7 optional CA student from non-SSL teacher | `configuration_7_*` | `ai.training.train_student` |
| 8 thesis ResNet-101 teacher variants | `configuration_8_*` | `ai.training.train_teacher` |

All configurations are under `ai/config/ablations/`. Pass the same frozen
`--final-split-dir` to every training, evaluation, and export command; never
use the locked test partition for model selection. The copy-paste GPU baseline
workflow is in `ai/training/BASELINE_FROZEN_SPLIT_RUNBOOK.md`.
tune from held-out test results.

The ablation configs are separate experiment definitions. Do not run the old
combined teacher/KD launcher until a corrected teacher has been validated.

## Evaluation and conversion

Evaluation reports accuracy, macro precision/recall/F1, per-class precision/recall/F1, and confusion matrices. Resource reports separate parameter count from file size and include FLOPs where supported, warmed repeated latency, throughput, variation, and memory scope. Expert-validated held-out records marked `field_subset=davao` receive a separate field report.

```powershell
.venv\Scripts\python.exe -m ai.deployment.convert_tflite --student-model <best_student.keras> --dataset-dir <dataset> --final-split-dir <frozen-split> --output-dir <run>
.venv\Scripts\python.exe -m ai.deployment.benchmark_tflite --tflite-model <model_int8.tflite> --dataset-dir <dataset> --final-split-dir <frozen-split> --output-dir <run>
```

Conversion writes an FP32 model, full-integer INT8 model, training-only calibration manifest, and programmatic quantization audit. Formal Android latency/memory comparison remains pending until run on named hardware with the same FP32/INT8 configuration.

Grad-CAM under `ai/evaluation/gradcam.py` is qualitative, offline evaluation only.
