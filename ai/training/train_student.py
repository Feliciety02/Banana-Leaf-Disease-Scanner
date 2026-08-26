"""Stage 3: distill a frozen teacher into Enhanced MobileNetV3."""

from __future__ import annotations

import argparse
from pathlib import Path

import tensorflow as tf
from tqdm import tqdm

from ai.data.dataset import make_supervised_dataset, prepare_splits, write_label_map
from ai.losses.classification_loss import classification_loss
from ai.losses.distillation_loss import feature_distillation_loss, logit_distillation_loss, total_distillation_loss
from ai.models.coordinate_attention import CoordinateAttention
from ai.models.mobilenetv3_baseline import build_distillable_baseline
from ai.models.mobilenetv3_student import HardSwish, build_student, initialize_shared_backbone_from_mobilenetv3, shared_backbone_layer_names
from ai.models.teacher import ResNet101Preprocessing
from ai.training.common import add_common_arguments, configured_experiment, macro_f1_from_predictions, make_optimizer, reduce_learning_rate, save_history, validate_model_input


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument("--teacher-model", required=True, help="Path to best_teacher.keras")
    parser.add_argument("--initial-student-model", help="Optional validation-selected student checkpoint to fine-tune")
    return parser.parse_args()


def dataset_batches(dataset: tf.data.Dataset) -> int:
    cardinality = int(dataset.cardinality())
    return cardinality if cardinality > 0 else 0


