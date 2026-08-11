"""Stage 3: distill a frozen teacher into Enhanced MobileNetV3."""

from __future__ import annotations

import argparse
from pathlib import Path

import tensorflow as tf

from ai.data.dataset import make_supervised_dataset, prepare_splits, write_label_map
from ai.losses.classification_loss import classification_loss
from ai.losses.distillation_loss import feature_distillation_loss, logit_distillation_loss
from ai.models.mobilenetv3_student import build_student
from ai.models.teacher import ResNet101Preprocessing
from ai.training.common import add_common_arguments, configured_experiment, make_optimizer, reduce_learning_rate, save_history, validate_model_input


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument("--teacher-model", required=True, help="Path to best_teacher.keras")
    return parser.parse_args()


def train(args: argparse.Namespace) -> Path:
    config = configured_experiment(args, "student_experiment_config.json")
    output_dir = Path(config.runtime.output_dir)
    splits = prepare_splits(config, output_dir / "split_manifest.json")
    write_label_map(splits.class_names, output_dir / "label_map.json")
    train_dataset = make_supervised_dataset(splits.train, config, training=True)
    validation_dataset = make_supervised_dataset(splits.validation, config, training=False)

    teacher_path = Path(args.teacher_model)
    if not teacher_path.is_file():
        raise FileNotFoundError(f"Teacher model not found: {teacher_path}")
    teacher = tf.keras.models.load_model(
        teacher_path, custom_objects={"ResNet101Preprocessing": ResNet101Preprocessing}, compile=False
    )
    if teacher.name != "resnet101_teacher":
        raise ValueError(f"Expected a fine-tuned ResNet-101 teacher, received model '{teacher.name}'")
    validate_model_input(teacher, config, "Teacher model")
    teacher.trainable = False
    for layer in teacher.layers:
        layer.trainable = False
    teacher_distillation_view = tf.keras.Model(
        teacher.input,
        {name: teacher.output[name] for name in ("logits", "features")},
        name="frozen_teacher_distillation_view",
    )
    teacher_distillation_view.trainable = False
    student = build_student(config)
    optimizer = make_optimizer(config.student.learning_rate, config.student.weight_decay)
    alpha = config.student.distillation_alpha

    @tf.function
    def train_step(images: tf.Tensor, labels: tf.Tensor) -> dict[str, tf.Tensor]:
        # Teacher execution is outside the tape and always inference-only/frozen.
        teacher_output = teacher_distillation_view(images, training=False)
        with tf.GradientTape() as tape:
            student_output = student(images, training=True)
            hard = classification_loss(labels, student_output["logits"])
            soft = logit_distillation_loss(
                teacher_output["logits"], student_output["logits"], config.student.distillation_temperature
            )
            features = tf.constant(0.0, tf.float32)
            if config.student.feature_distillation_enabled:
                features = feature_distillation_loss(
                    teacher_output["features"], student_output["distill_features"]
                )
            total = alpha * hard + (1.0 - alpha) * soft
            if config.student.feature_distillation_enabled:
                total += config.student.feature_distillation_weight * features
            if student.losses:
                total += tf.add_n(student.losses)
        gradients = tape.gradient(total, student.trainable_variables)
        gradient_pairs = [(gradient, variable) for gradient, variable in zip(gradients, student.trainable_variables) if gradient is not None]
        optimizer.apply_gradients(gradient_pairs)
        accuracy = tf.reduce_mean(
            tf.cast(tf.equal(tf.argmax(student_output["logits"], axis=1, output_type=tf.int32), tf.cast(labels, tf.int32)), tf.float32)
        )
        return {"loss": total, "hard_loss": hard, "soft_loss": soft, "feature_loss": features, "accuracy": accuracy}

    @tf.function
    def validation_step(images: tf.Tensor, labels: tf.Tensor) -> tuple[tf.Tensor, tf.Tensor]:
        logits = student(images, training=False)["logits"]
        return classification_loss(labels, logits), logits

    best_path = output_dir / "best_student.keras"
    best_accuracy = -1.0
    epochs_without_improvement = 0
    lr_wait = 0
    history: list[dict] = []
    for epoch in range(1, config.student.epochs + 1):
        train_metrics = {name: tf.keras.metrics.Mean() for name in ("loss", "hard_loss", "soft_loss", "feature_loss", "accuracy")}
        for images, labels in train_dataset:
            results = train_step(images, labels)
            for name, value in results.items():
                train_metrics[name].update_state(value)

        validation_loss = tf.keras.metrics.Mean()
        validation_accuracy = tf.keras.metrics.SparseCategoricalAccuracy()
        for images, labels in validation_dataset:
            loss_value, logits = validation_step(images, labels)
            validation_loss.update_state(loss_value, sample_weight=tf.cast(tf.shape(labels)[0], tf.float32))
            validation_accuracy.update_state(labels, logits)
        row = {
            "epoch": epoch,
            **{f"train_{name}": float(metric.result()) for name, metric in train_metrics.items()},
            "validation_loss": float(validation_loss.result()),
            "validation_accuracy": float(validation_accuracy.result()),
            "learning_rate": float(tf.keras.backend.get_value(optimizer.learning_rate)),
        }
        history.append(row)
        print(" - ".join(f"{name}={value:.5f}" if isinstance(value, float) else f"{name}={value}" for name, value in row.items()))

        current_accuracy = row["validation_accuracy"]
        if current_accuracy > best_accuracy:
            best_accuracy = current_accuracy
            epochs_without_improvement = 0
            lr_wait = 0
            student.save(best_path)
        else:
            epochs_without_improvement += 1
            lr_wait += 1
            if lr_wait >= config.runtime.reduce_lr_patience:
                reduce_learning_rate(optimizer, 0.5, config.runtime.min_learning_rate)
                lr_wait = 0
            if epochs_without_improvement >= config.runtime.early_stopping_patience:
                print(f"Early stopping after epoch {epoch}")
                break
        save_history(history, output_dir / "student_history.json")
    save_history(history, output_dir / "student_history.json")
    print(f"Best student saved to {best_path} (validation accuracy={best_accuracy:.5f})")
    return best_path


if __name__ == "__main__":
    train(parse_args())
