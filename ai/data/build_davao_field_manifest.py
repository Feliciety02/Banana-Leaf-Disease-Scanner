"""Ingest Davao field images into an expert-gated, test-only manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from ai.config.labels import CLASS_LABELS
from ai.data.build_ssl_manifest import (
    DisjointSet,
    _inspect,
    _json_fingerprint,
    _normalize,
    _verify_fingerprint,
)
from ai.data.dataset import _HammingBkTree, _sha256
from ai.data.metadata_manifest import UNRESOLVED_VALUES


SCHEMA_VERSION = 1
COLLECTION_FIELDS = (
    "collection_id", "project_name", "collecting_organization",
    "collection_authority_status", "collection_authority_reference", "notes",
)
IMAGE_FIELDS = (
    "site", "plant_id", "leaf_id", "acquisition_session", "capture_device",
    "capture_date", "collector_role", "preliminary_label",
    "preliminary_label_provider", "preliminary_label_recorded_at",
    "expert_reviewed_label", "review_status", "expert_reviewer",
    "expert_reviewed_at", "expert_evidence", "banana_leaf_status", "qc_status",
    "qc_reviewer", "qc_reviewed_at", "qc_note", "exclusion_reason",
)
REVIEW_STATES = frozenset({"pending", "validated", "conflict", "excluded"})
BANANA_STATES = frozenset({"confirmed_banana_leaf", "non_banana", "requires_review"})
QC_STATES = frozenset({"approved", "pending", "rejected"})
NEAR_DECISIONS = frozenset({"visually_similar_but_independent", "related", "requires_review"})
PARTITIONS = ("train", "validation", "test")


def _non_empty_strings(record: dict[str, Any], fields: Iterable[str], description: str) -> None:
    missing = [
        field for field in fields
        if not isinstance(record.get(field), str) or not record[field].strip()
    ]
    if missing:
        raise ValueError(f"{description} is missing non-empty string fields: {missing}")


def load_field_config(path: str | Path) -> dict[str, Any]:
    config = json.loads(Path(path).read_text(encoding="utf-8"))
    required = {
        "schema_version", "field_version", "class_names", "allowed_extensions",
        "minimum_width", "minimum_height", "near_duplicate_hamming_distance",
        "preliminary_labels_are_supervised_targets", "require_expert_validated_label",
        "require_approved_collection_authority", "require_frozen_final_split",
        "partition_assignment", "unresolved_policy",
    }
    missing = sorted(required - set(config))
    if missing:
        raise ValueError(f"Davao field config is missing fields: {missing}")
    if config["schema_version"] != SCHEMA_VERSION:
        raise ValueError("Unsupported Davao field config schema")
    if config["class_names"] != list(CLASS_LABELS):
        raise ValueError(f"Davao expert labels must use canonical order {list(CLASS_LABELS)}")
    if not isinstance(config["field_version"], str) or not config["field_version"].strip():
        raise ValueError("field_version must be a non-empty string")
    if not all(isinstance(value, str) and value.startswith(".") for value in config["allowed_extensions"]):
        raise ValueError("allowed_extensions must contain dot-prefixed strings")
    if any(not isinstance(config[field], int) or config[field] <= 0 for field in ("minimum_width", "minimum_height")):
        raise ValueError("minimum image dimensions must be positive")
    distance = config["near_duplicate_hamming_distance"]
    if not isinstance(distance, int) or not 0 <= distance <= 16:
        raise ValueError("near_duplicate_hamming_distance must be in [0, 16]")
    if config["preliminary_labels_are_supervised_targets"] is not False:
        raise ValueError("Preliminary field labels can never be supervised targets")
    if any(config[field] is not True for field in (
        "require_expert_validated_label", "require_approved_collection_authority",
        "require_frozen_final_split",
    )):
        raise ValueError("Davao field evaluation must retain all expert/authority/split gates")
    if config["partition_assignment"] != "held_out_test_only":
        raise ValueError("Davao field images must be assigned only to held-out test")
    if config["unresolved_policy"] != "pending_or_excluded_without_deleting_file":
        raise ValueError("Unresolved Davao images must remain pending/excluded without deletion")
    return config


def load_field_registry(path: str | Path) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if payload.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("Unsupported Davao field registry schema")
    if not isinstance(payload.get("registry_version"), str) or not payload["registry_version"].strip():
        raise ValueError("Davao field registry requires registry_version")
    collection = payload.get("collection")
    images = payload.get("images")
    if not isinstance(collection, dict) or not isinstance(images, dict):
        raise ValueError("Davao field registry requires collection{} and images{}")
    unknown_collection = set(collection) - set(COLLECTION_FIELDS)
    if unknown_collection:
        raise ValueError(f"Davao collection contains unknown fields: {sorted(unknown_collection)}")
    _non_empty_strings(collection, COLLECTION_FIELDS, "Davao collection")
    normalized: dict[str, dict[str, str]] = {}
    for raw_path, record in images.items():
        if not isinstance(raw_path, str) or not isinstance(record, dict):
            raise ValueError("Davao images must map relative paths to objects")
        relative = _normalize(raw_path)
        if not relative or relative.startswith("../") or ":" in relative.split("/", 1)[0]:
            raise ValueError(f"Unsafe Davao image path: {raw_path}")
        unknown = set(record) - set(IMAGE_FIELDS)
        if unknown:
            raise ValueError(f"Davao image '{relative}' contains unknown fields: {sorted(unknown)}")
        _non_empty_strings(record, IMAGE_FIELDS, f"Davao image '{relative}'")
        if record["review_status"] not in REVIEW_STATES:
            raise ValueError(f"Invalid review_status for Davao image '{relative}'")
        if record["banana_leaf_status"] not in BANANA_STATES:
            raise ValueError(f"Invalid banana_leaf_status for Davao image '{relative}'")
        if record["qc_status"] not in QC_STATES:
            raise ValueError(f"Invalid qc_status for Davao image '{relative}'")
        expert_label = record["expert_reviewed_label"]
        if record["review_status"] == "validated":
            if expert_label not in CLASS_LABELS:
                raise ValueError(f"Validated Davao image lacks canonical expert label: {relative}")
            if any(record[field] in UNRESOLVED_VALUES for field in (
                "expert_reviewer", "expert_reviewed_at", "expert_evidence",
            )):
                raise ValueError(f"Validated Davao image lacks expert evidence: {relative}")
        elif expert_label not in UNRESOLVED_VALUES:
            raise ValueError(
                f"Non-validated Davao image cannot expose a final expert label: {relative}"
            )
        if relative in normalized:
            raise ValueError(f"Repeated normalized Davao image path: {relative}")
        normalized[relative] = dict(record)
    return {
        "schema_version": SCHEMA_VERSION,
        "registry_version": payload["registry_version"],
        "collection": dict(collection),
        "images": normalized,
    }


def load_near_reviews(path: str | Path | None) -> dict[str, dict[str, str]]:
    if path is None:
        return {}
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if payload.get("schema_version") != SCHEMA_VERSION or not isinstance(payload.get("reviews"), dict):
        raise ValueError("Unsupported Davao near-duplicate review manifest")
    reviews: dict[str, dict[str, str]] = {}
    for key, review in payload["reviews"].items():
        if not isinstance(key, str) or not isinstance(review, dict):
            raise ValueError("Davao near reviews must map keys to objects")
        unknown = set(review) - {"decision", "reviewer", "reviewed_at", "evidence_note"}
        if unknown:
            raise ValueError(f"Davao near review '{key}' contains unknown fields: {sorted(unknown)}")
        if review.get("decision") not in NEAR_DECISIONS:
            raise ValueError(f"Invalid Davao near-duplicate decision for '{key}'")
        if review["decision"] != "requires_review":
            _non_empty_strings(review, ("reviewer", "reviewed_at", "evidence_note"), f"Davao near review '{key}'")
        reviews[key] = dict(review)
    return reviews


def _load_final_split(directory: str | Path | None) -> tuple[dict[str, Any] | None, dict[str, list[dict[str, Any]]]]:
    if directory is None:
        return None, {partition: [] for partition in PARTITIONS}
    root = Path(directory).expanduser().resolve()
    summary_path = root / "split_summary.json"
    if not summary_path.is_file():
        raise FileNotFoundError(f"Frozen final split summary is missing: {summary_path}")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    _verify_fingerprint(summary, "gate_fingerprint")
    if summary.get("status") != "ready":
        raise ValueError("Davao field subset requires a passed final split")
    partitions: dict[str, list[dict[str, Any]]] = {}
    for partition in PARTITIONS:
        path = root / f"{partition}_manifest.json"
        payload = json.loads(path.read_text(encoding="utf-8"))
        _verify_fingerprint(payload, "manifest_fingerprint")
        if payload.get("partition") != partition:
            raise ValueError(f"Final split partition mismatch: {path}")
        partitions[partition] = payload["records"]
    return {
        "path": str(summary_path),
        "sha256": hashlib.sha256(summary_path.read_bytes()).hexdigest(),
        "split_version": summary["split_version"],
    }, partitions


def _near_key(field_path: str, other_scope: str, other_path: str) -> str:
    return "||".join(sorted((f"davao::{field_path}", f"{other_scope}::{other_path}")))


def _known(value: str) -> bool:
    return value not in UNRESOLVED_VALUES


def _biological_keys(record: dict[str, str]) -> dict[str, str]:
    site = record["site"]
    keys: dict[str, str] = {}
    if _known(site) and _known(record["plant_id"]):
        keys["plant_id"] = f"plant::{site}::{record['plant_id']}"
    if _known(site) and _known(record["leaf_id"]):
        keys["leaf_id"] = f"leaf::{site}::{record['plant_id']}::{record['leaf_id']}"
    if _known(site) and _known(record["acquisition_session"]):
        keys["acquisition_session"] = f"session::{site}::{record['acquisition_session']}"
    return keys


def build_davao_field_manifest(
    field_root: str | Path,
    registry_path: str | Path,
    labeled_dataset_root: str | Path,
    final_split_dir: str | Path | None,
    config_path: str | Path,
    near_review_path: str | Path | None = None,
) -> dict[str, Any]:
    root = Path(field_root).expanduser().resolve()
    labeled_root = Path(labeled_dataset_root).expanduser().resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"Davao field root does not exist: {root}")
    if root == labeled_root or root in labeled_root.parents or labeled_root in root.parents:
        raise ValueError("Davao field root must remain separate from the labeled cohort root")
    config = load_field_config(config_path)
    registry = load_field_registry(registry_path)
    reviews = load_near_reviews(near_review_path)
    split_evidence, split_records = _load_final_split(final_split_dir)
    files = sorted(
        path for path in root.rglob("*")
        if path.is_file() and path.name not in {".gitkeep", ".DS_Store", "Thumbs.db"}
    )
    relative_files = [_normalize(str(path.relative_to(root))) for path in files]
    rows: dict[str, dict[str, Any]] = {}
    valid: dict[str, dict[str, Any]] = {}
    for path, relative in zip(files, relative_files):
        inspection, error = _inspect(path, config)
        metadata = registry["images"].get(relative)
        reasons: list[str] = []
        if error:
            reasons.append(f"invalid:{error}")
        if metadata is None:
            reasons.append("metadata:missing_registry_record")
        if inspection:
            valid[relative] = inspection
        rows[relative] = {
            "image_path": relative,
            **({key: value for key, value in inspection.items() if not key.startswith("_")} if inspection else {}),
            "metadata": metadata,
            "decision": "excluded",
            "reason_codes": reasons,
            "near_duplicate_review_keys": [],
        }

    primary: dict[str, dict[str, Any]] = {}
    primary_exact: dict[str, list[str]] = defaultdict(list)
    if files:
        if not labeled_root.is_dir():
            raise FileNotFoundError(f"Labeled dataset root does not exist: {labeled_root}")
        primary_config = {**config, "minimum_width": 1, "minimum_height": 1}
        for path in sorted(path for path in labeled_root.rglob("*") if path.is_file()):
            if path.suffix.lower() not in set(config["allowed_extensions"]):
                continue
            relative = _normalize(str(path.relative_to(labeled_root)))
            inspection, error = _inspect(path, primary_config)
            if not error and inspection:
                primary[relative] = inspection
                primary_exact[inspection["sha256"]].append(relative)

    duplicate_paths: set[str] = set()
    field_exact: dict[str, list[str]] = defaultdict(list)
    for relative, inspection in valid.items():
        field_exact[inspection["sha256"]].append(relative)
    for digest, members in field_exact.items():
        if digest in primary_exact:
            for relative in members:
                duplicate_paths.add(relative)
                rows[relative]["reason_codes"].append("duplicate:exact_labeled_inventory")
                rows[relative]["exact_duplicate_of"] = primary_exact[digest]
        else:
            representative = sorted(members)[0]
            for relative in sorted(members)[1:]:
                duplicate_paths.add(relative)
                rows[relative]["reason_codes"].append("duplicate:exact_davao_copy")
                rows[relative]["exact_duplicate_of"] = [representative]

    # Begin grouping from every valid field file. Known plant/leaf/session
    # identities are unioned transitively; unknown values never create groups.
    groups = DisjointSet(valid)
    identities: dict[str, list[str]] = defaultdict(list)
    for relative in valid:
        metadata = registry["images"].get(relative)
        if metadata:
            for key in _biological_keys(metadata).values():
                identities[key].append(relative)
    for members in identities.values():
        for member in members[1:]:
            groups.union(members[0], member)
    for members in field_exact.values():
        for member in members[1:]:
            groups.union(members[0], member)

    near_pairs: list[dict[str, Any]] = []
    near_paths: set[str] = set()
    primary_values: dict[int, list[str]] = defaultdict(list)
    primary_tree = _HammingBkTree()
    for relative, inspection in primary.items():
        value = inspection["_dhash_int"]
        if value not in primary_values:
            primary_tree.add(value)
        primary_values[value].append(relative)
    threshold = config["near_duplicate_hamming_distance"]
    for field_path, inspection in sorted(valid.items()):
        for matched in primary_tree.query(inspection["_dhash_int"], threshold):
            for primary_path in primary_values[matched]:
                if inspection["sha256"] == primary[primary_path]["sha256"]:
                    continue
                key = _near_key(field_path, "labeled", primary_path)
                review = reviews.get(key, {"decision": "requires_review", "reviewer": "", "reviewed_at": "", "evidence_note": ""})
                near_pairs.append({
                    "review_key": key, "field_path": field_path,
                    "other_scope": "labeled", "other_path": primary_path,
                    "sha256_field": inspection["sha256"],
                    "sha256_other": primary[primary_path]["sha256"],
                    "flip_aware_dhash64_field": inspection["flip_aware_dhash64"],
                    "flip_aware_dhash64_other": primary[primary_path]["flip_aware_dhash64"],
                    "hamming_distance": (inspection["_dhash_int"] ^ matched).bit_count(),
                    **review,
                })
                near_paths.add(field_path)
                rows[field_path]["near_duplicate_review_keys"].append(key)
                if review["decision"] == "requires_review":
                    rows[field_path]["reason_codes"].append("near_duplicate:requires_review")
                elif review["decision"] == "related":
                    rows[field_path]["reason_codes"].append("near_duplicate:related_to_labeled")

    field_values: dict[int, list[str]] = defaultdict(list)
    field_tree = _HammingBkTree()
    for field_path, inspection in sorted(valid.items()):
        value = inspection["_dhash_int"]
        for matched in field_tree.query(value, threshold):
            for other_path in field_values[matched]:
                if inspection["sha256"] == valid[other_path]["sha256"]:
                    continue
                key = _near_key(field_path, "davao", other_path)
                review = reviews.get(key, {"decision": "requires_review", "reviewer": "", "reviewed_at": "", "evidence_note": ""})
                near_pairs.append({
                    "review_key": key, "field_path": field_path,
                    "other_scope": "davao", "other_path": other_path,
                    "sha256_field": inspection["sha256"],
                    "sha256_other": valid[other_path]["sha256"],
                    "flip_aware_dhash64_field": inspection["flip_aware_dhash64"],
                    "flip_aware_dhash64_other": valid[other_path]["flip_aware_dhash64"],
                    "hamming_distance": (value ^ matched).bit_count(),
                    **review,
                })
                near_paths.update((field_path, other_path))
                rows[field_path]["near_duplicate_review_keys"].append(key)
                rows[other_path]["near_duplicate_review_keys"].append(key)
                if review["decision"] == "requires_review":
                    rows[field_path]["reason_codes"].append("near_duplicate:requires_review")
                    rows[other_path]["reason_codes"].append("near_duplicate:requires_review")
                elif review["decision"] == "related":
                    groups.union(field_path, other_path)
        if value not in field_values:
            field_tree.add(value)
        field_values[value].append(field_path)

    primary_biological: dict[str, set[str]] = defaultdict(set)
    for partition_records in split_records.values():
        for record in partition_records:
            metadata = {
                "site": record.get("location", "unknown"),
                "plant_id": record.get("plant_id", "unknown"),
                "leaf_id": record.get("leaf_id", "unknown"),
                "acquisition_session": record.get("acquisition_session", "unknown"),
            }
            for field, key in _biological_keys(metadata).items():
                primary_biological[field].add(key)

    components: dict[str, list[str]] = defaultdict(list)
    for relative in sorted(valid):
        components[groups.find(relative)].append(relative)
    group_by_path: dict[str, str] = {}
    group_rows: list[dict[str, Any]] = []
    for members in sorted(components.values(), key=lambda values: values[0]):
        group_id = f"davao-group::{_json_fingerprint(members)[:16]}"
        for relative in members:
            group_by_path[relative] = group_id
        group_rows.append({
            "group_id": group_id,
            "members": members,
            "sites": sorted({registry["images"][path]["site"] for path in members if path in registry["images"]}),
            "plant_ids": sorted({registry["images"][path]["plant_id"] for path in members if path in registry["images"] and _known(registry["images"][path]["plant_id"])}),
            "leaf_ids": sorted({registry["images"][path]["leaf_id"] for path in members if path in registry["images"] and _known(registry["images"][path]["leaf_id"])}),
            "acquisition_sessions": sorted({registry["images"][path]["acquisition_session"] for path in members if path in registry["images"] and _known(registry["images"][path]["acquisition_session"])}),
        })

    for relative, row in rows.items():
        metadata = registry["images"].get(relative)
        reasons = row["reason_codes"]
        if metadata:
            status = metadata["review_status"]
            if status != "validated":
                reasons.append(f"expert_review:{status}")
            if metadata["banana_leaf_status"] == "non_banana":
                reasons.append("relevance:non_banana")
            elif metadata["banana_leaf_status"] != "confirmed_banana_leaf":
                reasons.append("relevance:requires_review")
            if metadata["qc_status"] != "approved":
                reasons.append(f"qc:{metadata['qc_status']}")
            for field, key in _biological_keys(metadata).items():
                if key in primary_biological[field]:
                    reasons.append(f"biological_overlap:{field}")
            row["field_group_id"] = group_by_path.get(relative)
            row["preliminary_expert_disagreement"] = (
                status == "validated"
                and metadata["preliminary_label"] not in UNRESOLVED_VALUES
                and metadata["preliminary_label"] != metadata["expert_reviewed_label"]
            )
        if registry["collection"]["collection_authority_status"] != "approved":
            reasons.append("collection_authority:not_approved")
        if split_evidence is None:
            reasons.append("gate:missing_frozen_final_split")
        row["reason_codes"] = sorted(set(reasons))
        row["near_duplicate_review_keys"] = sorted(set(row["near_duplicate_review_keys"]))
        row["decision"] = "held_out_test" if not row["reason_codes"] else (
            "pending" if any(
                reason.startswith(("expert_review:pending", "expert_review:conflict", "relevance:requires_review", "qc:pending", "near_duplicate:requires_review", "gate:"))
                for reason in row["reason_codes"]
            ) else "excluded"
        )

    known_review_keys = {pair["review_key"] for pair in near_pairs}
    unknown_reviews = sorted(set(reviews) - known_review_keys)
    if unknown_reviews:
        raise ValueError(f"Davao near-review manifest contains stale/unknown keys: {unknown_reviews[:3]}")
    stale_registry = sorted(set(registry["images"]) - set(relative_files))
    evaluation_records: list[dict[str, Any]] = []
    for relative in sorted(rows):
        row = rows[relative]
        if row["decision"] != "held_out_test":
            continue
        metadata = row["metadata"]
        label = metadata["expert_reviewed_label"]
        evaluation_records.append({
            "image_path": relative,
            "sha256": row["sha256"],
            "width": row["width"],
            "height": row["height"],
            "flip_aware_dhash64": row["flip_aware_dhash64"],
            "partition": "test",
            "field_subset": "davao",
            "field_group_id": row["field_group_id"],
            "canonical_class": label,
            "class_index": list(CLASS_LABELS).index(label),
            **{field: metadata[field] for field in (
                "site", "plant_id", "leaf_id", "acquisition_session",
                "capture_device", "capture_date", "preliminary_label",
                "preliminary_label_provider", "expert_reviewed_label",
                "review_status", "expert_reviewer", "expert_reviewed_at",
                "expert_evidence",
            )},
        })
    decisions = Counter(row["decision"] for row in rows.values())
    review_states = Counter(
        row["metadata"]["review_status"]
        for row in rows.values() if row["metadata"]
    )
    reason_counts = Counter(
        reason for row in rows.values() for reason in row["reason_codes"]
    )
    class_counts = Counter(record["canonical_class"] for record in evaluation_records)
    global_blockers: list[str] = []
    if not files:
        global_blockers.append("no_field_images_acquired")
    if registry["collection"]["collection_authority_status"] != "approved":
        global_blockers.append("collection_authority_not_approved")
    if split_evidence is None:
        global_blockers.append("frozen_final_split_unavailable")
    summary = {
        "acquired": len(files),
        "integrity_valid": len(valid),
        "expert_validated": review_states["validated"],
        "pending_review": review_states["pending"],
        "conflicting_review": review_states["conflict"],
        "expert_excluded": review_states["excluded"],
        "invalid": sum(any(reason.startswith("invalid:") for reason in row["reason_codes"]) for row in rows.values()),
        "exact_duplicate": len(duplicate_paths),
        "near_duplicate": len(near_paths),
        "field_groups": len(group_rows),
        "held_out_test_ready": len(evaluation_records),
        "pending": decisions["pending"],
        "excluded": decisions["excluded"],
        "class_counts": {name: class_counts[name] for name in CLASS_LABELS},
        "all_classes_represented": all(class_counts[name] > 0 for name in CLASS_LABELS),
        "stale_registry_records": len(stale_registry),
    }
    status = "empty" if not files else ("ready" if evaluation_records else "blocked")
    if evaluation_records and (decisions["pending"] or decisions["excluded"]):
        status = "ready_with_pending"
    input_paths = {
        "registry": Path(registry_path).resolve(),
        "config": Path(config_path).resolve(),
    }
    if near_review_path:
        input_paths["near_reviews"] = Path(near_review_path).resolve()
    payload: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "field_version": config["field_version"],
        "status": status,
        "configuration": config,
        "field_root": str(root),
        "labeled_dataset_root": str(labeled_root),
        "input_artifacts": {
            name: {"path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            for name, path in input_paths.items()
        },
        "final_split_evidence": split_evidence,
        "collection": registry["collection"],
        "summary": summary,
        "pending_validation_summary": {
            "global_blockers": global_blockers,
            "pending_or_conflicting_records": [
                {"image_path": path, "reason_codes": rows[path]["reason_codes"]}
                for path in sorted(rows) if rows[path]["decision"] == "pending"
            ],
            "reason_counts": dict(sorted(reason_counts.items())),
            "preliminary_labels_promoted_automatically": 0,
        },
        "records": [rows[path] for path in sorted(rows)],
        "group_manifest": group_rows,
        "davao_field_evaluation_subset": evaluation_records,
        "near_duplicate_pairs": sorted(near_pairs, key=lambda pair: pair["review_key"]),
        "stale_registry_paths": stale_registry,
        "usage_contract": {
            "partition": "held_out_test",
            "allowed": ["one_time_final_evaluation", "predefined_davao_subset_reporting"],
            "forbidden": [
                "supervised_training", "ssl_pretraining", "checkpoint_selection",
                "hyperparameter_tuning", "quantization_calibration",
            ],
        },
        "policies": {
            "files_copied_moved_or_deleted": False,
            "preliminary_labels_used_as_targets": False,
            "expert_validation_fabricated": False,
            "uncertain_or_conflicting_images_admitted": False,
        },
    }
    payload["manifest_fingerprint"] = _json_fingerprint(payload)
    return payload


def write_field_manifest(payload: dict[str, Any], output: str | Path) -> Path:
    destination = Path(output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    if destination.is_file() and destination.read_text(encoding="utf-8") != serialized:
        existing = json.loads(destination.read_text(encoding="utf-8"))
        if existing.get("field_version") == payload.get("field_version") and existing.get("status") not in {"empty", "blocked"}:
            raise ValueError(
                f"Versioned Davao field manifest already exists with different content: {destination}. "
                "Use a new field_version/output path."
            )
    destination.write_text(serialized, encoding="utf-8")
    return destination.resolve()


def load_davao_test_records(
    manifest_path: str | Path,
    field_root: str | Path,
    final_split_dir: str | Path,
):
    from ai.data.dataset import ImageRecord

    payload = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    _verify_fingerprint(payload, "manifest_fingerprint")
    if payload.get("status") not in {"ready", "ready_with_pending"}:
        raise ValueError(f"Davao field manifest is not ready: {payload.get('status')}")
    expected_usage = {
        "partition": "held_out_test",
        "allowed": ["one_time_final_evaluation", "predefined_davao_subset_reporting"],
        "forbidden": [
            "supervised_training", "ssl_pretraining", "checkpoint_selection",
            "hyperparameter_tuning", "quantization_calibration",
        ],
    }
    if payload.get("usage_contract") != expected_usage:
        raise ValueError("Davao field manifest usage contract was weakened or changed")
    root = Path(field_root).expanduser().resolve()
    if Path(payload.get("field_root", "")).resolve() != root:
        raise ValueError("Davao field manifest root does not match configuration")
    summary_path = Path(final_split_dir).expanduser().resolve() / "split_summary.json"
    evidence = payload.get("final_split_evidence", {})
    if evidence.get("sha256") != hashlib.sha256(summary_path.read_bytes()).hexdigest():
        raise ValueError("Frozen final split changed after Davao field manifest creation")
    records = []
    for row in payload.get("davao_field_evaluation_subset", []):
        if row.get("partition") != "test" or row.get("review_status") != "validated":
            raise ValueError(f"Non-test/non-validated row entered Davao subset: {row.get('image_path')}")
        if row.get("expert_reviewed_label") != row.get("canonical_class"):
            raise ValueError(f"Davao expert label mismatch: {row.get('image_path')}")
        if row.get("canonical_class") not in CLASS_LABELS or row.get("class_index") != list(CLASS_LABELS).index(row["canonical_class"]):
            raise ValueError(f"Davao class-index contract mismatch: {row.get('image_path')}")
        path = (root / row["image_path"]).resolve()
        try:
            path.relative_to(root)
        except ValueError as error:
            raise ValueError(f"Davao manifest path escapes field root: {row['image_path']}") from error
        if not path.is_file() or _sha256(path) != row["sha256"]:
            raise ValueError(f"Davao field image changed after manifest creation: {path}")
        records.append(ImageRecord(
            path=str(path), label=row["class_index"], class_name=row["canonical_class"],
            sha256=row["sha256"], group_id=row["field_group_id"],
            source="davao-field-acquisition", plant_id=row["plant_id"],
            leaf_id=row["leaf_id"], site_id=row["site"],
            session_id=row["acquisition_session"], origin_type="field",
            capture_device=row["capture_device"], acquisition_date=row["capture_date"],
            field_subset="davao", species_review_status="banana",
            visibility_quality_status="acceptable", inclusion_status="included",
            label_validator=row["expert_reviewer"], label_review_status="validated",
        ))
    if len(records) != payload["summary"]["held_out_test_ready"]:
        raise ValueError("Davao held-out ready count does not match manifest summary")
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--field-root", required=True)
    parser.add_argument("--registry", required=True)
    parser.add_argument("--labeled-dataset-root", required=True)
    parser.add_argument("--final-split-dir")
    parser.add_argument("--near-reviews")
    parser.add_argument("--config", default="ai/config/davao_field_ingestion_v1.json")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    payload = build_davao_field_manifest(
        args.field_root, args.registry, args.labeled_dataset_root,
        args.final_split_dir, args.config, args.near_reviews,
    )
    destination = write_field_manifest(payload, args.output)
    print(json.dumps({
        "field_manifest": str(destination),
        "status": payload["status"],
        **payload["summary"],
        "manifest_fingerprint": payload["manifest_fingerprint"],
    }, indent=2))
    if payload["status"] in {"empty", "blocked"}:
        raise SystemExit("DAVAO FIELD SUBSET NOT READY: see field manifest")


if __name__ == "__main__":
    main()
