"""Stage 4: evaluate student metrics, resources, latency, and Grad-CAM."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import tensorflow as tf

from ai.data.dataset import make_supervised_dataset, prepare_splits
from ai.evaluation.experiment_contract import experiment_contract
from ai.evaluation.gradcam import save_gradcam_examples
from ai.evaluation.metrics import benchmark_keras_latency, classification_metrics, count_flops, save_confusion_matrix, save_json
from ai.models.coordinate_attention import CoordinateAttention  # Registers custom serialization.
from ai.models.mobilenetv3_student import HardSwish, logits_only_model
from ai.training.common import add_common_arguments, configured_experiment, validate_model_input


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument("--student-model", required=True)
    parser.add_argument(
        "--split-manifest",
        help="Exact shared split_manifest.json. Defaults to OUTPUT_DIR/split_manifest.json.",
    )
    parser.add_argument("--gradcam-count", type=int, default=5, help="Maximum correct and incorrect examples")
    parser.add_argument("--gradcam-layer", default="coordinate_attention")
    parser.add_argument("--latency-runs", type=int, default=100)
    return parser.parse_args()


def evaluate(args: argparse.Namespace) -> dict:
    config = configured_experiment(args, "student_evaluation_config.json")
    output_dir = Path(config.runtime.output_dir)
    manifest = (
        Path(args.split_manifest) if args.split_manifest
        else Path(config.data.final_split_dir) / "split_summary.json"
        if config.data.final_split_dir
        else output_dir / "split_manifest.json"
    )
    if not manifest.is_file():
        raise FileNotFoundError(f"Shared split manifest not found: {manifest}")
    splits = prepare_splits(config, manifest)
    model_path = Path(args.student_model)
    if not model_path.is_file():
        raise FileNotFoundError(f"Student model not found: {model_path}")
    model = tf.keras.models.load_model(
        model_path,
        custom_objects={"CoordinateAttention": CoordinateAttention, "HardSwish": HardSwish},
        compile=False,
    )
    if model.name != "coordinate_attention_enhanced_mobilenetv3":
        raise ValueError(f"Expected the finalized MobileNetV3 student, received model '{model.name}'")
    validate_model_input(model, config, "Student model")
    deployable = logits_only_model(model)
    dataset = make_supervised_dataset(splits.test, config, training=False)
    true_labels: list[int] = []
    predicted_labels: list[int] = []
    for images, labels in dataset:
        logits = deployable(images, training=False)
        true_labels.extend(labels.numpy().astype(int).tolist())
        predicted_labels.extend(tf.argmax(logits, axis=1).numpy().astype(int).tolist())
    metrics = classification_metrics(true_labels, predicted_labels, splits.class_names)
    metrics["model"] = "enhanced"
    metrics["experiment_contract"] = experiment_contract(manifest, splits.class_names, config.image_size)
    metrics["resources"] = {
        "parameters": int(deployable.count_params()),
        "training_model_parameters_including_optional_distillation_adapter": int(model.count_params()),
        "training_checkpoint_file_bytes": model_path.stat().st_size,
        "flops_batch_one": count_flops(deployable, config.image_size),
        "keras_latency": benchmark_keras_latency(deployable, config.image_size, runs=args.latency_runs),
    }
    davao_records = [
        record for record in splits.test
        if record.field_subset.lower() == "davao" and record.label_review_status == "validated"
    ]
    if davao_records:
        field_true: list[int] = []
        field_predicted: list[int] = []
        for images, labels in make_supervised_dataset(davao_records, config, training=False):
            logits = deployable(images, training=False)
            field_true.extend(labels.numpy().astype(int).tolist())
            field_predicted.extend(tf.argmax(logits, axis=1).numpy().astype(int).tolist())
        metrics["davao_field_subset"] = classification_metrics(
            field_true, field_predicted, splits.class_names
        )
        metrics["davao_field_subset"]["expert_validated_samples"] = len(davao_records)
        metrics["davao_field_subset"]["predefined_manifest"] = config.data.final_field_test_manifest
    else:
        metrics["davao_field_subset"] = {
            "status": "PENDING EXPERIMENTAL VALIDATION",
            "reason": "No expert-validated Davao records are predefined in the held-out test manifest",
        }
    save_json(metrics, output_dir / "student_evaluation.json")
    save_confusion_matrix(metrics["confusion_matrix"], splits.class_names, output_dir / "student_confusion_matrix.png")
    save_gradcam_examples(
        model,
        splits.test,
        predicted_labels,
        splits.class_names,
        config.image_size,
        output_dir / "gradcam",
        maximum_per_group=args.gradcam_count,
        layer_name=args.gradcam_layer,
    )
    print(f"Accuracy: {metrics['accuracy']:.5f}; macro F1: {metrics['macro_f1']:.5f}")
    print(f"Full report: {output_dir / 'student_evaluation.json'}")
    return metrics


if __name__ == "__main__":
    evaluate(parse_args())
