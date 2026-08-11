"""Validate the configured five-class dataset without starting model training."""

from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path

from ai.config.config import load_config
from ai.data.dataset import prepare_splits


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", help="Overrides DATASET_ROOT from ai/.env")
    parser.add_argument("--config", help="Optional experiment JSON override")
    parser.add_argument("--output-dir", default="ai/artifacts/dataset-validation")
    args = parser.parse_args()

    config = load_config(args.config)
    if args.dataset_dir:
        config.data.dataset_dir = args.dataset_dir
    config.runtime.output_dir = args.output_dir
    config.validate()

    manifest = Path(args.output_dir) / "split_manifest.json"
    splits = prepare_splits(config, manifest)
    print(f"Dataset root: {Path(config.data.dataset_dir or '').expanduser().resolve()}")
    print(f"Classes ({len(splits.class_names)}): {', '.join(splits.class_names)}")
    for split_name in ("train", "validation", "test"):
        records = getattr(splits, split_name)
        counts = Counter(record.class_name for record in records)
        print(f"{split_name}: {len(records)} images {dict(sorted(counts.items()))}")
    print(f"Validated manifest: {manifest.resolve()}")


if __name__ == "__main__":
    main()
