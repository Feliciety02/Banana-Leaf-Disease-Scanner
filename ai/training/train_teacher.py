"""Stage 2: self-supervise ResNet-101, then fine-tune it for four classes."""

from __future__ import annotations

import argparse
import gc
import json
import os
import time
from pathlib import Path

# oneDNN/MKL convolution allocation has repeatedly OOM'd this CPU pipeline. Disable the
# fused oneDNN path before TensorFlow is imported so Eigen handles convolutions instead.
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
# Bound Eigen/MKL thread arenas before TensorFlow initializes its thread pools. Each worker
# thread reserves per-op scratch buffers, so unlimited parallelism spikes peak RAM exactly
# while fine-tuning backprop is at its most memory-hungry.
os.environ.setdefault("OMP_NUM_THREADS", "8")
os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "8")

import tensorflow as tf
from tqdm import tqdm

from ai.data.dataset import build_ssl_pretraining_records, make_supervised_dataset, make_teacher_dataset, prepare_splits, write_label_map
from ai.losses.byol_loss import byol_loss
from ai.losses.classification_loss import classification_loss
from ai.losses.contrastive_loss import nt_xent_loss
from ai.losses.mim_loss import masked_reconstruction_loss
from ai.models.teacher import build_ema_target, build_teacher, update_ema_target
from ai.training.common import add_common_arguments, configured_experiment, macro_f1_from_predictions, make_optimizer, reduce_learning_rate, save_history
from ai.training.teacher_protocol import (
    assert_teacher_partition_isolation,
    selected_teacher_hyperparameters,
    write_reproducibility_manifest,
)

LIVE_FILE = "teacher_live.json"


def write_live_progress(output_dir: Path, payload: dict) -> None:
    (output_dir / LIVE_FILE).write_text(json.dumps(payload, indent=2), encoding="utf-8")


def dataset_batches(dataset: tf.data.Dataset) -> int:
    cardinality = int(dataset.cardinality())
    return cardinality if cardinality > 0 else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument(
        "--resume-ssl",
        action="store_true",
        help="Skip self-supervised pretraining and load resnet101_ssl_pretrained.keras from the output directory if present",
    )
    parser.add_argument(
        "--resume-finetune",
        action="store_true",
        help="Skip SSL and load best_teacher.keras to continue supervised fine-tuning from the saved history",
    )
    return parser.parse_args()


