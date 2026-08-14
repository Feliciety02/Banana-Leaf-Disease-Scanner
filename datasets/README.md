<div align="center">

# DahonMD Dataset Guide

Layout, provenance, label-review, leakage-prevention, and validation rules for the five-class banana-leaf dataset.

</div>

> [!IMPORTANT]
> Folder placement is treated as ground truth by the loader. Only include images whose provenance and reviewed label support the selected class.

## Dataset Snapshot

The cleaned source-labeled dataset contains **459 unique, validator-readable images**.

| Output | Model key | Display name | Images |
| ---: | --- | --- | ---: |
| 0 | `healthy` | Healthy | 91 |
| 1 | `dead` | Dead leaf | 55 |
| 2 | `black-sigatoka` | Black Sigatoka | 128 |
| 3 | `yellow-sigatoka` | Yellow Sigatoka | 23 |
| 4 | `cordana-leaf-spot` | Cordana leaf spot | 162 |
|  |  | **Total** | **459** |

The class order is fixed and must not be sorted alphabetically or changed independently in another client.

## Required Layout

```text
datasets/
└── banana_leaf_5class/
    ├── healthy/
    ├── dead/
    ├── black-sigatoka/
    ├── yellow-sigatoka/
    └── cordana-leaf-spot/
```

JPG, JPEG, PNG, BMP, and WEBP files may be nested under each class directory.

The loader also accepts an existing split layout:

```text
datasets/banana_leaf_5class/
├── train/<each-class-key>/
├── validation/<each-class-key>/
└── test/<each-class-key>/
```

`val/` may replace `validation/`. Every split must contain the same five exact class keys.

## Meaning of Each Label

| Class | Intended meaning | Important boundary |
| --- | --- | --- |
| Healthy | No target-class symptoms visible in the image | Not proof the entire plant is disease-free |
| Dead leaf | Fully dried or necrotic leaf appearance | Not a Moko diagnosis or causal claim |
| Black Sigatoka | Provenance- or expert-supported Black Sigatoka | Do not infer from dark lesion color alone |
| Yellow Sigatoka | Provenance- or expert-supported Yellow Sigatoka | Visually overlaps other leaf spots and stages |
| Cordana leaf spot | Provenance- or expert-supported Cordana presentation | Review images with Sigatoka-like overlap |

Mixed, uncertain, or visually indistinguishable cases do not belong in a single-label supervised class until a qualified reviewer or authoritative provenance record resolves them.

## Audit and Reorganization Record

The August 14, 2026 audit made these recoverable changes:

| Finding | Action |
| --- | --- |
| 38 duplicate Healthy files | Moved to `label-review/exact-duplicates/` |
| 1 duplicate Yellow Sigatoka file | Moved to `label-review/exact-duplicates/` |
| Malformed `black-sigatoka/452.jpeg` | Moved to `label-review/malformed/` |
| Former `moko-disease` images | Renamed and retained as the visual `dead` class |
| 473 generic `sigatoka` images | Moved outside training to `label-review/sigatoka-unverified/` |

The old Moko folder name was not supported by image-only evidence. Renaming it to `dead` describes visible condition only and makes no claim about why the leaves died.

Of the 473 generic Sigatoka files, 62 are exact copies of images already retained under `black-sigatoka`. The remaining source label does not establish Black Sigatoka, Yellow Sigatoka, another presentation in the disease complex, or mixed infection. They remain excluded from supervised training.

## Yellow Sigatoka Review Status

The 23 retained Yellow Sigatoka images came from Mafi et al., *Banana Disease Recognition Dataset*, Version 1, DOI [`10.17632/79w2n6b4kf.1`](https://doi.org/10.17632/79w2n6b4kf.1), licensed CC BY 4.0.

The source documents field collection and augmentation but not molecular confirmation or expert review for every retained image. Several images have Cordana-like visual overlap. Their status is recorded in `label-review/yellow-sigatoka-review.csv` as `pending-expert`.

These images support source-labeled exploratory research only. They must not support a production diagnostic claim until reviewed.

## Label Review Workflow

Use [label-review/README.md](label-review/README.md) for quarantined files.

An admission decision must record:

| Required field | Example |
| --- | --- |
| Relative path | `sigatoka-unverified/123.jpeg` |
| Final class | `black-sigatoka`, `yellow-sigatoka`, or `exclude` |
| Authority | Reviewer name or authoritative source |
| Review date | ISO date such as `2026-08-15` |
| Evidence note | Why the final label is justified |

Never assign Black versus Yellow Sigatoka from lesion color alone. Mark mixed or unresolved cases as `exclude`.

## Supported Formats and Preprocessing

| Format | Training loader | Diagnosis upload | Notes |
| --- | :---: | :---: | --- |
| JPG/JPEG | Yes | Yes | Lossy; retain quality metadata when available |
| PNG | Yes | Yes | Transparency is converted to RGB |
| WEBP | Yes | Yes | May be lossy or lossless |
| BMP | Yes | No | Offline training only |

All training images follow this path:

```text
decode → physical orientation → RGB → direct resize to 224 × 224 → float32 [0, 1]
```

The model receives pixels, not the filename extension. A PNG farmer capture can be processed after WEBP training, but equal field accuracy is not guaranteed. Compression, device processing, lighting, blur, distance, background, cultivar, and disease stage may change the pixel distribution.

Converting a WEBP image to PNG does not restore lost detail or create a new biological sample.

## Split and Leakage Rules

For an unsplit dataset, the loader creates a deterministic, class-stratified split:

| Partition | Share | Current count |
| --- | ---: | ---: |
| Training | 70% | 322 |
| Validation | 15% | 68 |
| Test | 15% | 69 |

Follow these rules:

1. Put every image of the same leaf, plant, plot, or capture session in one biological group.
2. Record known relationships in `datasets/group_manifest.json`.
3. Keep each group entirely inside one split.
4. Keep original and converted/cropped/augmented versions together.
5. Do not use demo assets, screenshots, or generated images as independent test samples.
6. Select hyperparameters from validation data, not the test set.
7. Open the test set only after the experiment is frozen.

Unlisted files fall back to exact SHA-256 grouping. Hashing catches byte-identical copies but cannot recognize different photos or crops of the same specimen; that relationship must be recorded manually.

## Provenance Checklist

Record as much of the following as the research protocol permits:

- source or collector;
- collection date and location;
- leaf, plant, plot, or session group ID;
- device and capture conditions;
- original format and processing history;
- labeling method and reviewer;
- license and reuse permission; and
- exclusion or uncertainty notes.

Also review unreadable files, severe blur, incorrect crops, watermarks, label leakage, and implausibly small images before training.

## Validate Before Training

From the repository root:

```powershell
.venv\Scripts\python.exe -m ai.data.validate_dataset `
  --dataset-dir datasets\banana_leaf_5class
```

The validator checks class keys and order, empty classes, unreadable files, duplicate-label conflicts, group leakage, and split consistency before writing a persistent manifest.

Class imbalance must be reported rather than hidden. Record any weighting, sampling, or augmentation strategy in the experiment configuration and thesis report.

Continue with the [AI pipeline guide](../ai/README.md) or the [dataset/model trainer checklist](../docs/dataset-model-trainer-todo.md).
