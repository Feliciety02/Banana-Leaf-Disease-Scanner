# Thesis Metadata Schema v2

`datasets/image_metadata.json` is the authoritative, path-keyed metadata
inventory. It is generated deterministically and contains no generation
timestamp. Every record carries a SHA-256 fingerprint over its thesis fields
and field-level evidence in `field_provenance`.

## Required record fields

| Field | Meaning | `unknown`/`pending` allowed in schema? | Required to pass formal gate? |
| --- | --- | :---: | :---: |
| `image_path` | Dataset-relative POSIX path | No | Yes; must equal object key |
| `canonical_class` | Current four-class folder label | No | Yes; must match folder |
| `source_dataset` | Dataset or collector of origin | Yes | Yes |
| `source_type` | `public_dataset`, `public_repository`, `field_collection`, or `unknown` | Yes | Yes |
| `original_label` | Label used by the source before harmonization | Yes | Yes |
| `field_or_public` | `field`, `public`, or `unknown` | Yes | Yes |
| `plant_id` | Verified source/collector plant identifier | Yes | No when unavailable |
| `leaf_id` | Verified source/collector leaf identifier | Yes | No when unavailable |
| `acquisition_session` | Verified capture-session identifier | Yes | No when unavailable |
| `capture_device` | Verified camera/device | Yes | No when unavailable |
| `capture_date` | Verified capture date | Yes | No when unavailable |
| `location` | Verified capture location; source-level regions are explicitly labeled | Yes | Required for field images |
| `expert_validated` | `pending` or `validated` | Pending | Must be `validated` |
| `group_id` | Reviewed biological/acquisition family, or reviewed singleton ID | Pending | Yes |
| `qc_status` | `pending_human_review`, `approved`, `excluded`, or `quarantined` | Pending | Must be `approved` |
| `duplicate_status` | Automated or reviewed duplicate-screen result | Pending | Must be resolved |

Compatibility fields preserve the more detailed species, visibility, inclusion,
reviewer, site, and legacy experiment-manifest contract. They are not aliases
for invented facts. Formal admission additionally requires
`species_review_status=banana`, `visibility_quality_status=acceptable`, and
`inclusion_status=included`.

## Automated inference policy

The enricher may derive `image_path` and `canonical_class` from the inventory;
public provenance and original source label from exact filename-prefix rules
documented in `banana_leaf_thesis_4class/SOURCES.md`; source-level Tanzania or
Ecuador location only for matching documented batches; group ID only from an
explicit group manifest or preserved reviewed record; and duplicate status only
from the named inventory report.

It never derives plant ID, leaf ID, acquisition session, capture device,
per-image capture date, field location, expert validation, or human QC from
image appearance. Missing evidence remains `unknown` or `pending`.

## Commands

Enrich metadata without creating a split:

```powershell
.venv\Scripts\python.exe -m ai.data.enrich_metadata `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --metadata-manifest datasets\image_metadata.json `
  --group-manifest datasets\group_manifest.json `
  --inventory-report ai\artifacts\thesis-compliance-audit-20260826\image_validation_report.json
```

Write a review report while pending work is expected:

```powershell
.venv\Scripts\python.exe -m ai.data.validate_metadata `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --metadata-manifest datasets\image_metadata.json `
  --output ai\artifacts\metadata-validation-current.json `
  --allow-pending
```

Omit `--allow-pending` for the pre-split thesis gate. It exits nonzero if any
active record remains inadmissible and never writes a split.
