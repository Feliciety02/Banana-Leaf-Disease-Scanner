"""Enrich thesis metadata without creating a train/validation/test split."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from ai.config.config import load_config
from ai.data.metadata_manifest import enrich_metadata, write_manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--metadata-manifest", required=True)
    parser.add_argument("--group-manifest")
    parser.add_argument("--inventory-report")
    parser.add_argument("--output", help="Defaults to --metadata-manifest (in-place deterministic migration)")
    parser.add_argument("--config")
    args = parser.parse_args()
    config = load_config(args.config)
    root = Path(args.dataset_dir).expanduser().resolve()
    payload = enrich_metadata(
        root=root,
        class_names=config.data.class_names,
        extensions=config.data.allowed_extensions,
        existing_path=args.metadata_manifest,
        group_manifest_path=args.group_manifest,
        inventory_report_path=args.inventory_report,
    )
    destination = write_manifest(payload, args.output or args.metadata_manifest)
    active = [
        record for record in payload["images"].values()
        if record["canonical_class"] in config.data.class_names
    ]
    summary = {
        "records_written": len(payload["images"]),
        "active_records": len(active),
        "source_dataset_resolved": sum(record["source_dataset"] != "unknown" for record in active),
        "original_label_resolved": sum(record["original_label"] != "unknown" for record in active),
        "explicit_group_id_resolved": sum(record["group_id"] not in {"unknown", "pending"} for record in active),
        "pending_near_duplicate_review": sum(record["duplicate_status"] == "pending_near_duplicate_review" for record in active),
    }
    print(json.dumps({"metadata_manifest": str(destination), **summary}, indent=2))


if __name__ == "__main__":
    main()