def train(args: argparse.Namespace) -> Path:
    config = configured_experiment(args, "student_experiment_config.json")
    if not config.distillation.enabled:
        raise ValueError("Use a supervised-only training entry point when distillation.enabled is false")
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
    if teacher.name not in ("resnet101_teacher", "resnet101_classifier"):
        raise ValueError(f"Expected a fine-tuned ResNet-101 teacher, received model '{teacher.name}'")
    validate_model_input(teacher, config, "Teacher model")
    teacher.trainable = False
    for layer in teacher.layers:
        layer.trainable = False
    teacher_distillation_view = tf.keras.Model(
        teacher.input,
        {name: teacher.output[name] for name in ("logits", "feature_map")},
        name="frozen_teacher_distillation_view",
    )
    teacher_distillation_view.trainable = False
    if args.initial_student_model:
        initial_path = Path(args.initial_student_model)
        if not initial_path.is_file():
            raise FileNotFoundError(f"Initial student model not found: {initial_path}")
        student = tf.keras.models.load_model(
            initial_path,
            custom_objects={"CoordinateAttention": CoordinateAttention, "HardSwish": HardSwish},
            compile=False,
        )
        expected_name = (
            "coordinate_attention_enhanced_mobilenetv3"
            if config.student.coordinate_attention
            else "mobilenetv3_small_stock_se_distillation_student"
        )
        if student.name != expected_name:
            raise ValueError(f"Expected {expected_name}, received '{student.name}'")
        validate_model_input(student, config, "Initial student model")
    else:
        student = (
            build_student(config)
            if config.student.coordinate_attention
            else build_distillable_baseline(config)
        )
    transferred_layers: tuple[str, ...] = ()
    if args.initial_student_model and config.student.imagenet_weights:
        transferred_layers = shared_backbone_layer_names()
        print(f"Loaded validation-selected student checkpoint from {args.initial_student_model}")
    elif config.student.imagenet_weights and config.student.coordinate_attention:
        transferred_layers = initialize_shared_backbone_from_mobilenetv3(student, config)
        print(f"Transferred ImageNet weights into {len(transferred_layers)} shared backbone layers")
    warmup_epochs = min(config.student.pretrained_warmup_epochs, config.student.epochs) if transferred_layers and not args.initial_student_model else 0
    if warmup_epochs:
        for layer_name in transferred_layers:
            student.get_layer(layer_name).trainable = False
        print(f"Frozen transferred backbone for {warmup_epochs} warm-up epochs")
    elif args.initial_student_model:
        for layer_name in transferred_layers:
            layer = student.get_layer(layer_name)
            layer.trainable = not isinstance(layer, tf.keras.layers.BatchNormalization)
        print("Enabled convolution fine-tuning while keeping transferred BatchNorm layers frozen")
    def make_train_step(optimizer: tf.keras.optimizers.Optimizer):
        @tf.function
        def train_step(images: tf.Tensor, labels: tf.Tensor) -> dict[str, tf.Tensor]:
            # Teacher execution is outside the tape and always inference-only/frozen.
            teacher_output = teacher_distillation_view(images, training=False)
            with tf.GradientTape() as tape:
                student_output = student(images, training=True)
                hard = classification_loss(labels, student_output["logits"])
                soft = logit_distillation_loss(
                    teacher_output["logits"], student_output["logits"], config.distillation.temperature
                )
                features = feature_distillation_loss(
                    teacher_output["feature_map"], student_output["distill_features"]
                )
                total = total_distillation_loss(
                    hard,
                    soft,
                    features,
                    config.distillation.alpha,
                    config.distillation.beta,
                    config.distillation.gamma,
                )
                if student.losses:
                    total += tf.add_n(student.losses)
            gradients = tape.gradient(total, student.trainable_variables)
            gradient_pairs = [(gradient, variable) for gradient, variable in zip(gradients, student.trainable_variables) if gradient is not None]
            optimizer.apply_gradients(gradient_pairs)
            accuracy = tf.reduce_mean(
                tf.cast(tf.equal(tf.argmax(student_output["logits"], axis=1, output_type=tf.int32), tf.cast(labels, tf.int32)), tf.float32)
            )
            return {"loss": total, "hard_loss": hard, "soft_loss": soft, "feature_loss": features, "accuracy": accuracy}
        return train_step

    initial_learning_rate = config.student.pretrained_warmup_learning_rate if warmup_epochs else config.student.learning_rate
    optimizer = make_optimizer(initial_learning_rate, config.student.weight_decay)
    train_step = make_train_step(optimizer)

    @tf.function
    def validation_step(images: tf.Tensor, labels: tf.Tensor) -> tuple[tf.Tensor, tf.Tensor]:
        logits = student(images, training=False)["logits"]
        return classification_loss(labels, logits), logits

    best_path = output_dir / "best_student.keras"
    best_macro_f1 = -1.0
    if args.initial_student_model:
        initial_true: list[int] = []
        initial_predicted: list[int] = []
        for images, labels in validation_dataset:
            logits = student(images, training=False)["logits"]
            initial_true.extend(labels.numpy().astype(int).tolist())
            initial_predicted.extend(tf.argmax(logits, axis=1).numpy().astype(int).tolist())
        best_macro_f1 = macro_f1_from_predictions(initial_true, initial_predicted, config.data.num_classes)
        student.save(best_path)
        print(f"Initial checkpoint validation macro F1={best_macro_f1:.5f}")
    epochs_without_improvement = 0
    lr_wait = 0
    history: list[dict] = []
    total_batches = dataset_batches(train_dataset)
    for epoch in range(1, config.student.epochs + 1):
        if warmup_epochs and epoch == warmup_epochs + 1:
            for layer_name in transferred_layers:
                layer = student.get_layer(layer_name)
                layer.trainable = not isinstance(layer, tf.keras.layers.BatchNormalization)
            optimizer = make_optimizer(config.student.learning_rate, config.student.weight_decay)
            train_step = make_train_step(optimizer)
            epochs_without_improvement = 0
            lr_wait = 0
            print(f"Unfroze shared backbone at epoch {epoch}; fine-tuning learning rate={config.student.learning_rate}")
        train_metrics = {name: tf.keras.metrics.Mean() for name in ("loss", "hard_loss", "soft_loss", "feature_loss", "accuracy")}
        train_progress = tqdm(
            train_dataset,
            desc=f"Epoch {epoch}/{config.student.epochs}",
            total=total_batches or None,
            unit="batch",
            dynamic_ncols=True,
        )
        for images, labels in train_progress:
            results = train_step(images, labels)
            for name, value in results.items():
                train_metrics[name].update_state(value)
            train_progress.set_postfix(
                loss=f"{float(train_metrics['loss'].result()):.4f}",
                accuracy=f"{float(train_metrics['accuracy'].result()):.4f}",
            )

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
            "epoch": epoch,
            **{f"train_{name}": float(metric.result()) for name, metric in train_metrics.items()},
            "validation_loss": float(validation_loss.result()),
            "validation_accuracy": float(validation_accuracy.result()),
            "validation_macro_f1": macro_f1_from_predictions(
                validation_true, validation_predicted, config.data.num_classes
            ),
            "learning_rate": float(tf.keras.backend.get_value(optimizer.learning_rate)),
        }
        history.append(row)
        print(" - ".join(f"{name}={value:.5f}" if isinstance(value, float) else f"{name}={value}" for name, value in row.items()))

        current_macro_f1 = row["validation_macro_f1"]
        if current_macro_f1 > best_macro_f1:
            best_macro_f1 = current_macro_f1
            epochs_without_improvement = 0
            lr_wait = 0
            student.save(best_path)
        else:
            epochs_without_improvement += 1
            lr_wait += 1
            if lr_wait >= config.runtime.reduce_lr_patience:
                reduce_learning_rate(optimizer, 0.5, config.runtime.min_learning_rate)
                lr_wait = 0
            if epoch > warmup_epochs and epochs_without_improvement >= config.runtime.early_stopping_patience:
                print(f"Early stopping after epoch {epoch}")
                break
        save_history(history, output_dir / "student_history.json")
    save_history(history, output_dir / "student_history.json")
    print(f"Best student saved to {best_path} (validation macro F1={best_macro_f1:.5f})")
    return best_path


if __name__ == "__main__":
    train(parse_args())
