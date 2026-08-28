# Dataset and Model Trainer Thesis Checklist

This is the working checklist for the DahonMD thesis member responsible for the
dataset, model training, evaluation, TensorFlow Lite artifacts, and research
evidence. Check an item only when its required evidence has been saved.

## Current status

Status reviewed on 2026-08-23 against the repository and automated tests.

- Current count: **31 verified complete**, **232 remaining**.
- `[x]` means the requirement is currently implemented and directly verifiable in the repository.
- `[ ]` means it still needs real dataset work, adviser/domain approval, a completed experiment, generated artifacts, or retained evidence.
- Completed implementation checks must be rechecked if the corresponding code or research protocol changes.
- The virtual environment and required packages are present.
- The fixed thesis outputs are Healthy, Sigatoka, Panama disease, and Cordana leaf spot. The `dead` folder is preserved as a 745-image quarantine and is never assigned an output index.
- The current 13,420-file inventory yields 12,670 canonical four-class images after five exact Cordana copies are reported and excluded without deletion. The audit found 1,011 perceptual pairs requiring review; only 16 images have explicit biological/acquisition group assignments, and all 12,670 active metadata entries remain incomplete. Formal split creation and retraining are therefore correctly blocked.
- Existing baseline/enhanced artifacts and their reports use retired contracts. They remain historical evidence only and are rejected by current runtime label-map validation. No current-contract model is trained or deployable.

The intended enhanced architecture remains Coordinate Attention-enhanced
MobileNetV3-Small, and the research baseline remains standard supervised
MobileNetV3-Small. Neither has a deployable artifact for the current taxonomy.
Do not change either variant without an approved thesis protocol amendment.

## Fixed research contract

- [ ] Confirm the four supported model classes and dead-leaf quarantine policy with the thesis adviser and agricultural/domain reviewer.
- [x] Preserve the exact output-index order from `ai/config/labels.py`:
  - `0` — `healthy`
  - `1` — `sigatoka`
  - `2` — `panama-disease`
  - `3` — `cordana-leaf-spot`
- [x] Confirm both models use MobileNetV3-Small with the same width multiplier.
- [x] Confirm model input is RGB, `224 x 224`, float32 `[0, 1]` before model-internal rescaling.
- [x] Confirm the baseline contains no Coordinate Attention, teacher, SSL, knowledge distillation, or feature distillation.
- [x] Confirm normal farmer diagnosis uses the enhanced model only.
- [ ] Record the approved protocol version and approval date in the experiment log.

Evidence required: signed/approved protocol note, class contract, active configuration snapshot.

## 1. Dataset authorization and provenance

- [ ] Identify every dataset source and responsible custodian.
- [ ] Record collection dates, locations, acquisition method, and source URLs where applicable.
- [ ] Verify permission, license, consent, or institutional authority for every source.
- [ ] Document whether images are field-captured, laboratory-captured, public, augmented, or externally supplied.
- [ ] Remove images that cannot legally or ethically be used in the thesis.
- [ ] Remove personal information, faces, location identifiers, and unrelated sensitive metadata when required.
- [ ] Preserve an untouched read-only copy of the original collected data.
- [ ] Assign a dataset version such as `dahonmd-dataset-v1`.
- [ ] Generate and store checksums for the frozen dataset inventory.
- [ ] Record who approved the frozen dataset version and when.

Evidence required: provenance register, permission/license files, original-data checksum inventory, dataset version record.

## 2. Labeling protocol

- [ ] Write observable inclusion and exclusion criteria for each class.
- [ ] Define how mixed symptoms, multiple diseases, uncertain leaves, damaged leaves, nutrient deficiencies, pests, and poor-quality images are handled.
- [ ] Require expert review or an accepted authoritative ground-truth method for labels used in final evaluation.
- [ ] Record labeler identity or anonymous reviewer code for every reviewed image.
- [ ] Record the initial label, final label, review date, and disagreement resolution.
- [ ] Keep uncertain/unverified images outside the final supervised dataset until resolved.
- [ ] Do not infer ground truth from an earlier model prediction.
- [ ] Do not silently relabel images after the split is frozen.
- [ ] If labels change, create a new version and document the reason.
- [ ] Calculate and report inter-rater agreement when multiple qualified labelers independently review the same subset.

