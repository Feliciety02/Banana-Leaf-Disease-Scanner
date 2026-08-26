"""Final held-out test-set evaluation for all frozen selected models.

This script is the single authoritative evaluation entry point. It consumes only
the held-out test partition — a partition that was never consulted during training,
hyperparameter tuning, or checkpoint selection. Running this script after all
model-selection decisions are frozen is the last step before thesis reporting.

Reported metrics per model:
    - accuracy, macro precision, macro recall, macro F1
    - per-class precision, recall, F1, support
    - confusion matrix (JSON + PNG)
    - computational: parameter count, FLOPs, Keras latency, model file bytes

The Davao field-acquired subset is evaluated separately and never mixed with
complete held-out test set numbers.

Usage:
    python -m ai.evaluation.final_evaluation \\
        --config ai/config/ablations/configuration_4.json \\
        --teacher-model  ai/artifacts/teacher/resnet101_teacher.keras \\
        --student-model  ai/artifacts/student/ca_mobilenetv3_small.keras \\
        --baseline-model ai/artifacts/baseline/baseline_mobilenetv3_small.keras \\
        --split-manifest ai/artifacts/final_split/split_summary.json \\
        --output-dir     ai/artifacts/final_evaluation
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path
from typing import Any, Sequence

import tensorflow as tf

from ai.config.config import ExperimentConfig, load_config, save_config, set_global_determinism
from ai.data.dataset import (
    ImageRecord,
    make_supervised_dataset,
    prepare_splits,
)
from ai.evaluation.experiment_contract import experiment_contract, file_sha256
from ai.evaluation.metrics import (
    benchmark_keras_latency,
    classification_metrics,
    count_flops,
    save_confusion_matrix,
    save_json,
)
from ai.models.coordinate_attention import CoordinateAttention
from ai.models.mobilenetv3_baseline import BASELINE_BACKBONE_NAME, BASELINE_MODEL_NAME
from ai.models.mobilenetv3_student import HardSwish, logits_only_model
from ai.models.teacher import ResNet101Preprocessing


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _set_determinism(config: ExperimentConfig) -> None:
    set_global_determinism(config.runtime.seed)


def _resolve_manifest(args: argparse.Namespace, config: ExperimentConfig, output_dir: Path) -> Path:
    """Locate the frozen split manifest, preferring the CLI-provided path."""
    if getattr(args, "split_manifest", None):
        return Path(args.split_manifest)
    if config.data.final_split_dir:
        candidate = Path(config.data.final_split_dir) / "split_summary.json"
        if candidate.is_file():
            return candidate
    return output_dir / "split_manifest.json"


def _run_inference(
    model: tf.keras.Model,
    records: Sequence[ImageRecord],
    config: ExperimentConfig,
    logits_key: str | None = None,
) -> tuple[list[int], list[int]]:
    """Run batched inference and return (true_labels, predicted_labels)."""
    true_labels: list[int] = []
    predicted_labels: list[int] = []
    dataset = make_supervised_dataset(records, config, training=False)
    for images, labels in dataset:
        output = model(images, training=False)
        logits = output[logits_key] if isinstance(output, dict) and logits_key else output
        true_labels.extend(labels.numpy().astype(int).tolist())
        predicted_labels.extend(tf.argmax(logits, axis=1).numpy().astype(int).tolist())
    return true_labels, predicted_labels


def _count_params_safe(model: tf.keras.Model) -> int | None:
    try:
        return int(model.count_params())
    except Exception:
        return None


def _flops_safe(model: tf.keras.Model, image_size: tuple[int, int]) -> int | None:
    try:
        return count_flops(model, image_size)
    except Exception as error:
        print(f"  [warn] FLOP profiling unavailable: {error}")
        return None


def _latency_safe(model: tf.keras.Model, image_size: tuple[int, int], runs: int) -> dict[str, Any]:
    try:
        return benchmark_keras_latency(model, image_size, runs=runs)
    except Exception as error:
        print(f"  [warn] Latency benchmark unavailable: {error}")
        return {"error": str(error)}


# ---------------------------------------------------------------------------
# Model loaders
# ---------------------------------------------------------------------------

def _load_teacher(model_path: Path, config: ExperimentConfig) -> tf.keras.Model:
    model = tf.keras.models.load_model(
        str(model_path),
        custom_objects={"ResNet101Preprocessing": ResNet101Preprocessing},
        compile=False,
    )
    if model.name not in ("resnet101_teacher", "resnet101_classifier"):
        raise ValueError(f"Expected a ResNet-101 teacher, received '{model.name}'")
    return model


def _load_student(model_path: Path, config: ExperimentConfig) -> tf.keras.Model:
    model = tf.keras.models.load_model(
        str(model_path),
        custom_objects={"CoordinateAttention": CoordinateAttention, "HardSwish": HardSwish},
        compile=False,
    )
    if model.name != "coordinate_attention_enhanced_mobilenetv3":
        raise ValueError(f"Expected the finalized CA-MobileNetV3-Small, received '{model.name}'")
    return model


def _load_baseline(model_path: Path, config: ExperimentConfig) -> tf.keras.Model:
    model = tf.keras.models.load_model(str(model_path), compile=False)
    if model.name != BASELINE_MODEL_NAME:
        raise ValueError(f"Expected {BASELINE_MODEL_NAME}, received '{model.name}'")
    return model


# ---------------------------------------------------------------------------
# Per-model evaluation
# ---------------------------------------------------------------------------

def _evaluate_teacher(
    model: tf.keras.Model,
    config: ExperimentConfig,
    test_records: Sequence[ImageRecord],
    manifest_path: Path,
    model_path: Path,
    output_dir: Path,
    latency_runs: int,
) -> dict[str, Any]:
    classifier = tf.keras.Model(model.input, model.output["logits"], name="teacher_classifier")
    true_labels, predicted_labels = _run_inference(classifier, test_records, config)
    metrics = classification_metrics(true_labels, predicted_labels, config.data.class_names)
    metrics["model"] = "teacher_resnet101"
    metrics["experiment_contract"] = experiment_contract(
        manifest_path, config.data.class_names, config.image_size, mobilenet_variant="ResNet101"
    )
    metrics["resources"] = {
        "parameters": _count_params_safe(classifier),
        "checkpoint_file_bytes": model_path.stat().st_size if model_path.is_file() else None,
        "flops_batch_one": _flops_safe(classifier, config.image_size),
        "keras_latency": _latency_safe(classifier, config.image_size, latency_runs),
    }
    save_json(metrics, output_dir / "teacher_final_evaluation.json")
    save_confusion_matrix(
        metrics["confusion_matrix"], config.data.class_names,
        output_dir / "teacher_final_confusion_matrix.png",
    )
    return metrics


def _evaluate_student(
    model: tf.keras.Model,
    config: ExperimentConfig,
    test_records: Sequence[ImageRecord],
    manifest_path: Path,
    model_path: Path,
    output_dir: Path,
    latency_runs: int,
    davao_field_records: Sequence[ImageRecord],
    field_manifest_path: str | None,
) -> dict[str, Any]:
    deployable = logits_only_model(model)
    true_labels, predicted_labels = _run_inference(deployable, test_records, config)
    metrics = classification_metrics(true_labels, predicted_labels, config.data.class_names)
    metrics["model"] = "enhanced_ca_mobilenetv3_small"
    metrics["experiment_contract"] = experiment_contract(
        manifest_path, config.data.class_names, config.image_size
    )
    metrics["resources"] = {
        "parameters": _count_params_safe(deployable),
        "training_model_parameters_including_distillation_adapter": _count_params_safe(model),
        "checkpoint_file_bytes": model_path.stat().st_size if model_path.is_file() else None,
        "flops_batch_one": _flops_safe(deployable, config.image_size),
        "keras_latency": _latency_safe(deployable, config.image_size, latency_runs),
    }
    save_json(metrics, output_dir / "student_final_evaluation.json")
    save_confusion_matrix(
        metrics["confusion_matrix"], config.data.class_names,
        output_dir / "student_final_confusion_matrix.png",
    )
    # Davao field subset
    if davao_field_records:
        field_true, field_pred = _run_inference(deployable, davao_field_records, config)
        field_metrics = classification_metrics(field_true, field_pred, config.data.class_names)
        field_metrics["expert_validated_samples"] = len(davao_field_records)
        field_metrics["predefined_manifest"] = field_manifest_path
        metrics["davao_field_subset"] = field_metrics
        save_json(field_metrics, output_dir / "student_davao_field_evaluation.json")
        save_confusion_matrix(
            field_metrics["confusion_matrix"], config.data.class_names,
            output_dir / "student_davao_field_confusion_matrix.png",
        )
    else:
        metrics["davao_field_subset"] = {
            "status": "PENDING EXPERIMENTAL VALIDATION",
            "reason": "No expert-validated Davao records are in the held-out test manifest",
        }
    return metrics


def _evaluate_baseline(
    model: tf.keras.Model,
    config: ExperimentConfig,
    test_records: Sequence[ImageRecord],
    manifest_path: Path,
    model_path: Path,
    output_dir: Path,
    latency_runs: int,
) -> dict[str, Any]:
    true_labels, predicted_labels = _run_inference(model, test_records, config)
    metrics = classification_metrics(true_labels, predicted_labels, config.data.class_names)
    metrics["model"] = "baseline_mobilenetv3_small"
    metrics["experiment_contract"] = experiment_contract(
        manifest_path, config.data.class_names, config.image_size
    )
    metrics["resources"] = {
        "parameters": _count_params_safe(model),
        "checkpoint_file_bytes": model_path.stat().st_size if model_path.is_file() else None,
        "flops_batch_one": _flops_safe(model, config.image_size),
        "keras_latency": _latency_safe(model, config.image_size, latency_runs),
    }
    save_json(metrics, output_dir / "baseline_final_evaluation.json")
    save_confusion_matrix(
        metrics["confusion_matrix"], config.data.class_names,
        output_dir / "baseline_final_confusion_matrix.png",
    )
    return metrics


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--config", required=True, help="Ablation config JSON path")
    parser.add_argument("--teacher-model", help="Path to frozen ResNet-101 teacher .keras")
    parser.add_argument("--student-model", help="Path to frozen CA-MobileNetV3-Small .keras")
    parser.add_argument("--baseline-model", help="Path to frozen baseline MobileNetV3-Small .keras")
    parser.add_argument(
        "--split-manifest",
        help="Frozen split_summary.json (overrides config.final_split_dir default)",
    )
    parser.add_argument("--output-dir", help="Output directory override")
    parser.add_argument("--latency-runs", type=int, default=100, help="Runs per latency benchmark")
    return parser.parse_args()


def run_final_evaluation(args: argparse.Namespace) -> dict[str, Any]:
    config = load_config(args.config)
    _set_determinism(config)
    output_dir = Path(args.output_dir) if args.output_dir else Path(config.runtime.output_dir)
    output_dir = output_dir / "final_evaluation"
    output_dir.mkdir(parents=True, exist_ok=True)
    save_config(config, output_dir / "experiment_config.json")

    manifest_path = _resolve_manifest(args, config, output_dir)
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Split manifest not found: {manifest_path}")
    splits = prepare_splits(config, manifest_path)
    test_records = splits.test
    print(f"Held-out test samples: {len(test_records)}")

    # Davao field subset (predefined)
    davao_records = [
        record for record in test_records
        if record.field_subset.lower() == "davao" and record.label_review_status == "validated"
    ]
    print(f"Davao field subset samples: {len(davao_records)}")

    results: dict[str, Any] = {
        "manifest_path": str(manifest_path),
        "manifest_sha256": file_sha256(manifest_path),
        "test_sample_count": len(test_records),
        "davao_field_sample_count": len(davao_records),
        "class_names": list(config.data.class_names),
        "image_size": list(config.image_size),
        "seed": config.runtime.seed,
    }

    # Teacher
    if args.teacher_model:
        print("\n=== Evaluating Teacher (ResNet-101) ===")
        teacher_path = Path(args.teacher_model)
        teacher = _load_teacher(teacher_path, config)
        results["teacher"] = _evaluate_teacher(
            teacher, config, test_records, manifest_path,
            teacher_path, output_dir, args.latency_runs,
        )
        print(f"  Accuracy: {results['teacher']['accuracy']:.5f}; macro F1: {results['teacher']['macro_f1']:.5f}")

    # Student
    if args.student_model:
        print("\n=== Evaluating Student (CA-MobileNetV3-Small) ===")
        student_path = Path(args.student_model)
        student = _load_student(student_path, config)
        results["student"] = _evaluate_student(
            student, config, test_records, manifest_path,
            student_path, output_dir, args.latency_runs,
            davao_records, config.data.final_field_test_manifest,
        )
        print(f"  Accuracy: {results['student']['accuracy']:.5f}; macro F1: {results['student']['macro_f1']:.5f}")

    # Baseline
    if args.baseline_model:
        print("\n=== Evaluating Baseline (MobileNetV3-Small) ===")
        baseline_path = Path(args.baseline_model)
        baseline = _load_baseline(baseline_path, config)
        results["baseline"] = _evaluate_baseline(
            baseline, config, test_records, manifest_path,
            baseline_path, output_dir, args.latency_runs,
        )
        print(f"  Accuracy: {results['baseline']['accuracy']:.5f}; macro F1: {results['baseline']['macro_f1']:.5f}")

    # Write unified summary
    results["output_dir"] = str(output_dir)
    results["evaluation_timestamp_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    save_json(results, output_dir / "final_evaluation_summary.json")
    print(f"\nFull summary: {output_dir / 'final_evaluation_summary.json'}")
    return results


if __name__ == "__main__":
    run_final_evaluation(parse_args())
