"""Image validation, leakage checks, persistent splits, and tf.data I/O."""

from __future__ import annotations

import hashlib
import json
import random
import warnings
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from ai.config.config import ExperimentConfig
from ai.data.metadata_manifest import (
    LEGACY_DEFAULTS,
    LEGACY_FIELDS,
    enrich_metadata,
    load_manifest_payload,
    validation_report as build_metadata_validation_report,
    write_manifest as write_metadata_manifest,
)


def _require_tensorflow():
    try:
        import tensorflow as tf
    except ModuleNotFoundError as error:
        raise RuntimeError(
            "TensorFlow is required for decoding and training pipelines. "
            "Install the AI dependencies with: python -m pip install -r ai/requirements.txt"
        ) from error
    return tf


@dataclass(frozen=True)
class ImageRecord:
    path: str
    label: int
    class_name: str
    sha256: str
    group_id: str
    source: str = "unknown"
    plant_id: str = "unknown"
    leaf_id: str = "unknown"
    site_id: str = "unknown"
    session_id: str = "unknown"
    origin_type: str = "unknown"
    capture_device: str = "unknown"
    acquisition_date: str = "unknown"
    field_subset: str = "none"
    species_review_status: str = "pending"
    visibility_quality_status: str = "pending"
    inclusion_status: str = "pending"
    label_validator: str = "unknown"
    label_review_status: str = "pending"


@dataclass
class DatasetSplits:
    class_names: list[str]
    train: list[ImageRecord]
    validation: list[ImageRecord]
    test: list[ImageRecord]
    ssl_unlabeled: list[ImageRecord] = field(default_factory=list)
    final_field_test: list[ImageRecord] = field(default_factory=list)


@dataclass(frozen=True)
class ImageInventoryValidation:
    hashes_by_path: dict[Path, str]
    perceptual_hashes_by_path: dict[Path, int]
    report_path: Path
    scanned_count: int
    rejected_count: int
    quarantined_count: int
    exact_duplicate_count: int
    near_duplicate_pair_count: int


METADATA_FIELDS = LEGACY_FIELDS
METADATA_DEFAULTS = LEGACY_DEFAULTS


def require_dataset_dir(config: ExperimentConfig) -> Path:
    if not config.data.dataset_dir:
        raise ValueError(
            "No dataset path was supplied. Set data.dataset_dir in a config JSON or pass --dataset-dir."
        )
    root = Path(config.data.dataset_dir).expanduser().resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"Dataset directory does not exist: {root}")
    return root


def _image_paths(directory: Path, extensions: Sequence[str]) -> list[Path]:
    allowed = {extension.lower() for extension in extensions}
    return sorted(path for path in directory.rglob("*") if path.is_file() and path.suffix.lower() in allowed)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise OSError(f"Could not read image: {path}: {error}") from error
    return digest.hexdigest()


def _candidate_class(path: Path, root: Path) -> str | None:
    parts = path.relative_to(root).parts
    if not parts:
        return None
    if parts[0] in {"train", "validation", "val", "test"}:
        return parts[1] if len(parts) > 1 else None
    return parts[0]


def _difference_hash(image: Image.Image) -> int:
    resized = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = resized.tobytes()
    value = 0
    for row in range(8):
        offset = row * 9
        for column in range(8):
            value = (value << 1) | int(pixels[offset + column] > pixels[offset + column + 1])
    return value


def _flip_aware_difference_hash(image: Image.Image) -> int:
    variants = (
        image,
        image.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
        image.transpose(Image.Transpose.FLIP_TOP_BOTTOM),
        image.transpose(Image.Transpose.ROTATE_180),
    )
    return min(_difference_hash(variant) for variant in variants)


class _HammingBkTree:
    """BK-tree for a reusable, sub-quadratic perceptual-hash sweep."""

    def __init__(self) -> None:
        self._nodes: list[tuple[int, dict[int, int]]] = []

    def add(self, value: int) -> None:
        if not self._nodes:
            self._nodes.append((value, {}))
            return
        index = 0
        while True:
            current, children = self._nodes[index]
            distance = (current ^ value).bit_count()
            child = children.get(distance)
            if child is None:
                children[distance] = len(self._nodes)
                self._nodes.append((value, {}))
                return
            index = child

    def query(self, value: int, radius: int) -> set[int]:
        if not self._nodes:
            return set()
        matches: set[int] = set()
        pending = [0]
        while pending:
            current, children = self._nodes[pending.pop()]
            distance = (current ^ value).bit_count()
            if distance <= radius:
                matches.add(current)
            lower, upper = distance - radius, distance + radius
            pending.extend(index for edge, index in children.items() if lower <= edge <= upper)
        return matches


def load_near_duplicate_reviews(path: str | Path | None) -> dict[str, dict[str, str]]:
    if path is None:
        return {}
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Near-duplicate review manifest not found: {source}")
    payload = json.loads(source.read_text(encoding="utf-8"))
    pairs = payload.get("pairs", payload) if isinstance(payload, dict) else None
    if isinstance(pairs, list):
        pairs = {pair.get("review_key"): pair for pair in pairs if isinstance(pair, dict)}
    if not isinstance(pairs, dict):
        raise ValueError("Near-duplicate review manifest must contain an object or list named 'pairs'")
    allowed_decisions = {
        "same_image",
        "same_leaf_or_related_capture",
        "visually_similar_but_independent",
        "not_duplicate",
        "requires_review",
        # Schema-v1 compatibility only.
        "grouped",
        "exclude_a",
        "exclude_b",
    }
    normalized: dict[str, dict[str, str]] = {}
    for key, review in pairs.items():
        if not isinstance(key, str) or "||" not in key or not isinstance(review, dict):
            raise ValueError("Near-duplicate review keys must use 'path_a||path_b' and map to objects")
        decision = review.get("decision")
        reviewer = review.get("reviewer")
        reviewed_at = review.get("reviewed_at")
        resolved = decision != "requires_review"
        if decision not in allowed_decisions or (resolved and not all(
            isinstance(value, str) and value.strip() for value in (reviewer, reviewed_at)
        )):
            raise ValueError(
                f"Near-duplicate review '{key}' needs a valid decision, reviewer, and reviewed_at"
            )
        left, right = key.split("||", 1)
        canonical_key = "||".join(sorted((left.replace("\\", "/"), right.replace("\\", "/"))))
        normalized[canonical_key] = {
            "decision": decision,
            "reviewer": reviewer,
            "reviewed_at": reviewed_at,
            "notes": str(review.get("evidence_note", review.get("notes", ""))),
        }
    return normalized


