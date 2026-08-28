# Metadata manifests

This folder contains the current path-keyed metadata and biological-group
manifests used by dataset validation.

- `image_metadata.json` is the authoritative per-image metadata manifest.
- `group_manifest.json` is the active grouping manifest.
- `group_manifest.reviewed.json` is a proposed reviewed output; it does not
  replace the active manifest automatically.
- `archive/` preserves retired assignments that no longer match the inventory.

These JSON files are local research data and are ignored by Git. Do not edit
labels, eligibility, or groups merely to make a validation gate pass.
