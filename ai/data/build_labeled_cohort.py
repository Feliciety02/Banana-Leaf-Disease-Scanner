"""Build a deterministic, group-aware labeled cohort after all review gates."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable, Sequence

from ai.config.labels import CLASS_LABELS
from ai.data.image_fingerprints import sha256_file
from ai.data.metadata_manifest import (
    UNRESOLVED_VALUES,
    formal_metadata_issues,
    load_manifest_payload,
)
from ai.data.near_duplicate_adjudication import (
    GROUPING_DECISIONS,
    load_and_validate_adjudication,
)


SCHEMA_VERSION = 1
DEFAULT_EXTENSIONS = frozenset({".jpg", ".jpeg", ".png", ".bmp", ".webp"})


def _normalize(value: str) -> str:
    return value.replace("\\", "/")


def _file_sha256(path: str | Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _json_fingerprint(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def load_cohort_config(path: str | Path) -> dict[str, Any]:
    source = Path(path).expanduser().resolve()
    config = json.loads(source.read_text(encoding="utf-8"))
    required = {
        "schema_version", "cohort_version", "target_per_class", "seed", "class_names",
        "selection_unit", "diversity_fields", "required_statuses",
        "require_resolved_source", "require_explicit_group",
        "require_all_duplicate_candidates_resolved", "allow_augmented_or_derived",
        "shortage_policy",
    }
    missing = sorted(required - set(config))
    if missing:
        raise ValueError(f"Cohort config is missing fields: {missing}")
    if config["schema_version"] != 1:
        raise ValueError("Unsupported cohort config schema")
    if config["class_names"] != list(CLASS_LABELS):
        raise ValueError(f"Cohort class order must be {list(CLASS_LABELS)}")
    if not isinstance(config["target_per_class"], int) or config["target_per_class"] <= 0:
        raise ValueError("target_per_class must be a positive integer")
    if not isinstance(config["seed"], int):
        raise ValueError("seed must be an integer")
    if config["selection_unit"] != "group_id":
        raise ValueError("Cohort selection_unit must be group_id")
    if config["allow_augmented_or_derived"] is not False:
        raise ValueError("This thesis cohort cannot allow augmented or derived files")
    if config["shortage_policy"] != "write_blocked_manifest_and_exit_nonzero":
        raise ValueError("Cohort shortage policy must fail after writing a blocked manifest")
    allowed_diversity = {
        "source_dataset", "field_or_public", "lighting_condition",
        "disease_appearance", "capture_device",
    }
    if not config["diversity_fields"] or not set(config["diversity_fields"]) <= allowed_diversity:
        raise ValueError(f"Unsupported diversity fields: {config['diversity_fields']}")
    return config


def _inventory(root: Path, class_names: Sequence[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {class_name: [] for class_name in class_names}
    for class_name in class_names:
        class_dir = root / class_name
        if not class_dir.is_dir():
            raise FileNotFoundError(f"Active class directory is missing: {class_dir}")
        result[class_name] = sorted(
            _normalize(str(path.relative_to(root)))
            for path in class_dir.rglob("*")
            if path.is_file() and path.suffix.lower() in DEFAULT_EXTENSIONS
        )
    return result


def _load_groups(path: str | Path) -> dict[str, str]:
    source = Path(path).expanduser().resolve()
    groups = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(groups, dict) or not all(
        isinstance(key, str) and isinstance(value, str) and value.strip()
        for key, value in groups.items()
    ):
        raise ValueError("Group manifest must map relative paths to non-empty group IDs")
    return {_normalize(key): value.strip() for key, value in groups.items()}


def _inventory_report_blockers(path: str | Path, inventory_count: int) -> tuple[list[str], set[str], dict[str, Any]]:
    report = json.loads(Path(path).read_text(encoding="utf-8"))
    summary = report.get("summary", {})
    blockers: list[str] = []
    if summary.get("scanned") != inventory_count:
        blockers.append(
            f"inventory report scanned {summary.get('scanned')} files but current inventory has {inventory_count}"
        )
    if summary.get("cross_label_exact_conflicts", 0):
        blockers.append(f"{summary['cross_label_exact_conflicts']} cross-label exact conflicts remain")
    if summary.get("exact_duplicate_copies_excluded", 0):
        blockers.append(
            f"{summary['exact_duplicate_copies_excluded']} exact duplicate copies require explicit metadata exclusion"
        )
    rejected = {_normalize(item["path"]) for item in report.get("rejected_images", [])}
    return blockers, rejected, report


def _duplicate_blockers(adjudication: dict[str, Any]) -> tuple[list[str], dict[str, int]]:
    pairs = adjudication["pairs"]
    unresolved = [pair for pair in pairs if pair["decision"] == "requires_review"]
    unresolved_cross = [pair for pair in unresolved if not pair["same_class"]]
    confirmed_cross = [
        pair for pair in pairs
        if not pair["same_class"] and pair["decision"] in GROUPING_DECISIONS
    ]
    blockers: list[str] = []
    if unresolved:
        blockers.append(f"{len(unresolved)} near-duplicate candidate pairs remain unresolved")
    if unresolved_cross:
        blockers.append(f"{len(unresolved_cross)} unresolved cross-label candidates are high risk")
    if confirmed_cross:
        blockers.append(
            f"{len(confirmed_cross)} confirmed-related cross-label pairs require separate label adjudication"
        )
    return blockers, {
        "candidate_pairs": len(pairs),
        "unresolved_pairs": len(unresolved),
        "unresolved_cross_label_pairs": len(unresolved_cross),
        "confirmed_related_cross_label_pairs": len(confirmed_cross),
    }


def _diversity_coverage(records: Sequence[dict[str, Any]], fields: Sequence[str]) -> dict[str, Any]:
    coverage: dict[str, Any] = {}
    for field in fields:
        values = Counter(record[field] for record in records)
        known = {key: count for key, count in sorted(values.items()) if key not in UNRESOLVED_VALUES}
        coverage[field] = {
            "known_records": sum(known.values()),
            "unknown_records": sum(count for key, count in values.items() if key in UNRESOLVED_VALUES),
            "distribution": known,
        }
    return coverage


def _rank_groups(
    records: Sequence[dict[str, Any]],
    diversity_fields: Sequence[str],
    seed: int,
    class_name: str,
) -> list[tuple[str, list[dict[str, Any]], float, str]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        groups[record["group_id"]].append(record)
    frequencies: dict[str, Counter[str]] = {
        field: Counter(
            record[field] for record in records if record[field] not in UNRESOLVED_VALUES
        )
        for field in diversity_fields
    }
    ranked: list[tuple[str, list[dict[str, Any]], float, str]] = []
    for group_id, members in groups.items():
        # Rare, explicitly known strata rank first. Unknown values add no score.
        score = 0.0
        for field in diversity_fields:
            values = {member[field] for member in members if member[field] not in UNRESOLVED_VALUES}
            score += sum(1.0 / frequencies[field][value] for value in values)
        tie = hashlib.sha256(f"{seed}|{class_name}|{group_id}".encode("utf-8")).hexdigest()
        ranked.append((group_id, sorted(members, key=lambda item: item["image_path"]), score, tie))
    return sorted(ranked, key=lambda item: (-item[2], item[3], item[0]))


def _select_exact_groups(
    records: Sequence[dict[str, Any]],
    target: int,
    diversity_fields: Sequence[str],
    seed: int,
    class_name: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    ranked = _rank_groups(records, diversity_fields, seed, class_name)
    sizes = [len(item[1]) for item in ranked]
    mask = (1 << (target + 1)) - 1
    suffix = [0] * (len(ranked) + 1)
    suffix[-1] = 1
    for index in range(len(ranked) - 1, -1, -1):
        suffix[index] = (suffix[index + 1] | (suffix[index + 1] << sizes[index])) & mask
    if not ((suffix[0] >> target) & 1):
        return [], {
            "exact_group_total_available": False,
            "available_images": len(records),
            "available_groups": len(ranked),
            "target": target,
        }
    remaining = target
    chosen: list[dict[str, Any]] = []
    selected_groups: list[str] = []
    for index, (group_id, members, _score, _tie) in enumerate(ranked):
        size = len(members)
        if size <= remaining and ((suffix[index + 1] >> (remaining - size)) & 1):
            chosen.extend(members)
            selected_groups.append(group_id)
            remaining -= size
        if remaining == 0:
            break
    if remaining:
        raise RuntimeError(f"Exact group-selection reconstruction failed for {class_name}")
    return sorted(chosen, key=lambda item: item["image_path"]), {
        "exact_group_total_available": True,
        "available_images": len(records),
        "available_groups": len(ranked),
        "selected_groups": len(selected_groups),
        "target": target,
        "ranking": "rare-known-diversity strata first; SHA-256(seed,class,group) tie-break; exact subset feasibility",
    }


def build_cohort(
    dataset_root: str | Path,
    metadata_manifest: str | Path,
    group_manifest: str | Path,
    adjudication_manifest: str | Path,
    inventory_report: str | Path,
    cohort_config_path: str | Path,
    target_override: int | None = None,
    seed_override: int | None = None,
) -> dict[str, Any]:
    root = Path(dataset_root).expanduser().resolve()
    config = load_cohort_config(cohort_config_path)
    if target_override is not None:
        if target_override <= 0:
            raise ValueError("Target override must be positive")
        config["target_per_class"] = target_override
    if seed_override is not None:
        config["seed"] = seed_override
    target = config["target_per_class"]
    classes = config["class_names"]
    inventory = _inventory(root, classes)
    all_disk_images = [
        path for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in DEFAULT_EXTENSIONS
    ]
    metadata = load_manifest_payload(metadata_manifest)
    groups = _load_groups(group_manifest)
    report_blockers, rejected_paths, report = _inventory_report_blockers(
        inventory_report, len(all_disk_images)
    )
    adjudication = load_and_validate_adjudication(adjudication_manifest, root)
    duplicate_blockers, duplicate_summary = _duplicate_blockers(adjudication)
    global_blockers = report_blockers + duplicate_blockers

    group_labels: dict[str, set[str]] = defaultdict(set)
    available_metadata_by_class: dict[str, list[dict[str, Any]]] = {name: [] for name in classes}
    eligible_by_class: dict[str, list[dict[str, Any]]] = {name: [] for name in classes}
    exclusions: dict[str, list[dict[str, Any]]] = {name: [] for name in classes}
    exclusion_counts: dict[str, Counter[str]] = {name: Counter() for name in classes}
    for class_name in classes:
        for relative in inventory[class_name]:
            reasons: list[str] = []
            record = metadata.get(relative)
            if record is None:
                reasons.append("missing_metadata_record")
            else:
                available_metadata_by_class[class_name].append(record)
                reasons.extend(formal_metadata_issues(relative, record, classes))
                explicit_group = groups.get(relative)
                metadata_group = record.get("group_id", "pending")
                if explicit_group and metadata_group not in UNRESOLVED_VALUES and explicit_group != metadata_group:
                    reasons.append("conflict:group_manifest_vs_metadata")
                if explicit_group is None:
                    reasons.append("unresolved:group_manifest_assignment")
                if relative in rejected_paths:
                    reasons.append("rejected_by_inventory_qc")
                if record.get("originality_status") in {"augmented", "derived"}:
                    reasons.append("excluded:augmented_or_derived")
                if explicit_group:
                    group_labels[explicit_group].add(class_name)
                record = {**record, "group_id": explicit_group or metadata_group}
            reasons = sorted(set(reasons))
            if reasons:
                exclusions[class_name].append({"image_path": relative, "reasons": reasons})
                exclusion_counts[class_name].update(reasons)
            else:
                eligible_by_class[class_name].append(record)

    conflicting_groups = {
        group_id: sorted(labels) for group_id, labels in group_labels.items() if len(labels) > 1
    }
    if conflicting_groups:
        global_blockers.append(f"{len(conflicting_groups)} explicit groups span multiple class labels")

    shortages: dict[str, dict[str, int]] = {}
    for class_name in classes:
        raw = len(inventory[class_name])
        eligible = len(eligible_by_class[class_name])
        shortages[class_name] = {
            "target": target,
            "raw_available": raw,
            "raw_shortage": max(0, target - raw),
            "validated_eligible": eligible,
            "validated_shortage": max(0, target - eligible),
        }
    shortage_blockers = [
        f"{class_name} has {values['raw_available']} raw active images for target {target}"
        for class_name, values in shortages.items() if values["raw_shortage"]
    ] + [
        f"{class_name} has {values['validated_eligible']} validated eligible images for target {target}"
        for class_name, values in shortages.items() if values["validated_shortage"]
    ]
    blockers = list(dict.fromkeys(global_blockers + shortage_blockers))

    selected_by_class: dict[str, list[dict[str, Any]]] = {name: [] for name in classes}
    selection_evidence: dict[str, Any] = {}
    if not blockers:
        for class_name in classes:
            selected, evidence = _select_exact_groups(
                eligible_by_class[class_name], target, config["diversity_fields"],
                config["seed"], class_name,
            )
            selection_evidence[class_name] = evidence
            if not selected:
                blockers.append(
                    f"{class_name} cannot reach exactly {target} images without splitting a group"
                )
            selected_by_class[class_name] = selected
    if blockers:
        selected_by_class = {name: [] for name in classes}

    selected_records: dict[str, list[dict[str, Any]]] = {name: [] for name in classes}
    selected_hashes: set[str] = set()
    for class_name, records in selected_by_class.items():
        for record in records:
            digest = sha256_file(root / record["image_path"])
            if digest in selected_hashes:
                raise ValueError(f"Selected cohort repeats identical image bytes: {record['image_path']}")
            selected_hashes.add(digest)
            selected_records[class_name].append({
                "image_path": record["image_path"],
                "sha256": digest,
                "group_id": record["group_id"],
                **{field: record[field] for field in config["diversity_fields"]},
                "originality_status": record["originality_status"],
            })

    source_distribution = {
        class_name: dict(sorted(Counter(
            record["source_dataset"] for record in selected_records[class_name]
        ).items()))
        for class_name in classes
    }
    eligible_source_distribution = {
        class_name: dict(sorted(Counter(
            record["source_dataset"] for record in eligible_by_class[class_name]
        ).items()))
        for class_name in classes
    }
    status = "ready" if not blockers else "blocked"
    input_paths = {
        "metadata_manifest": str(Path(metadata_manifest).resolve()),
        "group_manifest": str(Path(group_manifest).resolve()),
        "adjudication_manifest": str(Path(adjudication_manifest).resolve()),
        "inventory_report": str(Path(inventory_report).resolve()),
        "cohort_config": str(Path(cohort_config_path).resolve()),
    }
    payload: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "cohort_version": config["cohort_version"],
        "status": status,
        "split_generated": False,
        "configuration": config,
        "input_artifacts": {
            name: {"path": path, "sha256": _file_sha256(path)}
            for name, path in input_paths.items()
        },
        "gate_summary": {
            "blockers": blockers,
            "duplicate_review": duplicate_summary,
            "cross_label_group_conflicts": conflicting_groups,
            "no_augmentation_policy": "Only originality_status=original is eligible; no file is duplicated or generated.",
        },
        "per_class_counts": {
            class_name: {
                **shortages[class_name],
                "documented_original_available": sum(
                    record.get("originality_status") == "original"
                    for record in available_metadata_by_class[class_name]
                ),
                "augmented_or_derived_available": sum(
                    record.get("originality_status") in {"augmented", "derived"}
                    for record in available_metadata_by_class[class_name]
                ),
                "selected": len(selected_records[class_name]),
                "excluded": len(exclusions[class_name]),
            }
            for class_name in classes
        },
        "unresolved_shortages": shortages,
        "available_source_distribution": {
            class_name: dict(sorted(Counter(
                record.get("source_dataset", "unknown")
                for record in available_metadata_by_class[class_name]
            ).items()))
            for class_name in classes
        },
        "eligible_source_distribution": eligible_source_distribution,
        "selected_source_distribution": source_distribution,
        "eligible_diversity_coverage": {
            class_name: _diversity_coverage(
                eligible_by_class[class_name], config["diversity_fields"]
            )
            for class_name in classes
        },
        "available_diversity_coverage": {
            class_name: _diversity_coverage(
                available_metadata_by_class[class_name], config["diversity_fields"]
            )
            for class_name in classes
        },
        "selected_diversity_coverage": {
            class_name: _diversity_coverage(
                selected_by_class[class_name], config["diversity_fields"]
            )
            for class_name in classes
        },
        "selection_evidence": selection_evidence,
        "excluded_image_summary": {
            class_name: dict(sorted(exclusion_counts[class_name].items()))
            for class_name in classes
        },
        "excluded_records": exclusions,
        "selected_paths": {
            class_name: [record["image_path"] for record in selected_records[class_name]]
            for class_name in classes
        },
        "selected_records": selected_records,
    }
    payload["manifest_fingerprint"] = _json_fingerprint(payload)
    return payload


def write_cohort_manifest(payload: dict[str, Any], output: str | Path) -> Path:
    destination = Path(output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    if destination.is_file() and destination.read_text(encoding="utf-8") != serialized:
        existing = json.loads(destination.read_text(encoding="utf-8"))
        both_blocked_previews = (
            existing.get("status") == "blocked"
            and payload.get("status") == "blocked"
            and not any(existing.get("selected_paths", {}).values())
            and not any(payload.get("selected_paths", {}).values())
        )
        if existing.get("cohort_version") == payload.get("cohort_version") and not both_blocked_previews:
            raise ValueError(
                f"Versioned cohort manifest already exists with different content: {destination}. "
                "Use a new cohort_version/output path after input or policy changes."
            )
    destination.write_text(serialized, encoding="utf-8")
    return destination.resolve()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--metadata-manifest", required=True)
    parser.add_argument("--group-manifest", required=True)
    parser.add_argument("--adjudication-manifest", required=True)
    parser.add_argument("--inventory-report", required=True)
    parser.add_argument("--cohort-config", default="ai/config/cohort_labeled_v1.json")
    parser.add_argument("--target-per-class", type=int)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    payload = build_cohort(
        args.dataset_dir,
        args.metadata_manifest,
        args.group_manifest,
        args.adjudication_manifest,
        args.inventory_report,
        args.cohort_config,
        args.target_per_class,
        args.seed,
    )
    destination = write_cohort_manifest(payload, args.output)
    print(json.dumps({
        "cohort_manifest": str(destination),
        "status": payload["status"],
        "per_class_counts": payload["per_class_counts"],
        "blockers": payload["gate_summary"]["blockers"],
        "manifest_fingerprint": payload["manifest_fingerprint"],
    }, indent=2))
    if payload["status"] != "ready":
        raise SystemExit("COHORT BUILD BLOCKED: shortages or prerequisite review gates remain; no cohort or split was selected")


if __name__ == "__main__":
    main()
