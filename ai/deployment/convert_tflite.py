"""Stage 4: export FP32 and fully integer INT8 TensorFlow Lite models."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import tensorflow as tf

from ai.data.dataset import make_supervised_dataset, prepare_splits, select_stratified_representative_records
from ai.deployment.quantization_audit import write_quantization_audit
from ai.models.coordinate_attention import CoordinateAttention
from ai.models.mobilenetv3_student import HardSwish, logits_only_model
from ai.training.common import add_common_arguments, configured_experiment, validate_model_input


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument("--student-model", required=True)
    parser.add_argument("--representative-samples", type=int, default=200)
    return parser.parse_args()


def convert(args: argparse.Namespace) -> tuple[Path, Path]:
    config = configured_experiment(args, "tflite_conversion_config.json")
    output_dir = Path(config.runtime.output_dir)
    splits = prepare_splits(config, output_dir / "split_manifest.json")
    student_path = Path(args.student_model)
    if not student_path.is_file():
        raise FileNotFoundError(f"Student model not found: {student_path}")
    student = tf.keras.models.load_model(
        student_path,
        custom_objects={"CoordinateAttention": CoordinateAttention, "HardSwish": HardSwish},
        compile=False,
    )
    if student.name != "coordinate_attention_enhanced_mobilenetv3":
        raise ValueError(f"Expected the finalized MobileNetV3 student, received model '{student.name}'")
    validate_model_input(student, config, "Student model")
    deployable = logits_only_model(student)

    fp32_converter = tf.lite.TFLiteConverter.from_keras_model(deployable)
    fp32_bytes = fp32_converter.convert()
    fp32_path = output_dir / "enhanced_mobilenetv3_fp32.tflite"
    fp32_path.write_bytes(fp32_bytes)

    selected = select_stratified_representative_records(
        splits.train,
        splits.class_names,
        args.representative_samples,
        config.runtime.seed,
    )
    representative = make_supervised_dataset(selected, config, training=False).unbatch().batch(1)
    (output_dir / "quantization_calibration_manifest.json").write_text(
        json.dumps({
            "source_partition": "train",
            "validation_or_test_samples": 0,
            "records": [
                {"path": record.path, "class_name": record.class_name, "group_id": record.group_id}
                for record in selected
            ],
        }, indent=2),
        encoding="utf-8",
    )

    def representative_dataset():
        for images, _ in representative.take(args.representative_samples):
            # Calibrate exactly the model's documented [0, 1] input distribution.
            yield [tf.cast(images, tf.float32)]

    int8_converter = tf.lite.TFLiteConverter.from_keras_model(deployable)
    int8_converter.optimizations = [tf.lite.Optimize.DEFAULT]
    int8_converter.representative_dataset = representative_dataset
    int8_converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    int8_converter.inference_input_type = tf.int8
    int8_converter.inference_output_type = tf.int8
    int8_bytes = int8_converter.convert()
    int8_path = output_dir / "enhanced_mobilenetv3_int8.tflite"
    int8_path.write_bytes(int8_bytes)
    audit = write_quantization_audit(int8_path, output_dir / "quantization_audit.json")
    print(f"FP32 model: {fp32_path} ({fp32_path.stat().st_size} bytes)")
    print(f"INT8 model: {int8_path} ({int8_path.stat().st_size} bytes)")
    print(f"Full-integer audit: {audit['full_integer_verified']}")
    return fp32_path, int8_path


if __name__ == "__main__":
    convert(parse_args())
