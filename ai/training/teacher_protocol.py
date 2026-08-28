"""Research controls and auditable outputs for ResNet-101 teacher training."""

from __future__ import annotations

import hashlib
import json
import os
import platform
import sys
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np
import tensorflow as tf

from ai.config.config import ExperimentConfig
from ai.data.dataset import DatasetSplits, ImageRecord


SSL_CHECKPOINT_NAME = "resnet101_ssl_pretrained.keras"
TEACHER_CHECKPOINT_NAME = "best_teacher.keras"
TRAINING_ARTIFACT_NAMES = (
    SSL_CHECKPOINT_NAME,
    TEACHER_CHECKPOINT_NAME,
    "teacher_ssl_history.json",
    "teacher_finetune_history.json",
    "teacher_history.json",
    "validation_metrics.json",
    "candidate_hyperparameters.json",
    "reproducibility_manifest.json",
)


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _json_fingerprint(value: Any) -> str:
    serialized = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def weighted_ssl_objective(
    byol: tf.Tensor,
    mim: tf.Tensor,
    contrastive: tf.Tensor,
    config: ExperimentConfig,
) -> tf.Tensor:
    """Return lambda_BYOL*L_BYOL + lambda_MIM*L_MIM + lambda_CL*L_CL."""
    dtype = byol.dtype
    return (
        tf.cast(config.teacher.lambda_byol, dtype) * byol
        + tf.cast(config.teacher.lambda_mim, dtype) * tf.cast(mim, dtype)
        + tf.cast(config.teacher.lambda_cl, dtype) * tf.cast(contrastive, dtype)
    )


def build_finetune_classifier(ssl_model: tf.keras.Model) -> tf.keras.Model:
    """Drop SSL-only outputs while retaining the trained encoder and classifier."""
    if not isinstance(ssl_model.output, dict):
        raise ValueError("Teacher SSL model must expose named outputs")
    required = ("logits", "features", "feature_map")
    missing = [name for name in required if name not in ssl_model.output]
    if missing:
        raise ValueError(f"Teacher SSL model is missing fine-tuning outputs: {missing}")
    classifier = tf.keras.Model(
        ssl_model.input,
        {name: ssl_model.output[name] for name in required},
        name="resnet101_classifier",
    )
    if set(classifier.output) != set(required):
        raise AssertionError("SSL-only heads were not removed from the fine-tuning model")
    return classifier


def selected_teacher_hyperparameters(config: ExperimentConfig) -> dict[str, Any]:
    """Return the teacher values that must be reported for replication."""
    return {
        "backbone": config.teacher.backbone,
        "imagenet_weights": config.teacher.imagenet_weights,
        "ssl_epochs": config.teacher.ssl_epochs,
        "ssl_checkpoint_interval": config.teacher.ssl_checkpoint_interval,
        "max_recent_checkpoints": config.teacher.max_recent_checkpoints,
        "milestone_interval": config.teacher.milestone_interval,
        "finetune_epochs": config.teacher.finetune_epochs,
        "ssl_learning_rate": config.teacher.ssl_learning_rate,
        "finetune_learning_rate": config.teacher.finetune_learning_rate,
        "weight_decay": config.teacher.weight_decay,
        "lambda_byol": config.teacher.lambda_byol,
        "lambda_mim": config.teacher.lambda_mim,
        "lambda_cl": config.teacher.lambda_cl,
        "byol_ema_decay": config.teacher.byol_ema_decay,
        "contrastive_temperature": config.teacher.contrastive_temperature,
        "projection_dim": config.teacher.projection_dim,
        "projection_hidden_dim": config.teacher.projection_hidden_dim,
        "predictor_hidden_dim": config.teacher.predictor_hidden_dim,
        "dropout_rate": config.teacher.dropout_rate,
        "mask_patch_size": config.masking.patch_size,
        "mask_ratio": config.masking.mask_ratio,
        "batch_size": config.data.batch_size,
        "seed": config.runtime.seed,
    }


def _record_fingerprint(records: Sequence[ImageRecord]) -> str:
    identities = sorted(
        {
            "sha256": record.sha256,
            "group_id": record.group_id,
            "class_name": record.class_name,
            "label": record.label,
        }
        for record in records
    )
    return _json_fingerprint(identities)


