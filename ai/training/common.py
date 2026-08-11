"""Shared CLI and training utilities."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import tensorflow as tf

from ai.config.config import ExperimentConfig, load_config, save_config, set_global_determinism


def add_common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--config", help="Optional JSON file overriding config/config.py defaults")
    parser.add_argument("--dataset-dir", help="Dataset root; never inferred or hard-coded")
    parser.add_argument("--output-dir", help="Artifact directory override")


def configured_experiment(args: argparse.Namespace, snapshot_name: str | None = None) -> ExperimentConfig:
    config = load_config(args.config)
    if getattr(args, "dataset_dir", None):
        config.data.dataset_dir = args.dataset_dir
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


def reduce_learning_rate(
    optimizer: tf.keras.optimizers.Optimizer,
    factor: float,
    minimum: float,
) -> float:
    current = float(tf.keras.backend.get_value(optimizer.learning_rate))
    updated = max(minimum, current * factor)
    optimizer.learning_rate.assign(updated)
    return updated
