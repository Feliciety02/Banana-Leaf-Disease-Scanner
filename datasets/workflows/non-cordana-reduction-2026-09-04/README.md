# Non-Cordana Reduction — September 4, 2026

This workflow reduced only `healthy`, `sigatoka`, and `panama-disease` to 3,000
active files each. Cordana was explicitly protected and appeared in zero moves.

## Result

| Class | Before | Moved to quarantine | Active after |
| --- | ---: | ---: | ---: |
| Healthy | 4,000 | 1,000 | 3,000 |
| Sigatoka | 3,965 | 965 | 3,000 |
| Panama Disease | 4,000 | 1,000 | 3,000 |
| Cordana Leaf Spot | 881 | 0 | 881 |
| **Total** | **12,846** | **2,965** | **9,881** |

The move manifest is `reduction-manifest.json`. It stores source and quarantine
paths, SHA-256, image dimensions, perceptual fingerprints, removal reasons, and
duplicate evidence. The protected Cordana inventory is recorded in
`cordana-protected-baseline-881.json`.

## Scan and selection policy

- Exact duplicates: SHA-256.
- Broad candidates: flip-aware dHash64 distance ≤ 6, dHash256 distance ≤ 12,
  or pHash64 distance ≤ 6.
- Automatic perceptual confirmation: agreement between pHash/dHash and strict
  128×128 grayscale correlation plus mean-absolute-error thresholds.
- Confirmed duplicate copies: 3 Healthy files.
- Broad perceptual candidates selected as surplus: 126 files.
- Deterministic source-stratified surplus: 2,836 files from dominant Zenodo
  batches, preserving minority-source material.

Broad candidates and ordinary surplus are not asserted to be duplicates. They
were quarantined because the requested target required reducing the classes.

## Storage and validation

Quarantined files remain recoverable under
`datasets/reductions/non-cordana-to-3000-2026-09-04/`; nothing was permanently
deleted. The post-reduction exploratory report is under
`datasets/outputs/non-cordana-reduction-validation-2026-09-04/` and accepted all
9,881 active files with zero exact duplicates. Its 109 remaining perceptual
pairs require human review before formal thesis reporting.

## September 9, 2026 Sigatoka restoration

Fifteen images were copied back from
`source_stratified_surplus/sigatoka/`, while the older exact duplicate
`sigatoka n10.png` was moved to `confirmed_duplicate_copy/sigatoka/`. This
restored the active Sigatoka folder from 2,986 to exactly 3,000 unique, readable
files. The restored images had originally been removed
only to satisfy the earlier size target; none came from the confirmed-duplicate,
perceptual-candidate, malformed, or label-uncertain quarantines.

Before restoration, each selected image was decoded, checked against its
original SHA-256 in the reduction manifest, and compared with the active image
inventory. There were no exact matches, and every selected image had a
flip-aware dHash distance of at least 17 from the active inventory (the review
threshold is 6). The selected paths and checksums are recorded in
`restoration-manifest-2026-09-09.json`.

This restoration establishes the raw file count only. Expert review, metadata
completion, grouping, and the frozen split remain required before formal
training.