Evidence required: labeling guide, review log, disagreement log, final approved label inventory.

## 3. Metadata and grouping

- [ ] Give every original image a stable image ID.
- [ ] Create stable group IDs for the same leaf, plant, plot, plantation, capture session, or near-duplicate sequence.
- [ ] Populate `data.group_manifest` whenever multiple images can originate from one biological specimen or acquisition group.
- [ ] Record available metadata without inventing missing values:
  - source dataset, repository, or collector
  - plant ID and leaf ID
  - plantation/site code
  - acquisition-session or collection-batch ID
  - capture device
  - date/time or collection batch
  - field versus curated setting
  - lighting condition
  - image format and dimensions
  - disease stage or severity when expert-confirmed
  - label source/reviewer
- [ ] Use neutral values such as `unknown` for genuinely unavailable metadata.
- [ ] Validate that one group ID never spans conflicting class labels.

Evidence required: metadata dictionary, image inventory, group manifest, conflict-resolution log.

## 4. Dataset quality control

- [ ] Run corruption and decoder checks on all images.
- [ ] Remove files that are unreadable, empty, truncated, or not actual images.
- [ ] Detect byte-identical duplicates using SHA-256.
- [ ] Review perceptual or near duplicates so similar frames cannot leak across splits.
- [ ] Review images for severe blur, occlusion, screenshots, watermarks, borders, labels printed on the image, and unrelated backgrounds.
- [ ] Check whether class-identifying acquisition artifacts exist, such as one class coming from only one website or camera.
- [ ] Review unusually small, wide, tall, or heavily compressed images.
- [ ] Record each exclusion and its reason rather than deleting without an audit trail.
- [ ] Produce class counts before and after quality control.
- [ ] Produce source, device, and site counts where metadata permits.
- [ ] Assess class imbalance and document the selected mitigation without changing the test distribution.
- [ ] Have a domain reviewer inspect a random sample and all ambiguous cases.

Evidence required: QC report, exclusion register, duplicate report, class/source/device counts, reviewer sign-off.

## 5. Dataset directory and environment

- [ ] Place approved data under `datasets/banana_leaf_thesis_4class` or the approved external dataset path.
- [ ] Use the exact class directory keys from the fixed label contract.
- [ ] For a pre-split dataset, use `train`, `validation` or `val`, and `test` directories consistently.
- [ ] Copy `ai/.env.example` to `ai/.env` locally.
- [ ] Set `DATASET_ROOT` to the approved dataset location.
- [x] Create and activate the project virtual environment.
- [x] Install `ai/requirements.txt`.
- [ ] Record Python, TensorFlow, CUDA/cuDNN if applicable, operating system, CPU, GPU, RAM, and package versions.
- [ ] Confirm sufficient storage for checkpoints, reports, matrices, and TFLite exports.

Setup commands from the repository root:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r ai\requirements.txt
Copy-Item ai\.env.example ai\.env
```

Evidence required: environment export, hardware record, completed local `.env` without committing secrets or private paths.

## 6. Freeze the shared split

- [ ] Complete corruption screening, exact-deduplication, near-duplicate review, provenance recording, and group assignment **before** generating any split.
- [ ] Run dataset validation using the approved dataset version.
- [ ] Inspect every validator warning or failure.
- [ ] Confirm each class has enough independent groups for train, validation, and test.
- [ ] Confirm no image hash occurs in more than one split.
- [ ] Confirm no biological/acquisition group occurs in more than one split.
- [ ] Confirm the intended train/validation/test fractions or approved pre-split assignments.
- [ ] Save the generated `ai/artifacts/split_manifest.json`.
- [ ] Save `ai/artifacts/label_map.json` with the canonical order.
- [ ] Generate SHA-256 checksums for both files.
- [ ] Mark the test partition as locked; do not use it for model selection, tuning, threshold selection, or early stopping.
- [ ] Use only the training partition for self-supervised pretraining; do not expose validation or test pixels to SSL even with labels removed.
- [ ] Use this exact manifest for teacher, enhanced student, baseline, Keras evaluation, and TFLite evaluation.
- [ ] If the dataset changes, create a new dataset/split version instead of overwriting the frozen experiment.

Validation command:

```powershell
.venv\Scripts\python.exe -m ai.data.validate_dataset `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --group-manifest datasets\group_manifest.json `
  --metadata-manifest datasets\image_metadata.json `
  --near-duplicate-review-manifest datasets\near_duplicate_reviews.json `
  --formal
