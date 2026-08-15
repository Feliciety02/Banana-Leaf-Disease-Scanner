# Source-labeled enhanced CPU pilot — 2026-08-15

> [!IMPORTANT]
> Legacy experiment: this report intentionally preserves the retired separate
> Black/Yellow Sigatoka labels. Its artifacts are incompatible with the current
> `sigatoka` / `panama-disease` contract and must not be deployed.

## Decision

The baseline is the current leader in this exploratory comparison. On the exact same 69-image held-out split, the baseline reached 91.30% accuracy and 90.40% macro F1; the enhanced student reached 76.81% accuracy and 70.66% macro F1.

This is a useful negative result, not evidence that the proposed method can never outperform the baseline. The enhanced run used a reduced CPU budget, and the source-reported Yellow Sigatoka labels still require expert review. Neither model is approved for production diagnosis.

## Fair comparison contract

- Dataset: 459 unique, validator-readable images
- Classes: Healthy 91, Dead leaf 55, Black Sigatoka 128, Yellow Sigatoka 23, Cordana leaf spot 162
- Identical split: 322 train, 68 validation, 69 test
- Split manifest SHA-256: `c60f169aa0ec49baed234452b1276734744c0f04c1491451f158b3792e1c3ce3`
- Identical input: RGB, `224 × 224`, `float32`, `[0, 1]`
- Identical output order: Healthy, Dead leaf, Black Sigatoka, Yellow Sigatoka, Cordana leaf spot
- Runtime: TensorFlow 2.20.0 on CPU; no TensorFlow GPU detected
- Configuration: `ai/config/source_labeled_enhanced_cpu_pilot.json`

The enhanced pilot used 5 self-supervised teacher epochs, 20 teacher fine-tuning epochs, and up to 50 student epochs. Student early stopping selected epoch 15 and ended training after epoch 23. The full planned protocol remains 100/100/100 epochs and must be run only after dataset review and with suitable compute.

## Held-out results

| Model | Accuracy | Macro precision | Macro recall | Macro F1 |
| --- | ---: | ---: | ---: | ---: |
| Stock MobileNetV3-Small baseline | **0.9130** | **0.9056** | **0.9160** | **0.9040** |
| ResNet-101 teacher | 0.7826 | — | — | 0.7012 |
| Enhanced CA-MobileNetV3-Small student | 0.7681 | 0.7258 | 0.7308 | 0.7066 |

| Class | Baseline F1 | Enhanced F1 | Test support |
| --- | ---: | ---: | ---: |
| Healthy | **1.000** | 0.870 | 13 |
| Dead leaf | **0.875** | 0.706 | 9 |
| Black Sigatoka | **0.865** | 0.706 | 19 |
| Yellow Sigatoka | **0.857** | 0.400 | 3 |
| Cordana leaf spot | **0.923** | 0.852 | 25 |

Yellow Sigatoka has only three test images from one source group, so its class metric is not stable biological evidence. The Yellow images remain source-labeled and pending expert confirmation.

## Resource comparison

| Measure | Baseline | Enhanced student | Current leader |
| --- | ---: | ---: | --- |
| Deployable parameters | 942,005 | 1,168,945 | Baseline |
| FLOPs, batch one | 116,015,949 | 119,025,553 | Baseline |
| Keras mean latency, 100 desktop runs | 151.23 ms | 155.26 ms | Baseline |
| FP32 TFLite size | 3,754,080 bytes | 4,672,824 bytes | Baseline |
| FP32 TFLite accuracy | 0.9130 | 0.7681 | Baseline |
| FP32 TFLite mean desktop latency | 2.35 ms | 2.58 ms | Baseline |

Latency was measured on this Windows development machine with one thread. It is not a physical-phone benchmark.

## Quantization gate

| INT8 artifact | Accuracy | Macro F1 | Mean desktop latency | Result |
| --- | ---: | ---: | ---: | --- |
| Baseline | 0.8116 | 0.7316 | 134.93 ms | Failed parity; Dead recall 0 |
| Enhanced | 0.5217 | 0.2550 | 10.22 ms | Failed parity; Healthy, Dead, and Yellow recall 0 |

Both INT8 files fail deployment parity. The farmer-facing research comparator therefore uses the FP32 TFLite exports. Comparisons are marked research-only and are never written to diagnosis history.

## Single-photo validation

The sequential runner was tested with held-out `black-sigatoka/352.jpeg`. The baseline predicted Black Sigatoka at 47.61% confidence; the enhanced student predicted Cordana leaf spot at 63.77%. The disagreement is stored in `single_image_comparison.json` and illustrates that a higher confidence on one photo is not proof of better overall accuracy.

## Artifact checksums

| Artifact | SHA-256 |
| --- | --- |
| `best_teacher.keras` | `51ca6b4b5b1e44c91e8ed78b301ca54f96a06f6616a7c123cff7b4dc8eef01ec` |
| `best_student.keras` | `86c0bfb44f5463ccdaaaad3563336728f2d7475616eb145b8a1e3783e85c8a8b` |
| `enhanced_mobilenetv3_fp32.tflite` | `8d95f11cb65f47b419608503dfa7e79920ceef91af503d1970c1ad61b8e164ff` |
| `enhanced_mobilenetv3_int8.tflite` | `4876da2d9336d9e5c356682c2b940fe593599142364a7dec9354c4cf74420a0c` |
| `student_evaluation.json` | `ff211eafe033b762660a99d0c7e0e337ba9139196e0cd4f4fa09b01f15b2b685` |
| `int8_evaluation.json` | `819eb4f1097275b7cc2801d7fd52e8ef6fcf0b1afb852a9715f4a0ebfb12f726` |
| `model_comparison.json` | `3ecefe1e67459b66cf925829af65c067927da3303141e62858dd5dc9b6cd03d7` |

Generated artifacts are isolated under `ai/artifacts/source_labeled_enhanced_cpu_pilot/` and remain untracked.

## Required before an official thesis conclusion

1. Have a qualified agricultural expert review the Yellow Sigatoka records and resolve the Cordana-like cases.
2. Add enough independent verified specimens per class, especially Yellow Sigatoka.
3. Pre-register the primary metric and statistical comparison before another test-set evaluation.
4. Run the full enhanced training schedule with adequate compute and multiple fixed seeds.
5. Add paired uncertainty analysis and physical-device latency measurements.
6. Rework post-training quantization and require acceptable overall and per-class FP32 parity before deployment.
