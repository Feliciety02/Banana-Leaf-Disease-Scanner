"""Evaluate the best teacher on the held-out test split."""

from __future__ import annotations

import argparse
from pathlib import Path

import tensorflow as tf

from ai.data.dataset import make_supervised_dataset, prepare_splits
from ai.evaluation.metrics import classification_metrics, save_confusion_matrix, save_json
from ai.models.teacher import ResNet101Preprocessing
from ai.training.common import add_common_arguments, configured_experiment, validate_model_input


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument("--teacher-model", required=True)
    return parser.parse_args()


def evaluate(args: argparse.Namespace) -> dict:
    config = configured_experiment(args, "teacher_evaluation_config.json")
    output_dir = Path(config.runtime.output_dir)
    splits = prepare_splits(config, output_dir / "split_manifest.json")
    model = tf.keras.models.load_model(
        args.teacher_model, custom_objects={"ResNet101Preprocessing": ResNet101Preprocessing}, compile=False
    )
    if model.name not in ("resnet101_teacher", "resnet101_classifier"):
        raise ValueError(f"Expected a ResNet-101 teacher, received model '{model.name}'")
    validate_model_input(model, config, "Teacher model")
    classifier = tf.keras.Model(model.input, model.output["logits"], name="teacher_classifier")
    true_labels: list[int] = []
    predicted_labels: list[int] = []
    for images, labels in make_supervised_dataset(splits.test, config, training=False):
        logits = classifier(images, training=False)
        true_labels.extend(labels.numpy().astype(int).tolist())
        predicted_labels.extend(tf.argmax(logits, axis=1).numpy().astype(int).tolist())
    metrics = classification_metrics(true_labels, predicted_labels, splits.class_names)
    save_json(metrics, output_dir / "teacher_evaluation.json")
    save_confusion_matrix(metrics["confusion_matrix"], splits.class_names, output_dir / "teacher_confusion_matrix.png")
    print(f"Teacher accuracy: {metrics['accuracy']:.5f}")
    return metrics


if __name__ == "__main__":
    evaluate(parse_args())
