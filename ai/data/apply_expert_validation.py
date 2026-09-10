"""Apply a traceable dataset-wide expert label-validation attestation."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from ai.data.metadata_manifest import THESIS_FIELDS, write_manifest


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _record_fingerprint(record: dict[str, Any]) -> str:
    values = {field: record[field] for field in THESIS_FIELDS}
    return hashlib.sha256(
        json.dumps(values, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def apply_attestation(
    metadata: dict[str, Any],
    inventory_report: dict[str, Any],
    reviewer_code: str,
    recorded_date: str,
    evidence_note: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    images = metadata.get("images")
    if not isinstance(images, dict):
        raise ValueError("Metadata manifest must contain an images object")

    summary = inventory_report.get("summary", {})
    if summary.get("scanned") != len(images):
        raise ValueError(
            "Inventory report and metadata manifest cover different inventories: "
            f"{summary.get('scanned')} scanned versus {len(images)} metadata records"
        )
    if inventory_report.get("cross_label_exact_conflicts"):
        raise ValueError("Resolve cross-label exact conflicts before applying expert validation")

    rejected = {
        item["path"]: sorted(reason["code"] for reason in item.get("reasons", []))
        for item in inventory_report.get("rejected_images", [])
    }
    duplicate_copies: set[str] = set()
    for group in inventory_report.get("exact_duplicate_groups", []):
        duplicate_copies.update(group.get("excluded_copies", []))
    excluded = set(rejected) | duplicate_copies

    eligible_paths = sorted(set(images) - excluded)
    expected_accepted = summary.get("accepted")
    if expected_accepted != len(eligible_paths):
        raise ValueError(
            "Derived expert-validation scope does not match the inventory report: "
            f"{len(eligible_paths)} paths versus {expected_accepted} accepted"
        )

    provenance_text = (
        f"Dataset-wide expert-label validation attested by {reviewer_code}; "
        f"recorded {recorded_date}. {evidence_note}"
    ).strip()
    for relative in eligible_paths:
        record = images[relative]
        record["expert_validated"] = "validated"
        record["label_review_status"] = "validated"
        record["label_validator"] = reviewer_code
        record["qc_status"] = "approved"
        record["species_review_status"] = "banana"
        record["visibility_quality_status"] = "acceptable"
        record["inclusion_status"] = "included"
        provenance = record.setdefault("field_provenance", {})
        for field in (
            "expert_validated",
            "label_validator",
            "qc_status",
            "species_review_status",
            "visibility_quality_status",
            "inclusion_status",
        ):
            provenance[field] = provenance_text
        record["record_fingerprint"] = _record_fingerprint(record)

    for relative in sorted(excluded):
        record = images[relative]
        record["inclusion_status"] = "excluded"
        record["qc_status"] = "excluded"
        provenance = record.setdefault("field_provenance", {})
        if relative in rejected:
            reason = ", ".join(rejected[relative]) or "inventory rejection"
            evidence = (
                f"Excluded by the current image inventory report ({reason}); "
                f"recorded {recorded_date}."
            )
        else:
            evidence = (
                "Excluded as a byte-identical non-canonical copy by the current "
                f"image inventory report; recorded {recorded_date}."
            )
        provenance["inclusion_status"] = evidence
        provenance["qc_status"] = evidence
        record["record_fingerprint"] = _record_fingerprint(record)

    path_fingerprint = hashlib.sha256(
        "\n".join(eligible_paths).encode("utf-8")
    ).hexdigest()
    attestation = {
        "schema_version": 1,
        "decision": "expert_labels_and_human_qc_validated",
        "reviewer_code": reviewer_code,
        "recorded_date": recorded_date,
        "evidence_note": evidence_note,
        "inventory_report_summary": summary,
        "validated_record_count": len(eligible_paths),
        "excluded_record_count": len(excluded),
        "unreadable_or_rejected_record_count": len(rejected),
        "exact_duplicate_copy_count": len(duplicate_copies),
        "validated_paths_sha256": path_fingerprint,
    }
    return metadata, attestation


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--metadata-manifest", required=True)
    parser.add_argument("--inventory-report", required=True)
    parser.add_argument("--reviewer-code", required=True)
    parser.add_argument("--recorded-date", required=True)
    parser.add_argument("--evidence-note", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--attestation-output", required=True)
    args = parser.parse_args()

    metadata_path = Path(args.metadata_manifest)
    report_path = Path(args.inventory_report)
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    report = json.loads(report_path.read_text(encoding="utf-8"))
    updated, attestation = apply_attestation(
        metadata,
        report,
        args.reviewer_code.strip(),
        args.recorded_date.strip(),
        args.evidence_note.strip(),
    )

    attestation["inventory_report_sha256"] = _sha256_file(report_path)
    metadata_output = write_manifest(updated, args.output)
    attestation_output = write_manifest(attestation, args.attestation_output)
    print(json.dumps({
        "metadata_manifest": str(metadata_output),
        "attestation": str(attestation_output),
        "validated_record_count": attestation["validated_record_count"],
        "excluded_record_count": attestation["excluded_record_count"],
    }, indent=2))


if __name__ == "__main__":
    main()
