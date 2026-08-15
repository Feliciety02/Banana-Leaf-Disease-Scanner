# Panama Disease Leaf Stages

This folder contains leaf-only educational references for banana Fusarium wilt (Panama disease). It intentionally excludes pseudostems, petioles, rhizomes, fruit, internal cross-sections, and whole-plant views.

## Important limitation

The source dataset labels these images as **Fusarium Wilt Race 1**, but it does not assign chronological disease stages. The five folders below are therefore a **provisional visual-severity sequence** based only on visible leaf symptoms. They must not be treated as diagnostic ground truth or added to model training without expert review.

Symptoms such as petiole streaking or buckling, leaf-skirt formation, and the final canopy spike cannot be represented faithfully in a leaf-only collection, so they are outside this folder's scope.

## Provisional leaf sequence

| Folder | Visible leaf condition | Local file | Original file |
| --- | --- | --- | --- |
| `01-early-margin-yellowing` | Mostly green blade with initial yellowing near the margin | `panama-leaf-stage-1.jpg` | `FW_534.jpg` |
| `02-expanding-chlorosis` | Yellowing expanding inward from the margin with limited browning | `panama-leaf-stage-2.jpg` | `FW_520.jpg` |
| `03-widespread-yellowing` | Broad chlorosis across most of the blade | `panama-leaf-stage-3.jpg` | `FW_252.jpg` |
| `04-advanced-edge-necrosis` | Extensive yellowing with brown, dead tissue along the leaf edge | `panama-leaf-stage-4.jpg` | `FW_246.jpg` |
| `05-near-total-leaf-death` | Blade is predominantly yellow-brown with little healthy green tissue remaining | `panama-leaf-stage-5.jpg` | `FW_285.jpg` |

## Source and license

- **Dataset:** *Banana Leaves Imagery Dataset*
- **Authors:** Neema Mduma and Christian Elinisa
- **Published:** 2025, Zenodo
- **Dataset DOI:** <https://doi.org/10.5281/zenodo.7670326>
- **Related article:** <https://doi.org/10.1038/s41597-025-04456-4>
- **Source class/archive:** `Fusarium Wilt Race 1` / `FUSARIUM WILT-1.zip`
- **License:** [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)

The selected source files are unaugmented leaf photographs. They were copied and renamed for stable project organization; no visual modifications were made.
