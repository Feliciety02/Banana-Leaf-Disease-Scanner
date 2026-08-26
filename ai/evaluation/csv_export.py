"""Machine-readable CSV export for final evaluation results.

Reads the JSON reports produced by final_evaluation.py and the comparison_report
from compare_final.py, and writes three reproducible CSV files:

    1. overall_metrics.csv    — model x metric matrix for held-out test set
    2. per_class_metrics.csv  — model x class x metric
    3. davao_field_metrics.csv — Davao field subset, same structure as overall
    4. confusion_matrices.csv — one row per (model, true_class, pred_class)
    5. computational_resources.csv — parameters, FLOPs, latency per model

Usage:
    python -m ai.evaluation.csv_export \\
        --eval-dir  ai/artifacts/final_evaluation \\
        --output-dir ai/artifacts/final_evaluation/csv
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any


def _load_json(path: Path) -> dict:
    if not path.is_file():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _write_csv(rows: list[dict], path: Path) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


# ---------------------------------------------------------------------------
# Export: overall metrics
# ---------------------------------------------------------------------------

def _export_overall(reports: dict[str, dict], output_dir: Path) -> None:
    rows = []
    for model_label, report in reports.items():
        rows.append({
            "model": model_label,
            "accuracy": report.get("accuracy"),
            "macro_precision": report.get("macro_precision"),
            "macro_recall": report.get("macro_recall"),
            "macro_f1": report.get("macro_f1"),
            "test_samples": report.get("classification_report", {}).get("weighted avg", {}).get("support"),
        })
    _write_csv(rows, output_dir / "overall_metrics.csv")


# ---------------------------------------------------------------------------
# Export: per-class metrics
# ---------------------------------------------------------------------------

def _export_per_class(reports: dict[str, dict], output_dir: Path) -> None:
    rows = []
    for model_label, report in reports.items():
        for class_name, metrics in report.get("per_class", {}).items():
            rows.append({
                "model": model_label,
                "class": class_name,
                "precision": metrics.get("precision"),
                "recall": metrics.get("recall"),
                "f1": metrics.get("f1"),
                "support": metrics.get("support"),
            })
    _write_csv(rows, output_dir / "per_class_metrics.csv")


# ---------------------------------------------------------------------------
# Export: Davao field metrics
# ---------------------------------------------------------------------------

def _export_davao_field(reports: dict[str, dict], output_dir: Path) -> None:
    rows = []
    for model_label, report in reports.items():
        davao = report.get("davao_field_subset", {})
        if davao.get("accuracy") is None:
            continue
        rows.append({
            "model": model_label,
            "accuracy": davao.get("accuracy"),
            "macro_precision": davao.get("macro_precision"),
            "macro_recall": davao.get("macro_recall"),
            "macro_f1": davao.get("macro_f1"),
            "expert_validated_samples": davao.get("expert_validated_samples"),
        })
    _write_csv(rows, output_dir / "davao_field_metrics.csv")

    # Per-class Davao
    pc_rows = []
    for model_label, report in reports.items():
        davao = report.get("davao_field_subset", {})
        for class_name, metrics in davao.get("per_class", {}).items():
            pc_rows.append({
                "model": model_label,
                "class": class_name,
                "precision": metrics.get("precision"),
                "recall": metrics.get("recall"),
                "f1": metrics.get("f1"),
                "support": metrics.get("support"),
            })
    _write_csv(pc_rows, output_dir / "davao_field_per_class_metrics.csv")


# ---------------------------------------------------------------------------
# Export: confusion matrices
# ---------------------------------------------------------------------------

def _export_confusion_matrices(reports: dict[str, dict], output_dir: Path) -> None:
    rows = []
    for model_label, report in reports.items():
        cm = report.get("confusion_matrix")
        class_names = list(report.get("per_class", {}).keys())
        if cm is None or not class_names:
            continue
        for i, true_class in enumerate(class_names):
            for j, pred_class in enumerate(class_names):
                rows.append({
                    "model": model_label,
                    "true_class": true_class,
                    "predicted_class": pred_class,
                    "count": cm[i][j],
                })
    _write_csv(rows, output_dir / "confusion_matrices.csv")


# ---------------------------------------------------------------------------
# Export: computational resources
# ---------------------------------------------------------------------------

def _export_resources(reports: dict[str, dict], output_dir: Path) -> None:
    rows = []
    for model_label, report in reports.items():
        res = report.get("resources", {})
        latency = res.get("keras_latency", {})
        if not isinstance(latency, dict):
            latency = {}
        rows.append({
            "model": model_label,
            "parameters": res.get("parameters"),
            "flops_batch_one": res.get("flops_batch_one"),
            "checkpoint_file_bytes": res.get("checkpoint_file_bytes"),
            "latency_mean_ms": latency.get("mean_ms"),
            "latency_std_ms": latency.get("standard_deviation_ms"),
            "latency_median_ms": latency.get("median_ms"),
            "latency_p95_ms": latency.get("p95_ms"),
            "throughput_images_per_second": latency.get("throughput_images_per_second"),
            "warmup_runs": latency.get("warmup_runs"),
            "runs": latency.get("runs"),
        })
    _write_csv(rows, output_dir / "computational_resources.csv")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--eval-dir", required=True, help="Directory containing final_evaluation*.json files")
    parser.add_argument("--output-dir", default=None, help="CSV output directory (defaults to eval-dir/csv)")
    return parser.parse_args()


def export_csv(args: argparse.Namespace) -> list[Path]:
    eval_dir = Path(args.eval_dir)
    output_dir = Path(args.output_dir) if args.output_dir else eval_dir / "csv"
    output_dir.mkdir(parents=True, exist_ok=True)

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

    _export_overall(reports, output_dir)
    _export_per_class(reports, output_dir)
    _export_davao_field(reports, output_dir)
    _export_confusion_matrices(reports, output_dir)
    _export_resources(reports, output_dir)

    written = sorted(output_dir.glob("*.csv"))
    print(f"CSV files written: {len(written)}")
    for path in written:
        print(f"  {path}")
    return written


if __name__ == "__main__":
    export_csv(parse_args())
