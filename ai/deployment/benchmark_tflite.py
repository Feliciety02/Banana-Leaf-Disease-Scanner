"""Evaluate an INT8 TFLite model on the held-out test set and benchmark latency."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from ai.data.dataset import decode_and_resize, prepare_splits
from ai.deployment.tflite_utils import TFLiteRunner
from ai.evaluation.metrics import classification_metrics, save_confusion_matrix, save_json
from ai.training.common import add_common_arguments, configured_experiment


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument("--tflite-model", required=True)
    parser.add_argument(
        "--fp32-tflite-model",
        help="FP32 TFLite reference; defaults to OUTPUT_DIR/enhanced_mobilenetv3_fp32.tflite when present",
    )
    parser.add_argument("--fp32-metrics", help="Defaults to OUTPUT_DIR/student_evaluation.json")
    parser.add_argument("--num-threads", type=int, default=1)
    parser.add_argument("--warmup-runs", type=int, default=10)
    return parser.parse_args()


def benchmark(args: argparse.Namespace) -> dict:
    config = configured_experiment(args, "tflite_benchmark_config.json")
    output_dir = Path(config.runtime.output_dir)
    splits = prepare_splits(config, output_dir / "split_manifest.json")
    model_path = Path(args.tflite_model)
    runner = TFLiteRunner(model_path, num_threads=args.num_threads)
    default_fp32_path = output_dir / "enhanced_mobilenetv3_fp32.tflite"
    fp32_model_path = Path(args.fp32_tflite_model) if args.fp32_tflite_model else default_fp32_path
    fp32_runner = TFLiteRunner(fp32_model_path, num_threads=args.num_threads) if fp32_model_path.is_file() else None
    blank = np.zeros((1, *config.image_size, 3), dtype=np.float32)
    for _ in range(args.warmup_runs):
        runner.predict(blank)
        if fp32_runner is not None:
            fp32_runner.predict(blank)

    true_labels: list[int] = []
    predicted_labels: list[int] = []
    timings: list[float] = []
    fp32_predictions: list[int] = []
    fp32_timings: list[float] = []
    for record in splits.test:
        image = decode_and_resize(record.path, config.image_size).numpy()[None, ...]
        logits, elapsed_ms = runner.predict(image)
        true_labels.append(record.label)
        predicted_labels.append(int(np.argmax(logits[0])))
        timings.append(elapsed_ms)
        if fp32_runner is not None:
            fp32_logits, fp32_elapsed_ms = fp32_runner.predict(image)
            fp32_predictions.append(int(np.argmax(fp32_logits[0])))
            fp32_timings.append(fp32_elapsed_ms)
    report = classification_metrics(true_labels, predicted_labels, splits.class_names)
    report["resources"] = {
        "model_file_bytes": model_path.stat().st_size,
        "num_threads": args.num_threads,
        "latency": {
            "mean_ms": float(np.mean(timings)),
            "median_ms": float(np.median(timings)),
            "p95_ms": float(np.percentile(timings, 95)),
            "runs": len(timings),
        },
    }
    if fp32_runner is not None:
        fp32_report = classification_metrics(true_labels, fp32_predictions, splits.class_names)
        fp32_mean_latency = float(np.mean(fp32_timings))
        report["fp32_tflite_reference"] = {
            "model_file_bytes": fp32_model_path.stat().st_size,
            "accuracy": fp32_report["accuracy"],
            "mean_latency_ms": fp32_mean_latency,
        }
        report["accuracy_change_from_fp32_tflite"] = report["accuracy"] - fp32_report["accuracy"]
        report["mean_latency_change_from_fp32_tflite_ms"] = report["resources"]["latency"]["mean_ms"] - fp32_mean_latency
    fp32_metrics_path = Path(args.fp32_metrics) if args.fp32_metrics else output_dir / "student_evaluation.json"
    if fp32_metrics_path.is_file():
        fp32 = json.loads(fp32_metrics_path.read_text(encoding="utf-8"))
        report["keras_fp32_reference"] = {
            "accuracy": float(fp32["accuracy"]),
            "mean_latency_ms": fp32.get("resources", {}).get("keras_latency", {}).get("mean_ms"),
        }
    elif fp32_runner is None:
        report["comparison_note"] = f"FP32 metrics not found at {fp32_metrics_path}; run evaluate_student first"
    save_json(report, output_dir / "int8_evaluation.json")
    save_confusion_matrix(report["confusion_matrix"], splits.class_names, output_dir / "int8_confusion_matrix.png")
    print(f"INT8 accuracy: {report['accuracy']:.5f}; mean latency: {report['resources']['latency']['mean_ms']:.3f} ms")
    if "accuracy_change_from_fp32_tflite" in report:
        print(f"Accuracy change from FP32 TFLite: {report['accuracy_change_from_fp32_tflite']:+.5f}")
        print(f"Mean latency change from FP32 TFLite: {report['mean_latency_change_from_fp32_tflite_ms']:+.3f} ms")
    return report


if __name__ == "__main__":
    benchmark(parse_args())