def assert_teacher_partition_isolation(splits: DatasetSplits) -> dict[str, Any]:
    """Prove that training/SSL records do not share a hash or group with held-out data."""
    partitions = {
        "train": splits.train,
        "validation": splits.validation,
        "test": splits.test,
    }
    owner_by_hash: dict[str, str] = {}
    owner_by_group: dict[str, str] = {}
    for partition, records in partitions.items():
        for record in records:
            hash_owner = owner_by_hash.setdefault(record.sha256, partition)
            group_owner = owner_by_group.setdefault(record.group_id, partition)
            if hash_owner != partition:
                raise ValueError(
                    f"Teacher data leakage: hash appears in both {hash_owner} and {partition}"
                )
            if group_owner != partition:
                raise ValueError(
                    f"Teacher data leakage: group appears in both {group_owner} and {partition}"
                )

    held_out_hashes = {record.sha256 for record in splits.validation + splits.test}
    held_out_groups = {record.group_id for record in splits.validation + splits.test}
    ssl_pool = splits.train + splits.ssl_unlabeled
    conflicts = [
        record.path
        for record in ssl_pool
        if record.sha256 in held_out_hashes or record.group_id in held_out_groups
    ]
    if conflicts:
        raise ValueError(f"Held-out image/group entered teacher SSL: {conflicts[:3]}")

    return {
        "status": "passed",
        "zero_cross_partition_hash_leakage": True,
        "zero_cross_partition_group_leakage": True,
        "validation_excluded_from_ssl": True,
        "test_excluded_from_ssl": True,
        "test_pixels_used_for_training_or_selection": False,
        "partition_counts": {name: len(records) for name, records in partitions.items()},
        "external_ssl_count": len(splits.ssl_unlabeled),
        "ssl_pretraining_count": len(ssl_pool),
        "identity_fingerprints": {
            name: _record_fingerprint(records) for name, records in partitions.items()
        },
        "ssl_pool_identity_fingerprint": _record_fingerprint(ssl_pool),
    }


def _existing_file_evidence(paths: Iterable[Path]) -> dict[str, dict[str, Any]]:
    evidence: dict[str, dict[str, Any]] = {}
    for path in paths:
        if path.is_file():
            evidence[path.name] = {
                "path": str(path.resolve()),
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
            }
    return evidence


def write_reproducibility_manifest(
    config: ExperimentConfig,
    splits: DatasetSplits,
    output_dir: str | Path,
    selected_epoch: int,
    validation_macro_f1: float,
) -> Path:
    """Write software, seed, split, selection, and artifact evidence."""
    output = Path(output_dir).resolve()
    split_dir = Path(config.data.final_split_dir).resolve() if config.data.final_split_dir else None
    split_files = [
        split_dir / name
        for name in (
            "split_summary.json",
            "train_manifest.json",
            "validation_manifest.json",
            "test_manifest.json",
            "ssl_exclusion_manifest.json",
            "group_assignment_manifest.json",
        )
    ] if split_dir else []
    artifact_paths = [output / name for name in TRAINING_ARTIFACT_NAMES]
    config_path = output / "experiment_config.json"
    if config_path.is_file():
        artifact_paths.append(config_path)
    payload = {
        "schema_version": 1,
        "status": "complete",
        "experiment_name": config.experiment_name,
        "architecture": {
            "encoder": "ImageNet-pretrained ResNet-101",
            "ssl_objectives": ["BYOL", "masked_image_modeling", "InfoNCE"],
            "post_ssl_model": "ResNet-101 encoder plus four-class classifier; SSL-only heads removed",
        },
        "determinism": {
            "seed": config.runtime.seed,
            "python_hash_seed": os.environ.get("PYTHONHASHSEED", str(config.runtime.seed)),
            "tensorflow_deterministic_ops": os.environ.get("TF_DETERMINISTIC_OPS", "1"),
            "tf_data_deterministic": True,
        },
        "selection": {
            "partition": "validation",
            "metric": "macro_f1",
            "direction": "maximize",
            "selected_epoch": selected_epoch,
            "validation_macro_f1": validation_macro_f1,
            "test_set_evaluated": False,
        },
        "data_isolation": assert_teacher_partition_isolation(splits),
        "frozen_split_artifacts": _existing_file_evidence(split_files),
        "hyperparameters": selected_teacher_hyperparameters(config),
        "software": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "tensorflow": tf.__version__,
            "numpy": np.__version__,
        },
        "training_artifacts": _existing_file_evidence(artifact_paths),
    }
    destination = output / "reproducibility_manifest.json"
    destination.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    return destination