def write_near_duplicate_review_template(
    near_duplicate_pairs: Sequence[dict[str, Any]], destination: str | Path
) -> Path:
    pairs: dict[str, dict[str, str]] = {}
    for pair in near_duplicate_pairs:
        path_a, path_b = sorted((pair["path_a"], pair["path_b"]))
        key = pair.get("review_key", f"{path_a}||{path_b}")
        pairs[key] = pair.get("review") or {
            "decision": "requires_review",
            "reviewer": "",
            "reviewed_at": "",
            "evidence_note": "",
        }
    template = {
        "schema_version": 2,
        "allowed_decisions": [
            "same_image",
            "same_leaf_or_related_capture",
            "visually_similar_but_independent",
            "not_duplicate",
            "requires_review",
        ],
        "instructions": (
            "Visually inspect every pair. Confirmed same-image or related-capture decisions require "
            "one shared group_manifest ID. This workflow never deletes images or changes labels."
        ),
        "pairs": pairs,
    }
    output = Path(destination)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(template, indent=2), encoding="utf-8")
    return output.resolve()


def validate_image_inventory(
    root: Path,
    class_names: Sequence[str],
    quarantined_class_names: Sequence[str],
    allowed_extensions: Sequence[str],
    report_path: str | Path,
    near_duplicate_hamming_distance: int = 6,
    near_duplicate_reviews: dict[str, dict[str, str]] | None = None,
    metadata_map: dict[str, dict[str, str]] | None = None,
    quality_report_path: str | Path | None = None,
) -> ImageInventoryValidation:
    """Validate, exact-deduplicate, quarantine, and near-duplicate-screen images."""
    allowed = {extension.lower() for extension in allowed_extensions}
    candidates = sorted(
        path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in allowed
    )
    valid_classes = set(class_names)
    reviews = near_duplicate_reviews or {}
    quarantined_classes = set(quarantined_class_names)
    candidates_by_hash: dict[str, list[dict[str, Any]]] = {}
    rejected: list[dict] = []
    quarantined: list[dict] = []
    accepted_by_class = {class_name: 0 for class_name in class_names}
    rejected_by_reason: dict[str, int] = {}
    quality_excluded: list[dict[str, str]] = []

    for path in candidates:
        relative = str(path.relative_to(root)).replace("\\", "/")
        class_name = _candidate_class(path, root)
        reasons: list[dict[str, str]] = []
        width: int | None = None
        height: int | None = None
        source_mode: str | None = None
        perceptual_hash: int | None = None
        metadata = {**METADATA_DEFAULTS, **(metadata_map or {}).get(relative, {})}

        if class_name not in valid_classes and class_name not in quarantined_classes:
            reasons.append({
                "code": "invalid_class",
                "message": (
                    f"Image class '{class_name}' is neither active {list(class_names)} "
                    f"nor quarantined {list(quarantined_class_names)}"
                ),
            })

        quality_reason = None
        if metadata["species_review_status"] in {"non_banana", "incorrect_species"}:
            quality_reason = "incorrect_species"
        elif metadata["visibility_quality_status"] in {"reject", "unusable", "severely_blurred", "obscured"}:
            quality_reason = "visibility_or_quality"
        elif metadata["inclusion_status"] in {"excluded", "uncertain_label"}:
            quality_reason = "excluded_or_not_confidently_assignable"
        if quality_reason:
            reasons.append({"code": quality_reason, "message": "Excluded by reviewed harmonization/quality metadata"})
            quality_excluded.append({"path": relative, "reason": quality_reason})

        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error")
                with Image.open(path) as image:
                    image.verify()
                with Image.open(path) as image:
                    image.load()
                    width, height = image.size
                    source_mode = image.mode
                    if width <= 0 or height <= 0:
                        reasons.append({
                            "code": "invalid_dimensions",
                            "message": f"Image dimensions must be positive; received {width}x{height}",
                        })
                    try:
                        rgb = image.convert("RGB")
                        rgb.load()
                        if rgb.mode != "RGB":
                            raise ValueError(f"conversion returned mode {rgb.mode}")
                        perceptual_hash = _flip_aware_difference_hash(rgb)
                    except (OSError, ValueError) as error:
                        reasons.append({"code": "rgb_conversion_failed", "message": str(error)})
        except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Warning) as error:
            reasons.append({"code": "unreadable_image", "message": str(error)})

        digest: str | None = None
        if not reasons:
            try:
                digest = _sha256(path)
            except OSError as error:
                reasons.append({"code": "unreadable_image", "message": str(error)})

        if reasons:
            for reason in reasons:
                code = reason["code"]
                rejected_by_reason[code] = rejected_by_reason.get(code, 0) + 1
            rejected.append({
                "path": relative,
                "class_name": class_name,
                "width": width,
                "height": height,
                "source_mode": source_mode,
                "reasons": reasons,
            })
            continue

        if digest is None or perceptual_hash is None:
            raise RuntimeError(f"Validated image has incomplete hashes: {path}")
        item: dict[str, Any] = {
            "path": path.resolve(),
            "relative_path": relative,
            "class_name": class_name,
            "sha256": digest,
            "dhash64": f"{perceptual_hash:016x}",
            "perceptual_hash": perceptual_hash,
            "width": width,
            "height": height,
            "source_mode": source_mode,
        }
        if class_name in quarantined_classes:
            quarantined.append({
                key: value for key, value in item.items() if key not in {"path", "perceptual_hash"}
            })
            continue
        candidates_by_hash.setdefault(digest, []).append(item)

    hashes_by_path: dict[Path, str] = {}
    perceptual_hashes_by_path: dict[Path, int] = {}
    exact_duplicate_groups: list[dict[str, Any]] = []
    cross_label_exact_conflicts: list[dict[str, Any]] = []
    canonical_items: list[dict[str, Any]] = []
    for digest, group in sorted(candidates_by_hash.items()):
        group.sort(key=lambda item: item["relative_path"])
        labels = sorted({item["class_name"] for item in group})
        if len(labels) > 1:
            cross_label_exact_conflicts.append({
                "sha256": digest,
                "classes": labels,
                "paths": [item["relative_path"] for item in group],
            })
            continue
        canonical = group[0]
        canonical_items.append(canonical)
        hashes_by_path[canonical["path"]] = digest
        perceptual_hashes_by_path[canonical["path"]] = canonical["perceptual_hash"]
        accepted_by_class[canonical["class_name"]] += 1
        if len(group) > 1:
            exact_duplicate_groups.append({
                "sha256": digest,
                "class_name": canonical["class_name"],
                "kept": canonical["relative_path"],
                "excluded_copies": [item["relative_path"] for item in group[1:]],
            })

    tree = _HammingBkTree()
    items_by_perceptual_hash: dict[int, list[dict[str, Any]]] = {}
    near_duplicate_pairs: list[dict[str, Any]] = []
    excluded_by_review: set[str] = set()
    for item in sorted(canonical_items, key=lambda value: value["relative_path"]):
        value = item["perceptual_hash"]
        for matched_hash in tree.query(value, near_duplicate_hamming_distance):
            distance = (value ^ matched_hash).bit_count()
            for previous in items_by_perceptual_hash[matched_hash]:
                first, second = sorted((previous, item), key=lambda value: value["relative_path"])
                path_a, path_b = first["relative_path"], second["relative_path"]
                review_key = f"{path_a}||{path_b}"
                review = reviews.get(review_key)
                if review and review["decision"] == "exclude_a":
                    excluded_by_review.add(path_a)
                elif review and review["decision"] == "exclude_b":
                    excluded_by_review.add(path_b)
                near_duplicate_pairs.append({
                    "review_key": review_key,
                    "path_a": path_a,
                    "path_b": path_b,
                    "class_a": first["class_name"],
                    "class_b": second["class_name"],
                    "hamming_distance": distance,
                    "requires_review": review is None or review["decision"] == "requires_review",
                    "review": review,
                })
        if value not in items_by_perceptual_hash:
            tree.add(value)
            items_by_perceptual_hash[value] = []
        items_by_perceptual_hash[value].append(item)

    if excluded_by_review:
        for item in canonical_items:
            if item["relative_path"] not in excluded_by_review:
                continue
            hashes_by_path.pop(item["path"], None)
            perceptual_hashes_by_path.pop(item["path"], None)
            accepted_by_class[item["class_name"]] -= 1
        for pair in near_duplicate_pairs:
            if pair["path_a"] in excluded_by_review or pair["path_b"] in excluded_by_review:
                pair["requires_review"] = False
                if pair["review"] is None:
                    pair["resolved_by_other_exclusion"] = True
    unresolved_near_duplicates = sum(pair["requires_review"] for pair in near_duplicate_pairs)
    unused_reviews = sorted(set(reviews) - {pair["review_key"] for pair in near_duplicate_pairs})

    destination = Path(report_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "schema_version": 1,
        "dataset_root": str(root),
        "valid_classes": list(class_names),
        "quarantined_classes": list(quarantined_class_names),
        "allowed_extensions": sorted(allowed),
        "summary": {
            "scanned": len(candidates),
            "accepted": len(hashes_by_path),
            "rejected": len(rejected),
            "quarantined": len(quarantined),
            "exact_duplicate_groups": len(exact_duplicate_groups),
            "exact_duplicate_copies_excluded": sum(
                len(group["excluded_copies"]) for group in exact_duplicate_groups
            ),
            "cross_label_exact_conflicts": len(cross_label_exact_conflicts),
            "near_duplicate_pairs_total": len(near_duplicate_pairs),
            "near_duplicate_pairs_requiring_review": unresolved_near_duplicates,
            "near_duplicate_pairs_reviewed": len(near_duplicate_pairs) - unresolved_near_duplicates,
            "near_duplicate_images_excluded_by_review": len(excluded_by_review),
            "accepted_by_class": accepted_by_class,
            "rejected_by_reason": dict(sorted(rejected_by_reason.items())),
        },
        "rejected_images": rejected,
        "quarantined_images": quarantined,
        "exact_duplicate_groups": exact_duplicate_groups,
        "cross_label_exact_conflicts": cross_label_exact_conflicts,
        "near_duplicate_method": {
            "algorithm": "flip-aware 64-bit difference hash",
            "hamming_distance_threshold": near_duplicate_hamming_distance,
            "automatic_action": (
                "unreviewed pairs block formal splitting; reviewed decisions may mark a false match, "
                "require one explicit group, or exclude one image without deleting source files"
            ),
        },
        "near_duplicate_pairs": near_duplicate_pairs,
        "unused_near_duplicate_reviews": unused_reviews,
    }
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    if quality_report_path is not None:
        quality_destination = Path(quality_report_path)
        quality_destination.parent.mkdir(parents=True, exist_ok=True)
        quality_destination.write_text(json.dumps({
            "schema_version": 1,
            "processing_stage": "harmonization_and_quality_control_before_duplicate_screening_grouping_and_split",
            "eligible_images_after_inventory_validation": len(hashes_by_path),
            "excluded_images": quality_excluded,
        }, indent=2), encoding="utf-8")
    write_near_duplicate_review_template(
        near_duplicate_pairs, destination.parent / "near_duplicate_review_template.json"
    )
    if cross_label_exact_conflicts:
        example = cross_label_exact_conflicts[0]
        raise ValueError(
            "Identical image bytes occur under different class labels; correct the dataset before training. "
            f"Example SHA-256 {example['sha256']} occurs in {example['classes']}. "
            f"See {destination.resolve()}."
        )
    return ImageInventoryValidation(
        hashes_by_path=hashes_by_path,
        perceptual_hashes_by_path=perceptual_hashes_by_path,
        report_path=destination.resolve(),
        scanned_count=len(candidates),
        rejected_count=len(rejected),
        quarantined_count=len(quarantined),
        exact_duplicate_count=sum(len(group["excluded_copies"]) for group in exact_duplicate_groups),
        near_duplicate_pair_count=unresolved_near_duplicates,
    )


