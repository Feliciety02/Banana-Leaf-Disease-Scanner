# Acquisition preservation report

Recorded on 2026-09-02 for study `nassor_3class_v1`.

## Scope completed or in progress

- The Harvard Dataverse v6.0 metadata snapshot is preserved locally.
- The accompanying PDF matches its official byte count and MD5 checksum.
- The six ZIP archives are downloaded through a sequential, resumable queue.
- A ZIP is accepted only after its official byte count and MD5 both match.
- ZIP inspection is central-directory-only and does not extract content.
- Archive inspection remains pending until each ZIP is fully downloaded and
  checksum-verified.

## Explicitly not performed

- No archive has been extracted.
- No image has been relabeled, filtered, copied into class folders, or split.
- No Nassor model training has started.
- No current four-class dataset, split, checkpoint, artifact, or shared training
  source file has been moved, renamed, overwritten, or deleted by this
  acquisition work.

## Isolation boundary

- Existing dataset: `datasets/banana_leaf_thesis_4class/`
- New acquisition: `datasets/studies/nassor_3class_v1/acquisition/`
- Existing training artifacts: `ai/artifacts/four_class/`

The acquisition queue writes only beneath the new acquisition directory. Later
extraction and approved-dataset construction require a separate reviewed step.