def train(args: argparse.Namespace) -> Path:
    config = configured_experiment(args, "teacher_experiment_config.json")
    if not config.teacher.ssl_enabled:
        raise ValueError(
            "This entry point implements ImageNet -> banana-domain SSL -> supervised fine-tuning. "
            "Use train_supervised_ablation.py for configuration 5."
        )
    output_dir = Path(config.runtime.output_dir)
    splits = prepare_splits(config, output_dir / "split_manifest.json")
    write_label_map(splits.class_names, output_dir / "label_map.json")

    ssl_path = output_dir / "resnet101_ssl_pretrained.keras"
    best_path = output_dir / "best_teacher.keras"
    if args.resume_finetune and best_path.is_file():
        online = tf.keras.models.load_model(best_path)
        print(f"Resumed fine-tuned ResNet-101 classifier from {best_path}")
        ssl_history: list[dict] = []
    elif args.resume_ssl and ssl_path.is_file():
        online = tf.keras.models.load_model(ssl_path)
        print(f"Resumed ResNet-101 from self-supervised checkpoint {ssl_path}")
        ssl_history: list[dict] = []
    else:
        # Leakage boundary: SSL sees the internal training partition plus only an
        # explicitly designated, overlap-screened unlabeled inventory. Validation,
        # internal test, and locked final-field-test pixels are never included.
        ssl_records = build_ssl_pretraining_records(splits)
        ssl_dataset = make_teacher_dataset(ssl_records, config, training=True)

        online = build_teacher(config)
        target = build_ema_target(config, online)
        online_ssl = tf.keras.Model(
            online.input,
            {name: online.output[name] for name in ("projection", "prediction")},
            name="resnet101_online_ssl_heads",
        )
        online_mim = tf.keras.Model(online.input, online.output["reconstruction"], name="resnet101_mim_path")
        target_projector = tf.keras.Model(target.input, target.output["projection"], name="resnet101_target_projector")
        ssl_optimizer = make_optimizer(config.teacher.ssl_learning_rate, config.teacher.weight_decay)
        decay = tf.constant(config.teacher.byol_ema_decay, tf.float32)

        @tf.function
        def ssl_step(batch: dict[str, tf.Tensor]) -> dict[str, tf.Tensor]:
            # Labels are deliberately unused: this phase is strictly self-supervised.
            with tf.GradientTape() as tape:
                online_one = online_ssl(batch["view_one"], training=True)
                online_two = online_ssl(batch["view_two"], training=True)
                contrastive = tf.constant(0.0, tf.float32)
                if config.teacher.lambda_cl > 0:
                    contrastive = nt_xent_loss(
                        online_one["projection"], online_two["projection"], config.teacher.contrastive_temperature
                    )

                bootstrap = tf.constant(0.0, tf.float32)
                if config.teacher.lambda_byol > 0:
                    target_one = target_projector(batch["view_one"], training=False)
                    target_two = target_projector(batch["view_two"], training=False)
                    bootstrap = byol_loss(
                        online_one["prediction"], online_two["prediction"], target_one, target_two
                    )

                mim = tf.constant(0.0, tf.float32)
                if config.teacher.lambda_mim > 0:
                    reconstruction = online_mim(batch["masked_images"], training=True)
                    mim = masked_reconstruction_loss(batch["view_one"], reconstruction, batch["mask"])

                total = (
                    config.teacher.lambda_cl * contrastive
                    + config.teacher.lambda_byol * bootstrap
                    + config.teacher.lambda_mim * mim
                )
                if online.losses:
                    total += tf.add_n(online.losses)
            gradients = tape.gradient(total, online.trainable_variables)
            gradient_pairs = [
                (gradient, variable)
                for gradient, variable in zip(gradients, online.trainable_variables)
                if gradient is not None
            ]
            ssl_optimizer.apply_gradients(gradient_pairs)
            if config.teacher.lambda_byol > 0:
                update_ema_target(online, target, decay)
            return {"loss": total, "contrastive": contrastive, "byol": bootstrap, "mim": mim}

        ssl_history: list[dict] = []
        total_ssl_batches = dataset_batches(ssl_dataset)
        for epoch in range(1, config.teacher.ssl_epochs + 1):
            metrics = {name: tf.keras.metrics.Mean() for name in ("loss", "contrastive", "byol", "mim")}
            progress = tqdm(
                ssl_dataset,
                desc=f"SSL epoch {epoch}/{config.teacher.ssl_epochs}",
                total=total_ssl_batches or None,
                unit="batch",
                dynamic_ncols=True,
            )
            for batch_index, batch in enumerate(progress, start=1):
                results = ssl_step(batch)
                for name, value in results.items():
                    metrics[name].update_state(value)
                running = {name: float(metric.result()) for name, metric in metrics.items()}
                progress.set_postfix({name: f"{value:.4f}" for name, value in running.items()})
                if batch_index % 5 == 0 or batch_index == total_ssl_batches:
                    write_live_progress(
                        output_dir,
                        {
                            "phase": "self_supervised_pretraining",
                            "epoch": epoch,
                            "total_epochs": config.teacher.ssl_epochs,
                            "batch": batch_index,
                            "total_batches": total_ssl_batches,
                            "metrics": running,
                            "learning_rate": float(tf.keras.backend.get_value(ssl_optimizer.learning_rate)),
                            "timestamp": time.time(),
                        },
                    )
            row = {
                "phase": "self_supervised_pretraining",
                "epoch": epoch,
                **{name: float(metric.result()) for name, metric in metrics.items()},
                "learning_rate": float(tf.keras.backend.get_value(ssl_optimizer.learning_rate)),
            }
            ssl_history.append(row)
            progress.close()
            print(" - ".join(f"{name}={value:.5f}" if isinstance(value, float) else f"{name}={value}" for name, value in row.items()))
            save_history(ssl_history, output_dir / "teacher_ssl_history.json")

        online.save(ssl_path)
        print(f"Self-supervised ResNet-101 checkpoint saved to {ssl_path}")

        # Free SSL-only models, EMA target, optimizer, dataset, and traced graph before fine-tuning.
        del target, online_ssl, online_mim, target_projector, ssl_optimizer, ssl_dataset, ssl_step, decay
    gc.collect()

    # Phase 2: all ResNet-101 encoder weights and the classifier are supervised-fine-tuned.
    # When resuming fine-tuning, best_teacher.keras is already the lean classifier, so reuse it.
    if args.resume_finetune:
        classifier = online
    else:
        # Build a lean classifier exposing only the outputs downstream consumers need (logits and
        # features), then drop the full multi-head teacher so the SSL projection/prediction heads
        # and the heavy MIM decoder are freed before fine-tuning backprop peaks in memory.
        classifier = tf.keras.Model(
            online.input,
            {
                "logits": online.output["logits"],
                "features": online.output["features"],
                "feature_map": online.output["feature_map"],
            },
            name="resnet101_classifier",
        )
    del online
    gc.collect()
    finetune_dataset = make_supervised_dataset(splits.train, config, training=True)
    validation_dataset = make_supervised_dataset(splits.validation, config, training=False)
    finetune_optimizer = make_optimizer(config.teacher.finetune_learning_rate, config.teacher.weight_decay)

    @tf.function
    def finetune_step(images: tf.Tensor, labels: tf.Tensor) -> tuple[tf.Tensor, tf.Tensor]:
        with tf.GradientTape() as tape:
            logits = classifier(images, training=True)["logits"]
            loss_value = classification_loss(labels, logits)
            if classifier.losses:
                loss_value += tf.add_n(classifier.losses)
        gradients = tape.gradient(loss_value, classifier.trainable_variables)
        finetune_optimizer.apply_gradients(
            [(gradient, variable) for gradient, variable in zip(gradients, classifier.trainable_variables) if gradient is not None]
        )
        return loss_value, logits

    @tf.function
    def validation_step(images: tf.Tensor, labels: tf.Tensor) -> tuple[tf.Tensor, tf.Tensor]:
        logits = classifier(images, training=False)["logits"]
        return classification_loss(labels, logits), logits

    best_path = output_dir / "best_teacher.keras"
    best_macro_f1 = -1.0
    epochs_without_improvement = 0
    lr_wait = 0
    finetune_history: list[dict] = []
    history_path = output_dir / "teacher_finetune_history.json"
    if args.resume_finetune and history_path.is_file():
        finetune_history = json.loads(history_path.read_text(encoding="utf-8"))
        best_macro_f1 = max(float(row.get("validation_macro_f1", -1.0)) for row in finetune_history)
        print(
            f"Resuming fine-tuning from epoch {len(finetune_history) + 1} "
            f"with best validation macro F1 {best_macro_f1:.5f}"
        )
    total_finetune_batches = dataset_batches(finetune_dataset)
    for epoch in range(1 + len(finetune_history), config.teacher.finetune_epochs + 1):
        train_loss = tf.keras.metrics.Mean()
        train_accuracy = tf.keras.metrics.SparseCategoricalAccuracy()
        train_progress = tqdm(
            finetune_dataset,
            desc=f"Fine-tune epoch {epoch}/{config.teacher.finetune_epochs}",
            total=total_finetune_batches or None,
            unit="batch",
            dynamic_ncols=True,
        )
        for batch_index, (images, labels) in enumerate(train_progress, start=1):
            loss_value, logits = finetune_step(images, labels)
            train_loss.update_state(loss_value, sample_weight=tf.cast(tf.shape(labels)[0], tf.float32))
            train_accuracy.update_state(labels, logits)
            train_progress.set_postfix(
                loss=f"{float(train_loss.result()):.4f}", accuracy=f"{float(train_accuracy.result()):.4f}"
            )
            if batch_index % 5 == 0 or batch_index == total_finetune_batches:
                write_live_progress(
                    output_dir,
                    {
                        "phase": "supervised_finetuning",
                        "epoch": epoch,
                        "total_epochs": config.teacher.finetune_epochs,
                        "batch": batch_index,
                        "total_batches": total_finetune_batches,
                        "metrics": {
                            "loss": float(train_loss.result()),
                            "accuracy": float(train_accuracy.result()),
                        },
                        "learning_rate": float(tf.keras.backend.get_value(finetune_optimizer.learning_rate)),
                        "timestamp": time.time(),
                    },
                )
        train_progress.close()

        validation_loss = tf.keras.metrics.Mean()
        validation_accuracy = tf.keras.metrics.SparseCategoricalAccuracy()
        validation_true: list[int] = []
        validation_predicted: list[int] = []
        for images, labels in validation_dataset:
            loss_value, logits = validation_step(images, labels)
            validation_loss.update_state(loss_value, sample_weight=tf.cast(tf.shape(labels)[0], tf.float32))
            validation_accuracy.update_state(labels, logits)
            validation_true.extend(labels.numpy().astype(int).tolist())
            validation_predicted.extend(tf.argmax(logits, axis=1).numpy().astype(int).tolist())
        row = {
            "phase": "supervised_finetuning",
            "epoch": epoch,
            "train_loss": float(train_loss.result()),
            "train_accuracy": float(train_accuracy.result()),
            "validation_loss": float(validation_loss.result()),
            "validation_accuracy": float(validation_accuracy.result()),
            "validation_macro_f1": macro_f1_from_predictions(
                validation_true, validation_predicted, config.data.num_classes
            ),
            "learning_rate": float(tf.keras.backend.get_value(finetune_optimizer.learning_rate)),
        }
        finetune_history.append(row)
        print(" - ".join(f"{name}={value:.5f}" if isinstance(value, float) else f"{name}={value}" for name, value in row.items()))

        current_macro_f1 = row["validation_macro_f1"]
        if current_macro_f1 > best_macro_f1:
            best_macro_f1 = current_macro_f1
            epochs_without_improvement = 0
            lr_wait = 0
            classifier.save(best_path)
        else:
            epochs_without_improvement += 1
            lr_wait += 1
            if lr_wait >= config.runtime.reduce_lr_patience:
                reduce_learning_rate(finetune_optimizer, 0.5, config.runtime.min_learning_rate)
                lr_wait = 0
            if epochs_without_improvement >= config.runtime.early_stopping_patience:
                print(f"Supervised fine-tuning stopped after epoch {epoch}")
                break
        save_history(finetune_history, output_dir / "teacher_finetune_history.json")

    save_history(finetune_history, output_dir / "teacher_finetune_history.json")
    save_history(ssl_history + finetune_history, output_dir / "teacher_history.json")

    selected_epoch = max(
        (row["epoch"] for row in finetune_history if row.get("validation_macro_f1", -1.0) >= best_macro_f1 - 1e-9),
        default=len(finetune_history),
    )

    candidate_hyperparameters = selected_teacher_hyperparameters(config)
    (output_dir / "candidate_hyperparameters.json").write_text(
        json.dumps(candidate_hyperparameters, indent=2, sort_keys=True), encoding="utf-8"
    )

    held_out_true: list[int] = []
    held_out_predicted: list[int] = []
    best_model = tf.keras.models.load_model(best_path)
    best_classifier = tf.keras.Model(
        best_model.input,
        {name: best_model.output[name] for name in ("logits", "features", "feature_map")},
        name="resnet101_eval_classifier",
    )
    del best_model
    for images, labels in validation_dataset:
        logits = best_classifier(images, training=False)["logits"]
        held_out_true.extend(labels.numpy().astype(int).tolist())
        held_out_predicted.extend(tf.argmax(logits, axis=1).numpy().astype(int).tolist())
    del best_classifier

    final_macro_f1 = macro_f1_from_predictions(held_out_true, held_out_predicted, config.data.num_classes)
    validation_metrics = {
        "partition": "validation",
        "metric": "macro_f1",
        "value": final_macro_f1,
        "selected_epoch": selected_epoch,
        "num_samples": len(held_out_true),
        "test_set_evaluated": False,
    }
    (output_dir / "validation_metrics.json").write_text(
        json.dumps(validation_metrics, indent=2, sort_keys=True), encoding="utf-8"
    )

    write_reproducibility_manifest(
        config, splits, output_dir, selected_epoch, final_macro_f1,
    )
    assert_teacher_partition_isolation(splits)

    print(f"Best fine-tuned ResNet-101 saved to {best_path} (validation macro F1={best_macro_f1:.5f})")
    print(f"Reproducibility manifest written to {output_dir / 'reproducibility_manifest.json'}")
    return best_path


if __name__ == "__main__":
    train(parse_args())