def load_metadata_manifest(path: str | Path | None) -> dict[str, dict[str, Any]]:
    """Load schema v1 or v2, preserving v2 evidence while exposing legacy aliases."""
    return load_manifest_payload(path)


def write_metadata_template(
    root: Path,
    class_names: Sequence[str],
    quarantined_class_names: Sequence[str],
    allowed_extensions: Sequence[str],
    destination: str | Path,
) -> Path:
    """Write a deterministic v2 template while preserving reviewed values."""
    payload = enrich_metadata(
        root=root,
        class_names=class_names,
        quarantined_class_names=quarantined_class_names,
        extensions=allowed_extensions,
        existing_path=destination if Path(destination).is_file() else None,
    )
    return write_metadata_manifest(payload, destination)


def write_metadata_coverage_report(
    root: Path,
    active_paths: Iterable[Path],
    metadata_map: dict[str, dict[str, Any]],
    destination: str | Path,
) -> tuple[int, int]:
    payload, missing_count, incomplete_count = build_metadata_validation_report(
        root, active_paths, metadata_map
    )
    output = Path(destination)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return missing_count, incomplete_count


def _records_for_classes(
    class_directories: dict[str, Path],
    class_names: list[str],
    config: ExperimentConfig,
    dataset_root: Path,
    group_map: dict[str, str] | None,
    metadata_map: dict[str, dict[str, Any]],
    hashes_by_path: dict[Path, str],
) -> list[ImageRecord]:
    records: list[ImageRecord] = []
    for label, class_name in enumerate(class_names):
        paths = [
            path
            for path in _image_paths(class_directories[class_name], config.data.allowed_extensions)
            if path.resolve() in hashes_by_path
        ]
        if not paths:
            raise ValueError(f"Class directory contains no supported images: {class_directories[class_name]}")
        for path in paths:
            digest = hashes_by_path[path.resolve()]
            relative = str(path.relative_to(dataset_root)).replace("\\", "/")
            # A group manifest may contain only the known multi-image biological
            # groups. Unlisted records retain the safe exact-hash fallback.
            metadata = {**METADATA_DEFAULTS, **metadata_map.get(relative, {})}
            group_id = group_map.get(relative) if group_map is not None else None
            if not group_id:
                group_id = _metadata_group_id(metadata, digest)
            legacy_metadata = {
                field: metadata.get(field, METADATA_DEFAULTS[field]) for field in METADATA_FIELDS
            }
            records.append(ImageRecord(str(path), label, class_name, digest, group_id, **legacy_metadata))
    return records


