# Cordana Acquisition — September 4, 2026

This workflow acquired additional Cordana material without relabeling images
from another disease class. Source-provided augmentation derivatives were later
moved outside the active four-class dataset to prevent split leakage.

## Result

| Source batch | Downloaded | Admitted | Role |
| --- | ---: | ---: | --- |
| ABCGMP v2 Cordana | 739 | 331 | Screened source-labeled candidates |
| Ecuador `Imagenes-aumentadas/Cordana` | 3,000 | 3,000 archived | Inactive derivatives under `datasets/augmentation-derived/cordana-ecuador/` |
| Recovered pre-existing v4 files | 9 sought | 8 recovered | Restored source-labeled inventory files |
| Final active Cordana folder |  | **1,000** | Non-augmentation files only |

ABCGMP candidates were rejected when they had an exact SHA-256 match or a
flip-aware 64-bit dHash match within Hamming distance 6 against the pre-import
four-class inventory or an earlier ABCGMP candidate. This removed 408 of its 739
files. All 3,000 Ecuador derivatives decoded successfully; they contain no
byte-identical copies within the batch or against the pre-import inventory.

The machine-readable `manifest.json` in this directory is intentionally ignored
by Git with the rest of the local dataset evidence. It records the source path,
target path, SHA-256, dHash, image dimensions, and group ID for every admitted
file, plus rejection evidence for every excluded ABCGMP candidate.

The current post-removal exploratory validator accepted all 13,000 active files,
found zero exact duplicate copies, and reported 1,011 perceptual pairs for human
review. Its report is stored locally at
`datasets/outputs/cordana-validation-2026-09-04/image_validation_report.json`.
The retired 16,000-file report, which included the derivatives and reported
1,070 perceptual pairs, is preserved under
`datasets/outputs/archive/cordana-validation-2026-09-04-included-augmentations-retired/`.

## Sources

- ABCGMP v2: <https://data.mendeley.com/datasets/fhbvmpcyy2/2> (CC BY 4.0)
- ABCGMP download mirror: <https://www.kaggle.com/datasets/mdmuntasirahmed/abcgmpvers1>
- Ecuador source: <https://github.com/NixonJimenez02/deep-learning-banana-diseases/tree/main/Imagenes-aumentadas/Cordana>
- v4 recovery source: <https://www.kaggle.com/datasets/rayhanarlistya/banana-leaf-disease-dataset-v4>

## Scientific-use warning

The Ecuador batch consists of ten transformations per source image. These
3,000 files add zero independent biological samples and are excluded from the
active dataset. A formal thesis run should generate augmentation after a frozen
split and apply it to training only.
