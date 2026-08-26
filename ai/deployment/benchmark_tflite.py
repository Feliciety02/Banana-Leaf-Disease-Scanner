"""Evaluate an INT8 TFLite model on the held-out test set and benchmark latency."""

from __future__ import annotations

import argparse
import json
import tracemalloc
from pathlib import Path

import numpy as np

from ai.data.dataset import decode_and_resize, prepare_splits
from ai.deployment.tflite_utils import TFLiteRunner
from ai.evaluation.experiment_contract import experiment_contract
from ai.evaluation.metrics import classification_metrics, save_confusion_matrix, save_json
from ai.training.common import add_common_arguments, configured_experiment


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument("--tflite-model", required=True)
    parser.add_argument("--model-kind", choices=("baseline", "enhanced"), default="enhanced")
    parser.add_argument(
        "--split-manifest",
        help="Exact shared split_manifest.json. Defaults to OUTPUT_DIR/split_manifest.json.",
    )
    parser.add_argument(
        "--fp32-tflite-model",
        help="Optional matching FP32 TFLite reference",
    )
    parser.add_argument("--fp32-metrics", help="Optional matching Keras evaluation report")
    parser.add_argument("--num-threads", type=int, default=1)
    parser.add_argument("--warmup-runs", type=int, default=10)
    parser.add_argument("--device-model")
    parser.add_argument("--soc")
    parser.add_argument("--installed-ram-mb", type=int)
    parser.add_argument("--android-version")
    parser.add_argument("--execution-backend", default="TensorFlow Lite CPU")
    return parser.parse_args()


def benchmark(args: argparse.Namespace) -> dict:
    config = configured_experiment(args, "tflite_benchmark_config.json")
    output_dir = Path(config.runtime.output_dir)
    manifest = Path(args.split_manifest) if args.split_manifest else output_dir / "split_manifest.json"
    if not manifest.is_file():
        raise FileNotFoundError(f"Shared split manifest not found: {manifest}")
    splits = prepare_splits(config, manifest)
    model_path = Path(args.tflite_model)
    runner = TFLiteRunner(model_path, num_threads=args.num_threads)
    default_fp32_path = output_dir / (
        "baseline_mobilenetv3_small_fp32.tflite" if args.model_kind == "baseline" else "enhanced_mobilenetv3_fp32.tflite"
    )
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
    tracemalloc.start()
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
    _, peak_traced = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    mean_latency = float(np.mean(timings))
    report = classification_metrics(true_labels, predicted_labels, splits.class_names)
    report["model"] = args.model_kind
    report["experiment_contract"] = experiment_contract(manifest, splits.class_names, config.image_size)
    report["resources"] = {
        "model_file_bytes": model_path.stat().st_size,
        "num_threads": args.num_threads,
        "delegate_mode": runner.delegate_mode,
        "delegate_fallback_reason": runner.delegate_fallback_reason,
        "device": {
            "model": args.device_model or "PENDING EXPERIMENTAL VALIDATION",
            "processor_soc": args.soc or "PENDING EXPERIMENTAL VALIDATION",
            "installed_ram_mb": args.installed_ram_mb or "PENDING EXPERIMENTAL VALIDATION",
            "android_version": args.android_version or "PENDING EXPERIMENTAL VALIDATION",
            "tensorflow_lite_version": str(__import__("tensorflow").__version__),
            "thread_count": args.num_threads,
            "execution_backend": args.execution_backend,
        },
        "latency": {
            "mean_ms": mean_latency,
            "standard_deviation_ms": float(np.std(timings)),
            "median_ms": float(np.median(timings)),
            "p95_ms": float(np.percentile(timings, 95)),
            "throughput_images_per_second": float(1000.0 / mean_latency) if mean_latency > 0 else None,
            "warmup_runs": args.warmup_runs,
            "runs": len(timings),
        },
        "peak_python_traced_memory_bytes": int(peak_traced),
        "peak_memory_scope_note": "Python-traced inference allocations; formal peak memory must be profiled on the named Android device",
    }
    if fp32_runner is not None:
        fp32_report = classification_metrics(true_labels, fp32_predictions, splits.class_names)
        fp32_mean_latency = float(np.mean(fp32_timings))
        report["fp32_tflite_reference"] = {
            "model_file_bytes": fp32_model_path.stat().st_size,
            "classification_metrics": fp32_report,
            "latency": {
                "mean_ms": fp32_mean_latency,
                "standard_deviation_ms": float(np.std(fp32_timings)),
                "median_ms": float(np.median(fp32_timings)),
                "p95_ms": float(np.percentile(fp32_timings, 95)),
                "throughput_images_per_second": float(1000.0 / fp32_mean_latency) if fp32_mean_latency > 0 else None,
                "runs": len(fp32_timings),
            },
            "delegate_mode": fp32_runner.delegate_mode,
            "delegate_fallback_reason": fp32_runner.delegate_fallback_reason,
        }
        report["accuracy_change_from_fp32_tflite"] = report["accuracy"] - fp32_report["accuracy"]
        report["mean_latency_change_from_fp32_tflite_ms"] = report["resources"]["latency"]["mean_ms"] - fp32_mean_latency
    default_metrics = "baseline_evaluation.json" if args.model_kind == "baseline" else "student_evaluation.json"
    fp32_metrics_path = Path(args.fp32_metrics) if args.fp32_metrics else output_dir / default_metrics
    if fp32_metrics_path.is_file():
        fp32 = json.loads(fp32_metrics_path.read_text(encoding="utf-8"))
        report["keras_fp32_reference"] = {
            "accuracy": float(fp32["accuracy"]),
            "mean_latency_ms": fp32.get("resources", {}).get("keras_latency", {}).get("mean_ms"),
        }
    elif fp32_runner is None:
        report["comparison_note"] = f"FP32 metrics not found at {fp32_metrics_path}; run the matching Keras evaluation first"
    report_name = "baseline_int8_evaluation.json" if args.model_kind == "baseline" else "int8_evaluation.json"
    matrix_name = "baseline_int8_confusion_matrix.png" if args.model_kind == "baseline" else "int8_confusion_matrix.png"
    save_json(report, output_dir / report_name)
    save_confusion_matrix(report["confusion_matrix"], splits.class_names, output_dir / matrix_name)
    print(f"INT8 accuracy: {report['accuracy']:.5f}; mean latency: {report['resources']['latency']['mean_ms']:.3f} ms")
    if "accuracy_change_from_fp32_tflite" in report:
        print(f"Accuracy change from FP32 TFLite: {report['accuracy_change_from_fp32_tflite']:+.5f}")
        print(f"Mean latency change from FP32 TFLite: {report['mean_latency_change_from_fp32_tflite_ms']:+.3f} ms")
    return report


if __name__ == "__main__":
    benchmark(parse_args())
