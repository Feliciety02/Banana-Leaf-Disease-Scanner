"""Finalize declared local originals and conservatively exclude duplicate candidates."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

from ai.data.metadata_manifest import THESIS_FIELDS, UNRESOLVED_VALUES, _record_fingerprint


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def finalize_inputs(
    dataset_root: Path,
    metadata_path: Path,
    inventory_report_path: Path,
    adjudication_path: Path,
) -> tuple[dict[str, Any], dict[str, str], dict[str, Any]]:
    root = dataset_root.resolve()
    payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    images = payload["images"]
    report = json.loads(inventory_report_path.read_text(encoding="utf-8"))
    adjudication = json.loads(adjudication_path.read_text(encoding="utf-8"))

    unreadable = {item["path"] for item in report.get("rejected_images", [])}
    exact_copies = {
        relative
        for group in report.get("exact_duplicate_groups", [])
        for relative in group.get("excluded_copies", [])
    }
    duplicate_candidates = {
        pair[field]
        for pair in adjudication.get("pairs", [])
        for field in ("path_a", "path_b")
    }
    excluded = unreadable | exact_copies | duplicate_candidates
    groups: dict[str, str] = {}
    reason_counts: Counter[str] = Counter()
    included_counts: Counter[str] = Counter()
    excluded_counts: Counter[str] = Counter()
    declaration = (
        "Project-owner declaration on 2026-09-09: locally added images, including the "
        "Cordana collection, are team-owned local originals; unresolved source tracing was waived."
    )

    for relative, record in sorted(images.items()):
        provenance = dict(record.get("field_provenance", {}))
        class_name = record["canonical_class"]
        if relative in excluded:
            record["inclusion_status"] = "excluded"
            record["qc_status"] = "excluded"
            if relative in unreadable:
                reason = "unreadable_image"
            elif relative in exact_copies:
                reason = "exact_duplicate_copy"
            else:
                reason = "unresolved_near_duplicate_candidate"
            record["duplicate_status"] = f"excluded_{reason}"
            provenance["inclusion_status"] = f"conservative split exclusion: {reason}"
            provenance["qc_status"] = f"conservative split exclusion: {reason}"
            provenance["duplicate_status"] = f"conservative split exclusion: {reason}"
            excluded_counts[class_name] += 1
            reason_counts[reason] += 1
        else:
            if record.get("source_dataset") in UNRESOLVED_VALUES:
                record["source_dataset"] = "dahonmd-team-local-dataset"
                record["source_type"] = "project_local_dataset"
                record["field_or_public"] = "project_local"
                record["original_label"] = class_name
                for field in ("source_dataset", "source_type", "field_or_public", "original_label"):
                    provenance[field] = declaration
            if record.get("originality_status") in UNRESOLVED_VALUES:
                record["originality_status"] = "original"
                provenance["originality_status"] = declaration
            if record.get("originality_status") != "original":
                record["inclusion_status"] = "excluded"
                record["qc_status"] = "excluded"
                provenance["inclusion_status"] = "non-original records are excluded from the labeled cohort"
                provenance["qc_status"] = "non-original records are excluded from the labeled cohort"
                excluded_counts[class_name] += 1
                reason_counts["non_original"] += 1
            else:
                digest = _sha256(root / relative)
                group_id = f"reviewed-singleton::{digest[:20]}"
                groups[relative] = group_id
                record["group_id"] = group_id
                record["duplicate_status"] = (
                    "canonical_exact_duplicate_representative"
                    if record.get("duplicate_status") == "canonical_exact_duplicate_representative"
                    else "reviewed_clear"
                )
                record["inclusion_status"] = "included"
                record["qc_status"] = "approved"
                provenance["group_id"] = (
                    "reviewed singleton under project-owner independent-original declaration; "
                    "all automated near-duplicate candidates were excluded"
                )
                provenance["duplicate_status"] = (
                    "accepted only after exact-copy removal and conservative exclusion of all dHash candidates"
                )
                included_counts[class_name] += 1

        record["source"] = record["source_dataset"]
        record["origin_type"] = record["field_or_public"]
        for field in THESIS_FIELDS:
            provenance.setdefault(field, "preserved from expert-validated metadata manifest")
        record["field_provenance"] = dict(sorted(provenance.items()))
        record["record_fingerprint"] = _record_fingerprint(record)

    payload["generator"] = "ai.data.finalize_local_split_inputs/v1"
    payload["split_input_policy"] = {
        "local_original_declaration": declaration,
        "duplicate_policy": "Exclude every unresolved near-duplicate candidate image before cohort selection.",
        "group_policy": "Remaining records are reviewed singletons; no candidate pair may cross partitions.",
    }
    attestation = {
        "schema_version": 1,
        "decision": "local_originals_declared_and_duplicate_candidates_conservatively_excluded",
        "recorded_at": "2026-09-09",
        "declaration": declaration,
        "inputs": {
            "metadata_manifest": {"path": str(metadata_path.resolve()), "sha256": _sha256(metadata_path)},
            "inventory_report": {"path": str(inventory_report_path.resolve()), "sha256": _sha256(inventory_report_path)},
            "adjudication_manifest": {"path": str(adjudication_path.resolve()), "sha256": _sha256(adjudication_path)},
        },
        "included_by_class": dict(sorted(included_counts.items())),
        "excluded_by_class": dict(sorted(excluded_counts.items())),
        "exclusion_reasons": dict(sorted(reason_counts.items())),
        "limitations": [
            "Source tracing was waived by the project owner for locally added records.",
            "Near-duplicate candidates were excluded, not manually adjudicated.",
            "Singleton grouping relies on the project-owner independent-original declaration.",
        ],
    }
    attestation["attestation_fingerprint"] = hashlib.sha256(
        json.dumps(attestation, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return payload, groups, attestation


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", required=True, type=Path)
    parser.add_argument("--metadata-manifest", required=True, type=Path)
    parser.add_argument("--inventory-report", required=True, type=Path)
    parser.add_argument("--adjudication-manifest", required=True, type=Path)
    parser.add_argument("--output-metadata", required=True, type=Path)
    parser.add_argument("--output-groups", required=True, type=Path)
    parser.add_argument("--output-attestation", required=True, type=Path)
    args = parser.parse_args()
    metadata, groups, attestation = finalize_inputs(
        args.dataset_dir, args.metadata_manifest, args.inventory_report, args.adjudication_manifest
    )
    _write_json(args.output_metadata, metadata)
    _write_json(args.output_groups, groups)
    _write_json(args.output_attestation, attestation)
    print(json.dumps({
        "included_by_class": attestation["included_by_class"],
        "excluded_by_class": attestation["excluded_by_class"],
        "group_assignments": len(groups),
        "attestation_fingerprint": attestation["attestation_fingerprint"],
    }, indent=2))


if __name__ == "__main__":
    main()