def _metadata_group_id(metadata: dict[str, Any], digest: str) -> str:
    """Conservatively derive an indivisible biological/acquisition group."""
    explicit = metadata.get("group_id", "pending")
    if explicit not in {"unknown", "pending", "", "none"}:
        return explicit
    source = metadata.get("source", "unknown")
    site = metadata.get("site_id", "unknown")
    plant = metadata.get("plant_id", "unknown")
    leaf = metadata.get("leaf_id", "unknown")
    session = metadata.get("session_id", "unknown")
    if leaf != "unknown":
        return f"leaf::{source}::{site}::{plant}::{leaf}"
    if plant != "unknown":
        return f"plant::{source}::{site}::{plant}"
    if session != "unknown":
        return f"session::{source}::{site}::{session}"
    return digest


def _validate_hash_labels(records: Iterable[ImageRecord]) -> None:
    labels_by_hash: dict[str, set[str]] = {}
    for record in records:
        labels_by_hash.setdefault(record.sha256, set()).add(record.class_name)
    conflicts = {digest: labels for digest, labels in labels_by_hash.items() if len(labels) > 1}
    if conflicts:
        example_hash, labels = next(iter(conflicts.items()))
        raise ValueError(
            "Identical image bytes occur under different class labels; correct the dataset before training. "
            f"Example SHA-256 {example_hash} occurs in {sorted(labels)}."
        )

    labels_by_group: dict[str, set[str]] = {}
    groups_by_hash: dict[str, set[str]] = {}
    for record in records:
        labels_by_group.setdefault(record.group_id, set()).add(record.class_name)
        groups_by_hash.setdefault(record.sha256, set()).add(record.group_id)
    group_conflicts = {group: labels for group, labels in labels_by_group.items() if len(labels) > 1}
    if group_conflicts:
        group, labels = next(iter(group_conflicts.items()))
        raise ValueError(f"Group '{group}' spans multiple class labels: {sorted(labels)}")
    duplicate_group_conflicts = {digest: groups for digest, groups in groups_by_hash.items() if len(groups) > 1}
    if duplicate_group_conflicts:
        digest, groups = next(iter(duplicate_group_conflicts.items()))
        raise ValueError(
            f"Byte-identical image {digest} has multiple group IDs {sorted(groups)}; assign duplicates to one group"
        )


def _class_directories(root: Path) -> dict[str, Path]:
    return {path.name: path for path in sorted(root.iterdir()) if path.is_dir() and not path.name.startswith(".")}


def _validate_class_directories(
    directories: dict[str, Path], expected_names: Sequence[str], location: Path
) -> list[str]:
    expected = list(expected_names)
    actual = set(directories)
    expected_set = set(expected)
    if actual != expected_set:
        missing = sorted(expected_set - actual)
        unexpected = sorted(actual - expected_set)
        raise ValueError(
            f"Dataset classes at {location} do not match the fixed class contract. "
            f"Missing: {missing or 'none'}; unexpected: {unexpected or 'none'}; "
            f"expected output order: {expected}"
        )
    return expected


def _stratified_group_assignment(
    groups: list[list[ImageRecord]], config: ExperimentConfig, rng: random.Random
) -> dict[str, list[list[ImageRecord]]]:
    """Assign indivisible groups while targeting 70/15/15 image counts."""
    names = ("train", "validation", "test")
    fractions = {
        "train": config.data.train_fraction,
        "validation": config.data.validation_fraction,
        "test": config.data.test_fraction,
    }
    total_images = sum(len(group) for group in groups)
    targets = {name: total_images * fractions[name] for name in names}
    ordered = list(groups)
    rng.shuffle(ordered)
    ordered.sort(key=len, reverse=True)
    assigned: dict[str, list[list[ImageRecord]]] = {name: [] for name in names}
    counts = {name: 0 for name in names}
    for group in ordered:
        destination = max(names, key=lambda name: (targets[name] - counts[name], fractions[name]))
        assigned[destination].append(group)
        counts[destination] += len(group)
    for empty_name in (name for name in names if not assigned[name]):
        donor = max(names, key=lambda name: len(assigned[name]))
        if len(assigned[donor]) <= 1:
            raise ValueError("At least three independent groups are required per class")
        moved = min(assigned[donor], key=len)
        assigned[donor].remove(moved)
        assigned[empty_name].append(moved)
    return assigned


def _split_unsplit_dataset(
    root: Path,
    config: ExperimentConfig,
    group_map: dict[str, str] | None,
    metadata_map: dict[str, dict[str, str]],
    hashes_by_path: dict[Path, str],
) -> DatasetSplits:
    discovered = _class_directories(root)
    classes = {name: discovered[name] for name in config.data.class_names if name in discovered}
    class_names = _validate_class_directories(classes, config.data.class_names, root)
    records = _records_for_classes(
        classes, class_names, config, root, group_map, metadata_map, hashes_by_path
    )
    _validate_hash_labels(records)

    rng = random.Random(config.runtime.seed)
    split_records: dict[str, list[ImageRecord]] = {"train": [], "validation": [], "test": []}
    for class_name in class_names:
        # A biological group (or exact duplicate hash when no metadata exists) is indivisible.
        groups: dict[str, list[ImageRecord]] = {}
        for record in records:
            if record.class_name == class_name:
                groups.setdefault(record.group_id, []).append(record)
        grouped = list(groups.values())
        rng.shuffle(grouped)
        if len(grouped) < 3:
            raise ValueError(
                f"Class '{class_name}' needs at least three unique images/groups for train, validation, and test"
            )
        assignments = _stratified_group_assignment(grouped, config, rng)
        for split_name, split_groups in assignments.items():
            split_records[split_name].extend(record for group in split_groups for record in group)

    for values in split_records.values():
        rng.shuffle(values)
    return DatasetSplits(class_names, **split_records)


