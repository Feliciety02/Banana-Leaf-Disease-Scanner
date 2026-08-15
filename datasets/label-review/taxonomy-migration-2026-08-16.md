# Taxonomy Migration — 2026-08-16

## Canonical output contract

| Index | Model key | Migration action |
| ---: | --- | --- |
| 0 | `healthy` | Unchanged |
| 1 | `dead` | Unchanged |
| 2 | `sigatoka` | Merged former Black- and Yellow-source training images |
| 3 | `panama-disease` | Replaced the former Yellow output; 42 source-labeled candidates added |
| 4 | `cordana-leaf-spot` | Unchanged |

The merge moved 131 cleaned Black-source and 23 reviewed/source-recorded
Yellow-source images into one 154-image `sigatoka` directory. Original
filenames were retained for provenance. The legacy Yellow-source review sheet
and group manifest now point to the merged class.

A later documented source expansion admitted 97 warning-free Sigatoka
originals (three malformed files were quarantined), bringing the active class
to 251 images without changing the taxonomy mapping.

`panama-disease` contains 42 readable, byte-unique leaf candidates from two
documented sources. Five educational Panama leaf-stage assets in the web app
are byte-identical copies outside the training root and are not additional
samples. Structural dataset validation passes; formal retraining remains gated
on agricultural-expert review and biological/source grouping.

Existing model and label-map artifacts with `black-sigatoka` or
`yellow-sigatoka` outputs are obsolete. The API and comparison service reject
them rather than silently remapping predictions.