```

Evidence required: validator output, split counts, `split_manifest.json`, `label_map.json`, checksums.

## 7. Preprocessing and augmentation audit

- [x] Verify decoding produces three-channel RGB.
- [x] Verify resize is bilinear with antialiasing at `224 x 224`.
- [x] Verify decoded tensors are float32 `[0, 1]`.
- [x] Verify each model rescales only once to `[-1, 1]` internally.
- [x] Confirm there is no double normalization.
- [ ] Confirm validation, test, TFLite comparison, and mobile inference receive no random augmentation.
- [x] Confirm augmentation is applied only to training batches.
- [x] Confirm augmentation is constructed and applied only after the frozen split is loaded.
- [ ] Save representative before/after augmentation examples for visual review.
- [ ] Confirm rotations, flips, brightness, contrast, zoom, and translation do not create biologically misleading samples.
- [x] Keep baseline and enhanced supervised training augmentation identical.

Evidence required: preprocessing contract, augmentation samples, reviewer notes, active augmentation configuration.

## 8. Reproducibility setup

- [ ] Choose and record the approved random seed.
- [ ] Preserve deterministic settings where supported.
- [ ] Save the exact experiment configuration for every run.
- [ ] Give every run a unique ID and output directory.
- [ ] Record the source-code commit hash for every official run.
- [ ] Record dataset version and split-manifest checksum for every run.
- [ ] Record start/end time and training duration.
- [ ] Record hardware and software environment.
- [ ] Record all deviations, interruptions, restarts, and failed runs.
- [ ] Never replace a failed run's log with a later run without retaining both records.

Suggested run ID:

```text
YYYYMMDD_model_datasetversion_seed_runNumber
```

Evidence required: experiment register and immutable configuration/log folder per run.

## 9. Standard MobileNetV3-Small baseline

- [x] Review `ai/models/mobilenetv3_baseline.py` and confirm it builds stock Keras MobileNetV3-Small.
- [ ] Confirm ImageNet initialization policy matches the approved experiment design and is disclosed.
- [x] Confirm the five-logit classifier uses the canonical label order.
- [x] Confirm no enhanced-only component is imported into baseline training.
- [ ] Train the classifier with the backbone frozen.
- [ ] Fine-tune using the approved lower learning rate unless the protocol explicitly disables it.
- [ ] Use validation data only for checkpoint selection, early stopping, and learning-rate decisions.
- [ ] Save the best validation checkpoint as `ai/artifacts/best_baseline.keras`.
- [ ] Save complete epoch history and learning-rate history.
- [ ] Record signs of overfitting, instability, collapse, or class bias.
- [ ] Do not inspect final test metrics until the baseline configuration is frozen.

Command:

```powershell
.venv\Scripts\python.exe -m ai.training.train_baseline `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --split-manifest ai\artifacts\split_manifest.json
```

Evidence required: configuration, console log, `baseline_history.json`, best checkpoint, checkpoint checksum.

## 10. Existing enhanced training workflow

- [x] Confirm the enhanced architecture remains `MobileNetV3SmallCoordinateAttention`.
- [x] Confirm the existing Coordinate Attention implementation is unchanged unless an approved defect is documented.
- [ ] Train the ResNet-101 teacher using only the approved pipeline and shared split.
- [ ] Save and evaluate `best_teacher.keras`.
- [x] Confirm the teacher is frozen during student distillation.
- [ ] Train the enhanced student with the approved hard-label, logit-distillation, and feature-distillation settings.
- [ ] Save `best_student.keras` using validation performance only.
- [ ] Save teacher and student histories and configuration snapshots.
- [x] Do not deploy ResNet-101 to the mobile application.
- [x] Do not mix baseline training with teacher, SSL, Coordinate Attention, or distillation.

