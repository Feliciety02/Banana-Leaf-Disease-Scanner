<div align="center">

# Dataset Label Review

Quarantined, duplicated, malformed, or scientifically uncertain images kept outside supervised training.

</div>

## Start Here

This is a quarantine and review workspace. Files here are intentionally outside model training.

As a student reviewer:

1. Preserve the original file and filename.
2. Check the provenance record before judging appearance.
3. Ask a qualified reviewer to make or approve the biological decision.
4. Record the decision and evidence.
5. Move only approved, non-duplicate, readable images into training.

If evidence is insufficient, leave the image here. Exclusion is safer than creating an unreliable ground-truth label.

## Folder Guide

| Path | Contents | Training status |
| --- | --- | --- |
| `sigatoka-unverified/` | 473 images received with only the generic label `sigatoka` | Excluded |
| `exact-duplicates/` | 38 Healthy copies and 1 Yellow Sigatoka copy | Excluded as duplicate samples |
| `malformed/` | Unreliably decoded `black-sigatoka/452.jpeg` | Excluded |
| `yellow-sigatoka-review.csv` | Review status and grouping for source-labeled Yellow images | Pending expert review |

These folders remain outside `banana_leaf_5class`, so the training loader cannot silently treat them as ground truth.

## Sigatoka Review Rule

> [!CAUTION]
> Do not decide Black versus Yellow Sigatoka from lesion color alone. Different stages, related pathogens, Cordana-like symptoms, and mixed infection can overlap visually.

A qualified reviewer or authoritative source record must assign exactly one outcome:

- `black-sigatoka`
- `yellow-sigatoka`
- `exclude`

Use `exclude` for mixed, uncertain, or visually indistinguishable cases.

## Required Decision Record

For every reviewed image, record:

| Field | Requirement |
| --- | --- |
| Image | Stable relative path or filename |
| Final label | One allowed outcome listed above |
| Authority | Qualified reviewer or authoritative source |
| Evidence | Concise reason for the decision |
| Date | Review date in a consistent format |

Moving a file into a training class is the final step, not the review method itself.

### Example record

```text
image: sigatoka-unverified/123.jpeg
final_label: exclude
reviewer_or_source: Dr. Example Reviewer
review_date: 2026-08-15
evidence_note: Black versus Yellow subtype cannot be confirmed from the available image and provenance.
```

Do not use a model prediction as the authority for relabeling that model's own training dataset.

## Known Findings

- Sixty-two generic Sigatoka files are exact duplicates of files already retained under `banana_leaf_5class/black-sigatoka`. Keep only one training copy of each image.
- The Yellow review sheet records conservative biological grouping and visible Cordana-like overlap.
- The malformed JPEG produced both a truncated-read warning and malformed MPO interpretation in Pillow; keeping it here preserves recoverability without weakening reproducibility.

## Before Moving an Image

Confirm every item:

- [ ] The final label is one of the allowed model keys.
- [ ] A qualified reviewer or authoritative record supports it.
- [ ] The decision date and evidence note are recorded.
- [ ] The file is readable and is not a duplicate.
- [ ] Related photos share a group ID.
- [ ] The destination does not place the same biological specimen across splits.
- [ ] The dataset will be validated again after the move.

Return to the [dataset guide](../README.md) before admitting or excluding records.
