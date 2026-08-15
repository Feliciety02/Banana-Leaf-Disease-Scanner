# Five-Class Dataset Source Additions

This record covers the August 16, 2026 Kaggle expansion of the active five-class banana-leaf dataset. Only leaf images were admitted. Fruit, pseudostems, stems, rhizomes, internal cross-sections, whole-plant views, and source-provided augmentations were excluded.

## Active Kaggle coverage

| Model class | Kaggle source coverage |
| --- | --- |
| `healthy` | Nutrient Deficient Banana Plant Leaves; BananaLSD and Banana Disease Recognition images already present from earlier imports |
| `dead` | Banana Disease Recognition Dataset originals previously imported under the visual Dead leaf label |
| `sigatoka` | BananaLSD originals plus earlier Banana Disease Recognition originals |
| `panama-disease` | Banana Disease Recognition Dataset originals; see `panama-disease/README.md` |
| `cordana-leaf-spot` | BananaLSD originals |

## Newly admitted files

| Local folder | Added | Source class | Selection |
| --- | ---: | --- | --- |
| `healthy/kaggle-nutrient-healthy-original` | 100 | Healthy | Evenly sampled from 948 byte-unique candidates after duplicate screening |
| `sigatoka/kaggle-bananalsd-original` | 97 active | Sigatoka | 100 sampled; 3 malformed/truncated-MPO files quarantined after strict warning review |
| `cordana-leaf-spot/kaggle-bananalsd-original` | 100 | Cordana | Evenly sampled from 130 candidates not already present by exact hash |

The local numeric suffix preserves the original source number. For example, `healthy-nutrient-0001.jpg` maps to `h_1.jpg`, while `sigatoka-bananalsd-0236.jpeg` maps to BananaLSD `OriginalSet/sigatoka/236.jpeg`.

## Sources and licenses

### Banana Leaf Spot Diseases (BananaLSD) Dataset

- **Kaggle:** <https://www.kaggle.com/datasets/shifatearman/bananalsd>
- **Creator:** Shifat E Arman
- **Version:** 1
- **License:** [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- **Labeling:** the source reports expert plant-pathologist labeling
- **Used here:** original Healthy, Sigatoka, and Cordana folders only
- **Excluded:** all 1,600 source-provided augmented images and the non-contract Pestalotiopsis class

The 129 BananaLSD Healthy files were already represented in the active Healthy class, so none were copied again. The source folder contained 91 unique hashes and 38 exact duplicate files.

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
- **Used here:** earlier original-image imports supporting Healthy, Dead leaf, Sigatoka, and Panama disease
- **Excluded:** source-provided augmented derivatives

## Admission checks

- Every active newly copied image passes decoder verification without a recovery warning. Files `0179`, `0183`, and `0452` were moved to `label-review/malformed/sigatoka-incoming-2026-08-16/`.
- Exact SHA-256 duplicates within the active dataset were rejected.
- No new cross-class exact-hash conflicts were admitted.
- A 64-bit difference-hash screen found no strong near match at Hamming distance 6 or lower among the admitted candidate pools and their target classes.
- Source labels remain pending project-specific agricultural-expert review; source provenance is not laboratory confirmation.

After admission, a repository-wide scan also found 428 exact copies in older
repeated Healthy filename batches. Those copies were moved to
`datasets/label-review/exact-duplicates/healthy-incoming-2026-08-16/`; the
active five-class root now has 877 images and 877 distinct SHA-256 hashes.
