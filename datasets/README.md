# Dataset

The banana leaf image dataset is intentionally excluded from this repository.

The five target categories and their model output order are fixed. Directory names use stable machine keys; the corresponding display names are shown below:

| Output index | Directory / model key | Display name |
| --- | --- | --- |
| 0 | `healthy` | Healthy |
| 1 | `moko-disease` | Moko disease |
| 2 | `black-sigatoka` | Black Sigatoka |
| 3 | `yellow-sigatoka` | Yellow Sigatoka |
| 4 | `cordana-leaf-spot` | Cordana leaf spot |

Only use provenance-backed images whose expert-verified labels match this contract. Demo UI images are not training data.

Place the real dataset locally at:

```text
datasets/
`-- banana_leaf_5class/
    |-- healthy/
    |-- moko-disease/
    |-- black-sigatoka/
    |-- yellow-sigatoka/
    `-- cordana-leaf-spot/
```

Each class directory must contain its corresponding JPG, JPEG, PNG, BMP, or WEBP images. The loader also accepts an existing `train/`, `validation/`, and `test/` layout when every split contains the same exact five class directories.

## Supported Formats and Preprocessing

| Format | Training loader | Diagnosis upload | Notes |
| --- | --- | --- | --- |
| JPG/JPEG | Yes | Yes | Lossy compression; retain quality metadata when available. |
| PNG | Yes | Yes | Usually lossless; transparency is converted to three-channel RGB. |
| WEBP | Yes | Yes | May be lossy or lossless; record encoder quality when known. |
| BMP | Yes | No | Accepted for offline training, but not by the stored diagnosis-image contract. |

All supported training images are decoded to RGB, resized directly to `224 x 224`, converted to `float32`, and normalized to `[0, 1]`. The network receives pixel values, not the filename extension. Normalize physical orientation before ingestion; do not assume that every decoder or deployment bridge will apply EXIF rotation identically.

A PNG farmer capture remains a valid input when training files are WEBP. Accuracy may nevertheless change because WEBP compression, camera enhancement, lighting, blur, background, distance, or device characteristics alter the pixels. Include genuine images from the intended field workflow in validation and testing.

Converting one WEBP image to PNG does not restore compression loss or create a new biological sample. Never distribute original and converted copies across training, validation, or test sets.

## Layout Options

For the structure shown above, the loader creates a deterministic, class-stratified 70% training, 15% validation, and 15% test split. It also accepts this pre-split structure:

```text
datasets/banana_leaf_5class/
|-- train/<each-exact-class-key>/
|-- validation/<each-exact-class-key>/
`-- test/<each-exact-class-key>/
```

`val/` may be used instead of `validation/`. Files may be nested below their class directory. Every class needs enough independent biological groups to populate all three splits.

## Leakage and Provenance Rules

- Record source, collection date, location, device, capture conditions, labeling method, and reviewer where permitted by the study protocol.
- Use expert-confirmed class labels. Folder placement is treated as ground truth; the loader cannot determine whether a biological label is correct.
- If multiple photographs can come from one leaf, plant, plot, or capture session, provide a JSON `data.group_manifest` mapping each dataset-relative path to its group ID.
- Keep each biological group entirely within one split. Exact-byte hashing catches duplicate files, but it cannot recognize different crops or photographs of the same specimen without group metadata.
- Keep the test set untouched until the pipeline and hyperparameters are finalized. Do not select checkpoints or tune thresholds using test results.
- Do not use demo UI assets, screenshots, augmented exports, or model-generated images as independent test samples.
- Review unreadable files, severe blur, incorrect crops, watermarks, label leakage, and implausibly small images before training.

Class balance should be reported rather than hidden. If imbalance is handled through sampling, weighting, or augmentation, record the method in the experiment configuration and thesis report.

After placing the images, copy `ai/.env.example` to `ai/.env`, set `DATASET_ROOT`, and run:

```powershell
python -m ai.data.validate_dataset
```

The validator checks the exact class keys and output order above, empty classes, unreadable images, duplicate-label conflicts, and train/validation/test leakage before producing a split manifest. Training must not begin until the dataset and research plan are approved.
