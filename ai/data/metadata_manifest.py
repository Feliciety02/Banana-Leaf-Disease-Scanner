"""Deterministic, provenance-preserving metadata enrichment for thesis images."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any, Iterable, Sequence


SCHEMA_VERSION = 2
UNKNOWN = "unknown"
PENDING = "pending"

# Retained because ImageRecord and old experimental manifests use these names.
LEGACY_FIELDS: tuple[str, ...] = (
    "source",
    "plant_id",
    "leaf_id",
    "site_id",
    "session_id",
    "origin_type",
    "capture_device",
    "acquisition_date",
    "field_subset",
    "species_review_status",
    "visibility_quality_status",
    "inclusion_status",
    "label_validator",
    "label_review_status",
)

THESIS_FIELDS: tuple[str, ...] = (
    "image_path",
    "canonical_class",
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
    "group_id",
    "qc_status",
    "duplicate_status",
)

SUPPORT_FIELDS: tuple[str, ...] = (
    "site_id",
    "field_subset",
    "species_review_status",
    "visibility_quality_status",
    "inclusion_status",
    "label_validator",
    "label_review_status",
    "source",
    "session_id",
    "origin_type",
    "acquisition_date",
    "record_fingerprint",
)

ALLOWED_RECORD_FIELDS = frozenset((*THESIS_FIELDS, *SUPPORT_FIELDS, "field_provenance"))

LEGACY_DEFAULTS: dict[str, str] = {
    "source": UNKNOWN,
    "plant_id": UNKNOWN,
    "leaf_id": UNKNOWN,
    "site_id": UNKNOWN,
    "session_id": UNKNOWN,
    "origin_type": UNKNOWN,
    "capture_device": UNKNOWN,
    "acquisition_date": UNKNOWN,
    "field_subset": "none",
    "species_review_status": PENDING,
    "visibility_quality_status": PENDING,
    "inclusion_status": PENDING,
    "label_validator": UNKNOWN,
    "label_review_status": PENDING,
}

THESIS_DEFAULTS: dict[str, str] = {
    "image_path": UNKNOWN,
    "canonical_class": UNKNOWN,
    "source_dataset": UNKNOWN,
    "source_type": UNKNOWN,
    "original_label": UNKNOWN,
    "field_or_public": UNKNOWN,
    "plant_id": UNKNOWN,
    "leaf_id": UNKNOWN,
    "acquisition_session": UNKNOWN,
    "capture_device": UNKNOWN,
    "capture_date": UNKNOWN,
    "location": UNKNOWN,
    "expert_validated": PENDING,
    "group_id": PENDING,
    "qc_status": "pending_human_review",
    "duplicate_status": PENDING,
}

UNRESOLVED_VALUES = frozenset({UNKNOWN, PENDING, "", "none"})


SOURCE_RULES: tuple[dict[str, str], ...] = (
    {"prefix": "healthy-zenodo-", "dataset": "zenodo-tanzania-7670326", "label": "HEALTHY", "location": "Tanzania (source-level)"},
    {"prefix": "sigatoka-zenodo-", "dataset": "zenodo-tanzania-7670326", "label": "BLACK SIGATOKA", "location": "Tanzania (source-level)"},
    {"prefix": "panama-zenodo", "dataset": "zenodo-tanzania-7670326", "label": "FUSARIUM WILT", "location": "Tanzania (source-level)"},
    {"prefix": "healthy-v4-", "dataset": "banana-leaf-disease-dataset-v4", "label": "Healthy", "location": UNKNOWN},
    {"prefix": "sigatoka-v4-", "dataset": "banana-leaf-disease-dataset-v4", "label": "Yellow and Black Sigatoka", "location": UNKNOWN},
    {"prefix": "cordana-v4-", "dataset": "banana-leaf-disease-dataset-v4", "label": "Cordana", "location": UNKNOWN},
    {"prefix": "healthy-nutrient-", "dataset": "nutrient-deficient-banana-plant-leaves", "label": "healthy", "location": UNKNOWN},
    {"prefix": "cordana-bananalsd-", "dataset": "bananalsd", "label": "cordana", "location": UNKNOWN},
    {"prefix": "cordana-ecuador-", "dataset": "deep-learning-banana-diseases-ecuador", "label": "Cordana", "location": "Ecuador (source-level)"},
    {"prefix": "panama-kaggle-", "dataset": "banana-disease-recognition-dataset", "label": "Panama disease", "location": UNKNOWN},
    {"prefix": "black sigatoka disease", "dataset": "banana-disease-recognition-dataset", "label": "Black Sigatoka Disease", "location": UNKNOWN},
    {"prefix": "yellow sigatoka disease", "dataset": "banana-disease-recognition-dataset", "label": "Yellow Sigatoka Disease", "location": UNKNOWN},
    {"prefix": "dead leaf", "dataset": "banana-disease-recognition-dataset", "label": "Dead Leaf", "location": UNKNOWN},
)


def _normalize_path(value: str) -> str:
    return value.replace("\\", "/")


def _file_sha256(path: Path | None) -> str:
    if path is None or not path.is_file():
        return "unavailable"
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _rule_for_path(relative: str) -> dict[str, str] | None:
    filename = Path(relative).name.lower()
    return next((rule for rule in SOURCE_RULES if filename.startswith(rule["prefix"])), None)


def _record_fingerprint(record: dict[str, Any]) -> str:
    values = {field: record[field] for field in THESIS_FIELDS}
    return hashlib.sha256(
        json.dumps(values, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _legacy_to_v2(relative: str, existing: dict[str, Any]) -> dict[str, Any]:
    """Migrate values without upgrading the evidential strength of old claims."""
    record = {**THESIS_DEFAULTS, **LEGACY_DEFAULTS}
    for field in LEGACY_FIELDS:
        value = existing.get(field)
        if isinstance(value, str) and value.strip():
            record[field] = value.strip()
    record.update({
        "image_path": relative,
        "source_dataset": record["source"],
        "field_or_public": record["origin_type"],
        "acquisition_session": record["session_id"],
        "capture_date": record["acquisition_date"],
        "expert_validated": record["label_review_status"],
        "location": record["site_id"] if record["site_id"] != UNKNOWN else UNKNOWN,
    })
    return record


def load_manifest_payload(path: str | Path | None) -> dict[str, dict[str, Any]]:
    if path is None:
        return {}
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Metadata manifest not found: {source}")
    payload = json.loads(source.read_text(encoding="utf-8"))
    images = payload.get("images", payload) if isinstance(payload, dict) else None
    if not isinstance(images, dict):
        raise ValueError("Metadata manifest must contain an object named 'images'")
    normalized: dict[str, dict[str, Any]] = {}
    for raw_relative, raw_record in images.items():
        if not isinstance(raw_relative, str) or not isinstance(raw_record, dict):
            raise ValueError("Metadata entries must map string paths to JSON objects")
        relative = _normalize_path(raw_relative)
        unknown = set(raw_record) - ALLOWED_RECORD_FIELDS
        if unknown:
            raise ValueError(f"Metadata for '{relative}' contains unknown fields: {sorted(unknown)}")
        record = _legacy_to_v2(relative, raw_record)
        for field in ALLOWED_RECORD_FIELDS - {"field_provenance"}:
            value = raw_record.get(field)
            if value is not None:
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"Metadata field '{field}' for '{relative}' must be a non-empty string")
                record[field] = value.strip()
        provenance = raw_record.get("field_provenance", {})
        if not isinstance(provenance, dict) or not all(
            isinstance(key, str) and isinstance(value, str) and value.strip()
            for key, value in provenance.items()
        ):
            raise ValueError(f"field_provenance for '{relative}' must map fields to evidence strings")
        record["field_provenance"] = dict(sorted(provenance.items()))
        normalized[relative] = record
    return normalized


def _duplicate_states(report_path: Path | None) -> tuple[dict[str, str], dict[str, Any]]:
    states: dict[str, str] = {}
    if report_path is None or not report_path.is_file():
        return states, {}
    report = json.loads(report_path.read_text(encoding="utf-8"))
    priority = {
        "reviewed_clear": 1,
        "grouped_near_duplicate": 2,
        "pending_near_duplicate_review": 3,
    }
    for pair in report.get("near_duplicate_pairs", []):
        review = pair.get("review") or {}
        decision = review.get("decision")
        if pair.get("requires_review"):
            state = "pending_near_duplicate_review"
        elif decision in {"same_image", "same_leaf_or_related_capture", "grouped"}:
            state = "grouped_near_duplicate"
        else:
            state = "reviewed_clear"
        for field in ("path_a", "path_b"):
            relative = _normalize_path(pair[field])
            current = states.get(relative)
            if current is None or priority[state] > priority.get(current, 0):
                states[relative] = state
    for group in report.get("exact_duplicate_groups", []):
        states[_normalize_path(group["kept"])] = "canonical_exact_duplicate_representative"
        for relative in group.get("excluded_copies", []):
            states[_normalize_path(relative)] = "excluded_exact_duplicate_copy"
    for conflict in report.get("cross_label_exact_conflicts", []):
        for relative in conflict.get("paths", []):
            states[_normalize_path(relative)] = "cross_label_duplicate_conflict"
    return states, report


def enrich_metadata(
    root: Path,
    class_names: Sequence[str],
    quarantined_class_names: Sequence[str],
    extensions: Sequence[str],
    existing_path: str | Path | None,
    group_manifest_path: str | Path | None = None,
    inventory_report_path: str | Path | None = None,
) -> dict[str, Any]:
    """Build the same manifest for the same inputs; never infer biological IDs."""
    root = root.expanduser().resolve()
    existing = load_manifest_payload(existing_path) if existing_path and Path(existing_path).is_file() else {}
    group_path = Path(group_manifest_path).expanduser().resolve() if group_manifest_path else None
    group_map = json.loads(group_path.read_text(encoding="utf-8")) if group_path and group_path.is_file() else {}
    if not isinstance(group_map, dict) or not all(
        isinstance(key, str) and isinstance(value, str) and value.strip()
        for key, value in group_map.items()
    ):
        raise ValueError("Group manifest must map relative paths to non-empty group IDs")
    group_map = {_normalize_path(key): value.strip() for key, value in group_map.items()}
    report_path = Path(inventory_report_path).expanduser().resolve() if inventory_report_path else None
    duplicate_states, inventory_report = _duplicate_states(report_path)
    allowed = {extension.lower() for extension in extensions}
    active = set(class_names)
    quarantined = set(quarantined_class_names)
    paths = sorted(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in allowed)
    inventory_relatives = {_normalize_path(str(path.relative_to(root))) for path in paths}
    stale_groups = sorted(set(group_map) - inventory_relatives)
    if stale_groups:
        raise ValueError(f"Group manifest contains paths outside the image inventory: {stale_groups[:3]}")
    summary = inventory_report.get("summary", {})
    if summary and summary.get("scanned") != len(paths):
        raise ValueError(
            f"Inventory report scanned {summary.get('scanned')} files but current inventory has {len(paths)}; rerun image validation"
        )

    images: dict[str, dict[str, Any]] = {}
    for path in paths:
        relative = _normalize_path(str(path.relative_to(root)))
        canonical = relative.split("/", 1)[0]
        if canonical not in active | quarantined:
            continue
        previous = existing.get(relative, {})
        record = _legacy_to_v2(relative, previous)
        provenance = dict(previous.get("field_provenance", {}))
        record["canonical_class"] = canonical
        provenance["image_path"] = "dataset inventory relative path"
        provenance["canonical_class"] = f"top-level class folder: {canonical}"

        rule = _rule_for_path(relative)
        if rule:
            inferred = {
                "source_dataset": rule["dataset"],
                "source_type": "public_dataset" if rule["dataset"] != "deep-learning-banana-diseases-ecuador" else "public_repository",
                "original_label": rule["label"],
                "field_or_public": "public",
                "location": rule["location"],
            }
            for field, value in inferred.items():
                previous_value = record[field]
                if previous_value not in UNRESOLVED_VALUES and value not in UNRESOLVED_VALUES and previous_value != value:
                    raise ValueError(
                        f"Documented filename provenance conflicts with existing {field} for '{relative}': "
                        f"'{previous_value}' != '{value}'"
                    )
                if previous_value in UNRESOLVED_VALUES and value not in UNRESOLVED_VALUES:
                    record[field] = value
            evidence = f"documented filename rule '{rule['prefix']}*' in datasets/banana_leaf_thesis_4class/SOURCES.md"
            for field in ("source_dataset", "source_type", "original_label", "field_or_public"):
                provenance.setdefault(field, evidence)
            provenance.setdefault("location", evidence if rule["location"] != UNKNOWN else "not documented for this source batch")
        else:
            if record["source_dataset"] == UNKNOWN and record["source"] != UNKNOWN:
                record["source_dataset"] = record["source"]
                provenance["source_dataset"] = "preserved from schema-v1 source field"
            if record["source_dataset"] != UNKNOWN and record["field_or_public"] == UNKNOWN:
                record["field_or_public"] = "public"
                provenance["field_or_public"] = "preserved public origin in schema-v1 manifest"
            if record["source_dataset"] != UNKNOWN and record["source_type"] == UNKNOWN:
                record["source_type"] = "public_dataset"
                provenance["source_type"] = "source is documented as a public dataset in SOURCES.md"

        explicit_group = group_map.get(relative)
        previous_group = record.get("group_id", PENDING)
        if explicit_group and previous_group not in UNRESOLVED_VALUES and explicit_group != previous_group:
            raise ValueError(
                f"Group manifest conflicts with metadata group_id for '{relative}': "
                f"'{explicit_group}' != '{previous_group}'"
            )
        record["group_id"] = explicit_group or (
            previous_group if previous_group not in UNRESOLVED_VALUES else PENDING
        )
        provenance.setdefault(
            "group_id",
            "explicit datasets/group_manifest.json assignment"
            if record["group_id"] not in UNRESOLVED_VALUES else
            "unresolved; requires biological/acquisition review or explicit independent-singleton confirmation",
        )
        if canonical in quarantined:
            record["qc_status"] = "quarantined"
            record["duplicate_status"] = "not_applicable_quarantined"
        else:
            # Technical decoder success is not upgraded to human quality approval.
            old_qc = previous.get("qc_status")
            record["qc_status"] = old_qc if old_qc in {"approved", "excluded"} else "pending_human_review"
            if summary:
                record["duplicate_status"] = duplicate_states.get(relative, "automated_clear")
            elif record.get("duplicate_status", PENDING) in UNRESOLVED_VALUES:
                record["duplicate_status"] = PENDING
        provenance["qc_status"] = "human decision preserved; automated decoding never substitutes for human QC"
        provenance["duplicate_status"] = (
            f"inventory report SHA-256/dHash screen: {report_path.name}" if summary else "inventory report unavailable"
        )

        # Synchronize v2 names with retained compatibility fields.
        record["source"] = record["source_dataset"]
        record["session_id"] = record["acquisition_session"]
        record["origin_type"] = record["field_or_public"]
        record["acquisition_date"] = record["capture_date"]
        record["label_review_status"] = record["expert_validated"]
        for field in THESIS_FIELDS:
            provenance.setdefault(field, "unavailable in supplied records; explicit unknown/pending retained")
        record["field_provenance"] = dict(sorted(provenance.items()))
        record["record_fingerprint"] = _record_fingerprint(record)
        images[relative] = {field: record[field] for field in (*THESIS_FIELDS, *SUPPORT_FIELDS, "field_provenance")}

    source_documents = {
        "source_catalog_sha256": _file_sha256(root / "SOURCES.md"),
        "group_manifest_sha256": _file_sha256(group_path),
        "inventory_report_sha256": _file_sha256(report_path),
    }
    return {
        "schema_version": SCHEMA_VERSION,
        "dataset_root": str(root),
        "generator": "ai.data.metadata_manifest.enrich_metadata/v2",
        "determinism": "sorted paths + documented exact-prefix rules + content fingerprints; no generation timestamp",
        "unknown_value_policy": "Unknown and pending are evidence-preserving values. Biological/acquisition fields are never inferred without an explicit source record.",
        "source_documents": source_documents,
        "images": images,
    }


def formal_metadata_issues(
    relative: str,
    record: dict[str, Any],
    active_classes: Iterable[str],
) -> list[str]:
    issues: list[str] = []
    for field in THESIS_FIELDS:
        if field not in record or not isinstance(record[field], str) or not record[field].strip():
            issues.append(f"missing:{field}")
    if issues:
        return issues
    if record["image_path"] != relative:
        issues.append("mismatch:image_path")
    expected_class = relative.split("/", 1)[0]
    if record["canonical_class"] != expected_class or expected_class not in set(active_classes):
        issues.append("mismatch:canonical_class")
    for field in ("source_dataset", "source_type", "original_label", "field_or_public"):
        if record[field] in UNRESOLVED_VALUES:
            issues.append(f"unresolved:{field}")
    if record["expert_validated"] != "validated":
        issues.append("unresolved:expert_validated")
    if record["group_id"] in UNRESOLVED_VALUES:
        issues.append("unresolved:group_id")
    if record["qc_status"] != "approved":
        issues.append("unresolved:qc_status")
    if record["duplicate_status"] not in {
        "automated_clear", "reviewed_clear", "grouped_near_duplicate", "canonical_exact_duplicate_representative"
    }:
        issues.append("unresolved:duplicate_status")
    if record.get("species_review_status") != "banana":
        issues.append("unresolved:species_review_status")
    if record.get("visibility_quality_status") != "acceptable":
        issues.append("unresolved:visibility_quality_status")
    if record.get("inclusion_status") != "included":
        issues.append("unresolved:inclusion_status")
    if record["field_or_public"] == "field" and record["location"] == UNKNOWN:
        issues.append("unresolved:field_location")
    if record["expert_validated"] == "validated" and record.get("label_validator", UNKNOWN) == UNKNOWN:
        issues.append("missing:label_validator")
    provenance = record.get("field_provenance")
    if not isinstance(provenance, dict) or any(field not in provenance for field in THESIS_FIELDS):
        issues.append("missing:field_provenance")
    expected_fingerprint = _record_fingerprint(record)
    if record.get("record_fingerprint") != expected_fingerprint:
        issues.append("mismatch:record_fingerprint")
    return issues


def validation_report(
    root: Path,
    active_paths: Iterable[Path],
    records: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], int, int]:
    relatives = sorted(_normalize_path(str(path.relative_to(root))) for path in active_paths)
    missing = [relative for relative in relatives if relative not in records]
    unresolved: list[dict[str, Any]] = []
    reason_counts: Counter[str] = Counter()
    active_classes = {relative.split("/", 1)[0] for relative in relatives}
    for relative in relatives:
        if relative in records:
            issues = formal_metadata_issues(relative, records[relative], active_classes)
            if issues:
                unresolved.append({"image_path": relative, "issues": issues})
                reason_counts.update(issues)
    ready = len(relatives) - len(missing) - len(unresolved)
    report = {
        "schema_version": SCHEMA_VERSION,
        "dataset_root": str(root),
        "required_presence_fields": list(THESIS_FIELDS),
        "optional_when_unavailable": ["plant_id", "leaf_id", "acquisition_session", "capture_device", "capture_date", "location"],
        "formal_gate": (
            "Every active record needs traceable provenance, resolved source/original label, expert validation, "
            "approved human QC, an explicit biological/acquisition group (or reviewed singleton), and resolved duplicate status."
        ),
        "summary": {
            "active_images": len(relatives),
            "manifest_entries_present": len(relatives) - len(missing),
            "schema_complete_records": sum(
                relative in records and all(field in records[relative] for field in THESIS_FIELDS)
                for relative in relatives
            ),
            "formally_ready_records": ready,
            "missing_entries": len(missing),
            "records_requiring_human_review": len(unresolved),
            "issue_counts": dict(sorted(reason_counts.items())),
        },
        "missing_paths": missing,
        "unresolved_records": unresolved,
        "unused_or_quarantined_paths": sorted(set(records) - set(relatives)),
    }
    return report, len(missing), len(unresolved)


def write_manifest(payload: dict[str, Any], destination: str | Path) -> Path:
    output = Path(destination)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return output.resolve()
