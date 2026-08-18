"""Five-class image discovery, leakage checks, persistent splits, and tf.data I/O."""

from __future__ import annotations

import hashlib
import json
import random
import warnings
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Sequence

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


@dataclass
class DatasetSplits:
    class_names: list[str]
    train: list[ImageRecord]
    validation: list[ImageRecord]
    test: list[ImageRecord]


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


def _validate_and_hash(path: Path, verify: bool) -> str:
    if verify:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", UserWarning)
                with Image.open(path) as image:
                    image.verify()
        except (UnidentifiedImageError, OSError, ValueError, UserWarning) as error:
            raise ValueError(f"Unreadable or invalid image: {path}: {error}") from error
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise OSError(f"Could not read image: {path}: {error}") from error
    return digest.hexdigest()


def _records_for_classes(
    class_directories: dict[str, Path],
    class_names: list[str],
    config: ExperimentConfig,
    dataset_root: Path,
    group_map: dict[str, str] | None,
) -> list[ImageRecord]:
    records: list[ImageRecord] = []
    for label, class_name in enumerate(class_names):
        paths = _image_paths(class_directories[class_name], config.data.allowed_extensions)
        if not paths:
            raise ValueError(f"Class directory contains no supported images: {class_directories[class_name]}")
        for path in paths:
            digest = _validate_and_hash(path, config.data.verify_images)
            relative = str(path.relative_to(dataset_root)).replace("\\", "/")
            # A group manifest may contain only the known multi-image biological
            # groups. Unlisted records retain the safe exact-hash fallback.
            group_id = group_map.get(relative, digest) if group_map is not None else digest
            records.append(ImageRecord(str(path), label, class_name, digest, group_id))
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
            f"Dataset classes at {location} do not match the fixed five-class contract. "
            f"Missing: {missing or 'none'}; unexpected: {unexpected or 'none'}; "
            f"expected output order: {expected}"
        )
    return expected


def _split_unsplit_dataset(
    root: Path, config: ExperimentConfig, group_map: dict[str, str] | None
) -> DatasetSplits:
    classes = _class_directories(root)
    class_names = _validate_class_directories(classes, config.data.class_names, root)
    records = _records_for_classes(classes, class_names, config, root, group_map)
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
    root: Path, config: ExperimentConfig, group_map: dict[str, str] | None
) -> DatasetSplits | None:
    validation_name = "validation" if (root / "validation").is_dir() else "val"
    split_dirs = {"train": root / "train", "validation": root / validation_name, "test": root / "test"}
    if not all(path.is_dir() for path in split_dirs.values()):
        return None
    directories_by_split = {name: _class_directories(path) for name, path in split_dirs.items()}
    class_names = list(config.data.class_names)
    for split_name, directories in directories_by_split.items():
        _validate_class_directories(directories, class_names, split_dirs[split_name])
    values: dict[str, list[ImageRecord]] = {}
    for split_name, split_dir in split_dirs.items():
        directories = directories_by_split[split_name]
        values[split_name] = _records_for_classes(directories, class_names, config, root, group_map)
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


def _write_manifest(splits: DatasetSplits, root: Path, destination: Path) -> None:
    def serialize(record: ImageRecord) -> dict:
        value = asdict(record)
        value["path"] = str(Path(record.path).relative_to(root)).replace("\\", "/")
        return value

    payload = {
        "dataset_root": str(root),
        "class_names": splits.class_names,
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
    verify_images: bool,
    allowed_extensions: Sequence[str],
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
            current_hash = _validate_and_hash(image_path, verify_images)
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
                )
            )
    splits = DatasetSplits(class_names, **values)
    all_records = splits.train + splits.validation + splits.test
    manifest_paths = {Path(record.path).resolve() for record in all_records}
    current_paths = {image.resolve() for image in _image_paths(root, allowed_extensions)}
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


def prepare_splits(config: ExperimentConfig, manifest_path: str | Path | None = None) -> DatasetSplits:
    root = require_dataset_dir(config)
    manifest = Path(manifest_path) if manifest_path else Path(config.runtime.output_dir) / "split_manifest.json"
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
    if manifest.is_file():
        splits = _read_manifest(
            manifest,
            root,
            config.data.class_names,
            config.data.verify_images,
            config.data.allowed_extensions,
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
        return splits
    splits = _load_presplit_dataset(root, config, group_map) or _split_unsplit_dataset(root, config, group_map)
    _write_manifest(splits, root, manifest)
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