def _load_presplit_dataset(
    root: Path,
    config: ExperimentConfig,
    group_map: dict[str, str] | None,
    metadata_map: dict[str, dict[str, str]],
    hashes_by_path: dict[Path, str],
) -> DatasetSplits | None:
    validation_name = "validation" if (root / "validation").is_dir() else "val"
    split_dirs = {"train": root / "train", "validation": root / validation_name, "test": root / "test"}
    if not all(path.is_dir() for path in split_dirs.values()):
        return None
    directories_by_split = {
        split_name: {
            class_name: directory
            for class_name, directory in _class_directories(split_path).items()
            if class_name in config.data.class_names
        }
        for split_name, split_path in split_dirs.items()
    }
    class_names = list(config.data.class_names)
    for split_name, directories in directories_by_split.items():
        _validate_class_directories(directories, class_names, split_dirs[split_name])
    values: dict[str, list[ImageRecord]] = {}
    for split_name, split_dir in split_dirs.items():
        directories = directories_by_split[split_name]
        values[split_name] = _records_for_classes(
            directories, class_names, config, root, group_map, metadata_map, hashes_by_path
        )
    all_records = values["train"] + values["validation"] + values["test"]
    _validate_hash_labels(all_records)
    seen_hashes: dict[str, str] = {}
    seen_groups: dict[str, str] = {}
    for split_name, records in values.items():
        for record in records:
            previous_hash_split = seen_hashes.setdefault(record.sha256, split_name)
            if previous_hash_split != split_name:
                raise ValueError(
                    f"Data leakage detected: identical image content occurs in '{previous_hash_split}' and '{split_name}'"
                )
            previous_group_split = seen_groups.setdefault(record.group_id, split_name)
            if previous_group_split != split_name:
                raise ValueError(
                    f"Data leakage detected: group '{record.group_id}' occurs in "
                    f"'{previous_group_split}' and '{split_name}'"
                )
    return DatasetSplits(class_names, **values)


def _write_manifest(
    splits: DatasetSplits, root: Path, destination: Path, config: ExperimentConfig
) -> None:
    def serialize(record: ImageRecord) -> dict:
        value = asdict(record)
        value["path"] = str(Path(record.path).relative_to(root)).replace("\\", "/")
        return value

    payload = {
        "schema_version": 2,
        "status": (
            "formal"
            if config.data.require_near_duplicate_review and config.data.require_complete_metadata
            else "exploratory"
        ),
        "dataset_root": str(root),
        "class_names": splits.class_names,
        "quarantined_class_names": list(config.data.quarantined_class_names),
        "splits": {
            name: [serialize(record) for record in getattr(splits, name)]
            for name in ("train", "validation", "test")
        },
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _read_manifest(
    path: Path,
    root: Path,
    expected_class_names: Sequence[str],
    hashes_by_path: dict[Path, str],
) -> DatasetSplits:
    payload = json.loads(path.read_text(encoding="utf-8"))
    class_names = payload.get("class_names", [])
    expected = list(expected_class_names)
    if class_names != expected:
        raise ValueError(
            f"Manifest {path} class names/order do not match the fixed contract. "
            f"Expected {expected}, received {class_names}"
        )
    values: dict[str, list[ImageRecord]] = {}
    for split_name in ("train", "validation", "test"):
        if split_name not in payload.get("splits", {}):
            raise ValueError(f"Manifest is missing split '{split_name}': {path}")
        values[split_name] = []
        for item in payload["splits"][split_name]:
            label = item.get("label")
            class_name = item.get("class_name")
            if not isinstance(label, int) or not 0 <= label < len(expected):
                raise ValueError(f"Manifest contains an invalid class index in split '{split_name}': {label}")
            if class_name != expected[label]:
                raise ValueError(
                    f"Manifest label mismatch in split '{split_name}': index {label} must be "
                    f"'{expected[label]}', received '{class_name}'"
                )
            image_path = (root / item["path"]).resolve()
            if not image_path.is_file():
                raise FileNotFoundError(f"Manifest image no longer exists: {image_path}")
            current_hash = hashes_by_path.get(image_path)
            if current_hash is None:
                raise ValueError(
                    f"Manifest image failed pre-split validation: {image_path}. "
                    "See image_validation_report.json."
                )
            if current_hash != item["sha256"]:
                raise ValueError(
                    f"Image content changed after the split manifest was created: {image_path}. "
                    "Use a new output directory for a new experiment split."
                )
            values[split_name].append(
                ImageRecord(
                    str(image_path),
                    item["label"],
                    item["class_name"],
                    item["sha256"],
                    item.get("group_id", item["sha256"]),
                    **{field: item.get(field, METADATA_DEFAULTS[field]) for field in METADATA_FIELDS},
                )
            )
    splits = DatasetSplits(class_names, **values)
    all_records = splits.train + splits.validation + splits.test
    manifest_paths = {Path(record.path).resolve() for record in all_records}
    current_paths = set(hashes_by_path)
    if manifest_paths != current_paths:
        added = sorted(str(image.relative_to(root)) for image in current_paths - manifest_paths)
        removed = sorted(str(image.relative_to(root)) for image in manifest_paths - current_paths)
        raise ValueError(
            f"Dataset inventory changed after split manifest {path} was created. "
            f"Added: {added[:3] or 'none'}; removed: {removed[:3] or 'none'}. "
            "Use a new output directory for a new leakage-safe split."
        )
    _validate_hash_labels(all_records)
    seen_hashes: dict[str, str] = {}
    seen_groups: dict[str, str] = {}
    for split_name in ("train", "validation", "test"):
        for record in getattr(splits, split_name):
            hash_split = seen_hashes.setdefault(record.sha256, split_name)
            group_split = seen_groups.setdefault(record.group_id, split_name)
            if hash_split != split_name or group_split != split_name:
                raise ValueError(f"Stored manifest contains leakage involving image: {record.path}")
    return splits


def _scan_external_inventory(
    root_value: str | None,
    config: ExperimentConfig,
    labeled: bool,
) -> list[ImageRecord]:
    if not root_value:
        return []
    root = Path(root_value).expanduser().resolve()
    if not root.is_dir():
        raise FileNotFoundError(f"External dataset directory does not exist: {root}")
    records: list[ImageRecord] = []
    for path in _image_paths(root, config.data.allowed_extensions):
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error")
                with Image.open(path) as image:
                    image.verify()
                with Image.open(path) as image:
                    image.load()
                    perceptual_hash = _flip_aware_difference_hash(image.convert("RGB"))
        except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Warning) as error:
            raise ValueError(f"Unreadable external image {path}: {error}") from error
        class_name = _candidate_class(path, root) if labeled else "unlabeled"
        if labeled and class_name not in config.data.class_names:
            raise ValueError(
                f"Final field-test image {path} is not under one of {list(config.data.class_names)}"
            )
        label = list(config.data.class_names).index(class_name) if labeled else -1
        digest = _sha256(path)
        records.append(
            ImageRecord(
                path=str(path.resolve()),
                label=label,
                class_name=class_name,
                sha256=digest,
                group_id=digest,
                source="designated-final-field-test" if labeled else "designated-ssl-unlabeled",
                origin_type="field" if labeled else "unknown",
            )
        )
    return records