Commands:

```powershell
.venv\Scripts\python.exe -m ai.training.train_teacher `
  --dataset-dir datasets\banana_leaf_thesis_4class

.venv\Scripts\python.exe -m ai.evaluation.evaluate_teacher `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --teacher-model ai\artifacts\best_teacher.keras

.venv\Scripts\python.exe -m ai.training.train_student `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --teacher-model ai\artifacts\best_teacher.keras
```

Evidence required: teacher/student configurations, histories, checkpoints, checksums, training logs.

## 11. Hyperparameter and experiment discipline

- [ ] Define the search space before reviewing final test results.
- [ ] Tune only with training and validation partitions.
- [ ] Give baseline and enhanced models a fair, documented tuning budget.
- [ ] Record every attempted configuration, including unsuccessful runs.
- [ ] Avoid selecting only the most favorable random seed.
- [ ] If multiple seeds are required, use the same seed set for comparable experiments.
- [ ] Report mean, variability, and all included seeds rather than only the best run.
- [ ] Freeze the final configuration before opening the held-out test results.
- [ ] Document the checkpoint selection rule.
- [ ] Obtain adviser approval before changing primary metrics or comparison rules after seeing results.

Evidence required: search plan, run table, selection rationale, frozen final configuration.

## 12. Keras held-out evaluation

- [ ] Evaluate the final baseline checkpoint once on the locked test set.
- [ ] Evaluate the final enhanced checkpoint on the same test records.
- [ ] Calculate and save:
  - accuracy
  - macro precision
  - macro recall
  - macro F1-score
  - per-class precision
  - per-class recall
  - per-class F1-score
  - per-class support
  - confusion matrix
  - parameter count
  - estimated FLOPs where supported
  - Keras latency with documented hardware and run count
- [ ] Save correct and incorrect Grad-CAM examples for both models.
- [ ] Inspect false positives and false negatives by class.
- [ ] Stratify by source, device, site, lighting, format, or field/curated status where sample sizes permit.
- [ ] Report subgroup sample counts and treat small groups as exploratory.
- [ ] Never describe higher confidence as higher accuracy.

Commands:

```powershell
.venv\Scripts\python.exe -m ai.evaluation.evaluate_baseline `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --split-manifest ai\artifacts\split_manifest.json `
  --baseline-model ai\artifacts\best_baseline.keras

.venv\Scripts\python.exe -m ai.evaluation.evaluate_student `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --split-manifest ai\artifacts\split_manifest.json `
  --student-model ai\artifacts\best_student.keras
```

Evidence required: JSON reports, confusion matrices, Grad-CAM outputs, error-analysis notes.

## 13. Controlled comparison and statistical analysis

- [x] Combine reports only after the experiment-contract fingerprints match.
- [x] Verify matching MobileNetV3 variant, input contract, label order, and split-manifest SHA-256.
- [x] Produce the baseline-versus-enhanced metric table.
- [x] Report absolute metric differences without overstating practical importance.
- [ ] Calculate confidence intervals using a documented method appropriate to the test design.
- [ ] Consider a paired prediction test such as McNemar's test when approved by the thesis statistician/adviser.
- [ ] Preserve per-image predictions so paired analysis is reproducible.
- [x] Discuss class imbalance and test-set size when interpreting results.
- [x] Report negative, neutral, and unexpected results.
- [x] Do not claim generalization beyond the represented data sources and conditions.

Command:

```powershell
.venv\Scripts\python.exe -m ai.evaluation.compare_models `
  --baseline-report ai\artifacts\baseline_evaluation.json `
  --enhanced-report ai\artifacts\student_evaluation.json `
  --output ai\artifacts\model_comparison.json
```

Evidence required: comparison JSON/table, statistical-analysis script or notebook, adviser/statistician review.

## 14. TensorFlow Lite export and quantization

