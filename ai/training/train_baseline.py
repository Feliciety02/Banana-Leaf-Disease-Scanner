"""Train the supervised MobileNetV3-Small research baseline."""

from __future__ import annotations

import argparse
from pathlib import Path

import tensorflow as tf

from ai.data.dataset import make_supervised_dataset, prepare_splits, write_label_map
from ai.models.mobilenetv3_baseline import BASELINE_BACKBONE_NAME, build_baseline
from ai.training.common import add_common_arguments, configured_experiment, save_history


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument(
        "--split-manifest",
        help="Exact enhanced-experiment split_manifest.json. Defaults to OUTPUT_DIR/split_manifest.json.",
    )
    parser.add_argument("--skip-fine-tune", action="store_true")
    return parser.parse_args()


def _callbacks(
    checkpoint: Path,
    config,
    initial_accuracy: float | None = None,
) -> list[tf.keras.callbacks.Callback]:
    return [
        tf.keras.callbacks.ModelCheckpoint(
            checkpoint,
            monitor="val_accuracy",
            mode="max",
            save_best_only=True,
            initial_value_threshold=initial_accuracy,
        ),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_accuracy",
            mode="max",
            patience=config.runtime.early_stopping_patience,
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=config.runtime.reduce_lr_patience,
            min_lr=config.runtime.min_learning_rate,
        ),
    ]


def _history_rows(history: tf.keras.callbacks.History, phase: str, epoch_offset: int = 0) -> list[dict]:
    rows = []
    count = len(history.history.get("loss", []))
    for index in range(count):
        rows.append({
            "epoch": epoch_offset + index + 1,
            "phase": phase,
            **{name: float(values[index]) for name, values in history.history.items()},
        })
    return rows


def train(args: argparse.Namespace) -> Path:
    config = configured_experiment(args, "baseline_experiment_config.json")
    output_dir = Path(config.runtime.output_dir)
    manifest = Path(args.split_manifest) if args.split_manifest else output_dir / "split_manifest.json"
    if args.split_manifest and not manifest.is_file():
        raise FileNotFoundError(f"Shared split manifest not found: {manifest}")
    splits = prepare_splits(config, manifest)
    write_label_map(splits.class_names, output_dir / "label_map.json")
    train_dataset = make_supervised_dataset(splits.train, config, training=True)
    validation_dataset = make_supervised_dataset(splits.validation, config, training=False)

    model, backbone = build_baseline(config)
    backbone.trainable = False
    model.compile(
        optimizer=tf.keras.optimizers.AdamW(
            learning_rate=config.baseline.frozen_backbone_learning_rate,
            weight_decay=config.baseline.weight_decay,
        ),
        loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
        metrics=["accuracy"],
    )
    best_path = output_dir / "best_baseline.keras"
    frozen_history = model.fit(
        train_dataset,
        validation_data=validation_dataset,
        epochs=config.baseline.frozen_backbone_epochs,
        callbacks=_callbacks(best_path, config),
    )
    rows = _history_rows(frozen_history, "frozen_backbone")
    best_accuracy = max(frozen_history.history.get("val_accuracy", [-1.0]))

    if not args.skip_fine_tune:
        model = tf.keras.models.load_model(best_path, compile=False)
        backbone = model.get_layer(BASELINE_BACKBONE_NAME)
        backbone.trainable = True
        model.compile(
            optimizer=tf.keras.optimizers.AdamW(
                learning_rate=config.baseline.fine_tune_learning_rate,
                weight_decay=config.baseline.weight_decay,
            ),
            loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
            metrics=["accuracy"],
        )
        fine_tune_history = model.fit(
            train_dataset,
            validation_data=validation_dataset,
            epochs=config.baseline.fine_tune_epochs,
            callbacks=_callbacks(best_path, config, initial_accuracy=best_accuracy),
        )
        rows.extend(_history_rows(fine_tune_history, "fine_tune", len(rows)))

    save_history(rows, output_dir / "baseline_history.json")
    print(f"Best baseline saved to {best_path}")
    print(f"Shared split manifest: {manifest.resolve()}")
    return best_path


if __name__ == "__main__":
    train(parse_args())