def _external_record_dhash(record: ImageRecord) -> int:
    with Image.open(record.path) as image:
        return _flip_aware_difference_hash(image.convert("RGB"))


def _validate_external_overlap(
    config: ExperimentConfig,
    splits: DatasetSplits,
    primary_perceptual_hashes: dict[Path, int],
    destination: Path,
) -> None:
    ssl_records = _scan_external_inventory(config.data.ssl_unlabeled_dir, config, labeled=False)
    final_records = _scan_external_inventory(config.data.final_field_test_dir, config, labeled=True)
    primary_records = splits.train + splits.validation + splits.test
    primary_split_by_path = {
        record.path: split_name
        for split_name in ("train", "validation", "test")
        for record in getattr(splits, split_name)
    }
    sources = {
        "primary": primary_records,
        "ssl_unlabeled": ssl_records,
        "final_field_test": final_records,
    }
    exact_locations: dict[str, list[dict[str, str]]] = {}
    for source_name, records in sources.items():
        for record in records:
            exact_locations.setdefault(record.sha256, []).append({
                "source": source_name,
                "path": record.path,
                "class_name": record.class_name,
            })
    exact_overlaps = []
    for digest, occurrences in exact_locations.items():
        occurrence_sources = {item["source"] for item in occurrences}
        if len(occurrence_sources) <= 1:
            continue
        primary_occurrences = [item for item in occurrences if item["source"] == "primary"]
        ssl_training_only = (
            occurrence_sources == {"primary", "ssl_unlabeled"}
            and primary_occurrences
            and all(primary_split_by_path[item["path"]] == "train" for item in primary_occurrences)
        )
        if not ssl_training_only:
            exact_overlaps.append({"sha256": digest, "occurrences": occurrences})

    primary_hash_items: dict[int, list[ImageRecord]] = {}
    tree = _HammingBkTree()
    for record in primary_records:
        value = primary_perceptual_hashes[Path(record.path).resolve()]
        if value not in primary_hash_items:
            tree.add(value)
            primary_hash_items[value] = []
        primary_hash_items[value].append(record)
    near_overlaps: list[dict[str, Any]] = []
    for source_name, records in (("ssl_unlabeled", ssl_records), ("final_field_test", final_records)):
        for record in records:
            value = _external_record_dhash(record)
            for matched in tree.query(value, config.data.near_duplicate_hamming_distance):
                for primary in primary_hash_items[matched]:
                    primary_split = primary_split_by_path[primary.path]
                    # Labeled training images may legitimately participate in
                    # banana-domain SSL. Validation/test biological relatives
                    # may not. The locked field test must be independent of all.
                    if source_name == "ssl_unlabeled" and primary_split == "train":
                        continue
                    near_overlaps.append({
                        "external_source": source_name,
                        "external_path": record.path,
                        "primary_path": primary.path,
                        "primary_split": primary_split,
                        "hamming_distance": (value ^ matched).bit_count(),
                        "requires_review": True,
                    })

    payload = {
        "schema_version": 1,
        "contracts": {
            "ssl_unlabeled": (
                "May be consumed only by teacher self-supervised pretraining; never by supervised training, "
                "validation, checkpoint selection, or test evaluation."
            ),
            "final_field_test": (
                "Locked Davao field partition; never consumed by SSL, training, validation, tuning, or "
                "checkpoint selection."
            ),
        },
        "configured": {
            "ssl_unlabeled_dir": config.data.ssl_unlabeled_dir,
            "final_field_test_dir": config.data.final_field_test_dir,
        },
        "counts": {name: len(records) for name, records in sources.items()},
        "exact_cross_inventory_overlaps": exact_overlaps,
        "near_cross_inventory_overlaps_requiring_review": near_overlaps,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    if exact_overlaps:
        raise ValueError(f"External dataset exact overlap detected; see {destination.resolve()}")
    if near_overlaps:
        raise ValueError(
            "External dataset near-duplicate overlap with held-out or locked field data detected; "
            f"see {destination.resolve()}"
        )
    splits.ssl_unlabeled = ssl_records
    splits.final_field_test = final_records


def prepare_splits(config: ExperimentConfig, manifest_path: str | Path | None = None) -> DatasetSplits:
    root = require_dataset_dir(config)
    ssl_configured = bool(config.data.ssl_unlabeled_dir or config.data.ssl_manifest)
    field_configured = bool(config.data.final_field_test_dir or config.data.final_field_test_manifest)
    if bool(config.data.ssl_unlabeled_dir) != bool(config.data.ssl_manifest):
        raise ValueError(
            "External SSL requires both data.ssl_unlabeled_dir and a versioned data.ssl_manifest; "
            "raw directories are never admitted"
        )
    if ssl_configured and not config.data.final_split_dir:
        raise ValueError(
            "External SSL requires data.final_split_dir; validation/test identities must be frozen first"
        )
    if bool(config.data.final_field_test_dir) != bool(config.data.final_field_test_manifest):
        raise ValueError(
            "Davao field evaluation requires both data.final_field_test_dir and a versioned "
            "data.final_field_test_manifest; folder names/preliminary labels are never admitted"
        )
    if field_configured and not config.data.final_split_dir:
        raise ValueError(
            "Davao field evaluation requires data.final_split_dir and is attached only to held-out test"
        )
    if config.data.final_split_dir:
        # Import lazily to avoid a module cycle: the final-split adapter returns
        # the same DatasetSplits/ImageRecord contract used by every consumer.
        from ai.data.build_final_split import load_final_dataset_splits

        splits = load_final_dataset_splits(
            config.data.final_split_dir,
            root,
            config.data.class_names,
        )
        if ssl_configured:
            from ai.data.build_ssl_manifest import load_ssl_dataset_records

            splits.ssl_unlabeled = load_ssl_dataset_records(
                config.data.ssl_manifest,
                config.data.ssl_unlabeled_dir,
                Path(config.data.final_split_dir) / "ssl_exclusion_manifest.json",
            )
        if field_configured:
            from ai.data.build_davao_field_manifest import load_davao_test_records

            field_records = load_davao_test_records(
                config.data.final_field_test_manifest,
                config.data.final_field_test_dir,
                config.data.final_split_dir,
            )
            existing = splits.train + splits.validation + splits.test
            existing_paths = {Path(record.path).resolve() for record in existing}
            existing_hashes = {record.sha256 for record in existing}
            existing_groups = {record.group_id for record in existing}
            if any(
                Path(record.path).resolve() in existing_paths
                or record.sha256 in existing_hashes
                or record.group_id in existing_groups
                for record in field_records
            ):
                raise ValueError("Davao field subset overlaps a frozen labeled path/hash/group")
            splits.test.extend(field_records)
        if ssl_configured and field_configured:
            field_records = [record for record in splits.test if record.field_subset == "davao"]
            field_hashes = {record.sha256 for record in field_records}
            field_groups = {record.group_id for record in field_records}
            field_hash_values: dict[int, list[str]] = defaultdict(list)
            field_tree = _HammingBkTree()
            for record in field_records:
                value = _external_record_dhash(record)
                if value not in field_hash_values:
                    field_tree.add(value)
                field_hash_values[value].append(record.path)
            for record in splits.ssl_unlabeled:
                if record.sha256 in field_hashes or record.group_id in field_groups:
                    raise ValueError(f"Davao held-out image/group entered external SSL: {record.path}")
                value = _external_record_dhash(record)
                matches = field_tree.query(value, config.data.near_duplicate_hamming_distance)
                if matches:
                    raise ValueError(
                        "External SSL contains a perceptual relative of the Davao held-out subset: "
                        f"{record.path}"
                    )
        return splits
    manifest = Path(manifest_path) if manifest_path else Path(config.runtime.output_dir) / "split_manifest.json"
    near_duplicate_reviews = load_near_duplicate_reviews(config.data.near_duplicate_review_manifest)
    metadata_map = load_metadata_manifest(config.data.metadata_manifest)
    validation = validate_image_inventory(
        root,
        config.data.class_names,
        config.data.quarantined_class_names,
        config.data.allowed_extensions,
        manifest.parent / "image_validation_report.json",
        config.data.near_duplicate_hamming_distance,
        near_duplicate_reviews,
        metadata_map,
        manifest.parent / "harmonization_quality_report.json",
    )
    missing_metadata, incomplete_metadata = write_metadata_coverage_report(
        root,
        validation.hashes_by_path,
        metadata_map,
        manifest.parent / "metadata_coverage_report.json",
    )
    blockers: list[str] = []
    if config.data.require_near_duplicate_review and validation.near_duplicate_pair_count:
        blockers.append(
            f"{validation.near_duplicate_pair_count} near-duplicate pairs still require review"
        )
    if config.data.require_complete_metadata and (missing_metadata or incomplete_metadata):
        blockers.append(
            f"metadata has {missing_metadata} missing and {incomplete_metadata} incomplete active-image entries"
        )
    group_map = None
    if config.data.group_manifest:
        group_path = Path(config.data.group_manifest).expanduser().resolve()
        if not group_path.is_file():
            raise FileNotFoundError(f"Group manifest not found: {group_path}")
        group_map = json.loads(group_path.read_text(encoding="utf-8"))
        if not isinstance(group_map, dict) or not all(
            isinstance(key, str) and isinstance(value, str) and value for key, value in group_map.items()
        ):
            raise ValueError("data.group_manifest must be a JSON object mapping relative paths to non-empty group IDs")
    for review_key, review in near_duplicate_reviews.items():
        if review["decision"] not in {"grouped", "same_image", "same_leaf_or_related_capture"}:
            continue
        path_a, path_b = review_key.split("||", 1)
        if group_map is None or group_map.get(path_a) is None or group_map.get(path_a) != group_map.get(path_b):
            raise ValueError(
                f"Near-duplicate review '{review_key}' is marked grouped, but both paths are not assigned "
                "the same explicit data.group_manifest ID"
            )
    if manifest.is_file():
        splits = _read_manifest(
            manifest,
            root,
            config.data.class_names,
            validation.hashes_by_path,
        )
        if group_map is not None:
            for record in splits.train + splits.validation + splits.test:
                relative = str(Path(record.path).relative_to(root)).replace("\\", "/")
                expected_group = group_map.get(relative, record.sha256)
                if record.group_id != expected_group:
                    raise ValueError(
                        "The existing split manifest does not match data.group_manifest. "
                        "Use a new output directory to create a new leakage-safe split."
                    )
        for record in splits.train + splits.validation + splits.test:
            relative = str(Path(record.path).relative_to(root)).replace("\\", "/")
            expected_metadata = {**METADATA_DEFAULTS, **metadata_map.get(relative, {})}
            actual_metadata = {field: getattr(record, field) for field in METADATA_FIELDS}
            if actual_metadata != expected_metadata:
                raise ValueError(
                    "The existing split manifest does not match data.metadata_manifest. "
                    "Use a new output directory to create a new leakage-safe split."
                )
        _validate_external_overlap(
            config,
            splits,
            validation.perceptual_hashes_by_path,
            manifest.parent / "external_overlap_report.json",
        )
        if blockers:
            raise ValueError(
                "Formal split gate failed: " + "; ".join(blockers) + ". "
                f"See {validation.report_path}, "
                f"{(manifest.parent / 'metadata_coverage_report.json').resolve()}, and "
                f"{(manifest.parent / 'external_overlap_report.json').resolve()}."
            )
        return splits
    splits = _load_presplit_dataset(
        root, config, group_map, metadata_map, validation.hashes_by_path
    ) or _split_unsplit_dataset(
        root, config, group_map, metadata_map, validation.hashes_by_path
    )
    _validate_external_overlap(
        config,
        splits,
        validation.perceptual_hashes_by_path,
        manifest.parent / "external_overlap_report.json",
    )
    if blockers:
        raise ValueError(
            "Formal split gate failed: " + "; ".join(blockers) + ". "
            f"See {validation.report_path}, "
            f"{(manifest.parent / 'metadata_coverage_report.json').resolve()}, and "
            f"{(manifest.parent / 'external_overlap_report.json').resolve()}."
        )
    _write_manifest(splits, root, manifest, config)
    return splits


def decode_and_resize(path: tf.Tensor, image_size: tuple[int, int]) -> tf.Tensor:
    """Decode any supported RGB image to [H, W, 3] float32 in [0, 1]."""
    tf = _require_tensorflow()
    def decode_with_orientation(path_value):
        raw = path_value.numpy() if hasattr(path_value, "numpy") else path_value
        filename = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)
        with Image.open(filename) as source:
            oriented = ImageOps.exif_transpose(source)
            return np.asarray(oriented.convert("RGB"), dtype=np.uint8)

    image = tf.py_function(decode_with_orientation, [path], Tout=tf.uint8)
    image.set_shape([None, None, 3])
    image = tf.image.resize(image, image_size, method="bilinear", antialias=True)
    return tf.clip_by_value(tf.cast(image, tf.float32) / 255.0, 0.0, 1.0)


