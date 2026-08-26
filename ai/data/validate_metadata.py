"""Validate metadata readiness without constructing or writing a dataset split."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ai.config.config import load_config
from ai.data.dataset import _image_paths, load_metadata_manifest
from ai.data.metadata_manifest import validation_report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--metadata-manifest", required=True)
    parser.add_argument("--output", default="ai/artifacts/metadata-validation-report.json")
    parser.add_argument("--config")
    parser.add_argument(
        "--allow-pending",
        action="store_true",
        help="Write the report and return success despite human-review blockers",
    )
    args = parser.parse_args()
    config = load_config(args.config)
    root = Path(args.dataset_dir).expanduser().resolve()
    records = load_metadata_manifest(args.metadata_manifest)
    active_paths = [
        path for path in _image_paths(root, config.data.allowed_extensions)
        if path.relative_to(root).parts[0] in set(config.data.class_names)
    ]
    report, missing, unresolved = validation_report(root, active_paths, records)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))
    print(f"Metadata validation report: {output.resolve()}")
    if (missing or unresolved) and not args.allow_pending:
        raise SystemExit(
            "THESIS METADATA GATE FAILED: "
            f"{missing} active records are missing and {unresolved} require human review. "
            "No split was generated."
        )


if __name__ == "__main__":
    main()
