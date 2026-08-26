"""Train explicit supervised-only thesis ablations 2 or 5 using validation macro F1."""

from __future__ import annotations

import argparse
from pathlib import Path

import tensorflow as tf

from ai.data.dataset import make_supervised_dataset, prepare_splits, write_label_map
from ai.losses.classification_loss import classification_loss
from ai.models.mobilenetv3_student import build_student
from ai.models.teacher import build_teacher
from ai.training.common import (
    add_common_arguments,
    configured_experiment,
    macro_f1_from_predictions,
    make_optimizer,
    save_history,
)


SUPPORTED = {
    "configuration_2_ca_mobilenetv3_small_supervised",
    "configuration_5_resnet101_supervised_no_ssl",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    return parser.parse_args()


def train(args: argparse.Namespace) -> Path:
    config = configured_experiment(args, "supervised_ablation_config.json")
    if config.experiment_name not in SUPPORTED:
        raise ValueError(f"This entry point supports only explicit configurations: {sorted(SUPPORTED)}")
    if config.distillation.enabled or (
        config.experiment_name.endswith("no_ssl") and config.teacher.ssl_enabled
    ):
        raise ValueError("Supervised-only ablation config enables an out-of-scope SSL/KD path")

    output = Path(config.runtime.output_dir)
    splits = prepare_splits(config, output / "split_manifest.json")
    write_label_map(splits.class_names, output / "label_map.json")
    if config.experiment_name.startswith("configuration_2"):
        model = build_student(config)
        epochs = config.student.epochs
        learning_rate = config.student.learning_rate
        checkpoint = output / "best_ca_supervised_student.keras"
    else:
        full_teacher = build_teacher(config)
        model = tf.keras.Model(
            full_teacher.input,
            {
                "logits": full_teacher.output["logits"],
                "features": full_teacher.output["features"],
                "feature_map": full_teacher.output["feature_map"],
            },
            name="resnet101_classifier",
        )
        epochs = config.teacher.finetune_epochs
        learning_rate = config.teacher.finetune_learning_rate
        checkpoint = output / "best_teacher_no_ssl.keras"

    training = make_supervised_dataset(splits.train, config, training=True)
    validation = make_supervised_dataset(splits.validation, config, training=False)
    weight_decay = (
        config.student.weight_decay
        if config.experiment_name.startswith("configuration_2")
        else config.teacher.weight_decay
    )
    optimizer = make_optimizer(learning_rate, weight_decay)
    history: list[dict] = []
    best_macro_f1 = -1.0
    patience = 0
    for epoch in range(1, epochs + 1):
        train_loss = tf.keras.metrics.Mean()
        for images, labels in training:
            with tf.GradientTape() as tape:
                logits = model(images, training=True)["logits"]
                loss = classification_loss(labels, logits)
                if model.losses:
                    loss += tf.add_n(model.losses)
            gradients = tape.gradient(loss, model.trainable_variables)
            optimizer.apply_gradients(
                (gradient, variable)
                for gradient, variable in zip(gradients, model.trainable_variables)
                if gradient is not None
            )
            train_loss.update_state(loss)
        truth: list[int] = []
        predicted: list[int] = []
        for images, labels in validation:
            logits = model(images, training=False)["logits"]
            truth.extend(labels.numpy().astype(int).tolist())
            predicted.extend(tf.argmax(logits, axis=1).numpy().astype(int).tolist())
        validation_macro_f1 = macro_f1_from_predictions(truth, predicted, config.data.num_classes)
        history.append({
            "epoch": epoch,
            "train_loss": float(train_loss.result()),
            "validation_macro_f1": validation_macro_f1,
        })
        if validation_macro_f1 > best_macro_f1:
            best_macro_f1 = validation_macro_f1
            patience = 0
            model.save(checkpoint)
        else:
            patience += 1
            if patience >= config.runtime.early_stopping_patience:
                break
        save_history(history, output / "supervised_ablation_history.json")
    save_history(history, output / "supervised_ablation_history.json")
    print(f"Best checkpoint: {checkpoint} (validation macro F1={best_macro_f1:.5f})")
    return checkpoint


if __name__ == "__main__":
    train(parse_args())
