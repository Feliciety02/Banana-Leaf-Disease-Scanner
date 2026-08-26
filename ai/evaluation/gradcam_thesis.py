"""Thesis Grad-CAM qualitative evaluation workflow.

Grad-CAM is a research-evaluation-only technique for qualitative visual
interpretability.  This script generates Grad-CAM visualisations for every
frozen model on the held-out test set and writes them into a structured
output tree organised by model, correctness, and disease class.

**Qualitative disclaimer**
Grad-CAM highlights regions that influence a convolutional classifier's
logit output.  It does NOT prove spatial localisation accuracy,
diagnostic correctness, or clinical reliability.  All Grad-CAM output
in this thesis is presented solely as qualitative supplementary evidence.

Architecture-specific Grad-CAM layers
--------------------------------------
Teacher  (ResNet-101)           : conv5_block3_out   (last residual block)
Student  (CA-MobileNetV3-Small) : student_feature_map (last feature map before GAP, 576 ch)
Baseline (MobileNetV3-Small)    : baseline_mobilenetv3_small_backbone (backbone output)

Output structure
----------------
gradcam_thesis/
  disclaimer.txt
  manifest.json
  <model_name>/
    correct/<class_name>/
      <index>.png   (3-panel: original | heatmap | overlay)
      <index>.json  (metadata)
    incorrect/<class_name>/
      ...
  comparisons/
    correct/<class_name>/
      <index>.png   (N-model side-by-side grid)
    incorrect/<class_name>/
      ...

Usage
-----
    python -m ai.evaluation.gradcam_thesis \\
        --config ai/config/ablations/configuration_4.json \\
        --teacher-model  ai/artifacts/teacher/resnet101_teacher.keras \\
        --student-model  ai/artifacts/student/ca_mobilenetv3_small.keras \\
        --baseline-model ai/artifacts/baseline/baseline_mobilenetv3_small.keras \\
        --split-manifest ai/artifacts/final_split/split_summary.json \\
        --output-dir     ai/artifacts
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from PIL import Image

from ai.config.labels import CLASS_LABELS
from ai.data.dataset import ImageRecord, decode_and_resize, make_supervised_dataset, prepare_splits
from ai.evaluation.gradcam import _grad_model, gradcam_heatmap
from ai.models.coordinate_attention import CoordinateAttention
from ai.models.mobilenetv3_baseline import BASELINE_BACKBONE_NAME, BASELINE_MODEL_NAME
from ai.models.mobilenetv3_student import HardSwish, logits_only_model
from ai.models.teacher import ResNet101Preprocessing


# ---------------------------------------------------------------------------
# Per-architecture Grad-CAM layer registry
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ModelSpec:
    label: str
    gradcam_layer: str
    output_is_dict: bool
    logits_key: str | None
    custom_objects: dict = field(default_factory=dict)


MODEL_SPECS: dict[str, ModelSpec] = {
    "teacher_resnet101": ModelSpec(
        label="teacher_resnet101",
        gradcam_layer="conv5_block3_out",
        output_is_dict=True,
        logits_key="logits",
        custom_objects={"ResNet101Preprocessing": ResNet101Preprocessing},
    ),
    "enhanced_ca_mobilenetv3": ModelSpec(
        label="enhanced_ca_mobilenetv3",
        gradcam_layer="student_feature_map",
        output_is_dict=True,
        logits_key="logits",
        custom_objects={"CoordinateAttention": CoordinateAttention, "HardSwish": HardSwish},
    ),
    "baseline_mobilenetv3": ModelSpec(
        label="baseline_mobilenetv3",
        gradcam_layer=BASELINE_BACKBONE_NAME,
        output_is_dict=False,
        logits_key=None,
        custom_objects={},
    ),
}

EXPECTED_NAMES: dict[str, str | tuple[str, ...]] = {
    "teacher_resnet101": ("resnet101_teacher", "resnet101_classifier"),
    "enhanced_ca_mobilenetv3": "coordinate_attention_enhanced_mobilenetv3",
    "baseline_mobilenetv3": BASELINE_MODEL_NAME,
}


# ---------------------------------------------------------------------------
# Disclaimers
# ---------------------------------------------------------------------------

QUALITATIVE_DISCLAIMER = (
    "GRAD-CAM QUALITATIVE INTERPRETATION DISCLAIMER\n"
    "==============================================\n\n"
    "Grad-CAM (Gradient-weighted Class Activation Mapping) highlights image\n"
    "regions that most strongly influence a convolutional neural network's\n"
    "class-logit output.\n\n"
    "Grad-CAM does NOT:\n"
    "  - Prove that the model correctly localises disease symptoms.\n"
    "  - Demonstrate diagnostic or clinical correctness.\n"
    "  - Replace expert plant-pathology assessment.\n"
    "  - Guarantee that highlighted regions correspond to biologically\n"
    "    meaningful features.\n\n"
    "All Grad-CAM visualisations in this thesis are presented solely as\n"
    "qualitative supplementary evidence of what the learned representations\n"
    "attend to, and must not be interpreted as proof of localisation accuracy\n"
    "or diagnostic reliability.\n\n"
    "References:\n"
    "  Selvaraju et al., 'Grad-CAM: Visual Explanations from Deep Networks\n"
    "  via Gradient-based Localization', ICCV 2017.\n"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _softmax(logits: np.ndarray) -> np.ndarray:
    exp = np.exp(logits - np.max(logits))
    return exp / exp.sum(axis=-1, keepdims=True)


def _confidence(logits: np.ndarray, predicted_class: int) -> float:
    return float(_softmax(logits)[0, predicted_class])


def _resolve_manifest(args: argparse.Namespace, config: Any, output_dir: Path) -> Path:
    if getattr(args, "split_manifest", None):
        return Path(args.split_manifest)
    if config.data.final_split_dir:
        candidate = Path(config.data.final_split_dir) / "split_summary.json"
        if candidate.is_file():
            return candidate
    return output_dir / "split_manifest.json"


def _load_model(spec: ModelSpec, model_path: Path) -> tf.keras.Model:
    model = tf.keras.models.load_model(str(model_path), custom_objects=spec.custom_objects, compile=False)
    expected = EXPECTED_NAMES[spec.label]
    if isinstance(expected, tuple):
        if model.name not in expected:
            raise ValueError(f"Expected {expected} for {spec.label}, received '{model.name}'")
    else:
        if model.name != expected:
            raise ValueError(f"Expected {expected} for {spec.label}, received '{model.name}'")
    return model


def _inference_logits(model: tf.keras.Model, spec: ModelSpec) -> np.ndarray:
    """Forward pass returning raw logits [N, num_classes]."""
    return model.output["logits"] if spec.output_is_dict else model.output


# ---------------------------------------------------------------------------
# Single-sample Grad-CAM + save
# ---------------------------------------------------------------------------

def _save_gradcam_sample(
    image_tensor: tf.Tensor,
    heatmap: np.ndarray,
    record: ImageRecord,
    predicted_class: int,
    confidence: float,
    spec: ModelSpec,
    class_names: Sequence[str],
    image_size: tuple[int, int],
    destination_stem: Path,
) -> dict:
    """Save 3-panel PNG and metadata JSON for one sample. Returns metadata dict."""
    original = image_tensor.numpy()
    heatmap_resized = np.asarray(
        Image.fromarray(np.uint8(heatmap * 255)).resize(
            (image_size[1], image_size[0]), Image.BILINEAR
        )
    ) / 255.0
    colored = plt.get_cmap("jet")(heatmap_resized)[..., :3]
    overlay = np.clip(0.6 * original + 0.4 * colored, 0.0, 1.0)

    figure, axes = plt.subplots(1, 3, figsize=(13, 4.5))
    axes[0].imshow(np.clip(original, 0.0, 1.0))
    axes[0].set_title("Input", fontsize=10)
    axes[1].imshow(heatmap_resized, cmap="jet", vmin=0, vmax=1)
    axes[1].set_title("Grad-CAM", fontsize=10)
    axes[2].imshow(overlay)
    axes[2].set_title("Overlay", fontsize=10)
    for axis in axes:
        axis.axis("off")
    figure.suptitle(
        f"True: {class_names[record.label]}  |  "
        f"Predicted: {class_names[predicted_class]}  |  "
        f"Confidence: {confidence:.4f}  |  "
        f"Model: {spec.label}",
        fontsize=9,
        y=0.98,
    )
    figure.tight_layout(rect=(0, 0, 1, 0.93))
    figure.savefig(str(destination_stem) + ".png", dpi=180, bbox_inches="tight")
    plt.close(figure)

    metadata = {
        "record_index": destination_stem.name,
        "record_path": record.path,
        "record_sha256": record.sha256,
        "actual_class": class_names[record.label],
        "actual_class_index": record.label,
        "predicted_class": class_names[predicted_class],
        "predicted_class_index": predicted_class,
        "confidence": confidence,
        "model": spec.label,
        "gradcam_layer": spec.gradcam_layer,
        "field_subset": record.field_subset,
        "correct": record.label == predicted_class,
    }
    (destination_stem.with_suffix(".json")).write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    return metadata


# ---------------------------------------------------------------------------
# Comparison grid
# ---------------------------------------------------------------------------

def _save_comparison_grid(
    image_tensor: tf.Tensor,
    heatmaps: dict[str, np.ndarray],
    record: ImageRecord,
    predictions: dict[str, int],
    confidences: dict[str, float],
    class_names: Sequence[str],
    image_size: tuple[int, int],
    destination: Path,
) -> None:
    """Side-by-side grid: original | teacher | student | baseline."""
    n_models = len(heatmaps) + 1
    figure, axes = plt.subplots(1, n_models, figsize=(4.5 * n_models, 4.5))
    if n_models == 1:
        axes = [axes]

    original = image_tensor.numpy()
    axes[0].imshow(np.clip(original, 0.0, 1.0))
    axes[0].set_title("Input", fontsize=10)

    for idx, (model_label, heatmap) in enumerate(heatmaps.items(), start=1):
        heatmap_resized = np.asarray(
            Image.fromarray(np.uint8(heatmap * 255)).resize(
                (image_size[1], image_size[0]), Image.BILINEAR
            )
        ) / 255.0
        colored = plt.get_cmap("jet")(heatmap_resized)[..., :3]
        overlay = np.clip(0.6 * original + 0.4 * colored, 0.0, 1.0)
        axes[idx].imshow(overlay)
        pred = predictions[model_label]
        conf = confidences[model_label]
        axes[idx].set_title(
            f"{model_label}\n{class_names[pred]} ({conf:.3f})", fontsize=9
        )

    for axis in axes:
        axis.axis("off")

    figure.suptitle(
        f"True: {class_names[record.label]}",
        fontsize=11,
        y=1.01,
    )
    figure.tight_layout()
    figure.savefig(str(destination), dpi=180, bbox_inches="tight")
    plt.close(figure)


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
    parser.add_argument("--baseline-model", help="Path to frozen baseline .keras")
    parser.add_argument("--split-manifest", help="Frozen split_summary.json")
    parser.add_argument("--output-dir", help="Output directory override")
    parser.add_argument(
        "--max-per-class", type=int, default=20,
        help="Maximum Grad-CAM samples per (model, correctness, disease) group",
    )
    parser.add_argument(
        "--comparison-count", type=int, default=30,
        help="Maximum side-by-side comparison grids",
    )
    parser.add_argument(
        "--disease-only", action="store_true",
        help="If set, only generate Grad-CAM for disease classes (exclude healthy)",
    )
    return parser.parse_args()


def run_gradcam_thesis(args: argparse.Namespace) -> dict[str, Any]:
    from ai.config.config import load_config, save_config, set_global_determinism

    config = load_config(args.config)
    set_global_determinism(config.runtime.seed)
    output_root = Path(args.output_dir) if args.output_dir else Path(config.runtime.output_dir)
    output_dir = output_root / "gradcam_thesis"
    output_dir.mkdir(parents=True, exist_ok=True)
    save_config(config, output_dir / "experiment_config.json")

    # Write disclaimer
    (output_dir / "disclaimer.txt").write_text(QUALITATIVE_DISCLAIMER, encoding="utf-8")

    manifest_path = _resolve_manifest(args, config, output_dir)
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Split manifest not found: {manifest_path}")
    splits = prepare_splits(config, manifest_path)
    test_records = splits.test
    class_names = list(config.data.class_names)
    image_size = config.image_size

    if args.disease_only:
        disease_indices = {i for i, n in enumerate(class_names) if n != "healthy"}
        test_records = [r for r in test_records if r.label in disease_indices]
        print(f"Disease-only filter: {len(test_records)} samples")

    print(f"Held-out test samples: {len(test_records)}")

    # Load models
    model_specs_available: dict[str, tuple[tf.keras.Model, ModelSpec]] = {}
    model_paths = {
        "teacher_resnet101": args.teacher_model,
        "enhanced_ca_mobilenetv3": args.student_model,
        "baseline_mobilenetv3": args.baseline_model,
    }
    for label, path in model_paths.items():
        if path is None:
            continue
        spec = MODEL_SPECS[label]
        print(f"Loading {label} from {path}")
        model = _load_model(spec, Path(path))
        model_specs_available[label] = (model, spec)

    if not model_specs_available:
        raise ValueError("At least one model must be provided")

    # Run inference for each model to get predictions + confidence
    print("\nRunning inference on held-out test set...")
    per_model_predictions: dict[str, list[int]] = {label: [] for label in model_specs_available}
    per_model_confidences: dict[str, list[float]] = {label: [] for label in model_specs_available}
    per_model_logits: dict[str, list[np.ndarray]] = {label: [] for label in model_specs_available}

    for label, (model, spec) in model_specs_available.items():
        print(f"  {label}...")
        dataset = make_supervised_dataset(test_records, config, training=False)
        for images_batch, labels_batch in dataset:
            output = model(images_batch, training=False)
            logits = output["logits"] if isinstance(output, dict) and spec.logits_key else output
            logits_np = logits.numpy()
            preds = np.argmax(logits_np, axis=1)
            probs = _softmax(logits_np)
            for i in range(len(preds)):
                per_model_predictions[label].append(int(preds[i]))
                per_model_confidences[label].append(float(probs[i, preds[i]]))
                per_model_logits[label].append(logits_np[i])

    print("Inference complete.\n")

    # Organise samples
    all_metadata: list[dict] = []
    counts: dict[str, int] = {}  # "model/correct/class" -> count
    comparison_candidates: list[tuple[int, ImageRecord]] = []

    for label in model_specs_available:
        counts[f"{label}/correct"] = 0
        counts[f"{label}/incorrect"] = 0

    # Generate Grad-CAM for each model
    for label, (model, spec) in model_specs_available.items():
        print(f"Generating Grad-CAM: {label} (layer: {spec.gradcam_layer})")
        model_dir = output_dir / label
        predictions = per_model_predictions[label]
        confidences = per_model_confidences[label]

        for idx, record in enumerate(test_records):
            pred = predictions[idx]
            conf = confidences[idx]
            correct = record.label == pred
            group = "correct" if correct else "incorrect"
            class_dir = model_dir / group / class_names[record.label]
            key = f"{label}/{group}"

            if counts.get(key, 0) >= args.max_per_class:
                continue
            counts[key] = counts.get(key, 0) + 1

            image = decode_and_resize(tf.constant(record.path), image_size)
            heatmap = gradcam_heatmap(model, image, pred, spec.gradcam_layer)

            sample_index = counts[key] - 1
            destination_stem = class_dir / f"{sample_index:04d}"
            class_dir.mkdir(parents=True, exist_ok=True)

            metadata = _save_gradcam_sample(
                image, heatmap, record, pred, conf, spec,
                class_names, image_size, destination_stem,
            )
            metadata["configuration_id"] = label
            all_metadata.append(metadata)

    # Comparison grids
    if len(model_specs_available) > 1:
        print(f"\nGenerating comparison grids (max {args.comparison_count})...")
        comp_dir = output_dir / "comparisons"
        comp_counts: dict[str, int] = {}

        for idx, record in enumerate(test_records):
            total_correct = sum(
                1 for label in model_specs_available
                if per_model_predictions[label][idx] == record.label
            )
            if total_correct == len(model_specs_available):
                group = "correct"
            elif total_correct == 0:
                group = "incorrect"
            else:
                group = "mixed"

            class_dir = comp_dir / group / class_names[record.label]
            key = f"{group}/{class_names[record.label]}"
            if comp_counts.get(key, 0) >= args.comparison_count:
                continue
            comp_counts[key] = comp_counts.get(key, 0) + 1

            image = decode_and_resize(tf.constant(record.path), image_size)
            heatmaps: dict[str, np.ndarray] = {}
            preds_dict: dict[str, int] = {}
            confs_dict: dict[str, float] = {}
            for label, (model, spec) in model_specs_available.items():
                pred = per_model_predictions[label][idx]
                heatmaps[label] = gradcam_heatmap(model, image, pred, spec.gradcam_layer)
                preds_dict[label] = pred
                confs_dict[label] = per_model_confidences[label][idx]

            class_dir.mkdir(parents=True, exist_ok=True)
            destination = class_dir / f"{comp_counts[key] - 1:04d}.png"
            _save_comparison_grid(
                image, heatmaps, record, preds_dict, confs_dict,
                class_names, image_size, destination,
            )

    # Write manifest
    manifest = {
        "schema_version": 1,
        "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "qualitative_disclaimer": (
            "Grad-CAM is a qualitative research-evaluation technique. "
            "It does not prove localisation accuracy or diagnostic correctness."
        ),
        "class_names": class_names,
        "image_size": list(image_size),
        "test_sample_count": len(test_records),
        "models": {
            label: {
                "gradcam_layer": spec.gradcam_layer,
                "model_path": model_paths.get(label),
                "samples_generated": counts.get(f"{label}/correct", 0) + counts.get(f"{label}/incorrect", 0),
                "correct_generated": counts.get(f"{label}/correct", 0),
                "incorrect_generated": counts.get(f"{label}/incorrect", 0),
            }
            for label, spec in model_specs_available.items()
        },
        "per_image_metadata_count": len(all_metadata),
        "max_per_class": args.max_per_class,
        "comparison_count": args.comparison_count,
        "output_structure": {
            "<model>/correct/<class>/<index>.png": "3-panel: original, heatmap, overlay",
            "<model>/correct/<class>/<index>.json": "per-image metadata",
            "comparisons/<group>/<class>/<index>.png": "side-by-side model comparison",
        },
    }
    manifest_path_out = output_dir / "manifest.json"
    manifest_path_out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"\nGrad-CAM manifest: {manifest_path_out}")
    print(f"Disclaimer: {output_dir / 'disclaimer.txt'}")
    print(f"Total images generated: {sum(counts.values())}")
    for label in model_specs_available:
        c = counts.get(f"{label}/correct", 0)
        ic = counts.get(f"{label}/incorrect", 0)
        print(f"  {label}: {c} correct, {ic} incorrect")

    return manifest


if __name__ == "__main__":
    run_gradcam_thesis(parse_args())