def _parallelism(config: ExperimentConfig):
    tf = _require_tensorflow()
    return tf.data.AUTOTUNE if config.runtime.num_parallel_calls == -1 else config.runtime.num_parallel_calls


def make_supervised_dataset(
    records: Sequence[ImageRecord],
    config: ExperimentConfig,
    training: bool,
) -> tf.data.Dataset:
    tf = _require_tensorflow()
    from ai.data.augmentation import build_augmentation

    if not records:
        raise ValueError("Cannot build a dataset from an empty record list")
    paths = [record.path for record in records]
    labels = [record.label for record in records]
    dataset = tf.data.Dataset.from_tensor_slices((paths, labels))
    options = tf.data.Options()
    options.experimental_deterministic = True
    dataset = dataset.with_options(options)
    if training:
        dataset = dataset.shuffle(len(records), seed=config.runtime.seed, reshuffle_each_iteration=True)
    dataset = dataset.map(
        lambda path, label: (decode_and_resize(path, config.image_size), label),
        num_parallel_calls=_parallelism(config),
    )
    if config.data.cache_dataset:
        fingerprint = hashlib.md5("\n".join(paths).encode("utf-8")).hexdigest()[:16]
        cache_root = Path(config.runtime.output_dir) / "dataset_cache"
        cache_root.mkdir(parents=True, exist_ok=True)
        dataset = dataset.cache(str(cache_root / f"{'train' if training else 'val'}_{fingerprint}_decoded"))
    dataset = dataset.batch(config.data.batch_size, drop_remainder=False)
    if training:
        augmenter = build_augmentation(config.augmentation, config.runtime.seed)
        dataset = dataset.map(
            lambda image, label: (augmenter(image, training=True), label),
            num_parallel_calls=_parallelism(config),
        )
    return dataset.prefetch(tf.data.AUTOTUNE)


