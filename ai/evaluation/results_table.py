"""Aggregate ablation results into a single thesis-ready result table.

Test-set values are only populated after every experiment's selection decisions
are frozen.  The table is written as both JSON and a human-readable Markdown
file.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Sequence

from ai.training.experiments import ExperimentSpec


# Columns in the thesis result table (order matters for Markdown).
COLUMNS = (
    "experiment",
    "teacher",
    "student",
    "ssl",
    "ca",
    "kd",
    "params",
    "model_size_bytes",
    "validation_macro_f1",
    "test_accuracy",
    "test_macro_precision",
    "test_macro_recall",
    "test_macro_f1",
)


def _checkpoint_size_bytes(checkpoint_path: Path | None) -> int | None:
    if checkpoint_path is None or not checkpoint_path.is_file():
        return None
    return checkpoint_path.stat().st_size


def _safe_float(value: Any, default: str = "-") -> str:
    if value is None:
        return default
    try:
        return f"{float(value):.5f}"
    except (TypeError, ValueError):
        return str(value)


def _extract_validation_f1(checkpoint_dir: Path) -> float | None:
    """Read the best validation macro F1 from training history or validation metrics."""
    for name in ("teacher_finetune_history.json", "student_history.json", "baseline_history.json", "supervised_ablation_history.json"):
        path = checkpoint_dir / name
        if path.is_file():
            try:
                rows = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(rows, list) and rows:
                    candidates = [row.get("validation_macro_f1", row.get("val_macro_f1")) for row in rows]
                    candidates = [v for v in candidates if v is not None]
                    if candidates:
                        return max(candidates)
            except Exception:
                pass
    for name in ("validation_metrics.json", "student_validation_metrics.json", "teacher_validation_metrics.json"):
        path = checkpoint_dir / name
        if path.is_file():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                value = data.get("value") or data.get("validation_macro_f1")
                if value is not None:
                    return float(value)
            except Exception:
                pass
    return None


def build_row(
    spec: ExperimentSpec,
    checkpoint_path: Path | None,
    test_metrics: dict[str, Any] | None,
) -> dict[str, str]:
    """Build a single row of the result table."""
    output_dir = checkpoint_path.parent if checkpoint_path else Path(".")
    tags = spec.tags

    validation_f1 = _extract_validation_f1(output_dir)

    params = None
    if test_metrics and "resources" in test_metrics:
        params = test_metrics["resources"].get("parameters")

    test_acc = test_metrics.get("accuracy") if test_metrics else None
    test_prec = test_metrics.get("macro_precision") if test_metrics else None
    test_rec = test_metrics.get("macro_recall") if test_metrics else None
    test_f1 = test_metrics.get("macro_f1") if test_metrics else None

    teacher_name = "-"
    if spec.depends_on:
        if "ssl" in spec.depends_on and "8" in spec.depends_on:
            teacher_name = "ResNet-101 (SSL)"
        elif "5" in spec.depends_on:
            teacher_name = "ResNet-101 (supervised)"
        else:
            teacher_name = spec.depends_on

    student_name = "-"
    if spec.phase in ("baseline", "student", "supervised_ablation"):
        if "config_1" in spec.experiment_id:
            student_name = "MobileNetV3-Small"
        elif "config_2" in spec.experiment_id:
            student_name = "CA-MobileNetV3-Small"
        elif "config_3" in spec.experiment_id:
            student_name = "MobileNetV3-Small"
        elif "config_4" in spec.experiment_id:
            student_name = "CA-MobileNetV3-Small"
        elif "config_7" in spec.experiment_id:
            student_name = "CA-MobileNetV3-Small"
    elif spec.phase == "teacher":
        student_name = "ResNet-101"

    return {
        "experiment": spec.experiment_id,
        "teacher": teacher_name,
        "student": student_name,
        "ssl": "yes" if tags.get("ssl") == "yes" else "-",
        "ca": "yes" if tags.get("ca") == "yes" else "-",
        "kd": "yes" if tags.get("kd") == "yes" else "-",
        "params": str(params) if params else "-",
        "model_size_bytes": str(_checkpoint_size_bytes(checkpoint_path)) if checkpoint_path else "-",
        "validation_macro_f1": _safe_float(validation_f1),
        "test_accuracy": _safe_float(test_acc),
        "test_macro_precision": _safe_float(test_prec),
        "test_macro_recall": _safe_float(test_rec),
        "test_macro_f1": _safe_float(test_f1),
    }


def build_result_table(
    specs: Sequence[ExperimentSpec],
    checkpoints: dict[str, Path],
    test_results: dict[str, dict[str, Any]],
    output_root: str | Path,
) -> Path:
    """Write the aggregated result table as JSON and Markdown."""
    rows = []
    for spec in specs:
        checkpoint = checkpoints.get(spec.experiment_id)
        test_metrics = test_results.get(spec.experiment_id)
        rows.append(build_row(spec, checkpoint, test_metrics))

    output_dir = Path(output_root)
    output_dir.mkdir(parents=True, exist_ok=True)

    # JSON table
    json_path = output_dir / "thesis_result_table.json"
    json_payload = {
        "schema_version": 1,
        "columns": list(COLUMNS),
        "rows": rows,
        "notes": {
            "test_values": (
                "Test-set metrics are only populated after all training and "
                "validation-based model selection decisions are frozen."
            ),
            "selection_metric": "validation_macro_f1",
            "test_partition": "held-out, never used for training or checkpoint selection",
        },
    }
    json_path.write_text(json.dumps(json_payload, indent=2, sort_keys=True), encoding="utf-8")

    # Markdown table
    md_path = output_dir / "thesis_result_table.md"
    header = "| " + " | ".join(COLUMNS) + " |"
    separator = "| " + " | ".join("---" for _ in COLUMNS) + " |"
    lines = [
        "# Thesis Ablation Result Table",
        "",
        "Test-set values are populated only after all selection decisions are frozen.",
        "",
        header,
        separator,
    ]
    for row in rows:
        lines.append("| " + " | ".join(row[col] for col in COLUMNS) + " |")
    lines.append("")
    md_path.write_text("\n".join(lines), encoding="utf-8")

    return json_path
