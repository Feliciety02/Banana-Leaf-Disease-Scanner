# Thesis Source-Contract Audit — Release Verification Pending

> This table records source-level protocol evidence. It is not a final release certificate.
> The dated architecture audit in `docs/architecture-audit-2026-08-28.md` is authoritative for runtime readiness and remaining blockers.

---

## Requirements Verification

| # | Requirement | Status | Evidence | File |
|---|---|---|---|---|
| 1 | Four classes only | ✅ Verified | `CLASS_LABELS` = 4 tuples, `NUM_CLASSES = 4`, `assert len(CLASS_LABELS) == NUM_CLASSES`, config validation raises if `num_classes != len(CLASS_LABELS)` | `ai/config/labels.py:8-13,26-28` `ai/config/config.py:217-218` |
| 2 | No Moko production class | ✅ Verified | `"moko": None`, `"moko-disease": None`, `"moko_disease": None` — all map to `None` (excluded). `QUARANTINED_CLASS_NAMES = ("dead",)`. Config validation: `set(class_names).intersection(quarantined_class_names)` raises. | `ai/config/labels.py:49-52,17` `ai/config/config.py:229-230` |
| 3 | Black/Yellow Sigatoka merged | ✅ Verified | `"black-sigatoka": "sigatoka"`, `"black_sigatoka": "sigatoka"`, `"black sigatoka": "sigatoka"`, `"yellow-sigatoka": "sigatoka"`, `"yellow_sigatoka": "sigatoka"`, `"yellow sigatoka": "sigatoka"` — all 6 variants map to single `"sigatoka"` | `ai/config/labels.py:36-41` |
| 4 | ResNet-101 teacher | ✅ Verified | `TeacherConfig.backbone = "ResNet101"`, validation: `if self.teacher.backbone != "ResNet101": raise ValueError`. `build_teacher()` uses `tf.keras.applications.ResNet101`. Feature dim = 2048. | `ai/config/config.py:109,247-248` `ai/models/teacher.py:23-62` |
| 5 | BYOL + MIM + Contrastive Learning | ✅ Verified | Teacher config: `lambda_cl=1.0`, `lambda_byol=1.0`, `lambda_mim=1.0`. Teacher model has `projection`, `prediction` (BYOL heads), `reconstruction` (MIM head). `train_teacher.py` Phase 1: SSL pretraining with BYOL EMA + NT-Xent + MIM. | `ai/config/config.py:125-128` `ai/models/teacher.py:40-51` `ai/models/byol_heads.py` `ai/models/mim_head.py` `ai/training/train_teacher.py` |
| 6 | Supervised teacher fine-tuning | ✅ Verified | `train_teacher.py` two-phase pipeline: Phase 1 = SSL pretraining, Phase 2 = supervised fine-tuning. `finetune_epochs=100`, `finetune_learning_rate=1e-4`. Phase 2 drops SSL heads, trains classifier with early stopping + LR reduction. | `ai/training/train_teacher.py:1-382` `ai/config/config.py:118-119` |
| 7 | Frozen teacher | ✅ Verified | `train_student.py:54`: `teacher.trainable = False`. Lines 56-62: all teacher layers set `trainable = False`, wrapped in `frozen_teacher_distillation_view`. Teacher execution is outside the GradientTape. | `ai/training/train_student.py:54-62,106` |
| 8 | CA-MobileNetV3-Small | ✅ Verified | `StudentConfig.backbone = "MobileNetV3SmallCoordinateAttention"`, `coordinate_attention = True`. Config validation raises if backbone doesn't match. CA replaces every SE block in 11 inverted residuals. | `ai/config/config.py:133-134,251-259` `ai/models/mobilenetv3_student.py:28-64` `ai/models/coordinate_attention.py:1-53` |
| 9 | CE + KL + feature KD | ✅ Verified | `distillation_loss.py`: `logit_distillation_loss` (KL divergence with T² scaling), `feature_distillation_loss` (MSE on 4D feature maps), `total_distillation_loss = α·L_CE + β·L_KD + γ·L_feat`. | `ai/losses/distillation_loss.py:6-48` `ai/training/train_student.py` |
| 10 | Validation macro-F1 selection | ✅ Verified | `ExperimentConfig.selection_metric = "macro_f1"`. Validation: `if self.selection_metric != "macro_f1": raise ValueError`. | `ai/config/config.py:193,206-207` |
| 11 | Group-aware leakage control | ✅ Verified | `_stratified_group_assignment()`: groups are indivisible. Leakage detection: `seen_hashes` and `seen_groups` dicts check all splits. `build_ssl_pretraining_records()`: validates held-out hash/group exclusion. Davao overlap: checks path/hash/group against all existing splits. | `ai/data/dataset.py:673-694,772-786,860-890,1096-1125,1375-1387` |
| 12 | Train-only calibration | ✅ Verified | `convert_tflite.py:48`: `select_stratified_representative_records(splits.train, ...)`. Calibration manifest: `"validation_or_test_samples": 0`, `"source_partition": "train"`. | `ai/deployment/convert_tflite.py:48-63` |
| 13 | INT8 TFLite | ✅ Verified | `convert_tflite.py`: `target_spec.supported_ops = [TFLITE_BUILTINS_INT8]`, `inference_input_type = tf.int8`, `inference_output_type = tf.int8`. `quantization_audit.py`: checks `input_dtype_int8`, `output_dtype_int8`, `no_floating_point_tensors`, `full_integer_verified`. | `ai/deployment/convert_tflite.py:70-82` `ai/deployment/quantization_audit.py:30-56` |
| 14 | Working native Android inference | ⚠️ Source implemented; runtime blocked | `DahonMDTFLiteModule.kt` contains local model loading, exact INT8 tensor checks, and mutex-serialized inference. The required `.tflite` asset is absent and the Android device path has not run. | `modules/dahonmd-tflite/android/.../DahonMDTFLiteModule.kt` `modules/dahonmd-tflite/index.ts` `mobile-frontend/src/services/inference.ts` |
| 15 | Offline stateless app | ❌ Release not verified | The active dependency graph is stateless and network-free, but classification cannot complete without the missing model asset. `check-release-readiness.mjs` fails closed. | `mobile-frontend/App.tsx` `mobile-frontend/scripts/check-release-readiness.mjs` |
| 16 | No production backend dependency | ✅ Verified | `package.json` grep: no `firebase`, `supabase`, `auth`, `http`, `backend` packages. `check-release-readiness.mjs` bans `services/http`, `services/auth`, `services/database`, `services/sync`. | `mobile-frontend/package.json` `mobile-frontend/scripts/check-release-readiness.mjs:4` |
| 17 | No accounts/history | ✅ Verified | `App.tsx:21`: explicit "No account, Internet connection, upload, or scan history is required." No `AsyncStorage`, `SecureStore`, `SQLite`, or any persistence layer. | `mobile-frontend/App.tsx:21` |
| 18 | Grad-CAM evaluation-only | ✅ Verified | `gradcam_thesis.py` docstring: "Grad-CAM is a research-evaluation-only technique." `QUALITATIVE_DISCLAIMER`: "does NOT prove spatial localisation accuracy, diagnostic correctness, or clinical reliability." Not imported in `inference.ts` or `App.tsx`. | `ai/evaluation/gradcam_thesis.py:1-15,85-100` |
| 19 | Correct metrics | ✅ Verified | `metrics.py`: `classification_metrics()` computes accuracy, macro P/R/F1, per-class P/R/F1/support, confusion matrix, classification_report. `final_evaluation.py`: reports all for teacher, student, baseline. `compare_final.py`: comparison tables. `csv_export.py`: CSV export. | `ai/evaluation/metrics.py:17-54` `ai/evaluation/final_evaluation.py` `ai/evaluation/compare_final.py` `ai/evaluation/csv_export.py` |
| 20 | Davao field evaluation support | ✅ Verified | `final_evaluation.py:302`: filters `field_subset == "davao"` and `label_review_status == "validated"`. Writes `student_davao_field_evaluation.json` + confusion matrix. `compare_final.py`: held-out vs Davao contrast with deltas. | `ai/evaluation/final_evaluation.py:298-310` `ai/evaluation/compare_final.py` `ai/data/build_davao_field_manifest.py` |
| 21 | Documentation consistent with implementation | ✅ Verified | Root, mobile, and architecture documentation now distinguish the stateless thesis client from legacy/demo server-backed utilities and disclose the missing release artifact. | `README.md` `mobile-frontend/README.md` `docs/architecture.md` `docs/architecture-audit-2026-08-28.md` |

---

## Conclusion

**SOURCE CONTRACT IMPLEMENTED — RELEASE NOT VERIFIED**

The static architecture and scientific protocol are implemented, but the offline runtime acceptance test remains blocked.

Remaining items are execution-time dependencies (not implementation blockers):

| Item | Status | Note |
|---|---|---|
| Dataset not yet on disk | ⚠️ Expected | Phases 1–5 require the physical dataset |
| Trained model files not yet generated | ⚠️ Expected | Phases 6–9 produce `.keras` and `.tflite` artifacts |
| `ca_mobilenetv3_small_int8.tflite` not bundled | ❌ Release blocker | Produced by Phase 9, copied in Phase 9b |
| On-device offline test and benchmark not run | ❌ Verification blocker | Phase 12b requires representative Android hardware |
| All `PENDING EXPERIMENTAL VALIDATION` markers | ⚠️ Expected | These are intentional gates that resolve once training + device testing complete |
