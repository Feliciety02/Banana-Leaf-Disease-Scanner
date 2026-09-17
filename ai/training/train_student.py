"""Stage 3: distill a frozen teacher into Enhanced MobileNetV3."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("TF_GPU_ALLOCATOR", "BFC")

import tensorflow as tf
from tqdm import tqdm

from ai.data.dataset import make_supervised_dataset, prepare_splits, write_label_map
from ai.losses.classification_loss import classification_loss
from ai.losses.distillation_loss import feature_distillation_loss, logit_distillation_loss, total_distillation_loss
from ai.models.coordinate_attention import CoordinateAttention
from ai.models.mobilenetv3_baseline import build_distillable_baseline
from ai.models.mobilenetv3_student import HardSwish, build_student, configure_pretrained_student_stage, initialize_shared_backbone_from_mobilenetv3, shared_backbone_layer_names
from ai.models.teacher import ResNet101Preprocessing
from ai.training.common import add_common_arguments, configured_experiment, macro_f1_from_predictions, make_optimizer, reduce_learning_rate, save_history, validate_model_input


PROGRESS_UPDATE_INTERVAL = 20
COMPLETE_FILE = "student_training.complete.json"
HISTORY_FILE = "student_history.json"
BEST_MODEL_FILE = "best_student.keras"
LATEST_MODEL_FILE = "latest_student.keras"


def write_json_atomic(destination: Path, payload: dict | list) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    temporary.replace(destination)


def _load_student(path: Path, config) -> tf.keras.Model:
    student = tf.keras.models.load_model(
        path,
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
    validate_model_input(student, config, "Resumed student model")
    return student


def training_stage(epoch: int, warmup_epochs: int) -> str:
    """Name the warm-up or fine-tuning stage that owns a given epoch."""
    return "warmup" if warmup_epochs and epoch <= warmup_epochs else "finetune"


def resume_training_state(
    history: list[dict],
    stage: str,
    warmup_epochs: int,
    initial_learning_rate: float,
    reduce_lr_patience: int,
    min_learning_rate: float,
) -> tuple[int, int, float]:
    """Reconstruct stage-local early-stop counters and learning rate."""
    epochs_without_improvement = 0
    lr_wait = 0
    learning_rate = initial_learning_rate
    best_macro_f1 = -1.0
    for row in history:
        if training_stage(int(row["epoch"]), warmup_epochs) != stage:
            continue
        macro_f1 = float(row["validation_macro_f1"])
        if macro_f1 > best_macro_f1:
            best_macro_f1 = macro_f1
            epochs_without_improvement = 0
            lr_wait = 0
        else:
            epochs_without_improvement += 1
            lr_wait += 1
            if lr_wait >= reduce_lr_patience:
                learning_rate = max(learning_rate * 0.5, min_learning_rate)
                lr_wait = 0
    return epochs_without_improvement, lr_wait, learning_rate


def merge_gradient_sums(
    current_sums: list[tf.Tensor | None] | None,
    gradients: list[tf.Tensor | None],
) -> list[tf.Tensor | None]:
    """Add summed micro-batch gradients while preserving missing-gradient slots."""
    if current_sums is None:
        return [gradient for gradient in gradients]
    updated: list[tf.Tensor | None] = []
    for current, gradient in zip(current_sums, gradients):
        if current is None:
            updated.append(gradient)
        elif gradient is None:
            updated.append(current)
        else:
            updated.append(current + gradient)
    return updated


def averaged_gradient_pairs(
    gradient_sums: list[tf.Tensor | None],
    accumulated_samples: tf.Tensor,
    variables: list[tf.Variable],
):
    """Return sample-weighted mean gradients for one optimizer update."""
    return [
        (gradient / tf.cast(accumulated_samples, gradient.dtype), variable)
        for gradient, variable in zip(gradient_sums, variables)
        if gradient is not None
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument("--teacher-model", required=True, help="Path to best_teacher.keras")
    parser.add_argument("--initial-student-model", help="Optional validation-selected student checkpoint to fine-tune")
    parser.add_argument("--resume", action="store_true", help="Continue from the latest completed epoch")
    return parser.parse_args()


def dataset_batches(dataset: tf.data.Dataset) -> int:
    cardinality = int(dataset.cardinality())
    return cardinality if cardinality > 0 else 0


def train(args: argparse.Namespace) -> Path:
    config = configured_experiment(args, "student_experiment_config.json")
    if not config.distillation.enabled:
        raise ValueError("Use a supervised-only training entry point when distillation.enabled is false")
    output_dir = Path(config.runtime.output_dir)
    history_path = output_dir / HISTORY_FILE
    latest_path = output_dir / LATEST_MODEL_FILE
    best_path = output_dir / BEST_MODEL_FILE
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
    history: list[dict] = []
    if args.resume:
        if args.initial_student_model:
            raise ValueError("--resume cannot be combined with --initial-student-model")
        if not latest_path.is_file() or not history_path.is_file():
            raise FileNotFoundError(
                f"Resume needs both {latest_path.name} and {history_path.name} in {output_dir}"
            )
        history = json.loads(history_path.read_text(encoding="utf-8"))
        student = _load_student(latest_path, config)
        transferred_layers: tuple[str, ...] = (
            shared_backbone_layer_names()
            if config.student.imagenet_weights and config.student.coordinate_attention
            else ()
        )
        start_epoch = max((int(row["epoch"]) for row in history), default=0) + 1
        print(f"Resuming distillation student at epoch {start_epoch}")
    else:
        if history_path.exists() or latest_path.exists():
            raise FileExistsError(
                f"Existing recovery artifacts found in {output_dir}; use --resume or choose a new output directory"
            )
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
        transferred_layers = ()
        if args.initial_student_model and config.student.imagenet_weights:
            transferred_layers = shared_backbone_layer_names()
            print(f"Loaded validation-selected student checkpoint from {args.initial_student_model}")
        elif config.student.imagenet_weights and config.student.coordinate_attention:
            transferred_layers = initialize_shared_backbone_from_mobilenetv3(student, config)
            print(f"Transferred ImageNet weights into {len(transferred_layers)} shared backbone layers")
        start_epoch = 1
    warmup_epochs = min(config.student.pretrained_warmup_epochs, config.student.epochs) if transferred_layers and not args.initial_student_model else 0
    if warmup_epochs and not (args.resume and start_epoch > warmup_epochs):
        configure_pretrained_student_stage(
            student,
            transferred_layers,
            head_only=True,
            freeze_batch_norm=config.student.freeze_batch_norm_during_finetune,
        )
        print(f"Frozen transferred backbone for {warmup_epochs} warm-up epochs")
    elif transferred_layers:
        stage_details = configure_pretrained_student_stage(
            student,
            transferred_layers,
            head_only=False,
            freeze_batch_norm=config.student.freeze_batch_norm_during_finetune,
        )
        print(
            "Enabled convolution fine-tuning; "
            f"frozen transferred BatchNorm layers={stage_details['frozen_batch_norm_layers']}"
        )
    student_logits_view = tf.keras.Model(
        student.input,
        student.output["logits"],
        name="student_validation_logits",
    )
    def make_train_step():
        @tf.function
        def train_step(images: tf.Tensor, labels: tf.Tensor):
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
                # Loss functions return a batch mean. Accumulate summed gradients
                # so a short final micro-batch receives the correct sample weight.
                batch_samples = tf.cast(tf.shape(labels)[0], total.dtype)
                summed_total = total * batch_samples
            gradients = tape.gradient(summed_total, student.trainable_variables)
            accuracy = tf.reduce_mean(
                tf.cast(tf.equal(tf.argmax(student_output["logits"], axis=1, output_type=tf.int32), tf.cast(labels, tf.int32)), tf.float32)
            )
            return (
                {"loss": total, "hard_loss": hard, "soft_loss": soft, "feature_loss": features, "accuracy": accuracy},
                gradients,
                batch_samples,
            )
        return train_step

    def apply_accumulated_gradients(
        optimizer: tf.keras.optimizers.Optimizer,
        gradient_sums: list[tf.Tensor | None],
        accumulated_samples: tf.Tensor,
    ) -> None:
        pairs = averaged_gradient_pairs(
            gradient_sums, accumulated_samples, student.trainable_variables
        )
        optimizer.apply_gradients(pairs)

    accumulation_steps = config.student.gradient_accumulation_steps
    print(
        f"Gradient accumulation steps={accumulation_steps}; "
        f"effective batch size up to {config.data.batch_size * accumulation_steps}"
    )

    @tf.function
    def validation_step(images: tf.Tensor, labels: tf.Tensor) -> tuple[tf.Tensor, tf.Tensor]:
        # The logits-only view prunes the training-only 7x7x2048 feature adapter.
        logits = student_logits_view(images, training=False)
        return classification_loss(labels, logits), logits

    best_macro_f1 = -1.0
    validation_sample_count = 0
    if args.resume:
        best_macro_f1 = max(
            (float(row["validation_macro_f1"]) for row in history), default=-1.0
        )
        resume_stage = training_stage(start_epoch, warmup_epochs)
        stage_initial_learning_rate = (
            config.student.pretrained_warmup_learning_rate
            if resume_stage == "warmup"
            else config.student.learning_rate
        )
        (
            epochs_without_improvement,
            lr_wait,
            resumed_learning_rate,
        ) = resume_training_state(
            history,
            resume_stage,
            warmup_epochs,
            stage_initial_learning_rate,
            config.runtime.reduce_lr_patience,
            config.runtime.min_learning_rate,
        )
        optimizer = make_optimizer(resumed_learning_rate, config.student.weight_decay)
        train_step = make_train_step()
        print(
            f"Restored stage={resume_stage}; learning_rate={resumed_learning_rate:g}; "
            f"best_validation_macro_f1={best_macro_f1:.5f}"
        )
    else:
        initial_learning_rate = config.student.pretrained_warmup_learning_rate if warmup_epochs else config.student.learning_rate
        optimizer = make_optimizer(initial_learning_rate, config.student.weight_decay)
        train_step = make_train_step()
        if args.initial_student_model:
            initial_true: list[int] = []
            initial_predicted: list[int] = []
            for images, labels in validation_dataset:
                logits = student_logits_view(images, training=False)
                initial_true.extend(labels.numpy().astype(int).tolist())
                initial_predicted.extend(tf.argmax(logits, axis=1).numpy().astype(int).tolist())
            best_macro_f1 = macro_f1_from_predictions(initial_true, initial_predicted, config.data.num_classes)
            student.save(best_path)
            print(f"Initial checkpoint validation macro F1={best_macro_f1:.5f}")
        epochs_without_improvement = 0
        lr_wait = 0
    total_batches = dataset_batches(train_dataset)
    for epoch in range(start_epoch, config.student.epochs + 1):
        stage = training_stage(epoch, warmup_epochs)
        if warmup_epochs and epoch == warmup_epochs + 1:
            configure_pretrained_student_stage(
                student,
                transferred_layers,
                head_only=False,
                freeze_batch_norm=config.student.freeze_batch_norm_during_finetune,
            )
            optimizer = make_optimizer(config.student.learning_rate, config.student.weight_decay)
            train_step = make_train_step()
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
            mininterval=1.0,
            miniters=10,
        )
        gradient_sums: list[tf.Tensor | None] | None = None
        accumulated_samples: tf.Tensor | None = None
        accumulated_batches = 0
        for batch_index, (images, labels) in enumerate(train_progress, start=1):
            results, gradients, batch_samples = train_step(images, labels)
            if gradient_sums is None:
                gradient_sums = merge_gradient_sums(None, gradients)
                accumulated_samples = batch_samples
            else:
                gradient_sums = merge_gradient_sums(gradient_sums, gradients)
                accumulated_samples = accumulated_samples + batch_samples
            accumulated_batches += 1
            if accumulated_batches == accumulation_steps or batch_index == total_batches:
                if accumulated_samples is None:
                    raise RuntimeError("Gradient accumulation has no sample count")
                apply_accumulated_gradients(optimizer, gradient_sums, accumulated_samples)
                gradient_sums = None
                accumulated_samples = None
                accumulated_batches = 0
            for name, value in results.items():
                train_metrics[name].update_state(value)
            if batch_index % PROGRESS_UPDATE_INTERVAL == 0 or batch_index == total_batches:
                # Converting device metrics to Python values synchronizes the GPU.
                # Repaint periodically without changing any optimization step.
                train_progress.set_postfix(
                    loss=f"{float(train_metrics['loss'].result()):.4f}",
                    accuracy=f"{float(train_metrics['accuracy'].result()):.4f}",
                )
        # Dataset cardinality can be unknown for some future input pipelines.
        # Flush a final partial group even when `total_batches` was unavailable.
        if gradient_sums is not None:
            if accumulated_samples is None:
                raise RuntimeError("Gradient accumulation has no sample count")
            apply_accumulated_gradients(optimizer, gradient_sums, accumulated_samples)

        validation_loss = tf.keras.metrics.Mean()
        validation_accuracy = tf.keras.metrics.SparseCategoricalAccuracy()
        validation_true_batches: list[tf.Tensor] = []
        validation_predicted_batches: list[tf.Tensor] = []
        for images, labels in validation_dataset:
            loss_value, logits = validation_step(images, labels)
            validation_loss.update_state(loss_value, sample_weight=tf.cast(tf.shape(labels)[0], tf.float32))
            validation_accuracy.update_state(labels, logits)
            validation_true_batches.append(labels)
            validation_predicted_batches.append(tf.argmax(logits, axis=1, output_type=tf.int32))
        # Copy the small label/prediction vectors to CPU once per epoch instead
        # of synchronizing the GPU once per validation batch.
        validation_true = tf.concat(validation_true_batches, axis=0).numpy().astype(int).tolist()
        validation_predicted = tf.concat(validation_predicted_batches, axis=0).numpy().astype(int).tolist()
        validation_sample_count = len(validation_true)
        row = {
            "epoch": epoch,
            "stage": stage,
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
        student.save(latest_path)
        save_history(history, history_path)
    save_history(history, history_path)

    selected_epoch = max(
        (row["epoch"] for row in history if row.get("validation_macro_f1", -1.0) >= best_macro_f1 - 1e-9),
        default=len(history),
    )
    validation_metrics = {
        "partition": "validation",
        "metric": "macro_f1",
        "value": best_macro_f1,
        "selected_epoch": selected_epoch,
        "num_samples": validation_sample_count,
        "test_set_evaluated": False,
        "student_backbone": config.student.backbone,
        "coordinate_attention": config.student.coordinate_attention,
        "distillation": {
            "alpha": config.distillation.alpha,
            "beta": config.distillation.beta,
            "gamma": config.distillation.gamma,
            "temperature": config.distillation.temperature,
        },
    }
    write_json_atomic(output_dir / "student_validation_metrics.json", validation_metrics)
    write_json_atomic(output_dir / COMPLETE_FILE, {
        "status": "complete",
        "selected_epoch": int(selected_epoch),
        "completed_epochs": int(history[-1]["epoch"]),
        "validation_macro_f1": float(best_macro_f1),
    })
    print(f"Best student saved to {best_path} (validation macro F1={best_macro_f1:.5f})")
    return best_path


if __name__ == "__main__":
    train(parse_args())
