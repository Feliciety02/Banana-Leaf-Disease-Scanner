"""Run one-image inference with a trained INT8 banana-leaf classifier."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import tensorflow as tf

from ai.data.dataset import decode_and_resize
from ai.deployment.tflite_utils import TFLiteRunner


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tflite-model", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--label-map", required=True)
    parser.add_argument("--num-threads", type=int, default=1)
    return parser.parse_args()


def infer(args: argparse.Namespace) -> dict:
    image_path = Path(args.image)
    if not image_path.is_file():
        raise FileNotFoundError(f"Input image not found: {image_path}")
    label_map_path = Path(args.label_map)
    if not label_map_path.is_file():
        raise FileNotFoundError(f"Label map not found: {label_map_path}")
    label_map = json.loads(label_map_path.read_text(encoding="utf-8"))
    runner = TFLiteRunner(args.tflite_model, num_threads=args.num_threads)
    shape = runner.input["shape"]
    image_size = (int(shape[1]), int(shape[2]))
    image = decode_and_resize(tf.constant(str(image_path)), image_size).numpy()[None, ...]
    logits, latency_ms = runner.predict(image)
    probabilities = tf.nn.softmax(logits[0]).numpy()
    order = np.argsort(probabilities)[::-1]
    result = {
        "predicted_index": int(order[0]),
        "predicted_class": label_map[str(int(order[0]))],
        "confidence": float(probabilities[order[0]]),
        "latency_ms": latency_ms,
        "scores": [
            {"index": int(index), "class_name": label_map[str(int(index))], "probability": float(probabilities[index])}
            for index in order
        ],
    }
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    infer(parse_args())
