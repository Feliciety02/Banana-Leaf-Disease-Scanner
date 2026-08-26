"""Validate the configured four-class dataset without starting model training."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

from ai.config.config import load_config
from ai.data.dataset import prepare_splits, require_dataset_dir, write_metadata_template


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", help="Overrides DATASET_ROOT from ai/.env")
    parser.add_argument(
        "--group-manifest",
        help="JSON mapping of dataset-relative image paths to indivisible biological/acquisition group IDs",
    )
    parser.add_argument("--metadata-manifest", help="Structured per-image provenance and label-review JSON")
    parser.add_argument("--near-duplicate-review-manifest", help="Reviewed decisions keyed by path_a||path_b")
    parser.add_argument("--write-metadata-template", action="store_true", help="Create/update the metadata manifest without inventing unknown identifiers")
    parser.add_argument("--ssl-unlabeled-dir", help="Optional images designated only for self-supervised pretraining")
    parser.add_argument("--ssl-manifest", help="Versioned SSL admission manifest")
    parser.add_argument("--final-split-dir", help="Frozen final split required for external SSL admission")
    parser.add_argument("--final-field-test-dir", help="Optional locked Davao field-test root with four class folders")
    parser.add_argument("--formal", action="store_true", help="Explicitly use the default thesis-ready split gates")
    parser.add_argument(
        "--exploratory",
        action="store_true",
        help="Write a preliminary split despite unresolved metadata/near-duplicate review; never use it for thesis results",
    )
    parser.add_argument("--config", help="Optional experiment JSON override")
    parser.add_argument("--output-dir", default="ai/artifacts/dataset-validation-current-contract")
    args = parser.parse_args()
    if args.formal and args.exploratory:
        parser.error("--formal and --exploratory are mutually exclusive")

    config = load_config(args.config)
    if args.dataset_dir:
        config.data.dataset_dir = args.dataset_dir
    if args.group_manifest:
        config.data.group_manifest = args.group_manifest
    if args.metadata_manifest:
        config.data.metadata_manifest = args.metadata_manifest
    if args.near_duplicate_review_manifest:
        config.data.near_duplicate_review_manifest = args.near_duplicate_review_manifest
    if args.ssl_unlabeled_dir:
        config.data.ssl_unlabeled_dir = args.ssl_unlabeled_dir
    if args.ssl_manifest:
        config.data.ssl_manifest = args.ssl_manifest
    if args.final_split_dir:
        config.data.final_split_dir = args.final_split_dir
    if args.final_field_test_dir:
        config.data.final_field_test_dir = args.final_field_test_dir
    if args.formal:
        config.data.require_near_duplicate_review = True
        config.data.require_complete_metadata = True
    if args.exploratory:
        config.data.require_near_duplicate_review = False
        config.data.require_complete_metadata = False
    config.runtime.output_dir = args.output_dir
    config.validate()

    if args.write_metadata_template:
        if not config.data.metadata_manifest:
            raise ValueError("--write-metadata-template requires --metadata-manifest or data.metadata_manifest")
        template = write_metadata_template(
            require_dataset_dir(config),
            config.data.class_names,
            config.data.quarantined_class_names,
            config.data.allowed_extensions,
            config.data.metadata_manifest,
        )
        print(f"Metadata template: {template}")

    manifest = Path(args.output_dir) / "split_manifest.json"
    splits = prepare_splits(config, manifest)
    report = json.loads((Path(args.output_dir) / "image_validation_report.json").read_text(encoding="utf-8"))
    summary = report["summary"]
    print(f"Dataset root: {Path(config.data.dataset_dir or '').expanduser().resolve()}")
    print(
        f"Image validation: {summary['accepted']}/{summary['scanned']} accepted; "
        f"{summary['rejected']} rejected; report: "
        f"{(Path(args.output_dir) / 'image_validation_report.json').resolve()}"
    )
    print(f"Classes ({len(splits.class_names)}): {', '.join(splits.class_names)}")
    for split_name in ("train", "validation", "test"):
        records = getattr(splits, split_name)
        counts = Counter(record.class_name for record in records)
        print(f"{split_name}: {len(records)} images {dict(sorted(counts.items()))}")

    all_records = splits.train + splits.validation + splits.test
    validation_report = json.loads(
        (Path(args.output_dir) / "image_validation_report.json").read_text(encoding="utf-8")
    )
    summary = validation_report["summary"]
    print(
        "Inventory: "
        f"{summary['scanned']} scanned; {summary['accepted']} active; "
        f"{summary['quarantined']} quarantined/preserved; "
        f"{summary['exact_duplicate_copies_excluded']} exact duplicate copies excluded; "
        f"{summary['near_duplicate_pairs_requiring_review']} near-duplicate pairs require review"
    )
    if config.data.group_manifest:
        group_path = Path(config.data.group_manifest).expanduser().resolve()
        group_map = json.loads(group_path.read_text(encoding="utf-8"))
        dataset_root = Path(config.data.dataset_dir or "").expanduser().resolve()
        inventory = {
            str(Path(record.path).relative_to(dataset_root)).replace("\\", "/")
            for record in all_records
        }
        explicit_paths = inventory.intersection(group_map)
        hash_only_count = len(inventory) - len(explicit_paths)
        print(
            f"Explicit biological/acquisition grouping: {len(explicit_paths)}/{len(inventory)} images; "
            f"SHA-256-only fallback: {hash_only_count}"
        )
        if hash_only_count:
            print(
                "WARNING: SHA-256-only records are protected against exact-copy leakage only. "
                "Before formal reporting, confirm that each was reviewed as an independent singleton "
                "or add its biological/acquisition relationship to the group manifest."
            )
    else:
        print(
            "WARNING: No group manifest was supplied. The split protects only against byte-identical "
            "leakage and is not sufficient for a formal biological-independence claim."
        )
    print(f"Validated manifest: {manifest.resolve()}")
    checksums = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (
            manifest,
            Path(args.output_dir) / "image_validation_report.json",
            Path(args.output_dir) / "metadata_coverage_report.json",
            Path(args.output_dir) / "external_overlap_report.json",
            Path(args.output_dir) / "near_duplicate_review_template.json",
        )
    }
    checksum_path = Path(args.output_dir) / "artifact_checksums.json"
    checksum_path.write_text(json.dumps(checksums, indent=2), encoding="utf-8")
    print(f"Artifact checksums: {checksum_path.resolve()}")


if __name__ == "__main__":
    main()
