# Final CA-MobileNetV3-Small Deployment Audit

Audit date: 2026-08-28

## Decision

**MODEL DEPLOYMENT BLOCKED BY DATASET VALIDATION**

**BLOCKED — FINAL TRAINED MODEL DOES NOT YET EXIST**

No model was trained, converted, copied, or represented as final during this
audit.

## Artifact inspection

The only plausible student checkpoint found was:

`ai/artifacts/source_labeled_enhanced_transfer_finetune/best_student.keras`

- Size: 5,191,181 bytes
- SHA-256: `7425A69B8E17CE82C0ABB0FC830E35B3B0B6C2F846BFD64F446EB2C4C7E1B55D`
- Loaded model name: `coordinate_attention_enhanced_mobilenetv3`
- Loaded input: `[None, 224, 224, 3]`
- Loaded outputs: five logits plus two 1024-element feature outputs
- Parameter count: 1,168,945
- Coordinate-attention layers: 9

This is a real checkpoint, but it is not the final thesis model. Its saved
configuration and label map use the obsolete five-class dataset contract:
`healthy`, `dead`, `sigatoka`, `panama-disease`, and
`cordana-leaf-spot`. Its history records validation accuracy rather than the
current required validation macro-F1 selection evidence. It must not be
converted or bundled into the four-class application.

No `.tflite` artifact was found.

## Dataset and split gate

The authoritative cohort manifest
`datasets/cohorts/banana-leaf-thesis-labeled-v1.json` has `status=blocked`,
zero selected images, and these current counts:

| Class | Raw active | Target | Validated eligible | Raw shortage |
| --- | ---: | ---: | ---: | ---: |
| healthy | 4,000 | 700 | 0 | 0 |
| sigatoka | 4,000 | 700 | 0 | 0 |
| panama-disease | 4,000 | 700 | 0 | 0 |
| cordana-leaf-spot | 670 | 700 | 0 | 30 |

The latest cohort evidence reports all 1,011 near-duplicate candidates
resolved, with zero unresolved and zero unresolved cross-label pairs. The
remaining blockers are the 30-image Cordana raw shortage and missing expert,
QC, species, inclusion, visibility, and grouping eligibility evidence across
the cohort.

The existing `final_split_gate.blocked.json` predates that completed duplicate
adjudication and contains stale duplicate-review counts. Its operative result
is still valid: the final split cannot be written because the upstream cohort
is blocked. The exploratory `ai/artifacts/final_split` output is not the frozen,
authoritative thesis split and cannot authorize training.

## Mobile deployment changes

- Configured the Expo SDK 54 asset plugin to link the eventual INT8 model at
  build time.
- Aligned Kotlin production, benchmark, and instrumentation asset lookups with
  Expo's APK asset-root behavior.
- Kept native fail-closed checks for INT8 input/output, exact
  `[1,224,224,3]` input, exact `[1,4]` output, and positive quantization scales.
- Changed required INT8 instrumentation cases from silent skip to failure when
  the model is absent.
- Strengthened the release gate to reject missing, empty, or non-TFLite files,
  missing asset-plugin configuration, simulated inference fallbacks, network
  calls, and legacy backend/database dependencies in the production graph.

## Verification status

| Requirement | Status | Evidence |
| --- | --- | --- |
| Legitimate final four-class checkpoint | BLOCKED | Only an obsolete five-class checkpoint exists |
| Validation macro-F1 final selection | BLOCKED | No final four-class training run exists |
| Train-only calibration split | BLOCKED | Authoritative cohort/final split is not ready |
| Full-integer INT8 conversion and tensor audit | BLOCKED | Conversion correctly not attempted |
| Production model bundled | BLOCKED | Required `.tflite` file is absent |
| Four-class source contract | PARTIAL | TS/Kotlin/config agree; no final artifact exists to inspect |
| Confidence semantics | PARTIAL | Source applies softmax once to expected logits; final artifact is absent |
| Panama Disease safety wording | VERIFIED | UI says visible leaf patterns are not lab confirmation of Fusarium/Foc |
| Production network/backend boundary | VERIFIED AT SOURCE LEVEL | Release scan and tests show no dependency in the active inference graph |
| Mobile tests | VERIFIED | 28 tests passed |
| TypeScript | VERIFIED | `tsc --noEmit` passed |
| Release gate | FAILED AS DESIGNED | Sole reported blocker: final INT8 model not bundled |
| Android native compilation | NOT VERIFIED — ANDROID RUNTIME UNAVAILABLE | No generated Android project is present |
| Physical/emulated device instrumentation | NOT VERIFIED — ANDROID RUNTIME UNAVAILABLE | ADB reported no attached device |
| Offline camera/gallery classification | NOT VERIFIED — ANDROID RUNTIME UNAVAILABLE | Requires the approved model and a real runtime |

## Exact next pipeline step

1. Complete expert/QC/species/inclusion/visibility/group metadata review.
2. Add at least 30 validated original Cordana images, or formally version and
   justify a changed cohort target; do not silently relax the gate.
3. Rebuild the labeled cohort until it reports `status=ready`.
4. Build and freeze the authoritative final split.
5. Train the current four-class teacher/student protocol and select the final
   checkpoint by validation macro-F1 without test-set selection.
6. Convert that exact final student to full-integer INT8 using only the frozen
   training/calibration subset, then independently inspect its tensors and
   compare it with FP32 on the untouched test set.
7. Bundle it, build Android, run instrumentation, and perform camera/gallery
   inference with backend, Wi-Fi, and mobile data disabled.

Until those steps pass: **THESIS MOBILE RUNTIME NOT YET VERIFIED**.
