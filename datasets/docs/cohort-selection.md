# Labeled Cohort Selection

The cohort builder is a post-review gate. It does not create a train,
validation, or test split and does not select a partial cohort when one class is
short.

## Thesis configuration

- Cohort version: `banana-leaf-thesis-labeled-2878-v1`
- Target: 2,878 validated original images per class
- Intended total: 11,512
- Seed: 42
- Selection unit: complete `group_id`
- Configuration: `ai/config/cohort_labeled_2878_v1.json`

The target and seed are configurable through a new versioned configuration.
Changing a frozen ready cohort requires a new `cohort_version` and output path.

## Admission order

An image is eligible only after:

1. metadata and source/original-label validation;
2. banana-species, visibility, inclusion, and human QC approval;
3. expert label validation;
4. exact and near-duplicate resolution;
5. explicit biological/acquisition grouping; and
6. confirmation that the file is an original, not augmented or derived.

Every unresolved duplicate pair with two eligible endpoints must be resolved
before selection. A pair cannot affect the cohort when at least one endpoint
has been explicitly excluded. Cross-label related-image evidence remains a
blocking label conflict.

## Deterministic diversity selection

Eligible images are grouped by `group_id`; a group is either selected in full
or not selected. Groups receive a deterministic diversity rank using known:

- source dataset;
- field/public origin;
- lighting condition;
- disease appearance; and
- capture device.

Rare known strata rank before common strata. Ties use
`SHA-256(seed, class, group_id)`. A suffix subset-feasibility calculation then
selects the best-ranked set that reaches exactly the target without splitting a
group. If an exact group total is impossible, the build fails instead of taking
part of a leaf/capture family.

Unknown diversity fields contribute no artificial diversity score. Currently,
lighting, disease appearance, and capture device are unknown for every active
image, so no balance across those attributes is claimed.

## Current ready result (September 9, 2026)

| Class | Raw available | Validated eligible | Target | Selected | Conservatively excluded |
| --- | ---: | ---: | ---: | ---: | ---: |
| Healthy | 3,000 | 2,981 | 2,878 | 2,878 | 19 |
| Sigatoka | 3,000 | 2,946 | 2,878 | 2,878 | 54 |
| Panama Disease | 3,000 | 2,960 | 2,878 | 2,878 | 40 |
| Cordana Leaf Spot | 3,000 | 2,878 | 2,878 | 2,878 | 122 |

The conservative exclusion set contains all 167 unresolved near-duplicate
candidate images, 40 unreadable images, and 28 exact duplicate copies. The
sets do not overlap, for 235 exclusions total. A further 253 eligible images
from the three larger classes were not selected so that every class has the
same 2,878-image total. No image was generated or duplicated to reach it.

## Command

```powershell
.venv\Scripts\python.exe -m ai.data.build_labeled_cohort `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --metadata-manifest datasets\metadata\image_metadata.split-ready-2026-09-09.json `
  --group-manifest datasets\metadata\group_manifest.split-ready-2026-09-09.json `
  --adjudication-manifest datasets\reviews\near-duplicates\near_duplicate_adjudication.2026-09-09.json `
  --inventory-report datasets\outputs\dataset-validation-2026-09-09\image_validation_report.json `
  --cohort-config ai\config\cohort_labeled_2878_v1.json `
  --output datasets\outputs\cohorts\banana-leaf-thesis-labeled-2878-v1.json
```

The ready manifest selects paths only; no images are copied, duplicated,
augmented, deleted, or physically rearranged.

## Reproducibility evidence

- The manifest stores SHA-256 fingerprints for every selected image and every
  input artifact.
- Repeating the build with unchanged inputs produces byte-identical output.
