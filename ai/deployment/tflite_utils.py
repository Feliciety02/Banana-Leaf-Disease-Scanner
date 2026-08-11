"""Shared quantization-aware TensorFlow Lite interpreter helpers."""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import tensorflow as tf


class TFLiteRunner:
    def __init__(self, model_path: str | Path, num_threads: int = 1):
        model_path = Path(model_path)
        if not model_path.is_file():
            raise FileNotFoundError(f"TFLite model not found: {model_path}")
        self.interpreter = tf.lite.Interpreter(model_path=str(model_path), num_threads=num_threads)
        self.interpreter.allocate_tensors()
        self.input = self.interpreter.get_input_details()[0]
        self.output = self.interpreter.get_output_details()[0]

    @staticmethod
    def _quantize(values: np.ndarray, details: dict) -> np.ndarray:
        dtype = details["dtype"]
        if dtype not in (np.int8, np.uint8):
            return values.astype(dtype)
        scale, zero_point = details["quantization"]
        if scale <= 0:
            raise ValueError("Quantized tensor has an invalid zero scale")
        limits = np.iinfo(dtype)
        return np.clip(np.rint(values / scale + zero_point), limits.min, limits.max).astype(dtype)

    @staticmethod
    def _dequantize(values: np.ndarray, details: dict) -> np.ndarray:
        if details["dtype"] not in (np.int8, np.uint8):
            return values.astype(np.float32)
        scale, zero_point = details["quantization"]
        return (values.astype(np.float32) - zero_point) * scale

    def predict(self, images: np.ndarray) -> tuple[np.ndarray, float]:
        expected = tuple(int(value) for value in self.input["shape"])
        if tuple(images.shape) != expected:
            raise ValueError(f"Expected input shape {expected}, received {tuple(images.shape)}")
        quantized = self._quantize(images.astype(np.float32), self.input)
        self.interpreter.set_tensor(self.input["index"], quantized)
        start = time.perf_counter()
        self.interpreter.invoke()
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        output = self.interpreter.get_tensor(self.output["index"])
        return self._dequantize(output, self.output), elapsed_ms
