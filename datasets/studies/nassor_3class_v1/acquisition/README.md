# Nassor 3-class dataset acquisition

This directory is an isolated acquisition area for the public dataset associated
with Nassor et al. It does not replace or modify DahonMD's existing four-class
dataset, split files, training artifacts, checkpoints, or application code.

## Official source

- Dataset DOI: <https://doi.org/10.7910/DVN/LQUWXW>
- Dataverse release used: `6.0` (`RELEASED`)
- License reported by Dataverse: `CC0 1.0`
- Official metadata snapshot: `metadata/dataverse_dataset_v6.0.json`

The acquisition contains the publisher's six ZIP archives and accompanying PDF.
The ZIP files remain in `downloads/` while downloading and are resumed in place.
Nothing is extracted, relabeled, filtered, split, or used for training at this
stage.

## Safety rules

1. Never delete, move, or overwrite the existing DahonMD dataset or artifacts.
2. Download each file only from its matching Harvard Dataverse file ID.
3. Preserve partial files and resume them; do not restart from zero unnecessarily.
4. Treat a ZIP as usable only when its status JSON says `verified`.
5. Verification requires both the official byte count and official MD5 checksum.
6. If a completed-size file has a checksum mismatch, preserve it and stop instead
   of silently replacing it.
7. Do not extract archives until paths have been checked for traversal and enough
   disk space has been confirmed.
8. Do not create train/validation/test splits until the dataset inventory and the
   leaf-versus-stem inclusion decision are documented.

## Download status

Each archive has a status file in `logs/<file-key>.status.json`. Expected states
are:

- `downloading`: the worker is downloading or resuming the official file.
- `retry_wait`: a network attempt ended; the preserved partial file will resume.
- `verifying`: the official byte count was reached and MD5 is being calculated.
- `verified`: byte count and MD5 both match the official metadata.
- `blocked_oversize` or `blocked_checksum_mismatch`: manual review is required;
  the local file was preserved and was not overwritten.

The helper `resume_dataverse_download.ps1` is intentionally scoped to the six
known archive names, IDs, byte counts, and checksums. It writes only inside this
acquisition directory. `resume_all_sequential.ps1` runs those workers one at a
time so constrained network bandwidth cannot create competing archive writers.
Its current state is recorded in `logs/coordinator.status.json`. After all six
files verify, `inspect_verified_archives.ps1` reads ZIP central directories only,
performs path and entry-safety checks, and updates the inspection manifest. It
never extracts archive content.

## Separation from the current study

- Current/original study ID: `malasarte_jornadal_priego_4class_v1`
- New study ID: `nassor_3class_v1`
- Current dataset location remains: `datasets/banana_leaf_thesis_4class/`
- New raw acquisition location: this directory

No class-folder conversion should happen here. A later, separately reviewed step
can build an approved three-class dataset from verified raw archives while keeping
these source files immutable.
