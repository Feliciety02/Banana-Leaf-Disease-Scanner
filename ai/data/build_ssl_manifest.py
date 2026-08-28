"""Build a provenance-complete external banana-leaf SSL admission manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import warnings
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageOps, UnidentifiedImageError

from ai.data.image_fingerprints import HammingBkTree, flip_aware_difference_hash, sha256_file
from ai.data.metadata_manifest import UNRESOLVED_VALUES


SCHEMA_VERSION = 1
SOURCE_FIELDS = (
    "source_id", "source_name", "source_url", "accessed_at", "license_name",
    "license_url", "license_status", "citation", "source_type",
)
IMAGE_FIELDS = (
    "source_id", "source_item_id", "original_filename", "acquired_at",
    "banana_leaf_status", "relevance_reviewer", "relevance_reviewed_at",
    "relevance_evidence", "biological_group_id", "plant_id", "leaf_id",
    "acquisition_session", "capture_device", "capture_date", "location",
)
SOURCE_LICENSE_STATES = frozenset({"approved", "pending", "restricted"})
SOURCE_TYPES = frozenset({"public", "field", "institutional"})
RELEVANCE_STATES = frozenset({"confirmed_banana_leaf", "non_banana", "requires_review"})
NEAR_DECISIONS = frozenset({
    "visually_similar_but_independent", "related", "requires_review",
})


class DisjointSet:
    def __init__(self, values: Iterable[str]) -> None:
        self.parent = {value: value for value in values}

    def find(self, value: str) -> str:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left: str, right: str) -> None:
        left_root, right_root = self.find(left), self.find(right)
        if left_root != right_root:
            keep, merge = sorted((left_root, right_root))
            self.parent[merge] = keep


def _normalize(value: str) -> str:
    normalized = value.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized


def _json_fingerprint(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _verify_fingerprint(payload: dict[str, Any], field: str) -> None:
    expected = payload.get(field)
    unsigned = {key: value for key, value in payload.items() if key != field}
    if expected != _json_fingerprint(unsigned):
        raise ValueError(f"Manifest fingerprint mismatch: {field}")


def load_ssl_config(path: str | Path) -> dict[str, Any]:
    config = json.loads(Path(path).read_text(encoding="utf-8"))
    required = {
        "schema_version", "ssl_version", "target_count", "allowed_extensions",
        "minimum_width", "minimum_height", "near_duplicate_hamming_distance",
        "require_confirmed_banana_leaf", "require_approved_license",
        "require_frozen_heldout_exclusion", "target_policy", "unresolved_review_policy",
    }
    missing = sorted(required - set(config))
    if missing:
        raise ValueError(f"SSL ingestion config is missing fields: {missing}")
    if config["schema_version"] != SCHEMA_VERSION:
        raise ValueError("Unsupported SSL ingestion config schema")
    if not isinstance(config["ssl_version"], str) or not config["ssl_version"].strip():
        raise ValueError("ssl_version must be a non-empty string")
    if not isinstance(config["target_count"], int) or config["target_count"] <= 0:
        raise ValueError("target_count must be positive")
    if not all(isinstance(value, str) and value.startswith(".") for value in config["allowed_extensions"]):
        raise ValueError("allowed_extensions must contain dot-prefixed strings")
    if any(not isinstance(config[field], int) or config[field] <= 0 for field in ("minimum_width", "minimum_height")):
        raise ValueError("minimum image dimensions must be positive integers")
    distance = config["near_duplicate_hamming_distance"]
    if not isinstance(distance, int) or not 0 <= distance <= 16:
        raise ValueError("near_duplicate_hamming_distance must be in [0, 16]")
    if config["require_confirmed_banana_leaf"] is not True:
        raise ValueError("External SSL ingestion must require confirmed banana-leaf relevance")
    if config["require_approved_license"] is not True:
        raise ValueError("External SSL ingestion must require an approved license")
    if config["require_frozen_heldout_exclusion"] is not True:
        raise ValueError("External SSL ingestion must require the frozen held-out exclusion")
    if config["target_policy"] != "report_shortfall_without_fabrication":
        raise ValueError("SSL target policy cannot manufacture or imply missing images")
    if config["unresolved_review_policy"] != "exclude_candidate_without_deleting_file":
        raise ValueError("Unresolved SSL candidates must be excluded without deletion")
    return config


def _non_empty_strings(record: dict[str, Any], fields: Iterable[str], description: str) -> None:
    missing = [
        field for field in fields
        if not isinstance(record.get(field), str) or not record[field].strip()
    ]
    if missing:
        raise ValueError(f"{description} is missing non-empty string fields: {missing}")


def load_source_registry(path: str | Path) -> dict[str, Any]:
    registry = json.loads(Path(path).read_text(encoding="utf-8"))
    if registry.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("Unsupported SSL source-registry schema")
    if not isinstance(registry.get("registry_version"), str) or not registry["registry_version"].strip():
        raise ValueError("SSL source registry requires registry_version")
    if not isinstance(registry.get("sources"), list) or not isinstance(registry.get("images"), dict):
        raise ValueError("SSL source registry requires sources[] and images{}")
    sources: dict[str, dict[str, str]] = {}
    for source in registry["sources"]:
        if not isinstance(source, dict):
            raise ValueError("Every SSL source must be an object")
        unknown = set(source) - set(SOURCE_FIELDS) - {"notes"}
        if unknown:
            raise ValueError(f"SSL source contains unknown fields: {sorted(unknown)}")
        _non_empty_strings(source, SOURCE_FIELDS, "SSL source")
        if source["license_status"] not in SOURCE_LICENSE_STATES:
            raise ValueError(f"Invalid license status for source {source['source_id']}")
        if source["source_type"] not in SOURCE_TYPES:
            raise ValueError(f"Invalid source_type for source {source['source_id']}")
        if source["source_id"] in sources:
            raise ValueError(f"Repeated SSL source_id: {source['source_id']}")
        sources[source["source_id"]] = dict(source)
    normalized_images: dict[str, dict[str, str]] = {}
    for raw_path, record in registry["images"].items():
        if not isinstance(raw_path, str) or not isinstance(record, dict):
            raise ValueError("SSL image registry must map relative paths to objects")
        relative = _normalize(raw_path)
        if not relative or relative.startswith("../") or ":" in relative.split("/", 1)[0]:
            raise ValueError(f"Unsafe SSL registry path: {raw_path}")
        unknown = set(record) - set(IMAGE_FIELDS)
        if unknown:
            raise ValueError(
                f"SSL image '{relative}' contains unknown fields {sorted(unknown)}; "
                "disease labels are neither accepted nor required"
            )
        _non_empty_strings(record, IMAGE_FIELDS, f"SSL image '{relative}'")
        if record["source_id"] not in sources:
            raise ValueError(f"SSL image '{relative}' references unknown source_id")
        if record["banana_leaf_status"] not in RELEVANCE_STATES:
            raise ValueError(f"Invalid banana_leaf_status for SSL image '{relative}'")
        if record["banana_leaf_status"] != "requires_review" and not all(
            record[field] not in UNRESOLVED_VALUES
            for field in ("relevance_reviewer", "relevance_reviewed_at", "relevance_evidence")
        ):
            raise ValueError(f"Resolved banana-leaf decision lacks review evidence: {relative}")
        if relative in normalized_images:
            raise ValueError(f"Repeated normalized SSL image path: {relative}")
        normalized_images[relative] = dict(record)
    return {
        "schema_version": SCHEMA_VERSION,
        "registry_version": registry["registry_version"],
        "sources": sources,
        "images": normalized_images,
    }


def load_near_reviews(path: str | Path | None) -> dict[str, dict[str, str]]:
    if path is None:
        return {}
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if payload.get("schema_version") != SCHEMA_VERSION or not isinstance(payload.get("reviews"), dict):
        raise ValueError("Unsupported SSL near-duplicate review manifest")
    reviews: dict[str, dict[str, str]] = {}
    for key, review in payload["reviews"].items():
        if not isinstance(key, str) or not isinstance(review, dict):
            raise ValueError("SSL near reviews must map review keys to objects")
        unknown = set(review) - {"decision", "reviewer", "reviewed_at", "evidence_note"}
        if unknown:
            raise ValueError(f"SSL near review '{key}' contains unknown fields: {sorted(unknown)}")
        decision = review.get("decision")
        if decision not in NEAR_DECISIONS:
            raise ValueError(f"Invalid SSL near-duplicate decision for '{key}'")
        if decision != "requires_review":
            _non_empty_strings(review, ("reviewer", "reviewed_at", "evidence_note"), f"SSL near review '{key}'")
        reviews[key] = dict(review)
    return reviews


def _inspect(path: Path, config: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    if path.suffix.lower() not in set(config["allowed_extensions"]):
        return None, "unsupported_extension"
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            with Image.open(path) as source:
                source.verify()
            with Image.open(path) as source:
                oriented = ImageOps.exif_transpose(source)
                oriented.load()
                width, height = oriented.size
                mode = oriented.mode
                dhash = flip_aware_difference_hash(oriented.convert("RGB"))
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Warning) as error:
        return None, f"unreadable_image:{type(error).__name__}"
    if width < config["minimum_width"] or height < config["minimum_height"]:
        return None, "below_minimum_dimensions"
    return {
        "sha256": sha256_file(path),
        "width": width,
        "height": height,
        "original_mode": mode,
        "flip_aware_dhash64": f"{dhash:016x}",
        "_dhash_int": dhash,
    }, None


def _heldout(path: str | Path | None) -> dict[str, Any] | None:
    if path is None:
        return None
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    _verify_fingerprint(payload, "manifest_fingerprint")
    required = {
        "excluded_paths", "excluded_sha256", "excluded_split_unit_ids",
        "excluded_group_ids", "records",
    }
    if payload.get("excluded_partitions") != ["validation", "test"] or not required <= set(payload):
        raise ValueError("Invalid frozen SSL exclusion manifest")
    return payload


def _identity(source_id: str, value: str, field: str) -> str | None:
    return None if value in UNRESOLVED_VALUES else f"{field}::{source_id}::{value}"


def _near_key(external_path: str, other_scope: str, other_path: str) -> str:
    left = f"external::{external_path}"
    right = f"{other_scope}::{other_path}"
    return "||".join(sorted((left, right)))


def build_ssl_manifest(
    ssl_root: str | Path,
    source_registry_path: str | Path,
    labeled_dataset_root: str | Path,
    heldout_exclusion_path: str | Path | None,
    config_path: str | Path,
    near_review_path: str | Path | None = None,
) -> dict[str, Any]:
    root = Path(ssl_root).expanduser().resolve()
    labeled_root = Path(labeled_dataset_root).expanduser().resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"External SSL root does not exist: {root}")
    if root == labeled_root or root in labeled_root.parents or labeled_root in root.parents:
        raise ValueError("External SSL root must be physically separate from the labeled dataset root")
    config = load_ssl_config(config_path)
    registry = load_source_registry(source_registry_path)
    reviews = load_near_reviews(near_review_path)
    heldout = _heldout(heldout_exclusion_path)
    # Repository placeholders and OS metadata are administrative files, not
    # acquired imagery. Non-hidden unsupported files remain inventory items and
    # are reported invalid instead of being silently skipped.
    files = sorted(
        path for path in root.rglob("*")
        if path.is_file() and path.name not in {".gitkeep", ".DS_Store", "Thumbs.db"}
    )
    relative_files = [_normalize(str(path.relative_to(root))) for path in files]
    rows: dict[str, dict[str, Any]] = {}
    valid: dict[str, dict[str, Any]] = {}
    for path, relative in zip(files, relative_files):
        inspection, error = _inspect(path, config)
        record = registry["images"].get(relative)
        reasons: list[str] = []
        if error:
            reasons.append(f"invalid:{error}")
        if record is None:
            reasons.append("metadata:missing_source_registry_record")
        if inspection:
            valid[relative] = inspection
        rows[relative] = {
            "image_path": relative,
            **({key: value for key, value in inspection.items() if not key.startswith("_")} if inspection else {}),
            "provenance": record,
            "decision": "rejected",
            "reason_codes": reasons,
            "near_duplicate_review_keys": [],
        }

    exact_primary: dict[str, list[str]] = defaultdict(list)
    primary_hashes: dict[str, dict[str, Any]] = {}
    heldout_paths = set(heldout["excluded_paths"]) if heldout else set()
    if files:
        if not labeled_root.is_dir():
            raise FileNotFoundError(f"Labeled dataset root does not exist: {labeled_root}")
        for path in sorted(path for path in labeled_root.rglob("*") if path.is_file()):
            if path.suffix.lower() not in set(config["allowed_extensions"]):
                continue
            relative = _normalize(str(path.relative_to(labeled_root)))
            inspection, error = _inspect(path, {**config, "minimum_width": 1, "minimum_height": 1})
            if error or inspection is None:
                continue
            exact_primary[inspection["sha256"]].append(relative)
            primary_hashes[relative] = inspection

    exact_candidates: dict[str, list[str]] = defaultdict(list)
    for relative, inspection in valid.items():
        exact_candidates[inspection["sha256"]].append(relative)
    duplicate_candidates: set[str] = set()
    for digest, members in exact_candidates.items():
        if digest in exact_primary:
            for relative in members:
                duplicate_candidates.add(relative)
                rows[relative]["reason_codes"].append("duplicate:exact_labeled_inventory")
                rows[relative]["exact_duplicate_of"] = exact_primary[digest]
        else:
            representative = sorted(members)[0]
            for relative in sorted(members)[1:]:
                duplicate_candidates.add(relative)
                rows[relative]["reason_codes"].append("duplicate:exact_external_candidate")
                rows[relative]["exact_duplicate_of"] = [representative]

    near_pairs: list[dict[str, Any]] = []
    near_candidate_paths: set[str] = set()
    unresolved_review_keys: set[str] = set()
    related_internal = DisjointSet(valid)
    primary_values: dict[int, list[str]] = defaultdict(list)
    primary_tree = HammingBkTree()
    for relative, inspection in primary_hashes.items():
        value = inspection["_dhash_int"]
        if value not in primary_values:
            primary_tree.add(value)
        primary_values[value].append(relative)
    threshold = config["near_duplicate_hamming_distance"]
    for external_path, inspection in sorted(valid.items()):
        for matched in primary_tree.query(inspection["_dhash_int"], threshold):
            for primary_path in primary_values[matched]:
                if inspection["sha256"] == primary_hashes[primary_path]["sha256"]:
                    continue
                key = _near_key(external_path, "labeled", primary_path)
                review = reviews.get(key, {"decision": "requires_review", "reviewer": "", "reviewed_at": "", "evidence_note": ""})
                pair = {
                    "review_key": key,
                    "external_path": external_path,
                    "other_scope": "labeled",
                    "other_path": primary_path,
                    "other_partition": "held_out" if primary_path in heldout_paths else "labeled_inventory",
                    "sha256_external": inspection["sha256"],
                    "sha256_other": primary_hashes[primary_path]["sha256"],
                    "flip_aware_dhash64_external": inspection["flip_aware_dhash64"],
                    "flip_aware_dhash64_other": primary_hashes[primary_path]["flip_aware_dhash64"],
                    "hamming_distance": (inspection["_dhash_int"] ^ matched).bit_count(),
                    **review,
                }
                near_pairs.append(pair)
                near_candidate_paths.add(external_path)
                rows[external_path]["near_duplicate_review_keys"].append(key)
                if review["decision"] == "requires_review":
                    unresolved_review_keys.add(key)
                    rows[external_path]["reason_codes"].append("near_duplicate:requires_review")
                elif review["decision"] == "related":
                    rows[external_path]["reason_codes"].append("near_duplicate:related_to_labeled")

    external_values: dict[int, list[str]] = defaultdict(list)
    external_tree = HammingBkTree()
    for external_path, inspection in sorted(valid.items()):
        value = inspection["_dhash_int"]
        for matched in external_tree.query(value, threshold):
            for other_path in external_values[matched]:
                if inspection["sha256"] == valid[other_path]["sha256"]:
                    continue
                key = _near_key(external_path, "external", other_path)
                review = reviews.get(key, {"decision": "requires_review", "reviewer": "", "reviewed_at": "", "evidence_note": ""})
                pair = {
                    "review_key": key,
                    "external_path": external_path,
                    "other_scope": "external",
                    "other_path": other_path,
                    "other_partition": "external_ssl",
                    "sha256_external": inspection["sha256"],
                    "sha256_other": valid[other_path]["sha256"],
                    "flip_aware_dhash64_external": inspection["flip_aware_dhash64"],
                    "flip_aware_dhash64_other": valid[other_path]["flip_aware_dhash64"],
                    "hamming_distance": (value ^ matched).bit_count(),
                    **review,
                }
                near_pairs.append(pair)
                near_candidate_paths.update((external_path, other_path))
                rows[external_path]["near_duplicate_review_keys"].append(key)
                rows[other_path]["near_duplicate_review_keys"].append(key)
                if review["decision"] == "requires_review":
                    unresolved_review_keys.add(key)
                    rows[external_path]["reason_codes"].append("near_duplicate:requires_review")
                    rows[other_path]["reason_codes"].append("near_duplicate:requires_review")
                elif review["decision"] == "related":
                    related_internal.union(external_path, other_path)
        if value not in external_values:
            external_tree.add(value)
        external_values[value].append(external_path)

    related_components: dict[str, list[str]] = defaultdict(list)
    for relative in sorted(valid):
        related_components[related_internal.find(relative)].append(relative)
    for members in related_components.values():
        if len(members) <= 1:
            continue
        representative = sorted(members)[0]
        for relative in sorted(members)[1:]:
            rows[relative]["reason_codes"].append("near_duplicate:related_external_nonrepresentative")

    heldout_groups = set(heldout["excluded_group_ids"]) if heldout else set()
    heldout_units = set(heldout["excluded_split_unit_ids"]) if heldout else set()
    heldout_sources = {
        record.get("source_dataset", "unknown") for record in heldout["records"]
    } if heldout else set()
    heldout_identities: dict[str, set[str]] = {field: set() for field in ("plant_id", "leaf_id", "acquisition_session")}
    if heldout:
        for record in heldout["records"]:
            source_id = record.get("source_dataset", "unknown")
            for field in heldout_identities:
                identity = _identity(source_id, record.get(field, "unknown"), field)
                if identity:
                    heldout_identities[field].add(identity)

    for relative, row in rows.items():
        record = registry["images"].get(relative)
        reasons = row["reason_codes"]
        if record:
            source = registry["sources"][record["source_id"]]
            row["source_snapshot"] = source
            if source["license_status"] != "approved":
                reasons.append(f"license:{source['license_status']}")
            elif any(source[field] in UNRESOLVED_VALUES for field in ("license_name", "license_url")):
                reasons.append("license:incomplete_evidence")
            if any(source[field] in UNRESOLVED_VALUES for field in ("source_name", "source_url", "accessed_at", "citation")):
                reasons.append("provenance:incomplete_source")
            if any(record[field] in UNRESOLVED_VALUES for field in ("source_item_id", "original_filename", "acquired_at")):
                reasons.append("provenance:incomplete_image_record")
            relevance = record["banana_leaf_status"]
            if relevance == "non_banana":
                reasons.append("relevance:non_banana")
            elif relevance != "confirmed_banana_leaf":
                reasons.append("relevance:requires_review")
            group_id = record["biological_group_id"]
            if group_id not in UNRESOLVED_VALUES and (group_id in heldout_groups or group_id in heldout_units):
                reasons.append("biological_overlap:group_id")
            for field in heldout_identities:
                identity = _identity(record["source_id"], record[field], field)
                if identity and identity in heldout_identities[field]:
                    reasons.append(f"biological_overlap:{field}")
            biological_values = (
                record["biological_group_id"], record["plant_id"], record["leaf_id"],
                record["acquisition_session"],
            )
            if record["source_id"] in heldout_sources and all(
                value in UNRESOLVED_VALUES for value in biological_values
            ):
                reasons.append("biological_overlap:unresolved_identity_with_heldout_source")
        if heldout is None:
            reasons.append("gate:missing_frozen_heldout_exclusion")
        row["reason_codes"] = sorted(set(reasons))
        row["decision"] = "accepted" if not row["reason_codes"] else "rejected"
        row["near_duplicate_review_keys"] = sorted(set(row["near_duplicate_review_keys"]))

    unknown_reviews = sorted(set(reviews) - {pair["review_key"] for pair in near_pairs})
    if unknown_reviews:
        raise ValueError(f"SSL near-review manifest contains stale/unknown keys: {unknown_reviews[:3]}")
    stale_registry = sorted(set(registry["images"]) - set(relative_files))
    accepted = [rows[path] for path in sorted(rows) if rows[path]["decision"] == "accepted"]
    invalid = {
        path for path, row in rows.items()
        if any(reason.startswith("invalid:") for reason in row["reason_codes"])
    }
    non_banana = {
        path for path, row in rows.items()
        if "relevance:non_banana" in row["reason_codes"]
    }
    target = config["target_count"]
    summary = {
        "acquired": len(files),
        "accepted": len(accepted),
        "rejected": len(files) - len(accepted),
        "duplicate": len(duplicate_candidates),
        "near_duplicate": len(near_candidate_paths),
        "invalid": len(invalid),
        "non_banana": len(non_banana),
        "total_ssl_ready": len(accepted),
        "near_duplicate_pairs": len(near_pairs),
        "unresolved_near_duplicate_pairs": len(unresolved_review_keys),
        "stale_registry_records": len(stale_registry),
        "target_count": target,
        "target_shortage": max(0, target - len(accepted)),
        "target_reached": len(accepted) >= target,
    }
    status = "empty" if not files else ("ready" if accepted else "blocked")
    if accepted and len(accepted) < target:
        status = "ready_with_shortfall"
    input_paths = {
        "source_registry": Path(source_registry_path).resolve(),
        "config": Path(config_path).resolve(),
    }
    if heldout_exclusion_path:
        input_paths["heldout_exclusion"] = Path(heldout_exclusion_path).resolve()
    if near_review_path:
        input_paths["near_reviews"] = Path(near_review_path).resolve()
    payload: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "ssl_version": config["ssl_version"],
        "status": status,
        "configuration": config,
        "dataset_root": str(root),
        "labeled_dataset_root": str(labeled_root),
        "input_artifacts": {
            name: {"path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            for name, path in input_paths.items()
        },
        "summary": summary,
        "sources": [registry["sources"][key] for key in sorted(registry["sources"])],
        "records": [rows[path] for path in sorted(rows)],
        "ssl_ready_records": accepted,
        "near_duplicate_pairs": sorted(near_pairs, key=lambda pair: pair["review_key"]),
        "stale_registry_paths": stale_registry,
        "policies": {
            "disease_labels_required": False,
            "files_copied_moved_or_deleted": False,
            "public_ssl_separate_from_labeled_cohort": True,
            "validation_test_pixels_allowed": False,
            "unknown_biological_metadata_fabricated": False,
        },
    }
    payload["manifest_fingerprint"] = _json_fingerprint(payload)
    return payload


def write_ssl_manifest(payload: dict[str, Any], output: str | Path) -> Path:
    destination = Path(output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    if destination.is_file() and destination.read_text(encoding="utf-8") != serialized:
        existing = json.loads(destination.read_text(encoding="utf-8"))
        if existing.get("ssl_version") == payload.get("ssl_version") and existing.get("status") not in {"empty", "blocked"}:
            raise ValueError(
                f"Versioned SSL manifest already exists with different content: {destination}. "
                "Use a new ssl_version/output path."
            )
    destination.write_text(serialized, encoding="utf-8")
    return destination.resolve()


def load_ssl_dataset_records(
    manifest_path: str | Path,
    ssl_root: str | Path,
    heldout_exclusion_path: str | Path,
):
    """Load only fingerprinted SSL-ready rows and recheck held-out identities."""
    from ai.data.dataset import ImageRecord

    payload = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    _verify_fingerprint(payload, "manifest_fingerprint")
    if payload.get("status") not in {"ready", "ready_with_shortfall"}:
        raise ValueError(f"External SSL manifest is not ready: {payload.get('status')}")
    heldout = _heldout(heldout_exclusion_path)
    if heldout is None:
        raise ValueError("Frozen held-out SSL exclusion manifest is required")
    root = Path(ssl_root).expanduser().resolve()
    if Path(payload.get("dataset_root", "")).resolve() != root:
        raise ValueError("External SSL manifest dataset root does not match configuration")
    heldout_input = payload.get("input_artifacts", {}).get("heldout_exclusion", {})
    if heldout_input.get("sha256") != hashlib.sha256(Path(heldout_exclusion_path).read_bytes()).hexdigest():
        raise ValueError("Frozen held-out exclusion changed after SSL manifest creation")
    excluded_hashes = set(heldout["excluded_sha256"])
    excluded_groups = set(heldout["excluded_group_ids"]) | set(heldout["excluded_split_unit_ids"])
    result = []
    for row in payload.get("ssl_ready_records", []):
        if row.get("decision") != "accepted" or row.get("reason_codes"):
            raise ValueError(f"Non-accepted row entered SSL ready records: {row.get('image_path')}")
        path = (root / row["image_path"]).resolve()
        try:
            path.relative_to(root)
        except ValueError as error:
            raise ValueError(f"SSL manifest path escapes dataset root: {row['image_path']}") from error
        if not path.is_file() or sha256_file(path) != row["sha256"]:
            raise ValueError(f"External SSL image changed after manifest creation: {path}")
        provenance = row["provenance"]
        group_id = provenance["biological_group_id"]
        effective_group = (
            group_id if group_id not in UNRESOLVED_VALUES
            else f"ssl-unresolved::{provenance['source_id']}::{row['sha256']}"
        )
        if row["sha256"] in excluded_hashes or effective_group in excluded_groups:
            raise ValueError(f"Held-out image/group entered external SSL manifest: {path}")
        result.append(ImageRecord(
            path=str(path), label=-1, class_name="unlabeled", sha256=row["sha256"],
            group_id=effective_group, source=provenance["source_id"],
            plant_id=provenance["plant_id"], leaf_id=provenance["leaf_id"],
            site_id=provenance["location"], session_id=provenance["acquisition_session"],
            origin_type=row["source_snapshot"]["source_type"],
            capture_device=provenance["capture_device"],
            acquisition_date=provenance["capture_date"],
            species_review_status="banana", visibility_quality_status="acceptable",
            inclusion_status="included", label_validator="not-applicable-unlabeled",
            label_review_status="not-applicable-unlabeled",
        ))
    if len(result) != payload["summary"]["total_ssl_ready"]:
        raise ValueError("External SSL ready count does not match manifest summary")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ssl-root", required=True)
    parser.add_argument("--source-registry", required=True)
    parser.add_argument("--labeled-dataset-root", required=True)
    parser.add_argument("--heldout-exclusion")
    parser.add_argument("--near-reviews")
    parser.add_argument("--config", default="ai/config/ssl_ingestion_v1.json")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    payload = build_ssl_manifest(
        args.ssl_root, args.source_registry, args.labeled_dataset_root,
        args.heldout_exclusion, args.config, args.near_reviews,
    )
    destination = write_ssl_manifest(payload, args.output)
    print(json.dumps({
        "ssl_manifest": str(destination),
        "status": payload["status"],
        **payload["summary"],
        "manifest_fingerprint": payload["manifest_fingerprint"],
    }, indent=2))
    if payload["status"] in {"empty", "blocked"}:
        raise SystemExit("EXTERNAL SSL NOT READY: no admissible external images; see manifest")


if __name__ == "__main__":
    main()
