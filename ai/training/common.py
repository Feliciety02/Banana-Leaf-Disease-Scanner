"""Shared CLI and training utilities."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import tensorflow as tf
import numpy as np

from ai.config.config import ExperimentConfig, load_config, save_config, set_global_determinism


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--config", help="Optional JSON file overriding config/config.py defaults")
    parser.add_argument("--dataset-dir", help="Dataset root; never inferred or hard-coded")
    parser.add_argument(
        "--final-split-dir",
        help="Frozen, quality-gated final split directory; disables ad-hoc splitting",
    )
    parser.add_argument("--ssl-unlabeled-dir", help="Separate external SSL image root")
    parser.add_argument("--ssl-manifest", help="Versioned, accepted external SSL manifest")
    parser.add_argument("--davao-field-dir", help="Separate Davao field image root")
    parser.add_argument("--davao-field-manifest", help="Versioned, expert-reviewed Davao field manifest")
    parser.add_argument("--output-dir", help="Artifact directory override")


def configured_experiment(args: argparse.Namespace, snapshot_name: str | None = None) -> ExperimentConfig:
    config = load_config(args.config)
    if getattr(args, "dataset_dir", None):
        config.data.dataset_dir = args.dataset_dir
    if getattr(args, "final_split_dir", None):
        config.data.final_split_dir = args.final_split_dir
    if getattr(args, "ssl_unlabeled_dir", None):
        config.data.ssl_unlabeled_dir = args.ssl_unlabeled_dir
    if getattr(args, "ssl_manifest", None):
        config.data.ssl_manifest = args.ssl_manifest
    if getattr(args, "davao_field_dir", None):
        config.data.final_field_test_dir = args.davao_field_dir
    if getattr(args, "davao_field_manifest", None):
        config.data.final_field_test_manifest = args.davao_field_manifest
    if getattr(args, "output_dir", None):
        config.runtime.output_dir = args.output_dir
    config.validate()
    set_global_determinism(config.runtime.seed)
    output = Path(config.runtime.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    save_config(config, output / "experiment_config.json")
    if snapshot_name:
        save_config(config, output / snapshot_name)
    return config


def validate_model_input(model: tf.keras.Model, config: ExperimentConfig, description: str) -> None:
    expected = (config.data.image_height, config.data.image_width, 3)
    actual = tuple(model.input_shape[1:])
    if actual != expected:
        raise ValueError(
            f"{description} expects input shape {actual}, but the active configuration uses {expected}. "
            "Use the same image dimensions as training."
        )


def make_optimizer(learning_rate: float, weight_decay: float) -> tf.keras.optimizers.Optimizer:
    return tf.keras.optimizers.AdamW(learning_rate=learning_rate, weight_decay=weight_decay)


def save_history(history: list[dict[str, Any]], path: str | Path) -> None:
    Path(path).write_text(json.dumps(history, indent=2), encoding="utf-8")


def macro_f1_from_predictions(
    true_labels: list[int], predicted_labels: list[int], num_classes: int
) -> float:
    """Compute the fixed-class macro F1 used for every validation decision."""
    matrix = np.zeros((num_classes, num_classes), dtype=np.int64)
    for truth, prediction in zip(true_labels, predicted_labels):
        matrix[int(truth), int(prediction)] += 1
    true_positive = np.diag(matrix).astype(np.float64)
    false_positive = matrix.sum(axis=0) - true_positive
    false_negative = matrix.sum(axis=1) - true_positive
    denominator = 2.0 * true_positive + false_positive + false_negative
    per_class = np.divide(
        2.0 * true_positive,
        denominator,
        out=np.zeros_like(true_positive),
        where=denominator > 0,
    )
    return float(np.mean(per_class))


@tf.keras.utils.register_keras_serializable(package="DahonMD")
class SparseMacroF1(tf.keras.metrics.Metric):
    """Streaming sparse-label macro F1 for validation checkpointing."""

    def __init__(self, num_classes: int, name: str = "macro_f1", **kwargs):
        super().__init__(name=name, **kwargs)
        self.num_classes = num_classes
        self.matrix = self.add_weight(
            name="confusion_matrix",
            shape=(num_classes, num_classes),
            initializer="zeros",
        )

    def update_state(self, y_true, y_pred, sample_weight=None):
        labels = tf.cast(tf.reshape(y_true, [-1]), tf.int32)
        predictions = tf.argmax(y_pred, axis=-1, output_type=tf.int32)
        current = tf.math.confusion_matrix(
            labels,
            predictions,
            num_classes=self.num_classes,
            dtype=self.dtype,
            weights=sample_weight,
        )
        self.matrix.assign_add(current)

    def result(self):
        true_positive = tf.linalg.diag_part(self.matrix)
        false_positive = tf.reduce_sum(self.matrix, axis=0) - true_positive
        false_negative = tf.reduce_sum(self.matrix, axis=1) - true_positive
        denominator = 2.0 * true_positive + false_positive + false_negative
        per_class = tf.math.divide_no_nan(2.0 * true_positive, denominator)
        return tf.reduce_mean(per_class)

    def reset_state(self):
        self.matrix.assign(tf.zeros_like(self.matrix))

    def get_config(self):
        return {**super().get_config(), "num_classes": self.num_classes}


def reduce_learning_rate(
    optimizer: tf.keras.optimizers.Optimizer,
    factor: float,
    minimum: float,
) -> float:
    current = float(tf.keras.backend.get_value(optimizer.learning_rate))
    updated = max(minimum, current * factor)
    optimizer.learning_rate.assign(updated)
    return updated
