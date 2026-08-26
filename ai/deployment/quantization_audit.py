"""Programmatic audit for the intended full-integer TFLite inference path."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import tensorflow as tf


def audit_full_integer_model(model_path: str | Path, expected_classes: int = 4) -> dict:
    path = Path(model_path)
    interpreter = tf.lite.Interpreter(model_path=str(path))
    interpreter.allocate_tensors()
    inputs = interpreter.get_input_details()
    outputs = interpreter.get_output_details()
    tensors = interpreter.get_tensor_details()
    if len(inputs) != 1 or len(outputs) != 1:
        raise ValueError("Thesis deployment requires exactly one image input and one class output")
    input_detail, output_detail = inputs[0], outputs[0]
    shape = [int(value) for value in input_detail["shape"]]
    output_shape = [int(value) for value in output_detail["shape"]]
    float_tensors = [
        detail["name"]
        for detail in tensors
        if detail["dtype"] in (np.float16, np.float32, np.float64)
    ]
    invalid_quantized_tensors = []
    quantized_tensor_count = 0
    for detail in tensors:
        if detail["dtype"] not in (np.int8, np.uint8):
            continue
        quantized_tensor_count += 1
        scales = detail["quantization_parameters"].get("scales", [])
        if len(scales) == 0 or np.any(np.asarray(scales) <= 0):
            invalid_quantized_tensors.append(detail["name"])
    checks = {
        "input_shape_1x224x224x3": shape == [1, 224, 224, 3],
        "output_has_four_classes": len(output_shape) == 2 and output_shape[-1] == expected_classes,
        "input_dtype_int8": input_detail["dtype"] == np.int8,
        "output_dtype_int8": output_detail["dtype"] == np.int8,
        "input_quantization_scale_positive": float(input_detail["quantization"][0]) > 0,
        "output_quantization_scale_positive": float(output_detail["quantization"][0]) > 0,
        "no_floating_point_tensors": not float_tensors,
        "quantized_tensor_parameters_valid": not invalid_quantized_tensors,
    }
    report = {
        "model": str(path.resolve()),
        "model_file_bytes": path.stat().st_size,
        "expected_parameter_count_change_from_fp32": 0,
        "input": {
            "shape": shape,
            "dtype": np.dtype(input_detail["dtype"]).name,
            "quantization": [float(input_detail["quantization"][0]), int(input_detail["quantization"][1])],
        },
        "output": {
            "shape": output_shape,
            "dtype": np.dtype(output_detail["dtype"]).name,
            "quantization": [float(output_detail["quantization"][0]), int(output_detail["quantization"][1])],
        },
        "quantized_tensor_count": quantized_tensor_count,
        "floating_point_tensors": float_tensors,
        "invalid_quantized_tensors": invalid_quantized_tensors,
        "checks": checks,
        "full_integer_verified": all(checks.values()),
    }
    if not report["full_integer_verified"]:
        failed = [name for name, passed in checks.items() if not passed]
        raise ValueError(f"Full-integer TFLite audit failed checks: {failed}")
    return report


def write_quantization_audit(model_path: str | Path, destination: str | Path) -> dict:
    report = audit_full_integer_model(model_path)
    output = Path(destination)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
