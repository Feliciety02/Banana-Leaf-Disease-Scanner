"""Run baseline then enhanced TFLite inference on one shared preprocessed image."""

from __future__ import annotations

import argparse
import gc
import json
import platform
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import tensorflow as tf

from ai.config.labels import CLASS_LABELS
from ai.data.dataset import decode_and_resize
from ai.deployment.tflite_utils import TFLiteRunner


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-model", required=True)
    parser.add_argument("--enhanced-model", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--label-map", required=True)
    parser.add_argument("--num-threads", type=int, default=1)
    parser.add_argument("--output", help="Optional JSON destination")
    return parser.parse_args()


def _read_label_map(path: Path) -> list[str]:
    if not path.is_file():
        raise FileNotFoundError(f"Label map not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    labels = [payload.get(str(index)) for index in range(len(CLASS_LABELS))]
    if labels != list(CLASS_LABELS):
        raise ValueError(f"Label map must exactly match the canonical output order: {list(CLASS_LABELS)}")
    return labels


def _result(model: str, model_path: Path, logits: np.ndarray, latency_ms: float, labels: list[str]) -> dict:
    probabilities = tf.nn.softmax(logits[0]).numpy()
    predicted_index = int(np.argmax(probabilities))
    return {
        "model": model,
        "predicted_index": predicted_index,
        "predicted_class": labels[predicted_index],
        "confidence": float(probabilities[predicted_index]),
        "probabilities": {label: float(probabilities[index]) for index, label in enumerate(labels)},
        "inference_time_ms": float(latency_ms),
        "model_size_bytes": model_path.stat().st_size,
    }


def compare_models(
    baseline_model: str | Path,
    enhanced_model: str | Path,
    image: str | Path,
    label_map: str | Path,
    num_threads: int = 1,
) -> dict:
    baseline_path = Path(baseline_model)
    enhanced_path = Path(enhanced_model)
    image_path = Path(image)
    for description, path in (("Baseline model", baseline_path), ("Enhanced model", enhanced_path), ("Image", image_path)):
        if not path.is_file():
            raise FileNotFoundError(f"{description} not found: {path}")
    labels = _read_label_map(Path(label_map))

    baseline_runner = TFLiteRunner(baseline_path, num_threads=num_threads)
    baseline_shape = tuple(int(value) for value in baseline_runner.input["shape"])
    if len(baseline_shape) != 4 or baseline_shape[0] != 1 or baseline_shape[3] != 3:
        raise ValueError(f"Unsupported baseline input shape: {baseline_shape}")
    prepared = decode_and_resize(tf.constant(str(image_path)), baseline_shape[1:3]).numpy()[None, ...]
    baseline_logits, baseline_latency = baseline_runner.predict(prepared)
    baseline = _result("baseline", baseline_path, baseline_logits, baseline_latency, labels)
    del baseline_runner
    gc.collect()

    enhanced_runner = TFLiteRunner(enhanced_path, num_threads=num_threads)
    enhanced_shape = tuple(int(value) for value in enhanced_runner.input["shape"])
    if enhanced_shape != baseline_shape:
        raise ValueError(f"Model input mismatch: baseline {baseline_shape}, enhanced {enhanced_shape}")
    enhanced_logits, enhanced_latency = enhanced_runner.predict(prepared)
    enhanced = _result("enhanced", enhanced_path, enhanced_logits, enhanced_latency, labels)
    del enhanced_runner
    gc.collect()

    same_prediction = baseline["predicted_class"] == enhanced["predicted_class"]
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "runtime": {"name": "TensorFlow Lite Python", "python": platform.python_version(), "num_threads": num_threads},
        "input": {"image": str(image_path.resolve()), "shape": list(prepared.shape), "shared_preprocessing": True},
        "baseline": baseline,
        "enhanced": enhanced,
        "comparison": {
            "prediction_agreement": same_prediction,
            "summary": (
                f"Both models predicted {baseline['predicted_class']}."
                if same_prediction
                else f"Baseline predicted {baseline['predicted_class']}; enhanced predicted {enhanced['predicted_class']}."
            ),
            "enhanced_confidence_difference_percentage_points": (enhanced["confidence"] - baseline["confidence"]) * 100.0,
            "enhanced_latency_difference_ms": enhanced["inference_time_ms"] - baseline["inference_time_ms"],
            "interpretation_note": "Confidence differences for one image do not establish accuracy or model superiority.",
        },
    }
    return report


def compare(args: argparse.Namespace) -> dict:
    report = compare_models(
        args.baseline_model,
        args.enhanced_model,
        args.image,
        args.label_map,
        args.num_threads,
    )
    rendered = json.dumps(report, indent=2)
    print(rendered)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
    return report


if __name__ == "__main__":
    compare(parse_args())
