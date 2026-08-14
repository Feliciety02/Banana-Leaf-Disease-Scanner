<div align="center">

# Disease Guide Image Attribution

Sources and licenses for representative educational images displayed in the DahonMD disease guide.

</div>

> [!NOTE]
> These images are visual references, not diagnostic confirmation, and are not automatically part of the supervised training dataset.

## Start Here

Students should use this document when adding or replacing an image in the web Disease Guide.

Before adding an asset:

1. Confirm that the license permits reuse.
2. Save the source title, authors, DOI or URL, version, and license.
3. Choose an original, non-augmented representative image.
4. Use the existing stable filename pattern.
5. Add or update its attribution below.
6. Keep the image out of model training unless it separately passes the dataset-review process.

## Attribution

| Guide category | Local files | Source | License |
| --- | --- | --- | --- |
| Healthy | `healthy-*.jpg` | Mafi et al. (2023), *Banana Disease Recognition Dataset*, V1 | CC BY 4.0 |
| Dead leaf | `dead-*.jpg` | Mafi et al. (2023), *Banana Disease Recognition Dataset*, V1 | CC BY 4.0 |
| Black Sigatoka | `black-sigatoka-*.jpg` | Mafi et al. (2023), *Banana Disease Recognition Dataset*, V1 | CC BY 4.0 |
| Yellow Sigatoka | `yellow-sigatoka-*.jpg` | Mafi et al. (2023), *Banana Disease Recognition Dataset*, V1 | CC BY 4.0 |
| Cordana leaf spot | `cordana-*.jpg` | Arman et al. (2023), *Banana Leaf Spot Diseases (BananaLSD) Dataset*, V1 | CC BY 4.0 |

## Sources

### Banana Disease Recognition Dataset

- **Authors:** Mafi, Md Mafiul Hasan Matin; Sifat, R. M.; Moazzam, Md. Golam Moazzam; Uddin, Mohammad Shorif
- **Published:** 2023, Mendeley Data, Version 1
- **DOI:** <https://doi.org/10.17632/79w2n6b4kf.1>
- **License:** [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)

The `dead-*.jpg` examples show visibly dried or necrotic leaves. They do not identify the biological cause of leaf death.

### BananaLSD Dataset

- **Authors:** Arman, Shifat E.; Bhuiyan, Md Abdullahil Baki; Abdullah, Hasan Muhammad; Islam, Shariful; Chowdhury, Tahsin Tanha; Hossain, Md. Arban
- **Published:** 2023, Mendeley Data, Version 1
- **DOI:** <https://doi.org/10.17632/9tb7k297ff.1>
- **License:** [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)

## Asset Handling

The selected files came from the datasets' original, non-augmented image sets. They were renamed for stable application use; no visual modifications were made.

### Filename patterns

| Category | Pattern |
| --- | --- |
| Healthy | `healthy-<number>.jpg` |
| Dead leaf | `dead-<number>.jpg` |
| Black Sigatoka | `black-sigatoka-<number>.jpg` |
| Yellow Sigatoka | `yellow-sigatoka-<number>.jpg` |
| Cordana leaf spot | `cordana-<number>.jpg` |

## Student Checklist

- [ ] The image is used for education, not presented as confirmation.
- [ ] Attribution points to the original source.
- [ ] The license is recorded and compatible with use.
- [ ] The file is not an augmented export.
- [ ] The filename follows the table above.
- [ ] The UI still builds after the asset change.
