"""Stage 2: self-supervise ResNet-101, then fine-tune it for five classes."""

from __future__ import annotations

import argparse
from pathlib import Path

import tensorflow as tf

from ai.data.dataset import make_supervised_dataset, make_teacher_dataset, prepare_splits, write_label_map
from ai.losses.byol_loss import byol_loss
from ai.losses.classification_loss import classification_loss
from ai.losses.contrastive_loss import nt_xent_loss
from ai.losses.mim_loss import masked_reconstruction_loss
from ai.models.teacher import build_ema_target, build_teacher, update_ema_target
from ai.training.common import add_common_arguments, configured_experiment, make_optimizer, reduce_learning_rate, save_history


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    return parser.parse_args()


def train(args: argparse.Namespace) -> Path:
    config = configured_experiment(args, "teacher_experiment_config.json")
    output_dir = Path(config.runtime.output_dir)
    splits = prepare_splits(config, output_dir / "split_manifest.json")
    write_label_map(splits.class_names, output_dir / "label_map.json")
    ssl_dataset = make_teacher_dataset(splits.train, config, training=True)

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
            if config.teacher.lambda_contrastive > 0:
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
                config.teacher.lambda_contrastive * contrastive
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
    for epoch in range(1, config.teacher.ssl_epochs + 1):
        metrics = {name: tf.keras.metrics.Mean() for name in ("loss", "contrastive", "byol", "mim")}
        for batch in ssl_dataset:
            results = ssl_step(batch)
            for name, value in results.items():
                metrics[name].update_state(value)
        row = {
            "phase": "self_supervised_pretraining",
            "epoch": epoch,
            **{name: float(metric.result()) for name, metric in metrics.items()},
            "learning_rate": float(tf.keras.backend.get_value(ssl_optimizer.learning_rate)),
        }
        ssl_history.append(row)
        print(" - ".join(f"{name}={value:.5f}" if isinstance(value, float) else f"{name}={value}" for name, value in row.items()))
        save_history(ssl_history, output_dir / "teacher_ssl_history.json")

    ssl_path = output_dir / "resnet101_ssl_pretrained.keras"
    online.save(ssl_path)
    print(f"Self-supervised ResNet-101 checkpoint saved to {ssl_path}")

    # Phase 2: all ResNet-101 encoder weights and the classifier are supervised-fine-tuned.
    finetune_dataset = make_supervised_dataset(splits.train, config, training=True)
    validation_dataset = make_supervised_dataset(splits.validation, config, training=False)
    classifier = tf.keras.Model(online.input, online.output["logits"], name="resnet101_classifier")
    finetune_optimizer = make_optimizer(config.teacher.finetune_learning_rate, config.teacher.weight_decay)

    @tf.function
    def finetune_step(images: tf.Tensor, labels: tf.Tensor) -> tuple[tf.Tensor, tf.Tensor]:
        with tf.GradientTape() as tape:
            logits = classifier(images, training=True)
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
        logits = classifier(images, training=False)
        return classification_loss(labels, logits), logits

    best_path = output_dir / "best_teacher.keras"
    best_accuracy = -1.0
    epochs_without_improvement = 0
    lr_wait = 0
    finetune_history: list[dict] = []
    for epoch in range(1, config.teacher.finetune_epochs + 1):
        train_loss = tf.keras.metrics.Mean()
        train_accuracy = tf.keras.metrics.SparseCategoricalAccuracy()
        for images, labels in finetune_dataset:
            loss_value, logits = finetune_step(images, labels)
            train_loss.update_state(loss_value, sample_weight=tf.cast(tf.shape(labels)[0], tf.float32))
            train_accuracy.update_state(labels, logits)

        validation_loss = tf.keras.metrics.Mean()
        validation_accuracy = tf.keras.metrics.SparseCategoricalAccuracy()
        for images, labels in validation_dataset:
            loss_value, logits = validation_step(images, labels)
            validation_loss.update_state(loss_value, sample_weight=tf.cast(tf.shape(labels)[0], tf.float32))
            validation_accuracy.update_state(labels, logits)
        row = {
            "phase": "supervised_finetuning",
            "epoch": epoch,
            "train_loss": float(train_loss.result()),
            "train_accuracy": float(train_accuracy.result()),
            "validation_loss": float(validation_loss.result()),
            "validation_accuracy": float(validation_accuracy.result()),
            "learning_rate": float(tf.keras.backend.get_value(finetune_optimizer.learning_rate)),
        }
        finetune_history.append(row)
        print(" - ".join(f"{name}={value:.5f}" if isinstance(value, float) else f"{name}={value}" for name, value in row.items()))

        current_accuracy = row["validation_accuracy"]
        if current_accuracy > best_accuracy:
            best_accuracy = current_accuracy
            epochs_without_improvement = 0
            lr_wait = 0
            online.save(best_path)
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
    print(f"Best fine-tuned ResNet-101 saved to {best_path} (validation accuracy={best_accuracy:.5f})")
    return best_path


if __name__ == "__main__":
    train(parse_args())
