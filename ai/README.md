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
| `training/` | Training entry points and experiment orchestration |
| `evaluation/` | Metrics, comparisons, Grad-CAM, and final evaluation reports |
| `deployment/` | TFLite conversion, quantization audit, inference, and benchmark tooling |
| `tests/` | Source-contract, model, dataset, and deployment protocol checks |

`config/config.py` remains one compatibility module because its schema,
validation, JSON loading/saving, and determinism functions are imported together
throughout training, evaluation, models, and tests.

## Dataset validation

```powershell
.venv\Scripts\python.exe -m ai.data.validate_dataset `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --group-manifest datasets\group_manifest.json `
  --metadata-manifest datasets\image_metadata.json `
  --formal
```

Formal validation fails until every admitted image has the required species, visibility/quality, inclusion, and expert label decisions and every near-duplicate pair is resolved. Acquisition identifiers are used to group leaf, plant, and session captures where available.

After those gates pass, `ai.data.build_labeled_cohort` creates the exact
versioned, group-indivisible labeled cohort before any 70/15/15 split. Its
configuration is `ai/config/cohort_labeled_v1.json`. A shortage or unresolved
review writes a blocked diagnostic manifest, selects no paths, and exits
nonzero; augmented or derived records can never fill the quota.

The final split is then created by `ai.data.build_final_split` using
`ai/config/final_split_v1.json`. It closes exact, adjudicated-related, explicit
group, leaf, plant, and acquisition-session relations transitively before a
seeded stratified assignment. It writes partition manifests only when all
gates pass and the configured stratification tolerance is achievable without
relaxing a group. See `datasets/FINAL_SPLIT.md` for the current blocked result.

External unlabeled imagery is admitted only through
`ai.data.build_ssl_manifest`; a raw directory is rejected. The versioned
manifest requires source/license provenance, confirmed banana-leaf relevance,
integrity and duplicate screening, resolved perceptual candidates, and the
frozen validation/test SSL exclusions. See `datasets/SSL_INGESTION.md`. The
current external SSL-ready count is 0, not the planned target of 8,000.

Davao field acquisition uses `ai.data.build_davao_field_manifest`. Farmer or
worker labels are notes only; they do not become final labels. A photo becomes
eligible only after documented expert validation, quality and duplicate checks,
and leaf/plant/session grouping. Eligible Davao photos are final-test-only.
See `datasets/DAVAO_FIELD_WORKFLOW.md`. The current validated Davao count is 0.

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

All configurations are under `ai/config/ablations/`. Pass the same frozen
`--final-split-dir` to every training, evaluation, and export command; never
tune from held-out test results.

## Evaluation and conversion

Evaluation reports accuracy, macro precision/recall/F1, per-class precision/recall/F1, and confusion matrices. Resource reports separate parameter count from file size and include FLOPs where supported, warmed repeated latency, throughput, variation, and memory scope. Expert-validated held-out records marked `field_subset=davao` receive a separate field report.

```powershell
.venv\Scripts\python.exe -m ai.deployment.convert_tflite --student-model <best_student.keras> --dataset-dir <dataset> --final-split-dir <frozen-split> --output-dir <run>
.venv\Scripts\python.exe -m ai.deployment.benchmark_tflite --tflite-model <model_int8.tflite> --dataset-dir <dataset> --final-split-dir <frozen-split> --output-dir <run>
```

Conversion writes an FP32 model, full-integer INT8 model, training-only calibration manifest, and programmatic quantization audit. Formal Android latency/memory comparison remains pending until run on named hardware with the same FP32/INT8 configuration.

Grad-CAM under `ai/evaluation/gradcam.py` is qualitative, offline evaluation only.
