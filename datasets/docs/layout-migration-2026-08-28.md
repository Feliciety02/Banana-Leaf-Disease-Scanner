# Dataset layout migration — 2026-08-28

The dataset workspace was grouped by purpose to make student navigation
easier. The labeled, Davao field, and SSL image input roots were not moved.

| Previous path | Current path |
| --- | --- |
| `datasets/image_metadata.json` | `datasets/metadata/image_metadata.json` |
| `datasets/group_manifest*.json` | `datasets/metadata/` |
| `datasets/group_manifest_retired.json` | `datasets/metadata/archive/group_manifest_retired.json` |
| `datasets/near_duplicate_*` | `datasets/reviews/near-duplicates/` |
| `datasets/label-review/` | `datasets/reviews/labels/` |
| `datasets/davao-field-workflow/` | `datasets/workflows/davao-field/` |
| `datasets/ssl/` | `datasets/workflows/ssl/` |
| `datasets/cohorts/` | `datasets/outputs/cohorts/` |
| `datasets/splits/` | `datasets/outputs/splits/` |
| dataset workflow Markdown at the root | `datasets/docs/` |

All 31 moved files were SHA-256 checked before and immediately after the move;
their hashes matched. The three image input roots retained their original file
counts and byte totals. No image, label, QC decision, group assignment, cohort
membership, or split membership changed.

Existing generated JSON under `datasets/outputs/`, `datasets/workflows/`, and
`ai/artifacts/` may still display the previous absolute path because that path
is part of the artifact's historical provenance. Those files were preserved
byte-for-byte. Use the current commands in this folder's guides when producing
a new versioned artifact; do not edit a signed or fingerprinted historical
artifact in place.