- [x] Export baseline FP32 TFLite.
- [x] Export baseline fully integer INT8 TFLite.
- [x] Export enhanced FP32 TFLite using the existing converter.
- [x] Export enhanced fully integer INT8 TFLite.
- [x] Use representative samples only from the training partition for INT8 calibration.
- [ ] Confirm input/output shapes, dtypes, quantization scales, and zero points.
- [x] Confirm both exported models preserve the canonical five-label order.
- [x] Save model file sizes and SHA-256 checksums.
- [x] Compare Keras, FP32 TFLite, and INT8 TFLite predictions on the same held-out images.
- [x] Report quantization-related accuracy changes instead of assuming equivalence.
- [x] Reject any artifact that is corrupt, mismatched, or produces an unexpected tensor contract.

Commands:

```powershell
.venv\Scripts\python.exe -m ai.deployment.convert_baseline_tflite `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --split-manifest ai\artifacts\split_manifest.json `
  --baseline-model ai\artifacts\best_baseline.keras

.venv\Scripts\python.exe -m ai.deployment.convert_tflite `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --student-model ai\artifacts\best_student.keras
```

Evidence required: four TFLite files, conversion logs, tensor-contract report, checksums.

## 15. TFLite test-set benchmarking

- [x] Benchmark baseline INT8 on the locked test partition.
- [x] Benchmark enhanced INT8 on the same test images and same computer runtime.
- [x] Use the same thread count and warm-up policy.
- [x] Record mean, median, and p95 invocation latency.
- [x] Record the number of measured runs.
- [x] Save INT8 accuracy, macro metrics, per-class metrics, and confusion matrices.
- [x] Compare INT8 results with matching FP32 TFLite and Keras reports.
- [x] Do not treat desktop TFLite latency as mobile-device latency.

Commands:

```powershell
.venv\Scripts\python.exe -m ai.deployment.benchmark_tflite `
  --model-kind baseline `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --split-manifest ai\artifacts\split_manifest.json `
  --tflite-model ai\artifacts\baseline_mobilenetv3_small_int8.tflite

.venv\Scripts\python.exe -m ai.deployment.benchmark_tflite `
  --model-kind enhanced `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --split-manifest ai\artifacts\split_manifest.json `
  --tflite-model ai\artifacts\enhanced_mobilenetv3_int8.tflite
```

Evidence required: baseline/enhanced INT8 reports, matrices, runtime/hardware record.

## 16. Single-image research comparison validation

- [x] Run one shared decoded tensor through baseline first and enhanced second.
- [x] Verify the baseline interpreter is released before enhanced loading.
- [x] Verify the report includes timestamp, runtime, model size, prediction, probabilities, confidence, and invocation latency.
- [x] Verify agreement and differences are calculated correctly.
- [x] Verify the UI does not state that higher confidence means better accuracy.
- [x] Confirm research comparisons are not written to farmer diagnosis history.
- [x] Test a disagreement case with the real pilot artifacts.
- [ ] Test an agreement case with the real pilot artifacts.
- [ ] Test invalid label maps, missing model files, corrupt images, and incompatible tensor shapes.

Command:

```powershell
.venv\Scripts\python.exe -m ai.deployment.compare_tflite `
  --baseline-model ai\artifacts\baseline_mobilenetv3_small_int8.tflite `
  --enhanced-model ai\artifacts\enhanced_mobilenetv3_int8.tflite `
  --label-map ai\artifacts\label_map.json `
  --image path\to\banana-leaf.jpg `
  --output ai\artifacts\single_image_comparison.json
```

Evidence required: comparison JSON examples and validation/error-case log.

## 17. Physical mobile-device benchmarking

- [ ] Select and record the actual target phone model(s), OS version, chipset, RAM, and available storage.
- [ ] Use the same application build and TFLite runtime for both models.
- [ ] Use airplane/offline conditions where appropriate to isolate local inference.
- [ ] Define a fixed warm-up count and measured repetition count before testing.
- [ ] Use the same image set and sequence for both models.
- [ ] Run models sequentially to avoid simultaneous interpreter memory effects.
- [ ] Measure invocation latency and end-to-end latency separately where possible.
- [ ] Record mean, median, p95 latency, FPS if meaningful, and model-loading time.
- [ ] Record peak memory only when a reliable platform profiler is available.
- [ ] Record thermal state, battery condition, and background-process controls.
- [ ] Repeat measurements or use multiple runs/devices as required by the approved protocol.
- [ ] Do not substitute server or desktop latency for phone latency.
- [ ] Do not fabricate memory, power, FPS, or device information when APIs are unavailable.

