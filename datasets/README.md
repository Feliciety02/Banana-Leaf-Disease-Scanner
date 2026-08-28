<div align="center">

# DahonMD Dataset Guide

Layout, provenance, label-review, leakage-prevention, and validation rules for the four-class banana-leaf thesis dataset and its preserved dead-leaf quarantine.

</div>

> [!IMPORTANT]
> Folder placement is treated as ground truth by the loader. Only include images whose provenance and reviewed label support the selected class.

## Start Here

Use this folder when your task involves collecting images, checking labels, removing duplicates, assigning biological groups, or preparing data for training.

If you are new to the dataset, follow this order:

1. Read [Meaning of each label](#meaning-of-each-label).
2. Check whether the image belongs in training or [label review](reviews/labels/README.md).
3. Record provenance and biological grouping.
4. Put only approved images in the exact class folder.
5. Run the validator.
6. Do not train until validation passes.

> [!CAUTION]
> Do not move an uncertain image into the class that merely looks closest. Ask a qualified reviewer or keep it excluded.

## Workspace Map

The workspace keeps immutable image inputs at the top level and groups all
supporting material by purpose. Dataset images and generated JSON/CSV content
remain intentionally ignored by Git; the manifests and review records are
preserved locally and must be backed up with the research workspace.

| Path | Role | Current use |
| --- | --- | --- |
| `banana_leaf_thesis_4class/` | **SOURCE INPUT** | Original working image inventory. The four model-class folders are active inputs; `dead/` is quarantine and is not a fifth class. Do not modify images in place. |
| `davao-field/` | **SOURCE INPUT** | Original Davao field acquisitions. Keep originals immutable. |
| `ssl-unlabeled/` | **SOURCE INPUT** | Original external unlabeled banana-leaf candidates. Keep originals immutable. |
| `metadata/` | **CURRENT + ARCHIVED METADATA** | Authoritative image/group manifests, a proposed reviewed group output, and retired assignments. |
| `reviews/` | **HUMAN REVIEW** | Label decisions, the near-duplicate queue, reviewed decisions, application summary, and preserved working copies. |
| `workflows/` | **ACQUISITION WORKFLOWS** | Davao field and external SSL registries, review files, and generated manifests. |
| `outputs/` | **GENERATED OUTPUTS** | Versioned cohort diagnostics and frozen-split workspace. Inspect each artifact's status before use. |
| `docs/` | **STUDENT GUIDES** | Metadata, duplicate review, cohort, split, SSL, and Davao workflow instructions in pipeline order. |

```text
datasets/
├── banana_leaf_thesis_4class/  # labeled images + dead quarantine
├── davao-field/                # original field captures
├── ssl-unlabeled/              # original unlabeled SSL candidates
├── metadata/                   # image and grouping manifests
├── reviews/                    # human label and duplicate decisions
├── workflows/                  # Davao and SSL registries/manifests
├── outputs/                    # cohort and split artifacts
└── docs/                       # step-by-step student guides
```

The 4 GB labeled image root was intentionally not relocated: current
provenance and adjudication manifests store its absolute root. Keeping the
three input paths stable avoids rewriting scientific evidence merely for
cosmetic foldering.

The complete old-to-new path map and integrity record is in
[`layout-migration-2026-08-28.md`](docs/layout-migration-2026-08-28.md).

## Current Class Contract (August 26, 2026)

The thesis plan is 700 labeled images per class (2,800 total) plus 8,000
unlabeled banana-leaf images for SSL. Those are planned cohort sizes, not claims
about this larger acquired inventory. Final cohort selection remains pending
expert review and leakage-safe grouping; images must not be fabricated or
silently discarded merely to force the planned totals.

Black and Yellow Sigatoka are now one model class, `sigatoka`. The former
Yellow output slot is now `panama-disease`. This order is fixed and must not be
sorted alphabetically or changed independently in another client.

| Output | Model key | Display name | Working images |
| ---: | --- | --- | ---: |
| 0 | `healthy` | Healthy | 4,000 |
| 1 | `sigatoka` | Sigatoka | 4,000 |
| 2 | `panama-disease` | Panama Disease | 4,000 |
| 3 | `cordana-leaf-spot` | Cordana Leaf Spot | 670 files |
| — | `dead` | Preserved quarantine; no model index | 745 |
|  |  | **Four-class canonical total** | **12,670** |

> [!WARNING]
> The August 26 formal audit found 0 unreadable images, 0 exact duplicate
> copies, 1,011 perceptual pairs requiring visual review, and only 16 active
> images with explicit biological/acquisition group assignments. Seven stale
> assignments were moved to `metadata/archive/group_manifest_retired.json`
> without erasing them.
> Formal split creation is blocked until metadata and near-duplicate review are
> complete. Existing model artifacts are incompatible with this contract.

The complete pair-review procedure, decision vocabulary, current queue counts,
and deterministic artifact fingerprints are in
[`near-duplicate-review.md`](docs/near-duplicate-review.md). The generated JSON and
CSV review artifacts remain local under `datasets/` because the repository's
dataset ignore policy excludes non-documentation files.

There are 13,415 image files on disk: 12,670 in active class folders and 745 in
the dead-leaf quarantine. The validator determines the accepted canonical count
after exact-copy exclusion; folder counts alone are not a formal cohort.

After review and grouping, use the versioned cohort procedure in
[`cohort-selection.md`](docs/cohort-selection.md). The current 700-per-class build is
blocked and selects zero files: Cordana has only 670 raw images, while metadata
and duplicate adjudication are still incomplete. Cohort selection precedes the
70/15/15 split.

The atomic group-aware splitting procedure and current signed blocked result
are documented in [`final-split.md`](docs/final-split.md). No train, validation, or
test manifest is emitted until the cohort and all split quality gates pass.

The separate public-unlabeled ingestion framework is documented in
[`ssl-ingestion.md`](docs/ssl-ingestion.md). Its current honest count is zero acquired
and zero SSL-ready, leaving the full 8,000-image target outstanding.

For Davao field photos, follow the student checklist in
[`davao-field-workflow.md`](docs/davao-field-workflow.md). It explains what metadata
to record, how expert review works, why related photos share a group, and why
approved images are final-test-only. The current field manifest reports zero
acquired and zero expert-validated test-ready images.

The enforced processing order is acquisition → label harmonization and quality
control → exact/near-duplicate screening → biological/acquisition grouping →
dataset split → training-only augmentation.

### Kaggle original-image expansion

The August 16, 2026 Kaggle expansion imported 300 leaf-only original images:
100 Healthy images from *Nutrient Deficient Banana Plant Leaves*, plus 100
Sigatoka and 100 Cordana images from BananaLSD. Three Sigatoka files that
triggered truncated/MPO decoder-recovery warnings were subsequently
quarantined, leaving 297 active additions. Source-provided augmentations were
not admitted. Exact-hash, decoder, and perceptual near-duplicate checks were run
before final admission. See
[`banana_leaf_thesis_4class/SOURCES.md`](banana_leaf_thesis_4class/SOURCES.md) for source,
license, mapping, and selection details.

A repository-wide rescan then found 428 exact Healthy copies in four repeated
107-image batches. They were moved to
`reviews/labels/exact-duplicates/healthy-incoming-2026-08-16/`; one clean
`fresh1.jpg` through `fresh107.jpg` set remains active. (The quarantined copies
were removed from the working tree later that day and remain recoverable from
git history.)

### August 16, 2026 quantity expansion

To balance class quantity against the Panama class, the dataset was expanded
again on August 16, 2026. All class folders were flattened (images live directly
under each class key; the loader's `rglob` already supports this). Oversized
Zenodo photographs (3480 × 3496 px) were downscaled to a maximum dimension of
1024 px to keep storage and decode time practical for the 224 × 224 training
pipeline (12.35 GB → 0.46 GB before the expansion additions).

New sources admitted, after exact-hash and perceptual near-duplicate screening
against the entire active dataset:

| Class | Before | Added | Now |
| --- | ---: | ---: | ---: |
| `healthy` | 298 | +4,206 | 4,504 |
| `sigatoka` | 251 | +5,567 | 5,818 |
| `panama-disease` | 4,088 | — | 4,088 |
| `cordana-leaf-spot` | 231 | +203 | 434 |
| `dead` | 55 | — | 55 |
Additions by source:

- **Zenodo Banana Leaves Imagery Dataset** (Tanzania, DOI
  [`10.5281/zenodo.7670326`](https://doi.org/10.5281/zenodo.7670326), CC BY 4.0):
  3,218 Healthy images (`healthy-zenodo-*`) and 3,496 Black Sigatoka images
  (`sigatoka-zenodo-*`). Archive MD5 checksums were verified before admission.
- **`rayhanarlistya/banana-leaf-disease-dataset-v4`** (Kaggle, license recorded
  as Unknown): 1,001 Healthy (`healthy-v4-*`), 2,497 Sigatoka
  (`sigatoka-v4-*`), and 342 Cordana (`cordana-v4-*`) originals. 167 Cordana and
  a small number of Healthy/Sigatoka files were rejected as perceptual
  near-duplicates of already-active images. **Caution:** this compilation
  dataset lists its license as Unknown; it was added at the project owner's
  explicit request. Prefer the individually licensed upstream sources for
  publication.
- **BananaLSD** (Kaggle, CC BY-SA 4.0): 30 additional Cordana originals
  (`cordana-bananalsd-*`) not already active.

A full-dataset sweep after admission found 0 exact and 0 perceptual
near-duplicates (Hamming distance ≤ 6) across all 14,899 files. The validator
regenerates a leakage-safe split manifest on a fresh output directory.

### Ecuador Cordana expansion (August 16, 2026)

To further balance `cordana-leaf-spot` against `panama-disease`, 266 original
field captures from *Deep Learning Banana Diseases* (Ecuador,
`NixonJimenez02/deep-learning-banana-diseases` → `Data-Tesis/Cordana`) were
admitted as `cordana-ecuador-*`, bringing the class from 434 to 700. The
repository's 9,003 source-provided augmented images were not admitted. Screening
rejected 28 files byte-identical to already-active images and 6 files matching
existing cordana originals at dHash distance 0 (the source originals of
re-encoded v4 copies). All admitted images are ≤ 1024 px on the longest side.
The repository declares no LICENSE file; the companion MDPI AgriEngineering
article is CC BY 4.0 and states the data are openly available. See
[`banana_leaf_thesis_4class/SOURCES.md`](banana_leaf_thesis_4class/SOURCES.md).

### Flip-aware duplicate sweep (August 16, 2026)

After the Ecuador expansion, every class was rescanned against horizontal and
vertical flips and 180° rotations (dHash is defeated by H/V flips because the
gradient direction inverts, so flipped copies score far instead of near). The
sweep ran in two passes:

**Pass 1 — identical-hash pairs (Hamming distance 0 in any orientation):**

| Class | dist=0 pairs | Files removed |
| --- | ---: | ---: |
| `cordana-leaf-spot` | 88 | 79 |
| `healthy` | 29 | 24 |
| `panama-disease` | 14 | 11 |
| `sigatoka` | 3 | 3 |
| `dead` | 0 | 0 |
| **Total** | 134 | **117** |

**Pass 2 — fine-verified pairs:** every remaining pair at 64-bit distance ≤ 2
was re-checked with a finer 256-bit dHash across all orientations. Only pairs
whose 256-bit distance stayed ≤ 16/256 (6.25%) were treated as re-encoded
duplicates and removed. This confirmed the same v4/pfsd re-encode pattern that
pass 1 missed by 1-2 bits of re-encode noise:

| Class | Verified pairs | Files removed |
| --- | ---: | ---: |
| `cordana-leaf-spot` | 24 | 23 |
| `healthy` | 2 | 2 |
| `panama-disease` | 21 | 18 |
| `sigatoka` | 0 | 0 |
| **Total** | 47 | **43** |

In every cluster the source-original copy was kept (BananaLSD, legacy imports,
Zenodo) and the v4-derived or lower-numbered duplicate was removed. After both
passes the dataset contains **15,005** active images. The earlier "0 exact /
0 near-duplicates" sweep was not flip-aware; these passes close that gap at the
strictest thresholds (dist=0 + 256-bit confirmation).

### Flattened layout

```text
datasets/banana_leaf_thesis_4class/
├── healthy/            # *.jpg (mostly zenodo, v4, nutrient, original)
├── dead/
├── sigatoka/
├── panama-disease/
└── cordana-leaf-spot/
```

Images are flat (no source subfolders). Filename prefixes record provenance:
`healthy-zenodo-*`, `healthy-v4-*`, `healthy-nutrient-*`, `sigatoka-zenodo-*`,
`sigatoka-v4-*`, `cordana-v4-*`, `cordana-bananalsd-*`, `cordana-ecuador-*`,
`panama-*`.

### Legacy research snapshot

The August 14 experiment used the retired contract: Healthy 91, Dead leaf 55,
Black Sigatoka 128, Yellow Sigatoka 23, and Cordana leaf spot 162 (459 total).
Its reports remain unchanged as historical evidence, but its scores and
artifacts cannot be used with the current class contract.

## Required Layout

```text
datasets/
└── banana_leaf_thesis_4class/
    ├── healthy/
    ├── dead/
    ├── sigatoka/
    ├── panama-disease/
    └── cordana-leaf-spot/
```

JPG, JPEG, PNG, BMP, and WEBP files may be nested under each class directory.

The loader also accepts an existing split layout:

```text
datasets/banana_leaf_thesis_4class/
├── train/<each-class-key>/
├── validation/<each-class-key>/
└── test/<each-class-key>/
```

`val/` may replace `validation/`. Every split must contain the same four active
class keys. A `dead/` folder may exist beside an unsplit dataset and is reported
as quarantine; it is never accepted inside a model split.

## Meaning of Each Label

| Class | Intended meaning | Important boundary |
| --- | --- | --- |
| Healthy | No target-class symptoms visible in the image | Not proof the entire plant is disease-free |
| Dead leaf (quarantine only) | Fully dried or necrotic leaf appearance | Preserved for audit/history; no model index and not a Moko diagnosis |
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
| Malformed `452.jpeg` was reintroduced and exactly matched quarantined copies | Removed the reintroduced active copy; the original audit copy remains under `reviews/labels/malformed/sigatoka/` |
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
not additional training samples. See the
[`SOURCES.md` catalog](banana_leaf_thesis_4class/SOURCES.md) for the source and
license record.

The August 14, 2026 audit made these recoverable changes:

| Finding | Action |
| --- | --- |
| 38 duplicate Healthy files | Moved to `reviews/labels/exact-duplicates/` |
| 1 duplicate Yellow-source Sigatoka file | Moved to `reviews/labels/exact-duplicates/sigatoka/` |
| Malformed Sigatoka image `452.jpeg` | Moved to `reviews/labels/malformed/sigatoka/` |
| Former `moko-disease` images | Renamed and retained as the visual `dead` class |
| 473 generic `sigatoka` images | Moved outside training to `reviews/labels/sigatoka-unverified/` |

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
recorded in `reviews/labels/sigatoka-legacy-yellow-review.csv`.

These images support source-labeled exploratory research only. They must not support a production diagnostic claim until reviewed.

## Label Review Workflow

Use [reviews/labels/README.md](reviews/labels/README.md) for quarantined files.

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

## Split and Leakage Protocol

The split is created **once, before any model training or augmentation**, and is
then frozen for the entire baseline, teacher, student, Keras, and TensorFlow Lite
comparison. For an unsplit dataset, the loader creates a deterministic,
class-stratified split of biological/acquisition groups:

| Partition | Share | Current count |
| --- | ---: | ---: |
| Training | 70% | 10,503 |
| Validation | 15% | 2,251 |
| Test | 15% | 2,251 |

> [!CAUTION]
> A generated manifest is not, by itself, proof that the split is biologically
> independent. The validator can enforce only the relationships recorded in
> `metadata/group_manifest.json` plus exact byte matches. Until the source, near-duplicate,
> and biological/acquisition-group audit is complete, report resulting scores as
> preliminary rather than as evidence of field generalization.

The required order of operations is:

1. Inventory the original images and record the source dataset or collector for every image.
2. Remove or quarantine corrupt, unreadable, irrelevant, and otherwise unusable images, retaining an exclusion log.
3. Detect byte-identical files with SHA-256 and retain only the approved representative of each duplicate set.
4. Detect and visually inspect perceptual near-duplicates, crops, re-encodes, burst frames, and different views of the same specimen. Exclude redundant copies or assign all related images one group ID.
5. For field images, record every available `plant_id`, `leaf_id`, plantation/site, and acquisition-session identifier. Use `unknown`; never invent an identifier.
6. Construct the train/validation/test split from the cleaned original-image inventory, using group IDs as indivisible units.
7. Save and checksum `split_manifest.json`; all experiments must reuse it.
8. Decode, resize, sample, and augment only after the split has been frozen. Random augmentation is applied only while reading the training partition and never creates new validation or test observations.

All photographs from the same leaf, plant, plot/site, acquisition session,
burst, or derived-image family must remain in one partition. When site- or
source-level independence is the intended generalization claim and enough sites
or sources exist, reserve whole sites or sources for validation/test rather than
mixing them across partitions. Keep originals and their converted, cropped, or
augmented versions together. Demo assets, screenshots, and generated images are
not independent test samples.

The training partition is the **only** input to self-supervised pretraining.
Validation and test pixels are excluded even when their labels are hidden. The
validation partition may be used for checkpoint and hyperparameter selection;
the locked test partition is opened once only after the complete experiment is
frozen.

Unlisted files currently fall back to exact SHA-256 grouping as a last technical
safeguard. Hashing catches byte-identical copies but cannot recognize a different
angle, crop, re-encode, or burst frame of the same leaf. Therefore, an unreviewed
hash-only inventory is acceptable for exploratory runs but is **not sufficient
evidence of an independent thesis test set**. Those relationships must be
resolved in `datasets/metadata/group_manifest.json` before a formal experiment.

`datasets/metadata/image_metadata.json` uses the deterministic schema documented in
[`metadata-schema.md`](docs/metadata-schema.md). It records the canonical and
original labels, source dataset/type, public/field origin, available capture
metadata, expert decision, biological/acquisition group, QC and duplicate
status, per-field evidence, and a content fingerprint. Unknown values are
recorded as `unknown` or `pending`, never invented. Formal mode requires
resolved provenance, grouping, QC, duplicates, and expert validation. The validator writes
`near_duplicate_review_template.json`; each reported pair must be visually
resolved as `not_duplicate`, `grouped`, `exclude_a`, or `exclude_b` with reviewer
and date. Exclusion affects the experiment inventory only and does not delete
the source image.

External SSL requires both `--ssl-unlabeled-dir` and a fingerprinted
`--ssl-manifest`, plus a frozen final split. Raw directories are rejected. Only
licensed, provenance-complete, banana-leaf-confirmed records that pass exact,
perceptual, and biological held-out screening may reach teacher SSL. The
The Davao field root likewise requires an expert-reviewed manifest and is
attached only to the locked held-out test partition.

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
  --dataset-dir datasets\banana_leaf_thesis_4class `
  --group-manifest datasets\metadata\group_manifest.json `
  --metadata-manifest datasets\metadata\image_metadata.json `
  --formal
```

The validator checks the active class order, the preserved quarantine, RGB
decodability, exact and perceptual duplicates, structured metadata, group
leakage, external-inventory overlap, and split consistency before writing a
persistent manifest. Formal mode refuses to create a split while review remains
incomplete. Use `--exploratory` only for a clearly preliminary engineering run.

Class imbalance must be reported rather than hidden. Record any weighting, sampling, or augmentation strategy in the experiment configuration and thesis report.

### What success looks like

The validator should confirm four exact model classes, the preserved dead-leaf
quarantine, readable RGB conversion, completed review gates, and leakage-free
inventories. It writes a reusable split manifest only when the selected gate
mode allows it.

Do not ignore a warning simply because training still starts. Fix or formally document the data issue first.

## Common Problems

| Problem | What to do |
| --- | --- |
| A class folder is rejected | Match the exact lowercase model key from the label table. |
| An image is unreadable | Move it to `reviews/labels/malformed/` (or, if the folder is empty, record the exclusion in `reviews/labels/` and rely on git history) and retain the audit note. |
| A duplicate appears in two classes | Remove it from training and resolve the label conflict. |
| Related photos appear in different splits | Add their paths to one group in `metadata/group_manifest.json`. |
| Yellow and Cordana look similar | Do not guess; keep the record pending qualified review. |
| The dataset count changed | Revalidate, record the reason, and create a new experiment version. |
| Accuracy dropped after adding images | Check labels, balance, provenance, and field difficulty; a larger test can be more honest. |

## Student Handoff Checklist

Before giving the dataset to the model trainer, provide:

- the validated dataset path;
- the class counts;
- `metadata/group_manifest.json`;
- provenance and license records;
- the list of pending or excluded images;
- validator output and split-manifest fingerprint; and
- a note describing every dataset change since the previous run.

Continue with the [AI pipeline guide](../ai/README.md) or the [dataset/model trainer checklist](../docs/research/dataset-model-trainer-checklist.md).
