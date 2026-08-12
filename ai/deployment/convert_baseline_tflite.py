"""Export the trained baseline as FP32 and fully integer INT8 TFLite models."""

from __future__ import annotations

import argparse
from pathlib import Path

import tensorflow as tf

from ai.data.dataset import make_supervised_dataset, prepare_splits
from ai.models.mobilenetv3_baseline import BASELINE_MODEL_NAME
from ai.training.common import add_common_arguments, configured_experiment, validate_model_input


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_arguments(parser)
    parser.add_argument("--baseline-model", required=True)
    parser.add_argument(
        "--split-manifest",
        help="Exact enhanced-experiment split_manifest.json. Defaults to OUTPUT_DIR/split_manifest.json.",
    )
    parser.add_argument("--representative-samples", type=int, default=200)
    return parser.parse_args()


def convert(args: argparse.Namespace) -> tuple[Path, Path]:
    config = configured_experiment(args, "baseline_tflite_conversion_config.json")
    output_dir = Path(config.runtime.output_dir)
    manifest = Path(args.split_manifest) if args.split_manifest else output_dir / "split_manifest.json"
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

    fp32_converter = tf.lite.TFLiteConverter.from_keras_model(model)
    fp32_path = output_dir / "baseline_mobilenetv3_small_fp32.tflite"
    fp32_path.write_bytes(fp32_converter.convert())

    representative = make_supervised_dataset(splits.train, config, training=False).unbatch().batch(1)

    def representative_dataset():
        for images, _ in representative.take(args.representative_samples):
            yield [tf.cast(images, tf.float32)]

    int8_converter = tf.lite.TFLiteConverter.from_keras_model(model)
    int8_converter.optimizations = [tf.lite.Optimize.DEFAULT]
    int8_converter.representative_dataset = representative_dataset
    int8_converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    int8_converter.inference_input_type = tf.int8
    int8_converter.inference_output_type = tf.int8
    int8_path = output_dir / "baseline_mobilenetv3_small_int8.tflite"
    int8_path.write_bytes(int8_converter.convert())
    print(f"FP32 model: {fp32_path} ({fp32_path.stat().st_size} bytes)")
    print(f"INT8 model: {int8_path} ({int8_path.stat().st_size} bytes)")
    return fp32_path, int8_path


if __name__ == "__main__":
    convert(parse_args())
