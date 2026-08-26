# Thesis compliance audit

This file records implementation state without inventing experimental evidence.

## Verified implementation decisions

- `ai/config/labels.py` fixes exactly four output labels and harmonizes Black/Yellow Sigatoka into Sigatoka while excluding Moko/dead-leaf material.
- `ai/config/config.py` fixes 224 × 224 RGB, ResNet-101, CA-MobileNetV3-Small, 70/15/15, macro-F1 selection, explicit SSL lambdas, and explicit KD alpha/beta/gamma/temperature.
- `ai/data/dataset.py` performs corruption/RGB checks, exact and near-duplicate screening, metadata-driven QC, group-aware stratified splitting, SSL held-out exclusion, and training-only stratified calibration selection.
- `ai/models/teacher.py` implements the ResNet-101 online path, BYOL/projector/predictor outputs, spatial MIM decoder, four logits, and near-final feature maps. The EMA target is frozen and updated without backpropagation.
- `ai/training/train_teacher.py` combines BYOL, MIM, and InfoNCE losses and removes SSL-only heads from the fine-tuning checkpoint path.
- `ai/models/mobilenetv3_student.py` places Coordinate Attention deterministically at original SE positions. `mobilenetv3_baseline.py` keeps stock SE for controls.
- `ai/training/train_student.py` freezes the teacher and applies CE + temperature-scaled KL with T² + spatially aligned MSE feature matching.
- `ai/deployment/convert_tflite.py` uses only stratified training samples for calibration and audits the produced INT8 graph.
- `mobile-frontend/App.tsx` is stateless and contains no backend/account/history dependency.

## PENDING EXPERIMENTAL VALIDATION

- Complete expert label, species, visibility/quality, inclusion, near-duplicate, and biological/acquisition group review. Metadata schema v2 now covers all 12,670 active files deterministically, but all remain human-review-blocked; 1,011 near-duplicate pairs affect 436 files, and only 16 surviving files have explicit reviewed group assignments. Seven stale group rows are preserved separately in `datasets/group_manifest_retired.json`.
- The near-duplicate queue is now an enriched, fingerprinted JSON/CSV adjudication artifact with 60 transitive candidate components, 449 same-class pairs, and 562 high-priority cross-class pairs. The decision applicator refuses to write group output while any cross-label case is unresolved or confirmed-related without separate label adjudication; no labels or images are modified.
- The deterministic labeled-cohort builder is implemented, but the 2,800-image cohort remains blocked. Cordana has 670 raw images versus the 700 target, all classes currently have zero formally eligible records, and duplicate/group review is incomplete. The blocked versioned manifest selects zero paths and reports every shortage/exclusion rather than oversampling or fabricating data. Acquire/verify the planned 8,000-image unlabeled SSL inventory separately.
- The deterministic final-split builder is implemented with transitive exact/near/leaf/plant/session grouping, seeded class stratification, immutable fingerprinted manifests, complete validation/test SSL exclusion, training-only calibration, and executable zero-leakage assertions. The real run correctly produced only a signed blocked gate report: upstream quality/cohort gates have not passed, so no final partition manifests were generated and grouping was not relaxed.
- Select SSL and KD hyperparameters from training/validation only.
- Train and validation-select all required checkpoints; run held-out and repeated-seed experiments where resources permit.
- Supply and audit the final INT8 TFLite artifact and implement the native Android `DahonMDTFLite` bridge.
- Run same-configuration FP32/INT8 benchmarks on a representative mid-range Android device.
- Predefine and expert-validate the Davao held-out field subset, then generate complete-set versus field-subset metrics.
