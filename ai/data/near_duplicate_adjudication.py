"""Generate and apply human near-duplicate adjudication without editing images."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageOps

from ai.data.image_fingerprints import flip_aware_difference_hash, sha256_file
from ai.data.metadata_manifest import load_manifest_payload


SCHEMA_VERSION = 2
DECISIONS = (
    "same_image",
    "same_leaf_or_related_capture",
    "visually_similar_but_independent",
    "not_duplicate",
    "requires_review",
)
GROUPING_DECISIONS = frozenset({"same_image", "same_leaf_or_related_capture"})
RESOLVED_DECISIONS = frozenset(set(DECISIONS) - {"requires_review"})


class DisjointSet:
    def __init__(self, values: Iterable[str] = ()) -> None:
        self.parent = {value: value for value in values}

    def add(self, value: str) -> None:
        self.parent.setdefault(value, value)

    def find(self, value: str) -> str:
        self.add(value)
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, left: str, right: str) -> None:
        left_root, right_root = self.find(left), self.find(right)
        if left_root != right_root:
            keep, merge = sorted((left_root, right_root))
            self.parent[merge] = keep

    def components(self) -> list[list[str]]:
        grouped: dict[str, list[str]] = defaultdict(list)
        for value in sorted(self.parent):
            grouped[self.find(value)].append(value)
        return sorted((sorted(values) for values in grouped.values()), key=lambda values: values[0])


def _normalize(value: str) -> str:
    return value.replace("\\", "/")


def _pair_key(left: str, right: str) -> str:
    return "||".join(sorted((_normalize(left), _normalize(right))))


def _json_fingerprint(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _inspect_image(root: Path, relative: str) -> dict[str, Any]:
    path = (root / relative).resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise ValueError(f"Candidate path escapes dataset root: {relative}") from error
    if not path.is_file():
        raise FileNotFoundError(f"Candidate image no longer exists: {path}")
    with Image.open(path) as source:
        oriented = ImageOps.exif_transpose(source)
        oriented.load()
        width, height = oriented.size
        dhash = flip_aware_difference_hash(oriented.convert("RGB"))
    return {
        "path": relative,
        "sha256": sha256_file(path),
        "width": width,
        "height": height,
        "flip_aware_dhash64": f"{dhash:016x}",
        "_dhash_int": dhash,
    }


def _existing_reviews(path: Path | None) -> dict[str, dict[str, str]]:
    if path is None or not path.is_file():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    reviews: dict[str, dict[str, str]] = {}
    for pair in payload.get("pairs", []):
        if isinstance(pair, dict) and isinstance(pair.get("review_key"), str):
            reviews[pair["review_key"]] = {
                "decision": str(pair.get("decision", "requires_review")),
                "reviewer": str(pair.get("reviewer", "")),
                "reviewed_at": str(pair.get("reviewed_at", "")),
                "evidence_note": str(pair.get("evidence_note", "")),
            }
    return reviews


def generate_manifest(
    dataset_root: str | Path,
    inventory_report_path: str | Path,
    metadata_manifest_path: str | Path,
    output_json: str | Path,
    output_csv: str | Path | None = None,
) -> dict[str, Any]:
    root = Path(dataset_root).expanduser().resolve()
    report_path = Path(inventory_report_path).expanduser().resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    metadata = load_manifest_payload(metadata_manifest_path)
    raw_pairs = report.get("near_duplicate_pairs")
    if not isinstance(raw_pairs, list):
        raise ValueError("Inventory report has no near_duplicate_pairs list")
    output_path = Path(output_json)
    previous_reviews = _existing_reviews(output_path if output_path.is_file() else None)

    paths = sorted({
        _normalize(pair[field])
        for pair in raw_pairs
        for field in ("path_a", "path_b")
    })
    inspected = {relative: _inspect_image(root, relative) for relative in paths}
    candidate_graph = DisjointSet(paths)
    for pair in raw_pairs:
        candidate_graph.union(_normalize(pair["path_a"]), _normalize(pair["path_b"]))
    components = candidate_graph.components()
    component_by_path: dict[str, str] = {}
    component_rows: list[dict[str, Any]] = []
    for index, members in enumerate(components, start=1):
        component_id = f"candidate-component-{index:04d}"
        for member in members:
            component_by_path[member] = component_id
        component_pairs = [
            pair for pair in raw_pairs
            if _normalize(pair["path_a"]) in set(members) and _normalize(pair["path_b"]) in set(members)
        ]
        classes = sorted({metadata[member]["canonical_class"] for member in members})
        component_rows.append({
            "component_id": component_id,
            "image_count": len(members),
            "candidate_pair_count": len(component_pairs),
            "classes": classes,
            "contains_cross_label_candidate": len(classes) > 1,
            "members": members,
        })

    pairs: list[dict[str, Any]] = []
    def review_order(value: dict[str, Any]) -> tuple[bool, int, str]:
        left, right = _normalize(value["path_a"]), _normalize(value["path_b"])
        same_class = metadata[left]["canonical_class"] == metadata[right]["canonical_class"]
        return same_class, int(value["hamming_distance"]), _pair_key(left, right)

    # Cross-label conflicts are physically first in JSON/CSV, then closest hash
    # matches, so the highest-risk review queue is difficult to overlook.
    for raw in sorted(raw_pairs, key=review_order):
        left, right = sorted((_normalize(raw["path_a"]), _normalize(raw["path_b"])))
        image_a, image_b = inspected[left], inspected[right]
        distance = (image_a["_dhash_int"] ^ image_b["_dhash_int"]).bit_count()
        reported_distance = int(raw["hamming_distance"])
        if distance != reported_distance:
            raise ValueError(
                f"Perceptual hash drift for '{left}' and '{right}': report={reported_distance}, current={distance}"
            )
        class_a = metadata[left]["canonical_class"]
        class_b = metadata[right]["canonical_class"]
        same_class = class_a == class_b
        review_key = _pair_key(left, right)
        previous = previous_reviews.get(review_key, {})
        decision = previous.get("decision", "requires_review")
        if decision not in DECISIONS:
            raise ValueError(f"Unsupported preserved decision '{decision}' for {review_key}")
        pair = {
            "review_key": review_key,
            "candidate_component_id": component_by_path[left],
            "priority": "high" if not same_class else "normal",
            "same_class": same_class,
            "label_relation": "same_class" if same_class else "cross_class_conflict_candidate",
            "path_a": left,
            "class_a": class_a,
            "source_dataset_a": metadata[left]["source_dataset"],
            "dimensions_a": [image_a["width"], image_a["height"]],
            "sha256_a": image_a["sha256"],
            "flip_aware_dhash64_a": image_a["flip_aware_dhash64"],
            "path_b": right,
            "class_b": class_b,
            "source_dataset_b": metadata[right]["source_dataset"],
            "dimensions_b": [image_b["width"], image_b["height"]],
            "sha256_b": image_b["sha256"],
            "flip_aware_dhash64_b": image_b["flip_aware_dhash64"],
            "hamming_distance": distance,
            "similarity_score": round(1.0 - distance / 64.0, 6),
            "decision": decision,
            "reviewer": previous.get("reviewer", ""),
            "reviewed_at": previous.get("reviewed_at", ""),
            "evidence_note": previous.get("evidence_note", ""),
        }
        pairs.append(pair)

    pair_fingerprint_inputs = [
        {key: pair[key] for key in (
            "review_key", "sha256_a", "sha256_b", "flip_aware_dhash64_a",
            "flip_aware_dhash64_b", "hamming_distance", "class_a", "class_b"
        )}
        for pair in pairs
    ]
    cross_count = sum(not pair["same_class"] for pair in pairs)
    payload = {
        "schema_version": SCHEMA_VERSION,
        "dataset_root": str(root),
        "candidate_detector": {
            "algorithm": "flip-aware 64-bit difference hash",
            "distance": "Hamming distance",
            "candidate_threshold": report.get("near_duplicate_method", {}).get("hamming_distance_threshold", 6),
            "similarity_score_definition": "1 - (Hamming distance / 64); triage score only, never an identity probability",
        },
        "allowed_decisions": list(DECISIONS),
        "decision_policy": {
            "grouping_decisions": sorted(GROUPING_DECISIONS),
            "independent_decisions": ["visually_similar_but_independent", "not_duplicate"],
            "unresolved_decision": "requires_review",
            "label_policy": "Labels are immutable in this workflow; cross-label evidence is escalated, never relabeled.",
            "file_policy": "No image is deleted, moved, renamed, or rewritten.",
        },
        "candidate_fingerprint": _json_fingerprint(pair_fingerprint_inputs),
        "summary": {
            "candidate_pairs": len(pairs),
            "candidate_images": len(paths),
            "candidate_components": len(components),
            "same_class_pairs": len(pairs) - cross_count,
            "cross_class_high_priority_pairs": cross_count,
            "requires_review": sum(pair["decision"] == "requires_review" for pair in pairs),
            "resolved": sum(pair["decision"] in RESOLVED_DECISIONS for pair in pairs),
            "largest_candidate_component_images": max((len(component) for component in components), default=0),
        },
        "candidate_components": component_rows,
        "pairs": pairs,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if output_csv:
        csv_path = Path(output_csv)
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        fields = [key for key in pairs[0] if key not in {"dimensions_a", "dimensions_b"}] if pairs else []
        fields = fields[:fields.index("sha256_a")] + ["width_a", "height_a"] + fields[fields.index("sha256_a"):]
        insert_at = fields.index("sha256_b")
        fields = fields[:insert_at] + ["width_b", "height_b"] + fields[insert_at:]
        with csv_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            for pair in pairs:
                row = {key: value for key, value in pair.items() if key not in {"dimensions_a", "dimensions_b"}}
                row.update({
                    "width_a": pair["dimensions_a"][0], "height_a": pair["dimensions_a"][1],
                    "width_b": pair["dimensions_b"][0], "height_b": pair["dimensions_b"][1],
                })
                writer.writerow(row)
    return payload


def load_and_validate_adjudication(path: str | Path, dataset_root: str | Path) -> dict[str, Any]:
    source = Path(path).expanduser().resolve()
    payload = json.loads(source.read_text(encoding="utf-8"))
    if payload.get("schema_version") != SCHEMA_VERSION or not isinstance(payload.get("pairs"), list):
        raise ValueError("Unsupported near-duplicate adjudication manifest")
    root = Path(dataset_root).expanduser().resolve()
    seen: set[str] = set()
    fingerprint_inputs: list[dict[str, Any]] = []
    for pair in payload["pairs"]:
        key = _pair_key(pair["path_a"], pair["path_b"])
        if key != pair.get("review_key") or key in seen:
            raise ValueError(f"Invalid or repeated review key: {pair.get('review_key')}")
        seen.add(key)
        if pair.get("decision") not in DECISIONS:
            raise ValueError(f"Invalid decision for {key}: {pair.get('decision')}")
        if pair["decision"] in RESOLVED_DECISIONS and not all(
            isinstance(pair.get(field), str) and pair[field].strip()
            for field in ("reviewer", "reviewed_at", "evidence_note")
        ):
            raise ValueError(f"Resolved decision for {key} requires reviewer, reviewed_at, and evidence_note")
        for suffix in ("a", "b"):
            candidate_path = (root / pair[f"path_{suffix}"]).resolve()
            try:
                candidate_path.relative_to(root)
            except ValueError as error:
                raise ValueError(f"Candidate path escapes dataset root: {pair[f'path_{suffix}']}") from error
            current = sha256_file(candidate_path)
            if current != pair[f"sha256_{suffix}"]:
                raise ValueError(f"Image content changed after candidate generation: {pair[f'path_{suffix}']}")
        fingerprint_inputs.append({key_name: pair[key_name] for key_name in (
            "review_key", "sha256_a", "sha256_b", "flip_aware_dhash64_a",
            "flip_aware_dhash64_b", "hamming_distance", "class_a", "class_b"
        )})
    if _json_fingerprint(fingerprint_inputs) != payload.get("candidate_fingerprint"):
        raise ValueError("Candidate manifest fingerprint mismatch; candidate evidence was edited")
    return payload


def import_review_csv(
    adjudication_path: str | Path,
    reviewed_csv: str | Path,
    output_json: str | Path,
) -> dict[str, Any]:
    """Import only decision fields from a spreadsheet; immutable evidence stays in JSON."""
    source = Path(adjudication_path)
    payload = json.loads(source.read_text(encoding="utf-8"))
    pairs_by_key = {pair["review_key"]: pair for pair in payload.get("pairs", [])}
    rows_by_key: dict[str, dict[str, str]] = {}
    with Path(reviewed_csv).open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            key = row.get("review_key", "")
            if key not in pairs_by_key or key in rows_by_key:
                raise ValueError(f"CSV contains an unknown or repeated review_key: {key}")
            rows_by_key[key] = row
    missing = sorted(set(pairs_by_key) - set(rows_by_key))
    if missing:
        raise ValueError(f"Reviewed CSV is missing {len(missing)} candidate pairs; first: {missing[0]}")
    for key, row in rows_by_key.items():
        decision = row.get("decision", "requires_review").strip()
        if decision not in DECISIONS:
            raise ValueError(f"CSV contains invalid decision '{decision}' for {key}")
        pairs_by_key[key].update({
            "decision": decision,
            "reviewer": row.get("reviewer", "").strip(),
            "reviewed_at": row.get("reviewed_at", "").strip(),
            "evidence_note": row.get("evidence_note", "").strip(),
        })
    payload["summary"]["requires_review"] = sum(
        pair["decision"] == "requires_review" for pair in payload["pairs"]
    )
    payload["summary"]["resolved"] = sum(
        pair["decision"] in RESOLVED_DECISIONS for pair in payload["pairs"]
    )
    destination = Path(output_json)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload


def apply_decisions(
    adjudication_path: str | Path,
    dataset_root: str | Path,
    existing_group_manifest: str | Path | None,
    output_group_manifest: str | Path,
    output_summary: str | Path,
) -> dict[str, Any]:
    """Convert only confirmed relation edges into transitive, indivisible groups."""
    payload = load_and_validate_adjudication(adjudication_path, dataset_root)
    pairs = payload["pairs"]
    unresolved = [pair for pair in pairs if pair["decision"] == "requires_review"]
    unresolved_cross = [pair for pair in unresolved if not pair["same_class"]]
    confirmed_cross = [
        pair for pair in pairs
        if not pair["same_class"] and pair["decision"] in GROUPING_DECISIONS
    ]
    if unresolved_cross or confirmed_cross:
        raise ValueError(
            "High-risk cross-label cases block group-manifest application: "
            f"{len(unresolved_cross)} unresolved and {len(confirmed_cross)} confirmed-related conflicts. "
            "Labels were not changed and no output group manifest was written."
        )
    existing_path = Path(existing_group_manifest).expanduser().resolve() if existing_group_manifest else None
    groups = json.loads(existing_path.read_text(encoding="utf-8")) if existing_path and existing_path.is_file() else {}
    if not isinstance(groups, dict):
        raise ValueError("Existing group manifest must be a path-to-group object")
    dsu = DisjointSet()
    members_by_existing: dict[str, list[str]] = defaultdict(list)
    for relative, group_id in groups.items():
        members_by_existing[group_id].append(_normalize(relative))
    for members in members_by_existing.values():
        for member in members:
            dsu.add(member)
        for member in members[1:]:
            dsu.union(members[0], member)
    for pair in pairs:
        if pair["decision"] in GROUPING_DECISIONS:
            dsu.union(pair["path_a"], pair["path_b"])

    confirmed_paths = {
        pair[field]
        for pair in pairs if pair["decision"] in GROUPING_DECISIONS
        for field in ("path_a", "path_b")
    }
    output_groups = dict(sorted((_normalize(path), group_id) for path, group_id in groups.items()))
    assignments: list[dict[str, Any]] = []
    for members in dsu.components():
        if not confirmed_paths.intersection(members):
            continue
        existing_ids = sorted({groups[member] for member in members if member in groups})
        group_id = existing_ids[0] if len(existing_ids) == 1 else f"near-duplicate::{_json_fingerprint(members)[:16]}"
        for member in members:
            output_groups[member] = group_id
        assignments.append({
            "group_id": group_id,
            "members": members,
            "replaced_group_ids": existing_ids if len(existing_ids) > 1 else [],
        })
    summary = {
        "schema_version": 1,
        "adjudication_manifest": str(Path(adjudication_path).resolve()),
        "candidate_fingerprint": payload["candidate_fingerprint"],
        "decision_counts": dict(sorted(Counter(pair["decision"] for pair in pairs).items())),
        "unresolved_pairs": len(unresolved),
        "unresolved_high_risk_cross_label_pairs": len(unresolved_cross),
        "confirmed_cross_label_conflicts": len(confirmed_cross),
        "shared_groups_written": len(assignments),
        "shared_group_images": len({member for assignment in assignments for member in assignment["members"]}),
        "labels_changed": 0,
        "images_deleted_moved_or_rewritten": 0,
        "split_permitted": not unresolved and not confirmed_cross,
        "group_assignments": assignments,
    }
    group_output = Path(output_group_manifest)
    group_output.parent.mkdir(parents=True, exist_ok=True)
    group_output.write_text(json.dumps(output_groups, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    summary_output = Path(output_summary)
    summary_output.parent.mkdir(parents=True, exist_ok=True)
    summary_output.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    generate = subparsers.add_parser("generate", help="Generate or refresh a review queue")
    generate.add_argument("--dataset-dir", required=True)
    generate.add_argument("--inventory-report", required=True)
    generate.add_argument("--metadata-manifest", required=True)
    generate.add_argument("--output-json", required=True)
    generate.add_argument("--output-csv")
    apply = subparsers.add_parser("apply", help="Apply reviewed relation decisions to grouping")
    apply.add_argument("--dataset-dir", required=True)
    apply.add_argument("--adjudication-manifest", required=True)
    apply.add_argument("--group-manifest")
    apply.add_argument("--output-group-manifest", required=True)
    apply.add_argument("--output-summary", required=True)
    import_csv = subparsers.add_parser("import-csv", help="Import spreadsheet decisions into immutable JSON evidence")
    import_csv.add_argument("--adjudication-manifest", required=True)
    import_csv.add_argument("--reviewed-csv", required=True)
    import_csv.add_argument("--output-json", required=True)
    args = parser.parse_args()
    if args.command == "generate":
        payload = generate_manifest(
            args.dataset_dir, args.inventory_report, args.metadata_manifest,
            args.output_json, args.output_csv,
        )
        print(json.dumps(payload["summary"], indent=2))
    elif args.command == "apply":
        summary = apply_decisions(
            args.adjudication_manifest, args.dataset_dir, args.group_manifest,
            args.output_group_manifest, args.output_summary,
        )
        print(json.dumps(summary, indent=2))
    else:
        payload = import_review_csv(
            args.adjudication_manifest, args.reviewed_csv, args.output_json
        )
        print(json.dumps(payload["summary"], indent=2))


if __name__ == "__main__":
    main()
