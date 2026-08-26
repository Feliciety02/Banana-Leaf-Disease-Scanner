# Davao Field Image Workflow

This guide explains how to add banana-leaf photos collected in Davao without
weakening the thesis experiment. These photos are for **final field testing
only**. They must not be used for training, self-supervised learning (SSL),
model tuning, or INT8 calibration.

## Current status (August 26, 2026)

| Item | Count |
| --- | ---: |
| Images acquired | 0 |
| Images reviewed by an expert | 0 |
| Images ready for the held-out field test | **0** |
| Pending or conflicting reviews | 0 |
| Biological groups | 0 |

The project does not claim that Davao images or expert-validated field results
already exist. The current manifest is
`datasets/davao-field-workflow/manifests/davao-field-evaluation-v1.json` and
has status `empty`.

Work is currently blocked by three honest limitations:

1. No Davao field images have been added.
2. Collection permission has not been recorded as approved.
3. The main train/validation/test split is not yet frozen.

## What students need to prepare

- Put original photos in `datasets/davao-field/`. Never delete or overwrite
  the originals.
- Add collection and image details to
  `datasets/davao-field-workflow/field_registry.json`.
- Follow the example format in
  `ai/config/davao_field_registry_template.json`.
- Keep supporting permission and expert-review evidence with the research
  records. Do not store unnecessary personal information.

For every photo, record the following information when it is known:

| Field | What to enter |
| --- | --- |
| `site` | Collection site code or `unknown`. |
| `plant_id` | ID assigned to the photographed plant, or `unknown`. |
| `leaf_id` | ID assigned to the leaf, or `unknown`. |
| `acquisition_session` | ID for the collection visit or photo session. |
| `capture_device` | Phone or camera used, or `unknown`. |
| `capture_date` | Actual recorded date, not the file creation date. |
| `preliminary_label` | Farmer, worker, or collector's original observation. |
| `preliminary_label_provider` | Who supplied the preliminary observation. |
| `expert_reviewed_label` | Final class only after a documented expert review. |
| `review_status` | `pending`, `validated`, `conflict`, or `excluded`. |
| `banana_leaf_status` | Confirmed banana leaf, non-banana, or pending. |
| `qc_status` | Image-quality decision and its evidence. |

Use `unknown` or `pending` when information is unavailable. Never guess a
plant ID, leaf ID, date, site, device, or expert decision from the photo,
folder, filename, or file timestamp.

## Label rules

A farmer or plantation worker may provide a useful preliminary label, but that
label is **not** automatically a supervised or test label.

An image receives `review_status: validated` only when all of these exist:

- a class reviewed by a qualified expert;
- the expert reviewer's recorded identity or approved reviewer code;
- the review date; and
- review evidence or a reference to it.

If the preliminary and expert opinions conflict and the case is unresolved,
use `review_status: conflict` and keep the final label pending. If information
is incomplete, use `pending`. The pipeline rejects records that claim a final
expert label without the required review evidence.

## Step-by-step workflow

1. Obtain and record collection permission.
2. Copy the original photos into the Davao field folder.
3. Record site, plant, leaf, session, device, date, and preliminary-label data.
4. Check that each file opens correctly and clearly contains a banana leaf.
5. Ask a qualified agricultural expert to review the possible disease class.
6. Record the expert decision as `validated`, `pending`, `conflict`, or
   `excluded`.
7. Run the manifest builder. It checks file integrity, exact duplicates,
   near-duplicates, metadata, and overlap with the main dataset.
8. Review every unresolved near-duplicate pair. Do not delete images or change
   labels automatically.
9. Freeze a new versioned manifest before final evaluation.

## How grouping prevents leakage

Photos share one group when they are known to show the same plant, leaf, or
collection session, or when duplicate review confirms that they are related.
The builder also joins transitive relationships. For example, if A is related
to B and B is related to C, all three receive the same group ID.

Unknown values do not create a group. The software does not infer biological
identity from appearance. Every approved Davao group is test-only and is
checked against the labeled dataset and external SSL images for exact,
perceptual, and known biological overlap.

## When an image becomes field-test ready

A photo is included in the predefined Davao field subset only when it passes
all of these gates:

- valid image file and acceptable quality;
- confirmed banana-leaf relevance;
- complete expert validation;
- approved collection authority;
- resolved duplicate and near-duplicate checks;
- no forbidden overlap with the main dataset; and
- an available frozen final split.

Ready records are marked `partition: test` and `field_subset: davao`. The data
loader prevents them from entering supervised training, SSL pretraining,
validation-based tuning, checkpoint selection, or quantization calibration.

## Build command

Run this only after the main split has passed its quality gates:

```powershell
.venv\Scripts\python.exe -m ai.data.build_davao_field_manifest `
  --field-root datasets\davao-field `
  --registry datasets\davao-field-workflow\field_registry.json `
  --labeled-dataset-root datasets\banana_leaf_thesis_4class `
  --final-split-dir datasets\splits\banana-leaf-thesis-split-v1 `
  --near-reviews datasets\davao-field-workflow\near_duplicate_reviews.json `
  --config ai\config\davao_field_ingestion_v1.json `
  --output datasets\davao-field-workflow\manifests\davao-field-evaluation-v1.json
```

The command is expected to fail while required reviews or the frozen split are
missing. That failure protects the thesis from using unverified field data.

## Main files

- Workflow code: `ai/data/build_davao_field_manifest.py`
- Ingestion policy: `ai/config/davao_field_ingestion_v1.json`
- Registry example: `ai/config/davao_field_registry_template.json`
- Near-duplicate decisions:
  `datasets/davao-field-workflow/near_duplicate_reviews.json`
- Automated tests: `ai/tests/test_davao_field_ingestion.py`
