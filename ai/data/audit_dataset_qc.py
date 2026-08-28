"""Build an evidence-preserving, pre-split dataset QC manifest.

This command never trains a model, creates a cohort, or writes a dataset split.
Automated image decoding is recorded separately from biological and expert QC.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import warnings
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, UnidentifiedImageError

from ai.config.labels import CLASS_LABELS, QUARANTINED_CLASS_NAMES
from ai.data.metadata_manifest import THESIS_FIELDS, load_manifest_payload
from ai.data.near_duplicate_adjudication import (
    GROUPING_DECISIONS,
    RESOLVED_DECISIONS,
    load_and_validate_adjudication,
)


SCHEMA_VERSION = 1
ALLOWED_STATUSES = ("PASS", "REJECT", "REVIEW_REQUIRED", "UNKNOWN")
UNRESOLVED_VALUES = frozenset({"", "unknown", "pending", "none", None})
IMAGE_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".bmp", ".webp"})

OPTIONAL_WHEN_UNAVAILABLE = frozenset({
    "plant_id",
    "leaf_id",
    "acquisition_session",
    "capture_device",
    "capture_date",
    "location",
    "lighting_condition",
    "disease_appearance",
})

FORMAL_GATE_FIELDS = (
    "source_dataset",
    "source_type",
    "original_label",
    "field_or_public",
    "expert_validated",
    "group_id",
    "qc_status",
    "originality_status",
    "species_review_status",
    "visibility_quality_status",
    "inclusion_status",
)

REPORT_CLASS_NAMES = {
    "healthy": "Healthy",
    "sigatoka": "Sigatoka",
    "panama-disease": "Panama Disease",
    "cordana-leaf-spot": "Cordana Leaf Spot",
}


def _normalize(value: str) -> str:
    return value.replace("\\", "/")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _json_fingerprint(value: Any) -> str:
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _file_evidence(path: Path) -> dict[str, Any]:
    evidence: dict[str, Any] = {
        "file_size_bytes": path.stat().st_size,
        "sha256": _sha256(path),
        "width": None,
        "height": None,
        "source_mode": None,
        "integrity_status": "PASS",
        "integrity_error": None,
    }
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            with Image.open(path) as image:
                image.verify()
            with Image.open(path) as image:
                image.load()
                evidence["width"], evidence["height"] = image.size
                evidence["source_mode"] = image.mode
                if image.width <= 0 or image.height <= 0:
                    raise ValueError(f"invalid dimensions {image.width}x{image.height}")
                rgb = image.convert("RGB")
                rgb.load()
                if rgb.mode != "RGB":
                    raise ValueError(f"RGB conversion returned {rgb.mode}")
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Warning) as error:
        evidence["integrity_status"] = "REJECT"
        evidence["integrity_error"] = f"{type(error).__name__}: {error}"
    return evidence


def _load_json_object(path: Path, description: str) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{description} must contain a JSON object: {path}")
    return payload


def _active_paths(root: Path) -> list[Path]:
    paths: list[Path] = []
    for class_name in CLASS_LABELS:
        class_dir = root / class_name
        if not class_dir.is_dir():
            raise FileNotFoundError(f"Missing active class directory: {class_dir}")
        paths.extend(
            path for path in class_dir.rglob("*")
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
        )
    return sorted(paths)


def _status_from_value(
    value: Any,
    pass_values: Iterable[str],
    reject_values: Iterable[str],
) -> str:
    if value in set(pass_values):
        return "PASS"
    if value in set(reject_values):
        return "REJECT"
    return "REVIEW_REQUIRED"


def _validate_duplicate_evidence(
    inventory: dict[str, Any],
    adjudication: dict[str, Any],
    groups: dict[str, str],
) -> tuple[dict[str, str], dict[str, list[str]]]:
    report_pairs = inventory.get("near_duplicate_pairs", [])
    reviewed_pairs = adjudication.get("pairs", [])
    report_keys = {pair.get("review_key") for pair in report_pairs}
    reviewed_keys = {pair.get("review_key") for pair in reviewed_pairs}
    if report_keys != reviewed_keys:
        raise ValueError(
            "Fresh inventory near-duplicate candidates do not exactly match the reviewed adjudication"
        )
    unresolved = [
        pair for pair in reviewed_pairs if pair.get("decision") not in RESOLVED_DECISIONS
    ]
    if unresolved:
        raise ValueError(f"{len(unresolved)} near-duplicate pairs remain unresolved")

    decisions_by_path: dict[str, list[str]] = defaultdict(list)
    for pair in reviewed_pairs:
        left, right = _normalize(pair["path_a"]), _normalize(pair["path_b"])
        decision = pair["decision"]
        decisions_by_path[left].append(decision)
        decisions_by_path[right].append(decision)
        if decision in GROUPING_DECISIONS:
            if not groups.get(left) or groups.get(left) != groups.get(right):
                raise ValueError(
                    f"Related duplicate candidates do not share an explicit group: {left} / {right}"
                )

    duplicate_disposition: dict[str, str] = {}
    for relative, decisions in decisions_by_path.items():
        if any(decision in GROUPING_DECISIONS for decision in decisions):
            duplicate_disposition[relative] = "REVIEWED_RELATED_CAPTURE_GROUPED"
        else:
            duplicate_disposition[relative] = "REVIEWED_CLEAR"
    return duplicate_disposition, decisions_by_path


def _metadata_missing_fields(metadata: dict[str, Any], group_id: str) -> list[str]:
    effective = dict(metadata)
    effective["group_id"] = group_id
    fields = set(THESIS_FIELDS) | {
        "species_review_status",
        "visibility_quality_status",
        "inclusion_status",
        "label_validator",
    }
    return sorted(field for field in fields if effective.get(field) in UNRESOLVED_VALUES)


def _build_record(
    root: Path,
    path: Path,
    metadata: dict[str, Any],
    group_id: str,
    duplicate_disposition: str,
    duplicate_decisions: list[str],
    exact_duplicate_rejection: str | None,
) -> dict[str, Any]:
    relative = _normalize(str(path.relative_to(root)))
    canonical_class = relative.split("/", 1)[0]
    file_evidence = _file_evidence(path)

    canonical_status = (
        "PASS"
        if metadata.get("canonical_class") == canonical_class
        and metadata.get("image_path") == relative
        else "REJECT"
    )
    species_status = _status_from_value(
        metadata.get("species_review_status"),
        {"banana"},
        {"non_banana", "incorrect_species"},
    )
    visibility_status = _status_from_value(
        metadata.get("visibility_quality_status"),
        {"acceptable"},
        {"reject", "unusable", "severely_blurred", "obscured"},
    )
    qc_status = _status_from_value(
        metadata.get("qc_status"), {"approved"}, {"excluded", "quarantined"}
    )
    inclusion_status = _status_from_value(
        metadata.get("inclusion_status"), {"included"}, {"excluded"}
    )
    expert_status = _status_from_value(
        metadata.get("expert_validated"), {"validated"}, {"rejected"}
    )
    source_status = (
        "UNKNOWN"
        if metadata.get("source_dataset") in UNRESOLVED_VALUES
        else "PASS"
    )
    group_status = "PASS" if group_id not in UNRESOLVED_VALUES else "UNKNOWN"
    duplicate_status = "REJECT" if exact_duplicate_rejection else "PASS"

    # No repository field records per-image disease visibility. Source labels and
    # folder names are provenance, not a substitute for an image-level review.
    disease_visibility_status = "REVIEW_REQUIRED"

    statuses = {
        "canonical_class": canonical_status,
        "correct_plant_species": species_status,
        "file_integrity": file_evidence["integrity_status"],
        "sufficient_leaf_visibility": visibility_status,
        "disease_visibility": disease_visibility_status,
        "qc_status": qc_status,
        "source_dataset": source_status,
        "inclusion_status": inclusion_status,
        "expert_review_status": expert_status,
        "duplicate_status": duplicate_status,
        "group_information": group_status,
    }
    if any(value not in ALLOWED_STATUSES for value in statuses.values()):
        raise AssertionError(f"Unsupported status generated for {relative}")

    rejection_reasons: list[str] = []
    if file_evidence["integrity_status"] == "REJECT":
        rejection_reasons.append(f"file_integrity:{file_evidence['integrity_error']}")
    if canonical_status == "REJECT":
        rejection_reasons.append("canonical_class_or_path_mismatch")
    if species_status == "REJECT":
        rejection_reasons.append("reviewed_incorrect_species")
    if visibility_status == "REJECT":
        rejection_reasons.append("reviewed_insufficient_leaf_visibility_or_quality")
    if qc_status == "REJECT":
        rejection_reasons.append("human_qc_excluded")
    if inclusion_status == "REJECT":
        rejection_reasons.append("inclusion_status_excluded")
    if expert_status == "REJECT":
        rejection_reasons.append("expert_review_rejected")
    if exact_duplicate_rejection:
        rejection_reasons.append(exact_duplicate_rejection)

    manual_review_reasons: list[str] = []
    if species_status == "REVIEW_REQUIRED":
        manual_review_reasons.append("confirm_correct_banana_species")
    if visibility_status == "REVIEW_REQUIRED":
        manual_review_reasons.append("confirm_sufficient_leaf_visibility_and_quality")
    manual_review_reasons.append(
        "confirm_no_target_disease_visible"
        if canonical_class == "healthy"
        else "confirm_class_specific_disease_signs_visible"
    )
    if qc_status == "REVIEW_REQUIRED":
        manual_review_reasons.append("record_human_qc_decision")
    if inclusion_status == "REVIEW_REQUIRED":
        manual_review_reasons.append("record_inclusion_decision")
    if expert_status == "REVIEW_REQUIRED":
        manual_review_reasons.append("obtain_and_record_expert_label_review")
    if source_status == "UNKNOWN":
        manual_review_reasons.append("resolve_source_dataset_and_original_label_provenance")
    if metadata.get("originality_status") != "original":
        manual_review_reasons.append("resolve_originality_status")
    if group_status == "UNKNOWN":
        manual_review_reasons.append("assign_reviewed_group_or_independent_singleton_id")

    overall_status = (
        "REJECT" if rejection_reasons
        else "REVIEW_REQUIRED" if manual_review_reasons
        else "PASS"
    )
    missing_fields = _metadata_missing_fields(metadata, group_id)
    gate_blocking_fields = sorted(
        field for field in missing_fields if field in FORMAL_GATE_FIELDS
    )
    selected_metadata = {
        field: metadata.get(field, "unknown")
        for field in (
            "source_dataset",
            "source_type",
            "original_label",
            "field_or_public",
            "plant_id",
            "leaf_id",
            "acquisition_session",
            "capture_device",
            "capture_date",
            "location",
            "expert_validated",
            "qc_status",
            "originality_status",
            "lighting_condition",
            "disease_appearance",
            "species_review_status",
            "visibility_quality_status",
            "inclusion_status",
            "label_validator",
        )
    }

    return {
        "image_path": relative,
        "canonical_class": canonical_class,
        "file_evidence": file_evidence,
        "metadata": selected_metadata,
        "group_id": group_id,
        "duplicate_disposition": duplicate_disposition,
        "duplicate_review_decisions": sorted(set(duplicate_decisions)),
        "statuses": statuses,
        "missing_or_unresolved_metadata_fields": missing_fields,
        "gate_blocking_metadata_fields": gate_blocking_fields,
        "manual_review_reasons": manual_review_reasons,
        "rejection_reasons": rejection_reasons,
        "overall_status": overall_status,
        "eligible_for_final_cohort": overall_status == "PASS",
    }


def _source_hashes(paths: dict[str, Path]) -> dict[str, dict[str, str]]:
    return {
        name: {"path": _normalize(str(path.resolve())), "sha256": _sha256(path)}
        for name, path in sorted(paths.items())
    }


def _write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def _write_report(
    path: Path,
    manifest_name: str,
    review_queue_name: str,
    rejection_name: str,
    class_summary: dict[str, dict[str, int]],
    missing_counts: Counter[str],
    rejection_counts: Counter[str],
    summary: dict[str, Any],
) -> None:
    lines = [
        "# Dataset QC Gate Report v1",
        "",
        "No model was trained and no dataset split was created by this audit.",
        "",
        "## Class result",
        "",
        "| Class | Raw | Passed QC | Rejected | Needs Review |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for class_name in CLASS_LABELS:
        values = class_summary[class_name]
        lines.append(
            f"| {REPORT_CLASS_NAMES[class_name]} | {values['raw']} | "
            f"{values['passed']} | {values['rejected']} | {values['review_required']} |"
        )
    lines.extend([
        "",
        f"Eligible for final cohort: **{summary['eligible_for_final_cohort']}**.",
        "",
        "## Exact file lists",
        "",
        f"- Manual review: `{review_queue_name}` ({summary['needs_review']} files)",
        f"- Rejected: `{rejection_name}` ({summary['rejected']} files)",
        f"- Versioned per-image manifest: `{manifest_name}`",
        "",
        "## Missing or unresolved metadata fields",
        "",
        "| Field | Active files |",
        "| --- | ---: |",
    ])
    for field, count in sorted(missing_counts.items()):
        lines.append(f"| `{field}` | {count} |")
    lines.extend(["", "## Rejection reasons", ""])
    if rejection_counts:
        lines.extend(["| Reason | Files |", "| --- | ---: |"])
        for reason, count in sorted(rejection_counts.items()):
            lines.append(f"| `{reason}` | {count} |")
    else:
        lines.append("No active file was rejected by the available evidence.")
    lines.extend([
        "",
        "## Gate decision",
        "",
        "The gate remains blocked because every active image still requires image-level "
        "species/leaf-visibility/class-appearance review, human QC, an inclusion decision, "
        "and expert label validation. Files without explicit grouping or source provenance "
        "have additional blockers. Technical integrity and resolved duplicate review do not "
        "substitute for those human decisions.",
        "",
        "⛔ DATASET QC GATE BLOCKED",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def build_qc_manifest(
    dataset_dir: str | Path,
    metadata_manifest: str | Path,
    inventory_report: str | Path,
    duplicate_adjudication: str | Path,
    group_manifest: str | Path,
    source_catalog: str | Path,
    output_dir: str | Path,
) -> dict[str, Any]:
    root = Path(dataset_dir).expanduser().resolve()
    metadata_path = Path(metadata_manifest).expanduser().resolve()
    inventory_path = Path(inventory_report).expanduser().resolve()
    adjudication_path = Path(duplicate_adjudication).expanduser().resolve()
    group_path = Path(group_manifest).expanduser().resolve()
    source_path = Path(source_catalog).expanduser().resolve()
    output = Path(output_dir).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)

    metadata = load_manifest_payload(metadata_path)
    inventory = _load_json_object(inventory_path, "Inventory report")
    groups = {
        _normalize(key): value
        for key, value in _load_json_object(group_path, "Group manifest").items()
    }
    adjudication = load_and_validate_adjudication(adjudication_path, root)
    duplicate_dispositions, duplicate_decisions = _validate_duplicate_evidence(
        inventory, adjudication, groups
    )

    paths = _active_paths(root)
    relatives = {_normalize(str(path.relative_to(root))) for path in paths}
    missing_metadata = sorted(relatives - set(metadata))
    if missing_metadata:
        raise ValueError(
            f"Metadata manifest is missing {len(missing_metadata)} active files; first: {missing_metadata[0]}"
        )
    stale_groups = sorted(set(groups) - relatives)
    if stale_groups:
        raise ValueError(f"Group manifest contains non-active paths; first: {stale_groups[0]}")

    inventory_summary = inventory.get("summary", {})
    expected_counts = Counter(relative.split("/", 1)[0] for relative in relatives)
    if inventory_summary.get("accepted") != len(paths):
        raise ValueError("Fresh inventory accepted count does not match the active file inventory")
    if dict(inventory_summary.get("accepted_by_class", {})) != {
        class_name: expected_counts[class_name] for class_name in CLASS_LABELS
    }:
        raise ValueError("Fresh inventory class counts do not match current active folders")
    if inventory_summary.get("near_duplicate_pairs_requiring_review") != 0:
        raise ValueError("Fresh inventory still has unresolved near-duplicate pairs")
    if inventory.get("unused_near_duplicate_reviews"):
        raise ValueError("Fresh inventory has duplicate review decisions that no longer match candidates")

    exact_rejections: dict[str, str] = {}
    for group in inventory.get("exact_duplicate_groups", []):
        for relative in group.get("excluded_copies", []):
            exact_rejections[_normalize(relative)] = "excluded_exact_duplicate_copy"
    for conflict in inventory.get("cross_label_exact_conflicts", []):
        for relative in conflict.get("paths", []):
            exact_rejections[_normalize(relative)] = "cross_label_exact_duplicate_conflict"

    records: list[dict[str, Any]] = []
    for path in paths:
        relative = _normalize(str(path.relative_to(root)))
        group_id = groups.get(relative, "unknown")
        records.append(_build_record(
            root=root,
            path=path,
            metadata=metadata[relative],
            group_id=group_id,
            duplicate_disposition=duplicate_dispositions.get(relative, "AUTOMATED_CLEAR"),
            duplicate_decisions=duplicate_decisions.get(relative, []),
            exact_duplicate_rejection=exact_rejections.get(relative),
        ))

    class_summary = {
        class_name: {
            "raw": sum(record["canonical_class"] == class_name for record in records),
            "passed": sum(
                record["canonical_class"] == class_name and record["overall_status"] == "PASS"
                for record in records
            ),
            "rejected": sum(
                record["canonical_class"] == class_name and record["overall_status"] == "REJECT"
                for record in records
            ),
            "review_required": sum(
                record["canonical_class"] == class_name
                and record["overall_status"] == "REVIEW_REQUIRED"
                for record in records
            ),
        }
        for class_name in CLASS_LABELS
    }
    missing_counts: Counter[str] = Counter(
        field
        for record in records
        for field in record["missing_or_unresolved_metadata_fields"]
    )
    blocking_counts: Counter[str] = Counter(
        field for record in records for field in record["gate_blocking_metadata_fields"]
    )
    rejection_counts: Counter[str] = Counter(
        reason for record in records for reason in record["rejection_reasons"]
    )
    manual_reason_counts: Counter[str] = Counter(
        reason for record in records for reason in record["manual_review_reasons"]
    )
    summary = {
        "active_images": len(records),
        "passed_qc": sum(record["overall_status"] == "PASS" for record in records),
        "rejected": sum(record["overall_status"] == "REJECT" for record in records),
        "needs_review": sum(
            record["overall_status"] == "REVIEW_REQUIRED" for record in records
        ),
        "eligible_for_final_cohort": sum(
            record["eligible_for_final_cohort"] for record in records
        ),
        "class_summary": class_summary,
        "missing_or_unresolved_metadata_counts": dict(sorted(missing_counts.items())),
        "gate_blocking_metadata_counts": dict(sorted(blocking_counts.items())),
        "manual_review_reason_counts": dict(sorted(manual_reason_counts.items())),
        "rejection_reason_counts": dict(sorted(rejection_counts.items())),
        "technical_inventory": inventory_summary,
    }

    source_documents = _source_hashes({
        "metadata_manifest": metadata_path,
        "fresh_inventory_report": inventory_path,
        "duplicate_adjudication": adjudication_path,
        "group_manifest": group_path,
        "source_catalog": source_path,
    })
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "manifest_version": "banana-leaf-dataset-qc-v1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_root": _normalize(str(root)),
        "allowed_status_values": list(ALLOWED_STATUSES),
        "policy": {
            "training_performed": False,
            "dataset_split_performed": False,
            "file_presence_is_not_qc_approval": True,
            "technical_integrity_does_not_substitute_for_human_qc": True,
            "unknown_value_policy": (
                "No plant ID, leaf ID, acquisition session, capture device, location, "
                "or expert approval is inferred when repository evidence is absent."
            ),
            "optional_when_unavailable": sorted(OPTIONAL_WHEN_UNAVAILABLE),
        },
        "source_documents": source_documents,
        "summary": summary,
        "records_fingerprint_sha256": _json_fingerprint(records),
        "records": records,
        "gate": {
            "status": "BLOCKED" if summary["eligible_for_final_cohort"] != len(records) else "PASSED",
            "eligible_images": summary["eligible_for_final_cohort"],
            "reason": (
                "One or more active images require manual/expert review or rejection handling."
                if summary["eligible_for_final_cohort"] != len(records)
                else "Every active image passed all required evidence gates."
            ),
        },
    }

    manifest_path = output / "validation-manifest-v1.json"
    review_path = output / "manual-review-required-v1.csv"
    rejection_path = output / "rejected-files-v1.csv"
    report_path = output / "dataset-qc-report-v1.md"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    review_rows = [
        {
            "image_path": record["image_path"],
            "canonical_class": record["canonical_class"],
            "overall_status": record["overall_status"],
            "manual_review_reasons": ";".join(record["manual_review_reasons"]),
            "gate_blocking_metadata_fields": ";".join(record["gate_blocking_metadata_fields"]),
            "source_dataset": record["metadata"]["source_dataset"],
            "group_id": record["group_id"],
            "duplicate_disposition": record["duplicate_disposition"],
            "sha256": record["file_evidence"]["sha256"],
        }
        for record in records if record["overall_status"] == "REVIEW_REQUIRED"
    ]
    _write_csv(review_path, list(review_rows[0]) if review_rows else [
        "image_path", "canonical_class", "overall_status", "manual_review_reasons",
        "gate_blocking_metadata_fields", "source_dataset", "group_id",
        "duplicate_disposition", "sha256",
    ], review_rows)

    rejection_rows = [
        {
            "image_path": record["image_path"],
            "canonical_class": record["canonical_class"],
            "rejection_reasons": ";".join(record["rejection_reasons"]),
            "sha256": record["file_evidence"]["sha256"],
        }
        for record in records if record["overall_status"] == "REJECT"
    ]
    _write_csv(
        rejection_path,
        ["image_path", "canonical_class", "rejection_reasons", "sha256"],
        rejection_rows,
    )
    _write_report(
        report_path,
        manifest_path.name,
        review_path.name,
        rejection_path.name,
        class_summary,
        missing_counts,
        rejection_counts,
        summary,
    )

    artifact_paths = [manifest_path, review_path, rejection_path, report_path, inventory_path]
    checksums = {
        path.name: _sha256(path) for path in artifact_paths
    }
    (output / "artifact-checksums-v1.json").write_text(
        json.dumps(checksums, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--metadata-manifest", required=True)
    parser.add_argument("--inventory-report", required=True)
    parser.add_argument("--duplicate-adjudication", required=True)
    parser.add_argument("--group-manifest", required=True)
    parser.add_argument("--source-catalog", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    manifest = build_qc_manifest(
        dataset_dir=args.dataset_dir,
        metadata_manifest=args.metadata_manifest,
        inventory_report=args.inventory_report,
        duplicate_adjudication=args.duplicate_adjudication,
        group_manifest=args.group_manifest,
        source_catalog=args.source_catalog,
        output_dir=args.output_dir,
    )
    print(json.dumps(manifest["summary"], indent=2, ensure_ascii=False))
    print(f"Gate: {manifest['gate']['status']}")


if __name__ == "__main__":
    main()
