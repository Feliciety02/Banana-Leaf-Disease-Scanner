"""Train the Coordinate Attention student without knowledge distillation.

This recovery run establishes whether the enhanced architecture itself can beat
the stock MobileNetV3 baseline before a teacher is allowed to influence it.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import tensorflow as tf
from tqdm import tqdm

from ai.data.dataset import make_supervised_dataset, prepare_splits, write_label_map
from ai.losses.classification_loss import classification_loss
from ai.models.coordinate_attention import CoordinateAttention
from ai.models.mobilenetv3_student import (
    HardSwish,
    build_student,
    configure_pretrained_student_stage,
    initialize_shared_backbone_from_mobilenetv3,
    logits_only_model,
    shared_backbone_layer_names,
)
from ai.training.common import (
    add_common_arguments,
    configured_experiment,
    macro_f1_from_predictions,
    make_optimizer,
    reduce_learning_rate,
    save_history,
    validate_model_input,
)


LIVE_FILE = "student_live.json"
HISTORY_FILE = "student_supervised_history.json"
BEST_MODEL_FILE = "best_supervised_student.keras"
LATEST_MODEL_FILE = "latest_supervised_student.keras"
COMPLETE_FILE = "student_supervised_training.complete.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument("--resume", action="store_true", help="Continue from the latest completed epoch")
    return parser.parse_args()


def write_json_atomic(destination: Path, payload: dict | list) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    temporary.replace(destination)


def write_live_progress(output_dir: Path, payload: dict) -> None:
    write_json_atomic(output_dir / LIVE_FILE, payload)


def stage_for_epoch(epoch: int, warmup_epochs: int) -> str:
    return "attention_head_warmup" if epoch <= warmup_epochs else "backbone_finetune"


def resume_stage_state(
    history: list[dict],
    stage: str,
    initial_learning_rate: float,
    reduce_lr_patience: int,
    min_learning_rate: float,
) -> tuple[int, int, float, float, float]:
    """Reconstruct stage-local early-stop and LR-reduction state."""
    best_macro_f1 = -1.0
    best_validation_loss = float("inf")
    epochs_without_improvement = 0
    lr_wait = 0
    learning_rate = initial_learning_rate
    for row in (item for item in history if item.get("stage") == stage):
        macro_f1 = float(row["validation_macro_f1"])
        validation_loss = float(row["validation_loss"])
        if macro_f1 > best_macro_f1:
            best_macro_f1 = macro_f1
            epochs_without_improvement = 0
        else:
            epochs_without_improvement += 1
        if validation_loss < best_validation_loss:
            best_validation_loss = validation_loss
            lr_wait = 0
        else:
            lr_wait += 1
            if lr_wait >= reduce_lr_patience:
                learning_rate = max(learning_rate * 0.5, min_learning_rate)
                lr_wait = 0
    return epochs_without_improvement, lr_wait, learning_rate, best_macro_f1, best_validation_loss


def _load_student(path: Path, config) -> tf.keras.Model:
    student = tf.keras.models.load_model(
        path,
        custom_objects={"CoordinateAttention": CoordinateAttention, "HardSwish": HardSwish},
        compile=False,
    )
    if student.name != "coordinate_attention_enhanced_mobilenetv3":
        raise ValueError(f"Expected the Coordinate Attention student, received '{student.name}'")
    validate_model_input(student, config, "Resumed student model")
    return student


def train(args: argparse.Namespace) -> Path:
    config = configured_experiment(args, "student_supervised_experiment_config.json")
    if config.distillation.enabled:
        raise ValueError("This entry point requires distillation.enabled=false")
    if not config.student.coordinate_attention or not config.student.imagenet_weights:
        raise ValueError("This recovery run requires Coordinate Attention and ImageNet initialization")

    output_dir = Path(config.runtime.output_dir)
    history_path = output_dir / HISTORY_FILE
    latest_path = output_dir / LATEST_MODEL_FILE
    best_path = output_dir / BEST_MODEL_FILE
    splits = prepare_splits(config, output_dir / "split_manifest.json")
    write_label_map(splits.class_names, output_dir / "label_map.json")
    training = make_supervised_dataset(splits.train, config, training=True)
    validation = make_supervised_dataset(splits.validation, config, training=False)
    total_batches = int(training.cardinality())
    total_batches = total_batches if total_batches > 0 else 0

    history: list[dict] = []
    if args.resume:
        if not latest_path.is_file() or not history_path.is_file():
            raise FileNotFoundError(
                f"Resume needs both {latest_path.name} and {history_path.name} in {output_dir}"
            )
        history = json.loads(history_path.read_text(encoding="utf-8"))
        student = _load_student(latest_path, config)
        transferred_layers = shared_backbone_layer_names()
        start_epoch = max((int(row["epoch"]) for row in history), default=0) + 1
        print(f"Resuming supervised enhanced student at epoch {start_epoch}")
    else:
        if history_path.exists() or latest_path.exists():
            raise FileExistsError(
                f"Existing recovery artifacts found in {output_dir}; use --resume or choose a new output directory"
            )
        student = build_student(config)
        transferred_layers = initialize_shared_backbone_from_mobilenetv3(student, config)
        start_epoch = 1
        print(f"Transferred ImageNet weights into {len(transferred_layers)} shared backbone layers")

    warmup_epochs = min(config.student.pretrained_warmup_epochs, config.student.epochs)
    best_macro_f1 = max((float(row["validation_macro_f1"]) for row in history), default=-1.0)
    current_stage = ""
    optimizer = None
    train_step = None
    epochs_without_improvement = 0
    lr_wait = 0
    best_stage_validation_loss = float("inf")

    for epoch in range(start_epoch, config.student.epochs + 1):
        stage = stage_for_epoch(epoch, warmup_epochs)
        if stage != current_stage:
            # Match the baseline protocol: begin convolution fine-tuning from
            # the validation-selected warm-up checkpoint, not merely epoch 20.
            entering_finetune = (
                stage == "backbone_finetune"
                and not any(row.get("stage") == "backbone_finetune" for row in history)
            )
            if entering_finetune:
                if not best_path.is_file():
                    raise FileNotFoundError(
                        f"Cannot begin fine-tuning without the warm-up checkpoint: {best_path}"
                    )
                student = _load_student(best_path, config)
                print("Loaded the validation-selected warm-up checkpoint for backbone fine-tuning")
            head_only = stage == "attention_head_warmup"
            stage_details = configure_pretrained_student_stage(
                student,
                transferred_layers,
                head_only=head_only,
                freeze_batch_norm=config.student.freeze_batch_norm_during_finetune,
            )
            initial_lr = (
                config.student.pretrained_warmup_learning_rate
                if head_only
                else config.student.learning_rate
            )
            (
                epochs_without_improvement,
                lr_wait,
                resumed_lr,
                _,
                best_stage_validation_loss,
            ) = resume_stage_state(
                history,
                stage,
                initial_lr,
                config.runtime.reduce_lr_patience,
                config.runtime.min_learning_rate,
            )
            optimizer = make_optimizer(resumed_lr, config.student.weight_decay)
            logits_model = logits_only_model(student)

            @tf.function
            def compiled_train_step(images: tf.Tensor, labels: tf.Tensor) -> tuple[tf.Tensor, tf.Tensor]:
                with tf.GradientTape() as tape:
                    logits = logits_model(images, training=True)
                    loss = classification_loss(labels, logits)
                    if logits_model.losses:
                        loss += tf.add_n(logits_model.losses)
                gradients = tape.gradient(loss, logits_model.trainable_variables)
                optimizer.apply_gradients(
                    (gradient, variable)
                    for gradient, variable in zip(gradients, logits_model.trainable_variables)
                    if gradient is not None
                )
                return loss, logits

            train_step = compiled_train_step
            current_stage = stage
            print(
                f"Stage={stage}; learning_rate={resumed_lr:g}; "
                f"trainable_variables={stage_details['trainable_variables']}; "
                f"frozen_transferred_batch_norm={stage_details['frozen_batch_norm_layers']}"
            )

        train_loss = tf.keras.metrics.Mean()
        train_accuracy = tf.keras.metrics.SparseCategoricalAccuracy()
        progress = tqdm(
            training,
            desc=f"epoch {epoch}/{config.student.epochs}",
            total=total_batches or None,
            unit="batch",
            dynamic_ncols=True,
        )
        for batch_index, (images, labels) in enumerate(progress, start=1):
            loss, logits = train_step(images, labels)
            batch_size = tf.cast(tf.shape(labels)[0], tf.float32)
            train_loss.update_state(loss, sample_weight=batch_size)
            train_accuracy.update_state(labels, logits)
            progress.set_postfix(
                loss=f"{float(train_loss.result()):.4f}",
                accuracy=f"{float(train_accuracy.result()):.4f}",
            )
            if batch_index == 1 or batch_index % 5 == 0 or batch_index == total_batches:
                write_live_progress(output_dir, {
                    "phase": "enhanced_supervised",
                    "finetune_stage": stage,
                    "epoch": epoch,
                    "total_epochs": config.student.epochs,
                    "batch": batch_index,
                    "total_batches": total_batches,
                    "learning_rate": float(tf.keras.backend.get_value(optimizer.learning_rate)),
                    "metrics": {
                        "loss": float(train_loss.result()),
                        "accuracy": float(train_accuracy.result()),
                    },
                })

        validation_loss = tf.keras.metrics.Mean()
        validation_accuracy = tf.keras.metrics.SparseCategoricalAccuracy()
        truth: list[int] = []
        predicted: list[int] = []
        validation_count = 0
        for images, labels in validation:
            logits = logits_model(images, training=False)
            loss = classification_loss(labels, logits)
            batch_size = tf.cast(tf.shape(labels)[0], tf.float32)
            validation_loss.update_state(loss, sample_weight=batch_size)
            validation_accuracy.update_state(labels, logits)
            truth.extend(labels.numpy().astype(int).tolist())
            predicted.extend(tf.argmax(logits, axis=1).numpy().astype(int).tolist())
            validation_count += int(tf.shape(labels)[0])

        row = {
            "epoch": epoch,
            "stage": stage,
            "train_loss": float(train_loss.result()),
            "train_accuracy": float(train_accuracy.result()),
            "validation_loss": float(validation_loss.result()),
            "validation_accuracy": float(validation_accuracy.result()),
            "validation_macro_f1": macro_f1_from_predictions(truth, predicted, config.data.num_classes),
            "learning_rate": float(tf.keras.backend.get_value(optimizer.learning_rate)),
        }
        history.append(row)
        print(" - ".join(
            f"{name}={value:.5f}" if isinstance(value, float) else f"{name}={value}"
            for name, value in row.items()
        ))

        if row["validation_macro_f1"] > best_macro_f1:
            best_macro_f1 = row["validation_macro_f1"]
            epochs_without_improvement = 0
            student.save(best_path)
        else:
            epochs_without_improvement += 1

        if row["validation_loss"] < best_stage_validation_loss:
            best_stage_validation_loss = row["validation_loss"]
            lr_wait = 0
        else:
            lr_wait += 1
            if lr_wait >= config.runtime.reduce_lr_patience:
                updated_lr = reduce_learning_rate(optimizer, 0.5, config.runtime.min_learning_rate)
                print(f"Reduced learning rate to {updated_lr:g}")
                lr_wait = 0

        student.save(latest_path)
        save_history(history, history_path)
        write_live_progress(output_dir, {
            "phase": "enhanced_supervised",
            "finetune_stage": stage,
            "epoch": epoch,
            "total_epochs": config.student.epochs,
            "batch": total_batches,
            "total_batches": total_batches,
            "learning_rate": float(tf.keras.backend.get_value(optimizer.learning_rate)),
            "metrics": {"loss": row["train_loss"], "accuracy": row["train_accuracy"]},
            "validation_metrics": {
                "validation_loss": row["validation_loss"],
                "validation_accuracy": row["validation_accuracy"],
                "validation_macro_f1": row["validation_macro_f1"],
            },
        })
        if stage == "backbone_finetune" and epochs_without_improvement >= config.runtime.early_stopping_patience:
            print(f"Early stopping after epoch {epoch}")
            break

    if not history:
        raise RuntimeError("No training epochs were completed")
    selected = max(history, key=lambda row: float(row["validation_macro_f1"]))
    write_json_atomic(output_dir / "student_supervised_validation_metrics.json", {
        "partition": "validation",
        "selection_metric": "macro_f1",
        "value": float(selected["validation_macro_f1"]),
        "selected_epoch": int(selected["epoch"]),
        "num_samples": validation_count if start_epoch <= config.student.epochs else len(splits.validation),
        "test_set_evaluated": False,
        "baseline_validation_macro_f1_to_beat": 0.9123085141,
        "distillation_used": False,
    })
    write_json_atomic(output_dir / COMPLETE_FILE, {
        "status": "complete",
        "selected_epoch": int(selected["epoch"]),
        "completed_epochs": int(history[-1]["epoch"]),
        "validation_macro_f1": float(selected["validation_macro_f1"]),
        "beats_baseline_validation_macro_f1": float(selected["validation_macro_f1"]) > 0.9123085141,
    })
    print(
        f"Best supervised enhanced student saved to {best_path} "
        f"(validation macro F1={float(selected['validation_macro_f1']):.5f})"
    )
    return best_path


if __name__ == "__main__":
    train(parse_args())
