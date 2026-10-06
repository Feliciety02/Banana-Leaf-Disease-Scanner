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
| Healthy | `healthy-*.webp` | Mafi et al. (2023), *Banana Disease Recognition Dataset*, V1 | CC BY 4.0 |
| Sigatoka leaf spot | `sigatoka-*.webp` | Mafi et al. (2023), *Banana Disease Recognition Dataset*, V1 | CC BY 4.0 |
| Cordana leaf spot | `cordana-*.webp` | Arman et al. (2023), *Banana Leaf Spot Diseases (BananaLSD) Dataset*, V1 | CC BY 4.0 |
| Panama disease leaf stages | `panama-stages/*/panama-leaf-stage-*.webp` | Mduma & Elinisa (2025), *Banana Leaves Imagery Dataset* | CC BY 4.0 |
| Banana freckle (leaf symptoms) | `banana-freckle.webp` | © State of Queensland, [Business Queensland](https://www.business.qld.gov.au/industries/farms-fishing-forestry/agriculture/biosecurity/plants/priority-pest-disease/banana-freckle) | CC BY 4.0 |
| Banana bunchy top | `banana-bunchy-top.webp` | Scot Nelson, [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Banana_bunchy_top_virus_symptoms.jpg) | CC0 1.0 |

## Sources

### Banana Disease Recognition Dataset

- **Authors:** Mafi, Md Mafiul Hasan Matin; Sifat, R. M.; Moazzam, Md. Golam Moazzam; Uddin, Mohammad Shorif
- **Published:** 2023, Mendeley Data, Version 1
- **DOI:** <https://doi.org/10.17632/79w2n6b4kf.1>
- **License:** [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)

### BananaLSD Dataset

- **Authors:** Arman, Shifat E.; Bhuiyan, Md Abdullahil Baki; Abdullah, Hasan Muhammad; Islam, Shariful; Chowdhury, Tahsin Tanha; Hossain, Md. Arban
- **Published:** 2023, Mendeley Data, Version 1
- **DOI:** <https://doi.org/10.17632/9tb7k297ff.1>
- **License:** [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)

### Banana Leaves Imagery Dataset

- **Authors:** Mduma, Neema; Elinisa, Christian
- **Published:** 2025, Zenodo
- **DOI:** <https://doi.org/10.5281/zenodo.7670326>
- **Related article:** <https://doi.org/10.1038/s41597-025-04456-4>
- **License:** [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)

The `panama-stages` collection uses only images from the dataset's Fusarium Wilt Race 1 class. Its stage ordering is a provisional leaf-severity grouping, not a source-provided chronological label. See [`panama-stages/README.md`](panama-stages/README.md) for the image mapping and leaf-only scope.

## Asset Handling

The selected files came from the datasets' original, non-augmented image sets. They were renamed for stable application use and, in October 2026, re-encoded as WebP (quality 82, Panama stages quality 80) to load faster; the Panama stage photos were also resized from 4624 px to 1600 px wide. No other edits (cropping, color or content changes) were made.

### Filename patterns

| Category | Pattern |
| --- | --- |
| Healthy | `healthy-<number>.webp` |
| Sigatoka leaf spot | `sigatoka-<number>.webp` |
| Cordana leaf spot | `cordana-<number>.webp` |
| Panama disease leaf stage | `panama-stages/<stage-folder>/panama-leaf-stage-<number>.webp` |

## Student Checklist

- [ ] The image is used for education, not presented as confirmation.
- [ ] Attribution points to the original source.
- [ ] The license is recorded and compatible with use.
- [ ] The file is not an augmented export.
- [ ] The file is saved as WebP (longest side at most 1600 px) and the filename follows the table above.
- [ ] The UI still builds after the asset change.