Evidence required: raw timing logs, profiler exports/screenshots, device specification sheet, summarized benchmark table.

## 18. Robustness and error analysis

- [ ] Review the confusion matrix for recurring class confusions.
- [ ] Inspect errors involving Dead leaf, Sigatoka, Panama disease, Cordana leaf spot, and Healthy separately.
- [ ] Review low-confidence correct predictions and high-confidence incorrect predictions.
- [ ] Check performance under blur, shadows, clutter, occlusion, varying distances, and different capture devices where real samples exist.
- [ ] Check field images separately from curated images when sample sizes permit.
- [ ] Identify out-of-scope diseases and abiotic conditions likely to resemble supported classes.
- [ ] Document the model's inability to confirm pathogens or exclude every other cause from one image.
- [ ] Recommend referral to an agricultural professional for uncertain, severe, unusual, or rapidly spreading symptoms.
- [ ] Use Grad-CAM as an interpretability aid, not proof of causal reasoning or biological validity.

Evidence required: categorized error gallery, written limitations, robustness table with sample counts.

## 19. Optional ablation studies requiring prior approval

- [ ] Confirm with the adviser which ablations are required before running them.
- [ ] Possible approved ablations may include:
  - standard MobileNetV3-Small baseline
  - MobileNetV3-Small plus Coordinate Attention without distillation
  - enhanced model with logit distillation only
  - enhanced model with feature distillation disabled
  - final full enhanced configuration
- [ ] Change one controlled factor at a time.
- [ ] Use the same split, preprocessing, evaluation, and reporting contract.
- [ ] Do not silently redefine the primary baseline.
- [ ] Label exploratory ablations separately from confirmatory experiments.

Evidence required: adviser approval, ablation configurations, full result table, interpretation.

## 20. Artifact handoff to application members

- [ ] Provide only validated final artifacts.
- [ ] Supply these files together:
  - `baseline_mobilenetv3_small_int8.tflite`
  - `enhanced_mobilenetv3_int8.tflite`
  - `label_map.json`
  - preprocessing/tensor contract
  - artifact checksums
  - model version identifiers
  - evaluation reports
- [ ] Confirm model filenames and paths with the application member before integration.
- [x] Confirm farmer mode references enhanced only.
- [x] Confirm research mode references both models in the correct order.
- [ ] Provide known-good test images with expected raw outputs for integration testing.
- [ ] Do not hand off ResNet-101 teacher weights for mobile deployment.
- [ ] Do not mark production inference ready until application and model outputs are cross-checked.

Evidence required: signed handoff checklist, artifact manifest, checksums, integration test results.

## 21. Thesis tables and figures to prepare

- [ ] Dataset provenance table.
- [ ] Class distribution before and after QC.
- [ ] Train/validation/test distribution by class and group.
- [ ] Dataset preprocessing and augmentation diagram.
- [ ] Baseline architecture diagram with metrics outside the forward path.
- [ ] Enhanced teacher/student architecture diagram.
- [ ] Baseline versus enhanced experimental-control table.
- [ ] Training and validation curves.
- [ ] Baseline and enhanced confusion matrices.
- [ ] Per-class precision, recall, F1, and support table.
- [ ] Accuracy and macro-metric comparison table.
- [ ] Parameter, FLOP, and file-size table.
- [ ] Keras, FP32 TFLite, INT8 TFLite, and physical-phone latency table.
- [ ] Quantization accuracy-change table.
- [ ] Correct/incorrect Grad-CAM examples with cautious captions.
- [ ] Representative failure-case figure.
- [ ] Limitations and threat-to-validity summary.

Evidence required: editable source files plus export-ready figures/tables with captions and data references.