def make_teacher_dataset(
    records: Sequence[ImageRecord], config: ExperimentConfig, training: bool
) -> tf.data.Dataset:
    tf = _require_tensorflow()
    from ai.data.augmentation import build_augmentation
    from ai.data.masking import apply_patch_mask

    if not records:
        raise ValueError("Cannot build a dataset from an empty record list")
    paths = [record.path for record in records]
    labels = [record.label for record in records]
    base = tf.data.Dataset.from_tensor_slices((paths, labels))
    options = tf.data.Options()
    options.experimental_deterministic = True
    base = base.with_options(options)
    if training:
        base = base.shuffle(len(records), seed=config.runtime.seed, reshuffle_each_iteration=True)
    base = base.map(
        lambda path, label: (decode_and_resize(path, config.image_size), label),
        num_parallel_calls=_parallelism(config),
    ).batch(config.data.batch_size, drop_remainder=False)
    if not training:
        return base.prefetch(tf.data.AUTOTUNE)
    view_one_augmenter = build_augmentation(config.augmentation, config.runtime.seed + 101, strong=True)
    view_two_augmenter = build_augmentation(config.augmentation, config.runtime.seed + 202, strong=True)

    def prepare(images: tf.Tensor, labels: tf.Tensor) -> dict[str, tf.Tensor]:
        view_one = view_one_augmenter(images, training=True)
        view_two = view_two_augmenter(images, training=True)
        masked_images, mask = apply_patch_mask(
            view_one,
            patch_size=config.masking.patch_size,
            mask_ratio=config.masking.mask_ratio,
            mask_value=config.masking.mask_value,
        )
        return {
            "images": images,                 # [B, H, W, 3], supervised target view
            "labels": labels,                 # [B]
            "view_one": view_one,             # [B, H, W, 3]
            "view_two": view_two,             # [B, H, W, 3]
            "masked_images": masked_images,   # [B, H, W, 3]
            "mask": mask,                     # [B, H, W, 1]
        }

    return base.map(prepare, num_parallel_calls=_parallelism(config)).prefetch(tf.data.AUTOTUNE)


def write_label_map(class_names: Sequence[str], destination: str | Path) -> None:
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({str(index): name for index, name in enumerate(class_names)}, indent=2), encoding="utf-8")


def select_stratified_representative_records(
    training_records: Sequence[ImageRecord],
    class_names: Sequence[str],
    maximum_samples: int,
    seed: int,
) -> list[ImageRecord]:
    """Select calibration examples exclusively and evenly from training data."""
    if maximum_samples < len(class_names):
        raise ValueError("Representative sample count must cover all four classes")
    rng = random.Random(seed)
    per_class: dict[str, list[ImageRecord]] = {name: [] for name in class_names}
    for record in training_records:
        if record.class_name not in per_class:
            raise ValueError(f"Unexpected calibration class: {record.class_name}")
        per_class[record.class_name].append(record)
    if any(not records for records in per_class.values()):
        missing = [name for name, records in per_class.items() if not records]
        raise ValueError(f"Training calibration pool is missing classes: {missing}")
    for records in per_class.values():
        rng.shuffle(records)
    selected: list[ImageRecord] = []
    while len(selected) < maximum_samples and any(per_class.values()):
        for class_name in class_names:
            if per_class[class_name] and len(selected) < maximum_samples:
                selected.append(per_class[class_name].pop())
    return selected


def build_ssl_pretraining_records(splits: DatasetSplits) -> list[ImageRecord]:
    """Return the allowed SSL pool and fail on held-out hash/group leakage."""
    held_out = splits.validation + splits.test + splits.final_field_test
    held_out_hashes = {record.sha256 for record in held_out}
    held_out_groups = {record.group_id for record in held_out}
    pool = splits.train + splits.ssl_unlabeled
    conflicts = [
        record.path for record in pool
        if record.sha256 in held_out_hashes or record.group_id in held_out_groups
    ]
    if conflicts:
        raise ValueError(f"Held-out image/group entered SSL pretraining: {conflicts[:3]}")
    return pool
