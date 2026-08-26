"""Compare final held-out evaluation results across all models.

Reads the individual JSON reports produced by final_evaluation.py and generates:
    1. A model-by-model comparison table (complete test set).
    2. A Davao field-acquired subset comparison table.
    3. A held-out test vs Davao field contrast for each model.
    4. Machine-readable JSON and thesis-ready Markdown output.

Usage:
    python -m ai.evaluation.compare_final \\
        --eval-dir ai/artifacts/final_evaluation \\
        --output    ai/artifacts/final_evaluation/comparison_report.json
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Sequence

from ai.evaluation.metrics import save_json


# Metrics carried into the comparison table (same keys as classification_metrics output).
_OVERALL_METRICS = ("accuracy", "macro_precision", "macro_recall", "macro_f1")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(value: Any, precision: int = 5) -> str:
    if value is None:
        return "-"
    try:
        return f"{float(value):.{precision}f}"
    except (TypeError, ValueError):
        return str(value)


def _load_json(path: Path) -> dict:
    import json
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _extract_class_names(reports: dict[str, dict]) -> list[str]:
    """Extract ordered class names from the classification_report of any report."""
    known_classes = {"accuracy", "macro avg", "weighted avg"}
    for report in reports.values():
        cr = report.get("classification_report", {})
        if cr:
            names = [k for k in cr if k not in known_classes]
            if names:
                return names
    return []


def _resource_comparison(reports: dict[str, dict]) -> dict[str, dict]:
    resources = {}
    for model_label, report in reports.items():
        res = report.get("resources", {})
        resources[model_label] = {
            "parameters": res.get("parameters"),
            "checkpoint_file_bytes": res.get("checkpoint_file_bytes"),
            "flops_batch_one": res.get("flops_batch_one"),
        }
        latency = res.get("keras_latency", {})
        if isinstance(latency, dict) and "error" not in latency:
            resources[model_label]["latency_mean_ms"] = latency.get("mean_ms")
            resources[model_label]["latency_std_ms"] = latency.get("standard_deviation_ms")
            resources[model_label]["latency_p95_ms"] = latency.get("p95_ms")
            resources[model_label]["throughput_images_per_second"] = latency.get("throughput_images_per_second")
    return resources


# ---------------------------------------------------------------------------
# Markdown writer
# ---------------------------------------------------------------------------

def _write_markdown(
    reports: dict[str, dict],
    field_reports: dict[str, dict],
    held_out_vs_field: dict[str, dict],
    resources: dict[str, dict],
    output_path: Path,
    class_names: Sequence[str],
) -> None:
    model_labels = list(reports.keys())
    lines = [
        "# Final Held-Out Evaluation Comparison",
        "",
        "> All numbers below come exclusively from the held-out test partition.",
        "> These values are reported **only after** every model-selection decision is frozen.",
        "",
        "---",
        "",
        "## 1. Overall Held-Out Test Set",
        "",
        "| Metric | " + " | ".join(model_labels) + " |",
        "|---|" + "|".join("---" for _ in model_labels) + "|",
    ]
    for metric in _OVERALL_METRICS:
        vals = " | ".join(
            _safe_float(reports[ml].get(metric)) for ml in model_labels
        )
        lines.append(f"| {metric} | {vals} |")
    lines.extend([""])

    # Per-class table
    lines.extend(["## 2. Per-Class Metrics (Held-Out Test Set)", ""])
    pc_header = "| Class | " + " | ".join(f"{ml} P / R / F1" for ml in model_labels) + " |"
    pc_sep = "|---|" + "|".join("---" for _ in model_labels) + "|"
    lines.extend([pc_header, pc_sep])
    for class_name in class_names:
        vals = " | ".join(
            f"{_safe_float(reports[ml].get('per_class', {}).get(class_name, {}).get('precision'))} / "
            f"{_safe_float(reports[ml].get('per_class', {}).get(class_name, {}).get('recall'))} / "
            f"{_safe_float(reports[ml].get('per_class', {}).get(class_name, {}).get('f1'))}"
            for ml in model_labels
        )
        lines.append(f"| {class_name} | {vals} |")
    lines.extend([""])

    # Davao field subset
    lines.extend(["## 3. Davao Field-Acquired Subset", ""])
    if field_reports:
        lines.extend([
            "| Metric | " + " | ".join(field_reports.keys()) + " |",
            "|---|" + "|".join("---" for _ in field_reports) + "|",
        ])
        for metric in _OVERALL_METRICS:
            vals = " | ".join(
                _safe_float(fr.get(metric)) for fr in field_reports.values()
            )
            lines.append(f"| {metric} | {vals} |")
        lines.extend([""])
        # Per-class Davao
        lines.extend(["### Per-Class (Davao Field Subset)", ""])
        davao_labels = list(field_reports.keys())
        lines.extend([
            "| Class | " + " | ".join(f"{ml} P / R / F1" for ml in davao_labels) + " |",
            "|---|" + "|".join("---" for _ in davao_labels) + "|",
        ])
        for class_name in class_names:
            vals = " | ".join(
                f"{_safe_float(field_reports[ml].get('per_class', {}).get(class_name, {}).get('precision'))} / "
                f"{_safe_float(field_reports[ml].get('per_class', {}).get(class_name, {}).get('recall'))} / "
                f"{_safe_float(field_reports[ml].get('per_class', {}).get(class_name, {}).get('f1'))}"
                for ml in davao_labels
            )
            lines.append(f"| {class_name} | {vals} |")
        lines.extend([""])
    else:
        lines.extend(["_No Davao field records available._", ""])

    # Held-out vs Davao contrast
    lines.extend(["## 4. Held-Out Test Set vs Davao Field Subset", ""])
    if held_out_vs_field:
        for model_label, contrast in held_out_vs_field.items():
            lines.extend([
                f"### {model_label}", "",
                "| Metric | Held-Out Test | Davao Field | Delta |",
                "|---|---|---|---|",
            ])
            for metric in _OVERALL_METRICS:
                ho = contrast.get("held_out", {}).get(metric)
                fi = contrast.get("field", {}).get(metric)
                delta = (fi - ho) if ho is not None and fi is not None else None
                lines.append(
                    f"| {metric} | {_safe_float(ho)} | {_safe_float(fi)} | {_safe_float(delta)} |"
                )
            lines.extend([""])
    else:
        lines.extend(["_No Davao field records available for contrast._", ""])

    # Computational resources
    lines.extend(["## 5. Computational Resources", ""])
    if resources:
        r_labels = list(resources.keys())
        lines.extend([
            "| Resource | " + " | ".join(r_labels) + " |",
            "|---|" + "|".join("---" for _ in r_labels) + "|",
        ])
        for key, label in [
            ("parameters", "Parameters"),
            ("flops_batch_one", "FLOPs (batch=1)"),
            ("latency_mean_ms", "Latency mean (ms)"),
            ("latency_p95_ms", "Latency P95 (ms)"),
            ("throughput_images_per_second", "Throughput (img/s)"),
            ("checkpoint_file_bytes", "Checkpoint (bytes)"),
        ]:
            vals = " | ".join(
                _safe_float(resources[ml].get(key)) for ml in r_labels
            )
            lines.append(f"| {label} | {vals} |")
        lines.extend([""])

    # Confusion matrices
    lines.extend(["## 6. Confusion Matrices", ""])
    for model_label, report in reports.items():
        cm = report.get("confusion_matrix")
        if cm is None:
            continue
        lines.extend([f"### {model_label}", ""])
        lines.extend([
            "| True \\ Pred | " + " | ".join(class_names) + " |",
            "|---|" + "|".join("---" for _ in class_names) + "|",
        ])
        for i, true_class in enumerate(class_names):
            vals = " | ".join(str(cm[i][j]) for j in range(len(class_names)))
            lines.append(f"| {true_class} | {vals} |")
        lines.extend([""])

    output_path.write_text("\n".join(lines), encoding="utf-8")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--eval-dir", required=True, help="Directory containing final_evaluation*.json files")
    parser.add_argument("--output", default=None, help="Output JSON path (defaults to eval-dir/comparison_report.json)")
    return parser.parse_args()


def build_comparison(args: argparse.Namespace) -> dict[str, Any]:
    eval_dir = Path(args.eval_dir)
    teacher = _load_json(eval_dir / "teacher_final_evaluation.json")
    student = _load_json(eval_dir / "student_final_evaluation.json")
    baseline = _load_json(eval_dir / "baseline_final_evaluation.json")

    reports: dict[str, dict] = {}
    if teacher:
        reports["teacher_resnet101"] = teacher
    if student:
        reports["enhanced_ca_mobilenetv3"] = student
    if baseline:
        reports["baseline_mobilenetv3"] = baseline

    if not reports:
        raise FileNotFoundError(f"No final_evaluation*.json files found in {eval_dir}")

    class_names = _extract_class_names(reports)

    # Davao field reports
    field_reports: dict[str, dict] = {}
    for model_label, report in reports.items():
        davao = report.get("davao_field_subset", {})
        if davao.get("accuracy") is not None:
            field_reports[model_label] = davao

    # Held-out vs Davao contrast
    held_out_vs_field: dict[str, dict] = {}
    for model_label, report in reports.items():
        davao = report.get("davao_field_subset", {})
        if davao.get("accuracy") is not None:
            held_out_vs_field[model_label] = {
                "held_out": {m: report.get(m) for m in _OVERALL_METRICS},
                "field": {m: davao.get(m) for m in _OVERALL_METRICS},
                "held_out_samples": report.get("classification_report", {}).get("weighted avg", {}).get("support"),
                "field_samples": davao.get("expert_validated_samples"),
            }

    # Computational resources
    resources = _resource_comparison(reports)

    # Build JSON report
    report = {
        "schema_version": 1,
        "evaluation_dir": str(eval_dir),
        "class_names": class_names,
        "held_out_test_reports": {
            k: {
                "accuracy": v.get("accuracy"),
                "macro_precision": v.get("macro_precision"),
                "macro_recall": v.get("macro_recall"),
                "macro_f1": v.get("macro_f1"),
            }
            for k, v in reports.items()
        },
        "per_class_held_out": [
            {
                "class": cn,
                **{
                    f"{ml}_{metric}": reports[ml].get("per_class", {}).get(cn, {}).get(metric)
                    for ml in reports
                    for metric in ("precision", "recall", "f1", "support")
                },
            }
            for cn in class_names
        ],
        "davao_field_reports": {
            k: {
                "accuracy": v.get("accuracy"),
                "macro_precision": v.get("macro_precision"),
                "macro_recall": v.get("macro_recall"),
                "macro_f1": v.get("macro_f1"),
            }
            for k, v in field_reports.items()
        },
        "per_class_davao_field": [
            {
                "class": cn,
                **{
                    f"{ml}_{metric}": field_reports[ml].get("per_class", {}).get(cn, {}).get(metric)
                    for ml in field_reports
                    for metric in ("precision", "recall", "f1", "support")
                },
            }
            for cn in class_names
        ],
        "held_out_vs_davao_field": held_out_vs_field,
        "computational_resources": resources,
        "confusion_matrices": {
            ml: {
                "matrix": report.get("confusion_matrix"),
                "class_names": class_names,
            }
            for ml, report in reports.items()
            if report.get("confusion_matrix") is not None
        },
        "notes": {
            "held_out_definition": (
                "The held-out test partition is never used for training, "
                "hyperparameter tuning, or checkpoint selection."
            ),
            "davao_field_definition": (
                "Expert-validated Davao field-acquired images, evaluated "
                "separately from the complete held-out test set."
            ),
            "selection_metric": "validation_macro_f1",
            "validation_test_separation": (
                "Validation performance is never mixed with final test performance."
            ),
        },
    }

    output_path = Path(args.output) if args.output else eval_dir / "comparison_report.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    save_json(report, output_path)

    md_path = output_path.with_suffix(".md")
    _write_markdown(reports, field_reports, held_out_vs_field, resources, md_path, class_names)
    print(f"Comparison report: {output_path}")
    print(f"Comparison markdown: {md_path}")
    return report


if __name__ == "__main__":
    build_comparison(parse_args())