## 22. Thesis writing responsibilities

- [ ] Describe dataset acquisition and approval without overstating representativeness.
- [ ] Describe labeling and expert-validation procedures.
- [ ] Explain group-aware splitting and leakage prevention.
- [ ] State the fixed class order and preprocessing contract.
- [ ] Explain why MobileNetV3-Small is used for both baseline and enhanced models.
- [ ] Describe baseline supervised training separately from enhanced SSL/distillation training.
- [ ] State checkpoint-selection and hyperparameter-tuning rules.
- [ ] Report all final metrics with sample counts.
- [ ] Distinguish Keras, desktop TFLite, and physical-phone measurements.
- [ ] Explain that confidence is not accuracy or diagnostic certainty.
- [ ] Document dataset bias, label uncertainty, domain shift, supported-class limits, and image-only limitations.
- [ ] Avoid causal, clinical, or field-diagnostic claims unsupported by the experiment.
- [ ] Ensure every table and figure can be traced to a saved artifact or script output.

Evidence required: completed Methods, Results, Discussion, Limitations, and reproducibility appendix sections.

## 23. Final reproducibility package

- [ ] Save the final source-code commit hash.
- [ ] Save dataset version, inventory, provenance, and split-manifest checksum.
- [ ] Save environment/package versions.
- [ ] Save all approved configuration snapshots.
- [ ] Save raw training histories and evaluation JSON files.
- [ ] Save per-image test predictions for paired analysis.
- [ ] Save confusion matrices and Grad-CAM figures.
- [ ] Save TFLite tensor details and artifact checksums.
- [ ] Save desktop and mobile raw benchmark logs.
- [ ] Save the final comparison table and statistical outputs.
- [ ] Store restricted data securely and document how authorized examiners can reproduce the work.
- [ ] Verify no passwords, tokens, private paths, or restricted images are committed to Git.

Evidence required: archived reproducibility package and inventory document.

## 24. Final go/no-go gates

### Dataset ready

- [ ] Provenance and usage authorization complete.
- [ ] Labels reviewed and uncertain cases resolved or excluded.
- [ ] QC and duplicate checks complete.
- [ ] Group-aware split frozen with no leakage.
- [ ] Class order and preprocessing contract verified.

### Baseline ready

- [ ] Baseline trained without enhanced-only methods.
- [ ] Best validation checkpoint saved.
- [ ] Locked test evaluation completed once configuration was frozen.
- [ ] FP32 and INT8 exports validated.

### Enhanced ready

- [x] Existing enhanced architecture preserved.
- [ ] Teacher and enhanced student trained with approved settings.
- [ ] Best validation checkpoint saved.
- [ ] Locked test evaluation and TFLite validation complete.

### Comparison ready

- [x] Experiment-contract fingerprints match.
- [x] Baseline and enhanced metrics come from identical test images.
- [x] Sequential comparison works with real pilot artifacts.
- [x] Research comparisons are not written to farmer history.
- [x] Conclusions use held-out metrics, not confidence alone.

### Thesis submission ready

- [ ] All values trace to retained evidence.
- [ ] Mobile claims come from physical-device testing.
- [x] Pilot limitations and negative results are disclosed.
- [ ] Adviser/domain reviewer approvals are recorded.
- [ ] Reproducibility package is complete.

## Progress update template

Use this for each laboratory or thesis-team update:

```text
Date:
Member:
Dataset version:
Split manifest SHA-256:
Code commit:
Experiment/run ID:

Completed:
-

Evidence produced:
-

Current results (actual values only):
-

Problems or failed runs:
-

Decisions needed from adviser/domain reviewer:
-

Next tasks:
-
```

## Definition of done for the dataset/model trainer member

The member's work is complete only when the frozen, approved dataset can be
traced from provenance through its split manifest; baseline and enhanced models
have been trained and evaluated on the same records; validated Keras and TFLite
artifacts, checksums, raw reports, and physical-phone benchmarks have been
handed off; thesis tables are reproducible from retained evidence; and no result
or measurement has been fabricated or inferred from confidence alone.
