# Four-Class Thesis Dataset Sources

This record documents the sources, licenses, admission checks, and flattening
for the four-class thesis inventory. The
September 4, 2026 validator report is authoritative for current counts; older
admission narratives below are retained as history.

## Current composition

| Model class | Working images | Primary sources |
| --- | ---: | --- |
| `healthy` | 3,000 active | Zenodo Tanzania; v4 compilation (Healthy); Nutrient Deficient Banana Plant Leaves; earlier original imports |
| `sigatoka` | 3,000 active | Zenodo Tanzania (Black Sigatoka); v4 compilation (Yellow and Black Sigatoka); BananaLSD; earlier Banana Disease Recognition originals |
| `panama-disease` | 3,000 active | Zenodo Tanzania (Fusarium Wilt); Banana Disease Recognition Dataset originals |
| `cordana-leaf-spot` | 881 active | BananaLSD; v4 compilation; Ecuador originals; ABCGMP; later local additions |
| **Files on disk** | **9,881** | **9,881 active** |

## Filename prefixes and provenance

The class folders are flat. Filename prefixes identify the source batch:

| Prefix | Source | Class |
| --- | --- | --- |
| `healthy-zenodo-*` | Zenodo HEALTHY-1/2/3 | healthy |
| `healthy-v4-*` | v4 compilation `Healthy` | healthy |
| `healthy-nutrient-*` | Nutrient Deficient Banana Plant Leaves `healthy` | healthy |
| `sigatoka-zenodo-*` | Zenodo BLACK SIGATOKA-1/2/3 | sigatoka |
| `sigatoka-v4-*` | v4 compilation `Yellow and Black Sigatoka` | sigatoka |
| `cordana-v4-*` | v4 compilation `Cordana` | cordana-leaf-spot |
| `cordana-bananalsd-*` | BananaLSD `OriginalSet/cordana` | cordana-leaf-spot |
| `cordana-ecuador-*` | Deep Learning Banana Diseases (Ecuador) `Data-Tesis/Cordana` | cordana-leaf-spot |
| `cordana-abcgmp-*` | ABCGMP Fruit and Leaf Disease Six Crop Dataset v2 | cordana-leaf-spot |
| `panama-*` | Zenodo Fusarium Wilt + Banana Disease Recognition Panama | panama-disease |

The numeric suffix preserves ordering only; it does not necessarily map to the
original source filename.

## Sources and licenses

### Zenodo Banana Leaves Imagery Dataset (Tanzania)

- **Zenodo:** <https://doi.org/10.5281/zenodo.7670326>
- **Authors:** Mduma, N. & Elinisa, C. (2023)
- **License:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Companion article:** <https://doi.org/10.1038/s41597-025-04456-4>
- **Used here:** HEALTHY-1/2/3, BLACK SIGATOKA-1/2/3, and FUSARIUM WILT-2/3 originals
- **Excluded:** none from this source; all admitted files are original captures

Each ZIP archive was downloaded with a resumable downloader and its MD5
checksum verified before extraction. Images were downscaled to a maximum
dimension of 1024 px on admission.

### Banana Leaf Spot Diseases (BananaLSD) Dataset

