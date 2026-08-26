# External Unlabeled Banana-Leaf SSL Ingestion

External SSL imagery is a physically separate, unlabeled training-only
inventory. It is never part of the 2,800-image labeled cohort and disease labels
are neither requested nor accepted by its registry schema.

## Current truthful count (August 26, 2026)

| Measure | Count |
| --- | ---: |
| acquired | 0 |
| accepted | 0 |
| rejected | 0 |
| duplicate | 0 |
| near_duplicate | 0 |
| invalid | 0 |
| non_banana | 0 |
| **total_ssl_ready** | **0** |
| target | 8,000 |
| shortage | **8,000** |

The current versioned manifest is
`datasets/ssl/manifests/banana-leaf-external-ssl-v1.json`, with status `empty`
and fingerprint
`bf4909673ff1b1c28078dd5c779cc86083d21ca1147921c55e7306ecb156bc18`.
The command intentionally exits nonzero for an empty inventory. The 8,000 value
is a target, not an achieved count.

## Separation and files

- Image root: `datasets/ssl-unlabeled/`
- Source/image registry: `datasets/ssl/source_registry.json`
- Near-duplicate decisions: `datasets/ssl/near_duplicate_reviews.json`
- Policy: `ai/config/ssl_ingestion_v1.json`
- Schema example: `ai/config/ssl_source_registry_template.json`
- Builder/loader: `ai/data/build_ssl_manifest.py`

No ingestion operation copies, moves, relabels, or deletes an image. Public SSL
files remain outside `datasets/banana_leaf_thesis_4class/`.

## Admission gates

Every candidate is checked for:

1. supported file extension, successful strict decoding, and minimum 64×64
   dimensions;
2. a registered source, source item ID, acquisition date, citation, source URL,
   and license record whose review status is `approved`;
3. human-confirmed `confirmed_banana_leaf` relevance with reviewer, date, and
   evidence—filenames and folder names never establish botanical relevance;
4. exact SHA-256 duplication within the external inventory and against the
   complete labeled inventory;
5. flip-aware 64-bit perceptual-hash candidates within Hamming distance 6;
6. explicit review of every perceptual candidate as `related`,
   `visually_similar_but_independent`, or `requires_review`;
7. no exact, visually related, explicit-group, leaf, plant, or acquisition
   session overlap with frozen validation/test exclusions; and
8. a final content-hash recheck when training loads the manifest.

Unknown biological or capture metadata remains the literal value `unknown`.
When a candidate comes from a source represented in held-out data and all of
its group/plant/leaf/session identifiers are unknown, it is rejected rather
than assumed independent. Cross-source exact and perceptual screening still
protects against republished copies.

Exact copies are excluded deterministically but preserved on disk. Unresolved
near pairs are excluded pending review. For a confirmed related component
inside the external inventory, only the lexicographically stable representative
is eligible; the other files remain preserved and reported.

## Source registry

Each source records:

- stable `source_id` aligned with labeled `source_dataset` IDs when they refer
  to the same underlying dataset;
- source name and URL;
- access date;
- license name, license URL, and `license_status`;
- citation and public/field source type; and
- optional notes.

Each image records source item identity, original filename, acquisition date,
banana-leaf relevance review, and only genuinely available biological/capture
metadata. Adding `disease_label` is a schema error because SSL does not require
disease classification.

## Review workflow

1. Place original files under `datasets/ssl-unlabeled/` without changing the
   labeled cohort.
2. Add source and per-image provenance/relevance rows to the source registry.
3. After the final labeled split exists, run the builder with its
   `ssl_exclusion_manifest.json`.
4. Copy generated `review_key` values requiring visual adjudication into
   `near_duplicate_reviews.json`, add the decision/reviewer/date/evidence, and
   rerun.
5. Freeze a new `ssl_version` and output path whenever a ready manifest's
   inventory, evidence, or policy changes.

```powershell
.venv\Scripts\python.exe -m ai.data.build_ssl_manifest `
  --ssl-root datasets\ssl-unlabeled `
  --source-registry datasets\ssl\source_registry.json `
  --labeled-dataset-root datasets\banana_leaf_thesis_4class `
  --heldout-exclusion datasets\splits\banana-leaf-thesis-split-v1\ssl_exclusion_manifest.json `
  --near-reviews datasets\ssl\near_duplicate_reviews.json `
  --config ai\config\ssl_ingestion_v1.json `
  --output datasets\ssl\manifests\banana-leaf-external-ssl-v1.json
```

The held-out exclusion does not exist yet because the final labeled split is
correctly blocked. Non-empty external inventories therefore cannot become SSL
ready until that upstream gate passes.

## Training contract

Training must receive all three paths:

```powershell
--final-split-dir <frozen-final-split> `
--ssl-unlabeled-dir datasets\ssl-unlabeled `
--ssl-manifest datasets\ssl\manifests\banana-leaf-external-ssl-v1.json
```

A raw SSL directory is rejected. The loader verifies the SSL fingerprint, the
exact held-out-exclusion file used during ingestion, every image hash, path
containment, ready count, and excluded hashes/groups. Only `ssl_ready_records`
are appended to the training partition for teacher self-supervision; supervised
training, validation, test evaluation, and calibration never consume them.
