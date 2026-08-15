<div align="center">

# DahonMD Dataset Guide

Layout, provenance, label-review, leakage-prevention, and validation rules for the five-class banana-leaf dataset.

</div>

> [!IMPORTANT]
> Folder placement is treated as ground truth by the loader. Only include images whose provenance and reviewed label support the selected class.

## Start Here

Use this folder when your task involves collecting images, checking labels, removing duplicates, assigning biological groups, or preparing data for training.

If you are new to the dataset, follow this order:

1. Read [Meaning of each label](#meaning-of-each-label).
2. Check whether the image belongs in training or [label review](label-review/README.md).
3. Record provenance and biological grouping.
4. Put only approved images in the exact class folder.
5. Run the validator.
6. Do not train until validation passes.

> [!CAUTION]
> Do not move an uncertain image into the class that merely looks closest. Ask a qualified reviewer or keep it excluded.

## Current Class Contract (August 16, 2026)

Black and Yellow Sigatoka are now one model class, `sigatoka`. The former
Yellow output slot is now `panama-disease`. This order is fixed and must not be
sorted alphabetically or changed independently in another client.

| Output | Model key | Display name | Working images |
| ---: | --- | --- | ---: |
| 0 | `healthy` | Healthy | 298 |
| 1 | `dead` | Dead leaf | 55 |
| 2 | `sigatoka` | Sigatoka leaf spot | 251 |
| 3 | `panama-disease` | Panama disease | 42 |
| 4 | `cordana-leaf-spot` | Cordana leaf spot | 231 |
|  |  | **Total** | **877** |

> [!WARNING]
> The 42 Panama images are readable, source-labeled leaf candidates, not
> laboratory confirmation. Structural validation can pass, but formal training
> and deployment remain gated on agricultural-expert review and biological/source
> grouping. Existing model artifacts use the obsolete Black/Yellow contract and
> are not compatible with this dataset.

All 877 active files are validator-readable and byte-unique. Source labels and
biological grouping still require the review gates described below, so this is
not a claim of laboratory-confirmed ground truth.

### Kaggle original-image expansion

The August 16, 2026 Kaggle expansion imported 300 leaf-only original images:
100 Healthy images from *Nutrient Deficient Banana Plant Leaves*, plus 100
Sigatoka and 100 Cordana images from BananaLSD. Three Sigatoka files that
triggered truncated/MPO decoder-recovery warnings were subsequently
quarantined, leaving 297 active additions. Source-provided augmentations were
not admitted. Exact-hash, decoder, and perceptual near-duplicate checks were run
before final admission. See
[`banana_leaf_5class/SOURCES.md`](banana_leaf_5class/SOURCES.md) for source,
license, mapping, and selection details.

A repository-wide rescan then found 428 exact Healthy copies in four repeated
107-image batches. They were moved to
`label-review/exact-duplicates/healthy-incoming-2026-08-16/`; one clean
`fresh1.jpg` through `fresh107.jpg` set remains active.

### Legacy research snapshot

The August 14 experiment used the retired contract: Healthy 91, Dead leaf 55,
Black Sigatoka 128, Yellow Sigatoka 23, and Cordana leaf spot 162 (459 total).
Its reports remain unchanged as historical evidence, but its scores and
artifacts cannot be used with the current class contract.

## Required Layout

```text
datasets/
└── banana_leaf_5class/
    ├── healthy/
    ├── dead/
    ├── sigatoka/
    ├── panama-disease/
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
| Sigatoka leaf spot | Provenance- or expert-supported Black or Yellow Sigatoka presentation | The model does not distinguish Black from Yellow Sigatoka |
| Panama disease | Provenance- or expert-supported Panama disease leaf presentation | Leaf symptoms alone cannot confirm Fusarium wilt; field or laboratory assessment may be needed |
| Cordana leaf spot | Provenance- or expert-supported Cordana presentation | Review images with Sigatoka-like overlap |

Mixed, uncertain, or visually indistinguishable cases do not belong in a single-label supervised class until a qualified reviewer or authoritative provenance record resolves them.

## Audit and Reorganization Record

On August 16, 2026, the 131 cleaned Black Sigatoka images and 23 retained
source-labeled Yellow Sigatoka images were merged into `sigatoka`. Their
original filenames and review provenance remain intact. `panama-disease` was
created for the 42 newly added source-labeled Panama leaf candidates. Their
source audit is stored beside the images; expert review remains pending.

The same day's Black Sigatoka incoming-image audit retained three usable
additions (`Black Sigatoka Disease (68-70).jpg`) and removed these items from
the active training set:

| Finding | Action |
| --- | --- |
| `bananier_cercosporiose_noire_sigatocare.jpg` exactly duplicated image 70 | Removed the second active copy |
| Malformed `452.jpeg` was reintroduced and exactly matched quarantined copies | Removed the reintroduced active copy; the original audit copy remains under `label-review/malformed/sigatoka/` |
| 5 unrelated PDFs and 1 executable were present in the class folder | Removed; these formats are never loaded by the model |

The 131 retained Black-source images are now part of the 154-image `sigatoka`
class. The three additions had no strong near-duplicate match in the older set.

The targeted Yellow Sigatoka and Cordana audit also removed these files from
the active training set:

| Finding | Action |
| --- | --- |
| 296 byte-identical Cordana copies across repeated filename batches | Removed duplicate copies |
| 130 augmented or near-duplicate Cordana variants from 12 source clusters | Kept one least-compressed representative per cluster and removed the variants |
| 1 Cordana image with the class name printed on it | Removed to prevent label leakage |
| 1 Cordana image with a camera timestamp | Removed to prevent a spurious shortcut |
| 2 Yellow-source images without provenance, review rows, or biological groups | Excluded from the merged class pending verification |

Before the later source expansion, the active folders contained **154 Sigatoka** and **131 Cordana
leaf spot** images. Both target folders are readable and contain no
byte-identical duplicates. Other incoming class batches were outside this
targeted audit.

The new Panama batch contains **42 readable, byte-unique leaf images**: 37
source-labeled originals from the Kaggle Banana Disease Recognition Dataset and
5 Fusarium Wilt Race 1 images from the Zenodo Banana Leaves Imagery Dataset.
The source audit excluded 4 pseudostem-containing originals and all 287
augmented exports. A cross-class difference-hash scan found no strong
near-duplicate match against the other active images. The five web-guide
copies are byte-identical educational assets outside the training root and are
not additional training samples. See
[`panama-disease/README.md`](banana_leaf_5class/panama-disease/README.md) for the
source and license record.

The August 14, 2026 audit made these recoverable changes:

| Finding | Action |
| --- | --- |
| 38 duplicate Healthy files | Moved to `label-review/exact-duplicates/` |
| 1 duplicate Yellow-source Sigatoka file | Moved to `label-review/exact-duplicates/sigatoka/` |
| Malformed Sigatoka image `452.jpeg` | Moved to `label-review/malformed/sigatoka/` |
| Former `moko-disease` images | Renamed and retained as the visual `dead` class |
| 473 generic `sigatoka` images | Moved outside training to `label-review/sigatoka-unverified/` |

The old Moko folder name was not supported by image-only evidence. Renaming it to `dead` describes visible condition only and makes no claim about why the leaves died.

Of the 473 generic Sigatoka files, 62 are exact copies of retained images. The
remaining records still lack enough provenance to establish a supervised label
or rule out another leaf spot or mixed infection. They remain excluded pending
review even though the current model no longer predicts Black and Yellow
subtypes separately.

## Legacy Yellow-source Review Status

The 23 Yellow-source images now included in `sigatoka` came from Mafi et al.,
*Banana Disease Recognition Dataset*, Version 1, DOI
[`10.17632/79w2n6b4kf.1`](https://doi.org/10.17632/79w2n6b4kf.1), licensed CC BY 4.0.

The source documents field collection and augmentation but not molecular
confirmation or expert review for every retained image. Several images have
Cordana-like visual overlap. Their original source label and pending status are
recorded in `label-review/sigatoka-legacy-yellow-review.csv`.

These images support source-labeled exploratory research only. They must not support a production diagnostic claim until reviewed.

## Label Review Workflow

Use [label-review/README.md](label-review/README.md) for quarantined files.

An admission decision must record:

| Required field | Example |
| --- | --- |
| Relative path | `sigatoka-unverified/123.jpeg` |
| Final class | `sigatoka`, `panama-disease`, `cordana-leaf-spot`, or `exclude` |
| Authority | Reviewer name or authoritative source |
| Review date | ISO date such as `2026-08-15` |
| Evidence note | Why the final label is justified |

The model no longer assigns Black versus Yellow Sigatoka. Mark mixed,
unsupported, or unresolved cases as `exclude`.

### Student decision guide

| Situation | Action |
| --- | --- |
| Label and provenance are verified | Keep the image in its approved class folder |
| Source label exists but visual overlap is unresolved | Record it as pending review |
| Only a generic `sigatoka` label exists | Keep it in `sigatoka-unverified/` |
| The image appears mixed or cannot be assigned confidently | Mark `exclude` |
| It is an exact or near duplicate | Keep one biological sample and quarantine the copy |
| The file cannot be decoded reliably | Move it to `malformed/` |

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

### What success looks like

The validator should confirm the five exact classes, readable images, and a leakage-free split. It then writes a split manifest that training can reuse.

Do not ignore a warning simply because training still starts. Fix or formally document the data issue first.

## Common Problems

| Problem | What to do |
| --- | --- |
| A class folder is rejected | Match the exact lowercase model key from the label table. |
| An image is unreadable | Move it to `label-review/malformed/` and retain the audit note. |
| A duplicate appears in two classes | Remove it from training and resolve the label conflict. |
| Related photos appear in different splits | Add their paths to one group in `group_manifest.json`. |
| Yellow and Cordana look similar | Do not guess; keep the record pending qualified review. |
| The dataset count changed | Revalidate, record the reason, and create a new experiment version. |
| Accuracy dropped after adding images | Check labels, balance, provenance, and field difficulty; a larger test can be more honest. |

## Student Handoff Checklist

Before giving the dataset to the model trainer, provide:

- the validated dataset path;
- the class counts;
- `group_manifest.json`;
- provenance and license records;
- the list of pending or excluded images;
- validator output and split-manifest fingerprint; and
- a note describing every dataset change since the previous run.

Continue with the [AI pipeline guide](../ai/README.md) or the [dataset/model trainer checklist](../docs/dataset-model-trainer-todo.md).
