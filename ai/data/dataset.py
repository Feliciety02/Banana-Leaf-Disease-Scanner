"""Image validation, leakage checks, persistent splits, and tf.data I/O."""

from __future__ import annotations

import hashlib
import json
import random
import warnings
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

from PIL import Image, UnidentifiedImageError

from ai.config.config import ExperimentConfig


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


METADATA_FIELDS: tuple[str, ...] = (
    "source",
    "plant_id",
    "leaf_id",
    "site_id",
    "session_id",
    "origin_type",
    "label_validator",
    "label_review_status",
)

METADATA_DEFAULTS: dict[str, str] = {
    "source": "unknown",
    "plant_id": "unknown",
    "leaf_id": "unknown",
    "site_id": "unknown",
    "session_id": "unknown",
    "origin_type": "unknown",
    "label_validator": "unknown",
    "label_review_status": "pending",
}


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
    if not isinstance(pairs, dict):
        raise ValueError("Near-duplicate review manifest must contain an object named 'pairs'")
    allowed_decisions = {"not_duplicate", "grouped", "exclude_a", "exclude_b"}
    normalized: dict[str, dict[str, str]] = {}
    for key, review in pairs.items():
        if not isinstance(key, str) or "||" not in key or not isinstance(review, dict):
            raise ValueError("Near-duplicate review keys must use 'path_a||path_b' and map to objects")
        decision = review.get("decision")
        reviewer = review.get("reviewer")
        reviewed_at = review.get("reviewed_at")
        if decision not in allowed_decisions or not all(
            isinstance(value, str) and value.strip() for value in (reviewer, reviewed_at)
        ):
            raise ValueError(
                f"Near-duplicate review '{key}' needs a valid decision, reviewer, and reviewed_at"
            )
        left, right = key.split("||", 1)
        canonical_key = "||".join(sorted((left.replace("\\", "/"), right.replace("\\", "/"))))
        normalized[canonical_key] = {
            "decision": decision,
            "reviewer": reviewer,
            "reviewed_at": reviewed_at,
            "notes": str(review.get("notes", "")),
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
            "decision": "",
            "reviewer": "",
            "reviewed_at": "",
            "notes": "",
        }
    template = {
        "schema_version": 1,
        "allowed_decisions": ["not_duplicate", "grouped", "exclude_a", "exclude_b"],
        "instructions": (
            "Visually inspect every pair. 'grouped' also requires both paths to share one explicit "
            "group_manifest ID. Exclusion decisions remove an image from splitting, not from disk."
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

    for path in candidates:
        relative = str(path.relative_to(root)).replace("\\", "/")
        class_name = _candidate_class(path, root)
        reasons: list[dict[str, str]] = []
        width: int | None = None
        height: int | None = None
        source_mode: str | None = None
        perceptual_hash: int | None = None

        if class_name not in valid_classes and class_name not in quarantined_classes:
            reasons.append({
                "code": "invalid_class",
                "message": (
                    f"Image class '{class_name}' is neither active {list(class_names)} "
                    f"nor quarantined {list(quarantined_class_names)}"
                ),
            })

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
                    "requires_review": review is None,
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


def load_metadata_manifest(path: str | Path | None) -> dict[str, dict[str, str]]:
    if path is None:
        return {}
    source = Path(path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"Metadata manifest not found: {source}")
    payload = json.loads(source.read_text(encoding="utf-8"))
    images = payload.get("images", payload) if isinstance(payload, dict) else None
    if not isinstance(images, dict):
        raise ValueError("data.metadata_manifest must contain an object keyed by dataset-relative image path")
    normalized: dict[str, dict[str, str]] = {}
    for relative, metadata in images.items():
        if not isinstance(relative, str) or not isinstance(metadata, dict):
            raise ValueError("Metadata entries must map string paths to JSON objects")
        unknown = set(metadata) - set(METADATA_FIELDS)
        if unknown:
            raise ValueError(f"Metadata for '{relative}' contains unknown fields: {sorted(unknown)}")
        values = {**METADATA_DEFAULTS, **metadata}
        if any(not isinstance(values[field], str) or not values[field].strip() for field in METADATA_FIELDS):
            raise ValueError(f"Metadata for '{relative}' must use non-empty strings for every field")
        normalized[relative.replace("\\", "/")] = values
    return normalized


def _infer_documented_source(relative_path: str) -> str:
    filename = Path(relative_path).name.lower()
    mappings = (
        ("healthy-zenodo-", "zenodo-tanzania-7670326"),
        ("sigatoka-zenodo-", "zenodo-tanzania-7670326"),
        ("healthy-v4-", "banana-leaf-disease-dataset-v4"),
        ("sigatoka-v4-", "banana-leaf-disease-dataset-v4"),
        ("cordana-v4-", "banana-leaf-disease-dataset-v4"),
        ("healthy-nutrient-", "nutrient-deficient-banana-plant-leaves"),
        ("cordana-bananalsd-", "bananalsd"),
        ("cordana-ecuador-", "deep-learning-banana-diseases-ecuador"),
        ("panama-kaggle-", "banana-disease-recognition-dataset"),
    )
    for prefix, source in mappings:
        if filename.startswith(prefix):
            return source
    return "unknown"


def write_metadata_template(
    root: Path,
    class_names: Sequence[str],
    quarantined_class_names: Sequence[str],
    allowed_extensions: Sequence[str],
    destination: str | Path,
) -> Path:
    """Write a non-destructive metadata template, preserving existing reviewed values."""
    output = Path(destination)
    existing = load_metadata_manifest(output) if output.is_file() else {}
    active = set(class_names)
    quarantined = set(quarantined_class_names)
    images: dict[str, dict[str, str]] = {}
    for path in _image_paths(root, allowed_extensions):
        class_name = _candidate_class(path, root)
        if class_name not in active and class_name not in quarantined:
            continue
        relative = str(path.relative_to(root)).replace("\\", "/")
        existing_values = existing.get(relative)
        values = {**METADATA_DEFAULTS, **(existing_values or {})}
        if values["source"] == "unknown":
            values["source"] = _infer_documented_source(relative)
        if existing_values is None and values["source"] != "unknown":
            values["origin_type"] = "public"
        images[relative] = values
    payload = {
        "schema_version": 1,
        "dataset_root": str(root),
        "instructions": (
            "Replace unknown/pending values only with verified provenance. "
            "Do not invent plant, leaf, site, session, or validator identifiers."
        ),
        "images": images,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return output.resolve()


def write_metadata_coverage_report(
    root: Path,
    active_paths: Iterable[Path],
    metadata_map: dict[str, dict[str, str]],
    destination: str | Path,
) -> tuple[int, int]:
    relative_paths = sorted(str(path.relative_to(root)).replace("\\", "/") for path in active_paths)
    missing_entries = [relative for relative in relative_paths if relative not in metadata_map]
    incomplete: list[dict[str, Any]] = []
    for relative in relative_paths:
        values = {**METADATA_DEFAULTS, **metadata_map.get(relative, {})}
        unresolved = [field for field in METADATA_FIELDS if values[field] in {"unknown", "pending"}]
        if values["label_review_status"] != "validated" and "label_review_status" not in unresolved:
            unresolved.append("label_review_status")
        if unresolved:
            incomplete.append({"path": relative, "unresolved_fields": unresolved})
    unused_entries = sorted(set(metadata_map) - set(relative_paths))
    payload = {
        "schema_version": 1,
        "dataset_root": str(root),
        "required_fields": list(METADATA_FIELDS),
        "formal_completion_rule": (
            "Every active image must have verified non-unknown metadata and label_review_status=validated."
        ),
        "summary": {
            "active_images": len(relative_paths),
            "manifest_entries_present": len(relative_paths) - len(missing_entries),
            "missing_entries": len(missing_entries),
            "incomplete_entries": len(incomplete),
            "unused_or_quarantined_entries": len(unused_entries),
        },
        "missing_paths": missing_entries,
        "incomplete_images": incomplete,
        "unused_or_quarantined_paths": unused_entries,
    }
    output = Path(destination)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return len(missing_entries), len(incomplete)


def _records_for_classes(
    class_directories: dict[str, Path],
    class_names: list[str],
    config: ExperimentConfig,
    dataset_root: Path,
    group_map: dict[str, str] | None,
    metadata_map: dict[str, dict[str, str]],
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
            group_id = group_map.get(relative, digest) if group_map is not None else digest
            metadata = {**METADATA_DEFAULTS, **metadata_map.get(relative, {})}
            records.append(ImageRecord(str(path), label, class_name, digest, group_id, **metadata))
    return records


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
        n_groups = len(grouped)
        n_train = max(1, int(round(n_groups * config.data.train_fraction)))
        n_validation = max(1, int(round(n_groups * config.data.validation_fraction)))
        if n_train + n_validation >= n_groups:
            n_train = n_groups - 2
            n_validation = 1
        assignments = {
            "train": grouped[:n_train],
            "validation": grouped[n_train : n_train + n_validation],
            "test": grouped[n_train + n_validation :],
        }
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
    exact_overlaps = [
        {"sha256": digest, "occurrences": occurrences}
        for digest, occurrences in exact_locations.items()
        if len({item["source"] for item in occurrences}) > 1
    ]

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
                    near_overlaps.append({
                        "external_source": source_name,
                        "external_path": record.path,
                        "primary_path": primary.path,
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
    splits.ssl_unlabeled = ssl_records
    splits.final_field_test = final_records


def prepare_splits(config: ExperimentConfig, manifest_path: str | Path | None = None) -> DatasetSplits:
    root = require_dataset_dir(config)
    manifest = Path(manifest_path) if manifest_path else Path(config.runtime.output_dir) / "split_manifest.json"
    near_duplicate_reviews = load_near_duplicate_reviews(config.data.near_duplicate_review_manifest)
    validation = validate_image_inventory(
        root,
        config.data.class_names,
        config.data.quarantined_class_names,
        config.data.allowed_extensions,
        manifest.parent / "image_validation_report.json",
        config.data.near_duplicate_hamming_distance,
        near_duplicate_reviews,
    )
    metadata_map = load_metadata_manifest(config.data.metadata_manifest)
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
        if review["decision"] != "grouped":
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
    encoded = tf.io.read_file(path)
    image = tf.io.decode_image(encoded, channels=3, expand_animations=False)
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

    base = make_supervised_dataset(records, config, training=training)
    if not training:
        return base
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
