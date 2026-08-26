# Near-Duplicate Adjudication Workflow

The authoritative review queue is `near_duplicate_adjudication.json`; the CSV
with the same stem is a spreadsheet-friendly view. Candidate generation never
changes labels, groups, or image files.

## Current queue

| Measure | Count |
| --- | ---: |
| Candidate pairs | 1,011 |
| Candidate images | 436 |
| Transitive candidate components | 60 |
| Same-class pairs | 449 |
| Cross-class high-priority pairs | 562 |
| Resolved decisions | 0 |
| Requires review | 1,011 |
| Largest candidate component | 291 images |

Cross-class distribution:

| Classes | Pairs |
| --- | ---: |
| Panama Disease / Sigatoka | 293 |
| Healthy / Sigatoka | 167 |
| Healthy / Panama Disease | 70 |
| Cordana Leaf Spot / Sigatoka | 17 |
| Cordana Leaf Spot / Panama Disease | 9 |
| Cordana Leaf Spot / Healthy | 6 |

The unusually large candidate component and high cross-label count show that
the 64-bit dHash screen is intentionally broad. Its similarity score is a
triage measure, not an identity probability.

## Allowed decisions

| Decision | Effect |
| --- | --- |
| `same_image` | Both files enter one shared, indivisible group; neither file is deleted. |
| `same_leaf_or_related_capture` | Both files enter one shared group. Transitive confirmed edges are grouped together. |
| `visually_similar_but_independent` | No grouping; reviewer affirms biological independence. |
| `not_duplicate` | No grouping; candidate is rejected as a hash false positive. |
| `requires_review` | Unresolved; formal splitting remains blocked. |

Every resolved decision requires reviewer, ISO review date, and an evidence
note. Cross-label candidates are high priority. A confirmed cross-label
relationship remains a label conflict and blocks application; this tool never
chooses or changes a class label.

## Review procedure

1. Open `near_duplicate_adjudication.csv` in a spreadsheet and filter
   `priority=high` first.
2. Inspect both original images at full resolution. Use source provenance and
   the candidate component as context; do not decide from dHash alone.
3. Fill only `decision`, `reviewer`, `reviewed_at`, and `evidence_note`.
4. Import the completed CSV. Static hashes, labels, paths, dimensions, and
   similarity evidence remain immutable in JSON.
5. Apply reviewed decisions to a new group manifest. The application step
   validates current file SHA-256 values and refuses unresolved or confirmed
   cross-label conflicts.
6. Run the formal dataset validator only after the adjudication summary says
   `split_permitted=true` and the separate metadata gate passes.

```powershell
.venv\Scripts\python.exe -m ai.data.near_duplicate_adjudication import-csv `
  --adjudication-manifest datasets\near_duplicate_adjudication.json `
  --reviewed-csv datasets\near_duplicate_adjudication.csv `
  --output-json datasets\near_duplicate_adjudication.reviewed.json

.venv\Scripts\python.exe -m ai.data.near_duplicate_adjudication apply `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --adjudication-manifest datasets\near_duplicate_adjudication.reviewed.json `
  --group-manifest datasets\group_manifest.json `
  --output-group-manifest datasets\group_manifest.reviewed.json `
  --output-summary datasets\near_duplicate_application_summary.json
```

Do not overwrite the active group manifest until the reviewed output and its
conflict summary have been checked. No final split is authorized by this file.

## Reproducibility evidence

- Review JSON SHA-256:
  `bdd0207978a408e83381fe8be8ac42374a47c1e36ac1a740e3d7ade7629496ca`
- Review CSV SHA-256:
  `8c8d470bf2b08b6af5f7738794fa64dbaaf24241923f2a06c83bac86333ca22a`
- Repeating generation with unchanged inputs produced byte-identical outputs.
- Applying the current all-pending queue exits nonzero and writes no proposed
  group manifest because 562 high-risk cross-label pairs remain unresolved.