- **Kaggle:** <https://www.kaggle.com/datasets/shifatearman/bananalsd>
- **Creator:** Shifat E Arman
- **Version:** 1
- **License:** [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- **Labeling:** the source reports expert plant-pathologist labeling
- **Used here:** original Healthy, Sigatoka, and Cordana folders only
- **Excluded:** all 1,600 source-provided augmented images and the non-contract Pestalotiopsis class

### Nutrient Deficient Banana Plant Leaves

- **Kaggle:** <https://www.kaggle.com/datasets/warcoder/nutrient-deficient-banana-plant-leaves>
- **Kaggle uploader:** Chirag Chauhan
- **Upstream dataset:** Sunitha P. (2022), DOI <https://doi.org/10.17632/7vpdrbdkd4.1>
- **Version:** 1
- **License:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Used here:** raw-source `healthy` folder only
- **Excluded:** all 7,500 source-provided augmented images and every nutrient-deficiency class

### Banana Disease Recognition Dataset

- **Kaggle:** <https://www.kaggle.com/datasets/sujaykapadnis/banana-disease-recognition-dataset>
- **Kaggle uploader:** Sujay Kapadnis
- **Upstream dataset:** Mafi et al. (2023), DOI <https://doi.org/10.17632/79w2n6b4kf.1>
- **Version:** 1
- **License:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Used here:** earlier original-image imports supporting Healthy, Sigatoka, and Panama disease
- **Excluded:** source-provided augmented derivatives

### Banana Leaf Disease Dataset v4 (compilation)

- **Kaggle:** <https://www.kaggle.com/datasets/rayhanarlistya/banana-leaf-disease-dataset-v4>
- **Uploader:** Rayhan Arlistya
- **Version:** 1
- **License:** recorded as **Unknown**
- **Contents:** a compilation of Harvard Dataverse NM-AIST Bananas (2021 season),
  BananaLSD, Banana Disease Recognition, and Roboflow exports
- **Used here:** `Healthy`, `Yellow and Black Sigatoka`, and `Cordana` folders
- **Excluded:** none from those folders except files rejected by duplicate screening

> [!CAUTION]
> This dataset's license is recorded as **Unknown**. It was admitted at the
> project owner's explicit request to increase class quantity. For any
> publication or redistribution, prefer the individually licensed upstream
> sources listed above.

### Deep Learning Banana Diseases (Ecuador Cordana originals)

- **GitHub:** <https://github.com/NixonJimenez02/deep-learning-banana-diseases>
- **Authors:** Jiménez, N. et al.
- **Companion article:** Detection of Banana Leaf Diseases using Deep Learning
  (MDPI, AgriEngineering 2025); the paper states the data are openly available
  at the linked repository
- **License:** the GitHub repository declares **no LICENSE file**; the
  companion MDPI article is CC BY 4.0
- **Used here:** original `Data-Tesis/Cordana` captures (300 files, none
  augmented)
- **Inactive archive:** 3,000 source-provided augmented Cordana images are kept
  under `datasets/augmentation-derived/cordana-ecuador/`, outside the active
  four-class root; the remaining source augmentations were not imported
- **Excluded from the original-image import:** 28 files byte-identical to
  existing active images; 6 files matching existing Cordana originals at
  dHash distance 0

> [!CAUTION]
> The repository itself carries no license, so reuse terms rest on the
> companion CC BY 4.0 article statement. It was admitted at the project
> owner's explicit request to balance the cordana class. For any publication
> or redistribution, verify current upstream terms.

### September 4, 2026 Cordana balancing acquisition

The acquisition added 331 screened ABCGMP images to the active Cordana folder.
It also downloaded 3,000 published Ecuador Cordana augmentation derivatives,
but those derivatives are now archived outside the four-class dataset and are
not active samples. A cache-to-disk reconciliation found nine previously active
v4 files absent; eight were recovered from the current v4 source archive. The
acquisition inventory was therefore 1,000 non-augmentation files. Before the
later non-Cordana reduction, external folder changes left 881 Cordana files;
that reduction did not move or modify any of them.

- **ABCGMP Fruit and Leaf Disease Six Crop Dataset v2:** canonical source
  [Mendeley Data DOI 10.17632/fhbvmpcyy2.2](https://data.mendeley.com/datasets/fhbvmpcyy2/2),
  CC BY 4.0. The acquisition used the
  [Kaggle `abcgmpvers1` mirror](https://www.kaggle.com/datasets/mdmuntasirahmed/abcgmpvers1),
  recorded there as Apache 2.0. Of 739 Cordana-labeled files, 331 were admitted;
  408 exact or flip-aware near matches against the existing inventory or an
  earlier candidate were rejected at 64-bit dHash distance <= 6.
- **Ecuador augmentation batch:** 3,000 files from
  [`Imagenes-aumentadas/Cordana`](https://github.com/NixonJimenez02/deep-learning-banana-diseases/tree/main/Imagenes-aumentadas/Cordana),
  ten derivatives for each of 300 source images. All decoded successfully and
  none were byte-identical to the pre-import inventory or each other. The
  repository declares no license; its companion article is CC BY 4.0. These
  files are stored only in `datasets/augmentation-derived/cordana-ecuador/`.
- The generated acquisition manifest is
  `datasets/workflows/cordana-acquisition-2026-09-04/manifest.json`. It records
  source paths, target paths, SHA-256, flip-aware dHash, dimensions, rejection
  reasons, augmentation parent IDs, and group IDs.

> [!CAUTION]
> The 3,000 Ecuador augmentation files are derived examples, not new biological
> samples, and are excluded from the active dataset. For a formal experiment,
> freeze the original-image split first and generate augmentation only while
> reading the training partition.

### September 4, 2026 non-Cordana reduction

The active Healthy, Sigatoka, and Panama Disease folders were reduced to 3,000
files each. A multi-method scan used SHA-256, flip-aware 64-bit and 256-bit
dHash, 64-bit pHash, and grayscale correlation/MAE confirmation. It found and
quarantined three byte-identical Healthy copies. To meet the requested counts,
it also quarantined 126 broad perceptual candidates as surplus and 2,836
deterministically selected files from the dominant Zenodo source batches.
Those surplus categories are not claimed to be confirmed duplicates.

All 2,965 files remain recoverable under
`datasets/reductions/non-cordana-to-3000-2026-09-04/`. Cordana appeared in zero
planned moves and matched its protected 881-file SHA-256 baseline immediately
after application. The post-reduction validator accepted all 9,881 active
files, found zero exact duplicate copies, and retained 109 broad perceptual
candidates for human review.

## Admission checks (August 16, 2026)

- Every admitted image passes decoder verification.
- Exact SHA-256 duplicates within the active dataset were rejected.
- No cross-class exact-hash conflicts were admitted.
- A 64-bit difference-hash screen found no near match at Hamming distance 6 or
  lower among admitted candidate pools and their target classes.
- A final full-dataset sweep found 0 exact and 0 near duplicates across all
  15,165 active files.
- A subsequent flip-aware sweep (comparing each image against horizontal,
  vertical, and 180° rotations of every other image) removed 117 v4-derived
  flipped or re-encoded duplicates at Hamming distance 0, then 43 more confirmed
  by a finer 256-bit dHash (distance ≤ 16/256), leaving 15,005 active files.
  See `datasets/README.md` → "Flip-aware duplicate sweep".
- Oversized images were downscaled to a maximum dimension of 1024 px.
- Source labels remain pending project-specific agricultural-expert review;
  source provenance is not laboratory confirmation.
