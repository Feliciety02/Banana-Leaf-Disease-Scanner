"""Combine actual baseline and enhanced held-out reports after fairness checks."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


METRICS = ("accuracy", "macro_precision", "macro_recall", "macro_f1")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-report", required=True)
    parser.add_argument("--enhanced-report", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def _read(path: Path) -> dict:
    if not path.is_file():
        raise FileNotFoundError(f"Evaluation report not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def compare(args: argparse.Namespace) -> dict:
    baseline = _read(Path(args.baseline_report))
    enhanced = _read(Path(args.enhanced_report))
    baseline_contract = baseline.get("experiment_contract")
    enhanced_contract = enhanced.get("experiment_contract")
    if not baseline_contract or baseline_contract != enhanced_contract:
        raise ValueError("Evaluation contracts differ; labels, preprocessing, variant, and split manifest must match exactly")
    report = {
        "experiment_contract": baseline_contract,
        "metrics": {
            metric: {"baseline": baseline[metric], "enhanced": enhanced[metric]}
            for metric in METRICS
        },
        "per_class": {
            class_name: {"baseline": baseline["per_class"][class_name], "enhanced": enhanced["per_class"][class_name]}
            for class_name in baseline_contract["class_names"]
        },
        "resources": {"baseline": baseline.get("resources", {}), "enhanced": enhanced.get("resources", {})},
        "interpretation_note": "Conclusions require held-out metrics and uncertainty analysis; confidence on individual images is not accuracy.",
    }
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Comparison report: {destination}")
    return report


if __name__ == "__main__":
    compare(parse_args())
