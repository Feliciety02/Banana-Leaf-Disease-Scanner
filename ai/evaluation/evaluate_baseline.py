"""Evaluate the baseline on the unchanged held-out test partition."""

from __future__ import annotations

import argparse
from pathlib import Path

import tensorflow as tf

from ai.data.dataset import make_supervised_dataset, prepare_splits
from ai.evaluation.experiment_contract import experiment_contract
from ai.evaluation.gradcam import save_gradcam_examples
from ai.evaluation.metrics import benchmark_keras_latency, classification_metrics, count_flops, save_confusion_matrix, save_json
from ai.models.mobilenetv3_baseline import BASELINE_BACKBONE_NAME, BASELINE_MODEL_NAME
from ai.training.common import add_common_arguments, configured_experiment, validate_model_input


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument("--baseline-model", required=True)
    parser.add_argument(
        "--split-manifest",
        help="Exact enhanced-experiment split_manifest.json. Defaults to OUTPUT_DIR/split_manifest.json.",
    )
    parser.add_argument("--gradcam-count", type=int, default=5)
    parser.add_argument("--latency-runs", type=int, default=100)
    return parser.parse_args()


def evaluate(args: argparse.Namespace) -> dict:
    config = configured_experiment(args, "baseline_evaluation_config.json")
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
    model_path = Path(args.baseline_model)
    if not model_path.is_file():
        raise FileNotFoundError(f"Baseline model not found: {model_path}")
    model = tf.keras.models.load_model(model_path, compile=False)
    if model.name != BASELINE_MODEL_NAME:
        raise ValueError(f"Expected {BASELINE_MODEL_NAME}, received model '{model.name}'")
    validate_model_input(model, config, "Baseline model")

    true_labels: list[int] = []
    predicted_labels: list[int] = []
    for images, labels in make_supervised_dataset(splits.test, config, training=False):
        logits = model(images, training=False)
        true_labels.extend(labels.numpy().astype(int).tolist())
        predicted_labels.extend(tf.argmax(logits, axis=1).numpy().astype(int).tolist())

    report = classification_metrics(true_labels, predicted_labels, splits.class_names)
    report["model"] = "baseline"
    report["experiment_contract"] = experiment_contract(manifest, splits.class_names, config.image_size)
    report["resources"] = {
        "parameters": int(model.count_params()),
        "training_checkpoint_file_bytes": model_path.stat().st_size,
        "flops_batch_one": count_flops(model, config.image_size),
        "keras_latency": benchmark_keras_latency(model, config.image_size, runs=args.latency_runs),
    }
    save_json(report, output_dir / "baseline_evaluation.json")
    save_confusion_matrix(report["confusion_matrix"], splits.class_names, output_dir / "baseline_confusion_matrix.png")
    save_gradcam_examples(
        model,
        splits.test,
        predicted_labels,
        splits.class_names,
        config.image_size,
        output_dir / "baseline_gradcam",
        maximum_per_group=args.gradcam_count,
        layer_name=BASELINE_BACKBONE_NAME,
    )
    print(f"Accuracy: {report['accuracy']:.5f}; macro F1: {report['macro_f1']:.5f}")
    print(f"Full report: {output_dir / 'baseline_evaluation.json'}")
    return report


if __name__ == "__main__":
    evaluate(parse_args())
