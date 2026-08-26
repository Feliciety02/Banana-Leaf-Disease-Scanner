# Labeled Cohort Selection

The cohort builder is a post-review gate. It does not create a train,
validation, or test split and does not select a partial cohort when one class is
short.

## Thesis configuration

- Cohort version: `banana-leaf-thesis-labeled-v1`
- Target: 700 validated original images per class
- Intended total: 2,800
- Seed: 42
- Selection unit: complete `group_id`
- Configuration: `ai/config/cohort_labeled_v1.json`

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

The duplicate adjudication queue must be globally resolved before any cohort is
selected. Cross-label related-image evidence remains a blocking label conflict.

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

## Current blocked result

| Class | Raw available | Documented original | Validated eligible | Target | Raw shortage | Selected |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Healthy | 4,000 | 3,802 | 0 | 700 | 0 | 0 |
| Sigatoka | 4,000 | 3,942 | 0 | 700 | 0 | 0 |
| Panama Disease | 4,000 | 3,941 | 0 | 700 | 0 | 0 |
| Cordana Leaf Spot | 670 | 437 | 0 | 700 | **30** | 0 |

The 233 Cordana records with undocumented provenance/originality remain
unknown; they are not automatically called augmented, original, or invalid.
Even if every current Cordana file later passes review, at least 30 additional
validated original Cordana images are required to reach 700.

Available source distribution:

| Class | Sources |
| --- | --- |
| Healthy | Zenodo Tanzania 3,217; v4 585; unknown 198 |
| Sigatoka | Zenodo Tanzania 3,194; v4 667; Banana Disease Recognition 81; unknown 58 |
| Panama Disease | Zenodo Tanzania 3,904; Banana Disease Recognition 37; unknown 59 |
| Cordana Leaf Spot | Ecuador repository 266; BananaLSD 128; v4 43; unknown 233 |

Additional global blockers are 1,011 unresolved near-duplicate pairs, including
562 cross-label high-priority pairs. Expert, species, quality, inclusion, and
group review are also incomplete. Consequently, the versioned manifest has
`status=blocked`, contains zero selected paths, and reports all exclusion
reasons rather than manufacturing a balanced cohort.

## Command

```powershell
.venv\Scripts\python.exe -m ai.data.build_labeled_cohort `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --metadata-manifest datasets\image_metadata.json `
  --group-manifest datasets\group_manifest.json `
  --adjudication-manifest datasets\near_duplicate_adjudication.json `
  --inventory-report ai\artifacts\thesis-compliance-audit-20260826\image_validation_report.json `
  --cohort-config ai\config\cohort_labeled_v1.json `
  --output datasets\cohorts\banana-leaf-thesis-labeled-v1.blocked.json
```

Blocked builds write a complete diagnostic manifest and exit nonzero. No images
are copied, duplicated, augmented, deleted, or split.

## Reproducibility evidence

- Manifest fingerprint:
  `b7d8a367e57a509c7724728817649613fd0418972f644bd92de4e58dd17d9d77`
- Blocked-manifest file SHA-256:
  `bffc7165090d41bf0316615dc04a672b770edc073de3ce6b088b2653729ad07c`
- Repeating the build with unchanged inputs produced byte-identical output.
