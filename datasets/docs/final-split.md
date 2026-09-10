# Final Thesis Split Protocol

The final 70/15/15 split is an atomic, post-cohort quality gate. It is not
generated from raw class folders and it never weakens a biological grouping
constraint to improve class balance.

## Current result (September 9, 2026)

The official split is **ready** and contains 11,512 expert-validated original
images: 2,878 per class. The partition counts are exactly:

| Partition | Per class | Total | Achieved fraction |
| --- | ---: | ---: | ---: |
| Train | 2,014 | 8,056 | 69.9792% |
| Validation | 432 | 1,728 | 15.0104% |
| Test | 432 | 1,728 | 15.0104% |

All cross-partition leakage assertions are zero. No grouping constraint was
relaxed, and the maximum class-fraction deviation is 0.00020848, below the
configured 0.02 tolerance.

The project owner declared the locally added data, including Cordana images,
to be team-owned local originals. As a conservative substitute for manual
near-duplicate adjudication, all 167 images appearing in the unresolved dHash
candidate queue were excluded. The 40 unreadable files and 28 exact duplicate
copies also remain excluded. The limitations and declaration are recorded in
`datasets/reviews/labels/local-original-split-attestation-2026-09-09.json`.

## Algorithm and constraints

Configuration lives in `ai/config/final_split_2878_v1.json`. The implementation is
`ai/data/build_final_split.py`.

For a ready, fingerprinted cohort, the builder forms the transitive closure of:

1. exact SHA-256 identity;
2. confirmed `same_image` or `same_leaf_or_related_capture` decisions;
3. explicit `group_id`;
4. known `leaf_id`;
5. known `plant_id`; and
6. known `acquisition_session`.

Unknown and pending biological identifiers are ignored; they are never
invented or treated as a shared identity. Known identifiers are namespaced by
source-dataset context to avoid merging unrelated datasets that reuse local
identifier strings.
Each resulting split unit is assigned as a whole by a seeded deterministic
optimizer. It targets 70/15/15 independently for all four canonical classes.
The report includes target counts, achieved counts, fraction deviations, and
optimization cost. A deviation above the configured tolerance blocks output;
`grouping_constraints_relaxed` must remain `false`.

## Successful outputs

Only a passed run writes the frozen artifact set:

- `train_manifest.json`;
- `validation_manifest.json`;
- `test_manifest.json`;
- `ssl_exclusion_manifest.json`;
- `group_assignment_manifest.json`; and
- `split_summary.json`.

Every artifact is fingerprinted. The loader verifies the summary, all
fingerprints, file hashes, class indices, root containment, usage contracts,
and zero cross-partition identity conflicts before returning any records.

The SSL exclusion manifest deny-lists every validation/test path, exact hash,
transitive split unit, and explicit group. Quantization calibration is allowed
only from training. Validation permits checkpoint/hyperparameter selection but
forbids SSL and calibration. Test permits only one-time final evaluation and
explicitly forbids training, SSL, checkpoint selection, hyperparameter tuning,
and calibration.

Augmentation remains an in-memory training-dataset transform after manifest
loading; no augmented or derived file can enter the original cohort.

## Command

Run this only after the upstream cohort has `status=ready`:

```powershell
.venv\Scripts\python.exe -m ai.data.build_final_split `
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --cohort-manifest datasets\outputs\cohorts\banana-leaf-thesis-labeled-2878-v1.json `
  --metadata-manifest datasets\metadata\image_metadata.split-ready-2026-09-09.json `
  --adjudication-manifest datasets\reviews\near-duplicates\near_duplicate_adjudication.2026-09-09.json `
  --split-config ai\config\final_split_2878_v1.json `
  --output-dir datasets\outputs\final-split\banana-leaf-thesis-split-2878-v1
```

Training, evaluation, and export commands must then use:

```powershell
--dataset-dir datasets\banana_leaf_thesis_4class `
--final-split-dir datasets\outputs\final-split\banana-leaf-thesis-split-2878-v1
```

When `final_split_dir` is configured, `prepare_splits` bypasses all legacy
ad-hoc split creation and accepts only the frozen final artifact set.

## Automated evidence

`ai/tests/test_final_split_builder.py` proves deterministic reproduction,
exact per-class targets in a feasible fixture, transitive related-capture,
leaf, plant, session, and explicit-group confinement, SSL exclusion, frozen
loader routing, exact-hash conflict detection, atomic gate failure, and refusal
to relax grouping when stratification is impossible.
