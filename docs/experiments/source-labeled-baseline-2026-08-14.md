# Source-labeled baseline experiment — 2026-08-14

> [!IMPORTANT]
> Legacy experiment: this report intentionally preserves the retired separate
> Black/Yellow Sigatoka labels. Its artifacts are incompatible with the current
> `sigatoka` / `panama-disease` contract and must not be deployed.

## Decision

This run is a reproducible exploratory baseline, not a production or biological-validation result. Do not deploy either TFLite file. Full teacher/student training is deferred until the Yellow Sigatoka labels receive expert review and the class has enough independent biological groups for meaningful validation and testing.

## Data and runtime

- Dataset: 459 unique, validator-readable images
- Classes: Healthy 91, Dead leaf 55, Black Sigatoka 128, Yellow Sigatoka 23, Cordana leaf spot 162
- Split: 322 train, 68 validation, 69 test
- Yellow grouping: 12 conservative source groups; the test partition contains only three Yellow images from one group
- Yellow provenance: Mafi et al., *Banana Disease Recognition Dataset*, Version 1, DOI [10.17632/79w2n6b4kf.1](https://doi.org/10.17632/79w2n6b4kf.1), CC BY 4.0; per-image expert or molecular confirmation is not documented
- Runtime: TensorFlow 2.20.0 on CPU; no TensorFlow GPU detected
- Configuration: `ai/config/source_labeled_baseline.json`
- Architecture: ImageNet-initialized stock MobileNetV3-Small, 20 frozen-backbone epochs and 10 fine-tuning epochs

Thirty-eight duplicate Healthy files, one duplicate Yellow file, and one malformed Black Sigatoka JPEG were moved recoverably under `datasets/label-review/`. Related Yellow photographs were kept within the same split using `datasets/group_manifest.json`.

## Held-out Keras result

| Metric | Result |
| --- | ---: |
| Accuracy | 0.9130 |
| Macro precision | 0.9056 |
| Macro recall | 0.9160 |
| Macro F1 | 0.9040 |
| Test images | 69 |

| Class | Precision | Recall | F1 | Support |
| --- | ---: | ---: | ---: | ---: |
| Healthy | 1.000 | 1.000 | 1.000 | 13 |
| Dead leaf | 1.000 | 0.778 | 0.875 | 9 |
| Black Sigatoka | 0.889 | 0.842 | 0.865 | 19 |
| Yellow Sigatoka | 0.750 | 1.000 | 0.857 | 3 |
| Cordana leaf spot | 0.889 | 0.960 | 0.923 | 25 |

The Yellow metric is not stable evidence because its support is three images from one biological/source group. The six Keras errors were:

- Black Sigatoka 12 → Cordana leaf spot
- Black Sigatoka 28 → Cordana leaf spot
- Black Sigatoka 65 → Yellow Sigatoka
- Cordana 133 → Black Sigatoka
- Dead Leaf 6 → Black Sigatoka
- Dead Leaf 32 → Cordana leaf spot

## TensorFlow Lite result

| Runtime artifact | Size | Accuracy | Macro F1 | Mean desktop latency |
| --- | ---: | ---: | ---: | ---: |
| FP32 TFLite | 3,754,080 bytes | 0.9130 | Not separately recorded | 2.348 ms |
| INT8 TFLite | 1,230,408 bytes | 0.8116 | 0.7316 | 134.933 ms |

INT8 lost 0.10145 absolute accuracy versus FP32. Most importantly, INT8 Dead-leaf recall was 0: all nine Dead test images became Black Sigatoka. This fails the deployment-equivalence gate.

TensorFlow 2.20's Windows interpreter could not prepare the INT8 graph with the default XNNPACK delegate. The benchmark retried with built-in kernels and recorded `builtin_without_default_delegates`; its median was 129.124 ms and p95 was 169.762 ms. These desktop numbers are diagnostic only and are not a substitute for a physical-phone LiteRT benchmark.

## Artifact checksums

| Artifact | SHA-256 |
| --- | --- |
| `best_baseline.keras` | `d2385693aedd1d81098ebb08d84647e9b83165ad5699c016b3d01453fd3a5c6a` |
| `split_manifest.json` | `c60f169aa0ec49baed234452b1276734744c0f04c1491451f158b3792e1c3ce3` |
| `baseline_mobilenetv3_small_fp32.tflite` | `0b25a050911f8a5df7ea1966ad7e90868b74f2e4b24d61c92610b6e40236eded` |
| `baseline_mobilenetv3_small_int8.tflite` | `2036db0cc81c6184615d4affe7500f23b28ba2622247ecad4ead932b65e0038d` |
| `baseline_evaluation.json` | `2227a33f8e7995a6a95ca3ea59ef1b14e28f70b2ae77ed8f4bb54c25c92d7246` |
| `baseline_int8_evaluation.json` | `c3ac68ae92e1050296a6bab15d13bd257eca5b1d08fc624c4b200470132d9f45` |

Generated artifacts are isolated under `ai/artifacts/source_labeled_baseline/` and remain untracked. The directory also contains the label map, configuration snapshots, history, confusion matrices, and correct/incorrect Grad-CAM examples.

## Required before the next official run

1. Preserve expert review or stronger ground-truth evidence for every legacy Yellow-source record, especially the Cordana-like cases in `datasets/label-review/sigatoka-legacy-yellow-review.csv`.
2. Add enough independent, verified Yellow specimens to support more than one test group and a protocol-approved per-class sample target.
3. Establish source/specimen groups for the other classes where acquisition metadata permits.
4. Investigate INT8 calibration/runtime compatibility and require acceptable per-class parity—particularly nonzero Dead recall—before mobile integration.
5. Run the enhanced teacher/student experiment only after the dataset and research protocol are approved.
