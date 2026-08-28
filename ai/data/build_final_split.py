"""Create the frozen thesis split from a ready, versioned labeled cohort."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable, Sequence

from ai.config.labels import CLASS_LABELS
from ai.data.image_fingerprints import sha256_file
from ai.data.records import DatasetSplits, ImageRecord, METADATA_DEFAULTS, METADATA_FIELDS
from ai.data.metadata_manifest import UNRESOLVED_VALUES, load_manifest_payload
from ai.data.near_duplicate_adjudication import GROUPING_DECISIONS, load_and_validate_adjudication


PARTITIONS = ("train", "validation", "test")
SCHEMA_VERSION = 1


class DisjointSet:
    def __init__(self, values: Iterable[str]) -> None:
        self.parent = {value: value for value in values}

    def find(self, value: str) -> str:
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


def _json_fingerprint(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _verify_fingerprint(payload: dict[str, Any], field: str) -> None:
    expected = payload.get(field)
    unsigned = {key: value for key, value in payload.items() if key != field}
    if expected != _json_fingerprint(unsigned):
        raise ValueError(f"Manifest fingerprint mismatch: {field}")


def load_split_config(path: str | Path) -> dict[str, Any]:
    config = json.loads(Path(path).read_text(encoding="utf-8"))
    if config.get("schema_version") != 1:
        raise ValueError("Unsupported final-split config schema")
    if config.get("class_names") != list(CLASS_LABELS):
        raise ValueError(f"Final-split class order must be {list(CLASS_LABELS)}")
    fractions = config.get("fractions", {})
    if list(fractions) != list(PARTITIONS) or abs(sum(fractions.values()) - 1.0) > 1e-12:
        raise ValueError(f"Split fractions must be ordered {PARTITIONS} and sum to one")
    if any(not isinstance(fractions[name], (int, float)) or fractions[name] <= 0 for name in PARTITIONS):
        raise ValueError("Every split fraction must be positive")
    if not isinstance(config.get("seed"), int):
        raise ValueError("Split seed must be an integer")
    if not isinstance(config.get("optimization_restarts"), int) or config["optimization_restarts"] <= 0:
        raise ValueError("optimization_restarts must be positive")
    tolerance = config.get("maximum_class_fraction_deviation")
    if not isinstance(tolerance, (int, float)) or not 0 <= tolerance < 0.15:
        raise ValueError("maximum_class_fraction_deviation must be in [0, 0.15)")
    return config


def _target_counts(total: int, fractions: dict[str, float]) -> dict[str, int]:
    raw = {name: total * fractions[name] for name in PARTITIONS}
    targets = {name: int(raw[name]) for name in PARTITIONS}
    remaining = total - sum(targets.values())
    order = sorted(PARTITIONS, key=lambda name: (-(raw[name] - targets[name]), PARTITIONS.index(name)))
    for name in order[:remaining]:
        targets[name] += 1
    return targets


def _identity(metadata: dict[str, Any], level: str) -> str | None:
    source = metadata.get("source_dataset", "unknown")
    plant = metadata.get("plant_id", "unknown")
    if level == "leaf_id":
        leaf = metadata.get("leaf_id", "unknown")
        return None if leaf in UNRESOLVED_VALUES else f"leaf::{source}::{leaf}"
    if level == "plant_id":
        return None if plant in UNRESOLVED_VALUES else f"plant::{source}::{plant}"
    session = metadata.get("acquisition_session", "unknown")
    return None if session in UNRESOLVED_VALUES else f"session::{source}::{session}"


def _build_components(
    selected: list[dict[str, Any]],
    metadata: dict[str, dict[str, Any]],
    adjudication: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, list[str]]]:
    paths = sorted(record["image_path"] for record in selected)
    path_set = set(paths)
    dsu = DisjointSet(paths)
    relationships: dict[str, dict[str, list[str]]] = {
        level: defaultdict(list)
        for level in ("sha256", "group_id", "leaf_id", "plant_id", "acquisition_session")
    }
    selected_by_path = {record["image_path"]: record for record in selected}
    for record in selected:
        relative = record["image_path"]
        relationships["sha256"][record["sha256"]].append(relative)
        relationships["group_id"][record["group_id"]].append(relative)
        for level in ("leaf_id", "plant_id", "acquisition_session"):
            identity = _identity(metadata[relative], level)
            if identity:
                relationships[level][identity].append(relative)
    for identities in relationships.values():
        for members in identities.values():
            for member in members[1:]:
                dsu.union(members[0], member)

    confirmed_relations: dict[str, list[str]] = {}
    for pair in adjudication["pairs"]:
        if pair["decision"] not in GROUPING_DECISIONS:
            continue
        pair_paths = [pair["path_a"], pair["path_b"]]
        selected_members = [path for path in pair_paths if path in path_set]
        if len(selected_members) == 1:
            raise ValueError(
                "Ready cohort contains only one member of a confirmed related pair: "
                f"{pair['review_key']}"
            )
        if len(selected_members) == 2:
            dsu.union(*selected_members)
            confirmed_relations[pair["review_key"]] = selected_members

    components: list[dict[str, Any]] = []
    split_unit_by_path: dict[str, str] = {}
    for members in dsu.components():
        split_unit_id = f"split-unit::{_json_fingerprint(members)[:16]}"
        # The cohort manifest deliberately stores only stable selection/provenance
        # fields. Canonical labels remain authoritative in the fingerprinted
        # metadata manifest and are never inferred from a path here.
        class_counts = Counter(metadata[path]["canonical_class"] for path in members)
        for path in members:
            split_unit_by_path[path] = split_unit_id
        components.append({
            "split_unit_id": split_unit_id,
            "members": members,
            "size": len(members),
            "class_counts": dict(sorted(class_counts.items())),
            "explicit_group_ids": sorted({selected_by_path[path]["group_id"] for path in members}),
            "leaf_ids": sorted({metadata[path]["leaf_id"] for path in members if metadata[path]["leaf_id"] not in UNRESOLVED_VALUES}),
            "plant_ids": sorted({metadata[path]["plant_id"] for path in members if metadata[path]["plant_id"] not in UNRESOLVED_VALUES}),
            "acquisition_sessions": sorted({metadata[path]["acquisition_session"] for path in members if metadata[path]["acquisition_session"] not in UNRESOLVED_VALUES}),
        })
    return components, split_unit_by_path


def _assignment_cost(
    counts: dict[str, Counter[str]],
    total_counts: Counter[str],
    targets: dict[str, dict[str, int]],
) -> float:
    cost = 0.0
    for partition in PARTITIONS:
        for class_name, target in targets[partition].items():
            difference = counts[partition][class_name] - target
            cost += (difference * difference) / max(target, 1)
            if difference > 0:
                cost += 2.0 * (difference * difference) / max(target, 1)
        total_target = sum(targets[partition].values())
        total_difference = total_counts[partition] - total_target
        cost += 0.25 * (total_difference * total_difference) / max(total_target, 1)
    return cost


def _assign_components(
    components: list[dict[str, Any]],
    class_totals: Counter[str],
    fractions: dict[str, float],
    seed: int,
    restarts: int,
) -> tuple[dict[str, str], dict[str, Counter[str]], float, dict[str, dict[str, int]]]:
    targets = {partition: {} for partition in PARTITIONS}
    for class_name, total in class_totals.items():
        class_targets = _target_counts(total, fractions)
        for partition in PARTITIONS:
            targets[partition][class_name] = class_targets[partition]
    best: tuple[float, str, dict[str, str], dict[str, Counter[str]]] | None = None
    for restart in range(restarts):
        ordered = sorted(
            components,
            key=lambda component: (
                -component["size"],
                -max(component["class_counts"].values()),
                hashlib.sha256(
                    f"{seed}|{restart}|{component['split_unit_id']}".encode("utf-8")
                ).hexdigest(),
            ),
        )
        counts = {partition: Counter() for partition in PARTITIONS}
        total_counts = Counter()
        assignment: dict[str, str] = {}
        for component in ordered:
            options: list[tuple[float, str, str]] = []
            for partition in PARTITIONS:
                prospective = {name: Counter(values) for name, values in counts.items()}
                prospective_totals = Counter(total_counts)
                prospective[partition].update(component["class_counts"])
                prospective_totals[partition] += component["size"]
                cost = _assignment_cost(prospective, prospective_totals, targets)
                tie = hashlib.sha256(
                    f"{seed}|{restart}|{component['split_unit_id']}|{partition}".encode("utf-8")
                ).hexdigest()
                options.append((cost, tie, partition))
            _, _, chosen = min(options)
            assignment[component["split_unit_id"]] = chosen
            counts[chosen].update(component["class_counts"])
            total_counts[chosen] += component["size"]

        # Deterministic single-component local improvement, always preserving groups.
        improved = True
        while improved:
            improved = False
            current_cost = _assignment_cost(counts, total_counts, targets)
            best_move: tuple[float, str, str, str, dict[str, Counter[str]], Counter[str]] | None = None
            for component in components:
                unit = component["split_unit_id"]
                current = assignment[unit]
                for destination in PARTITIONS:
                    if destination == current:
                        continue
                    prospective = {name: Counter(values) for name, values in counts.items()}
                    prospective_totals = Counter(total_counts)
                    prospective[current].subtract(component["class_counts"])
                    prospective[destination].update(component["class_counts"])
                    prospective_totals[current] -= component["size"]
                    prospective_totals[destination] += component["size"]
                    cost = _assignment_cost(prospective, prospective_totals, targets)
                    tie = f"{unit}|{destination}"
                    candidate = (cost, tie, unit, destination, prospective, prospective_totals)
                    if cost + 1e-12 < current_cost and (best_move is None or candidate[:2] < best_move[:2]):
                        best_move = candidate
            if best_move:
                _, _, unit, destination, counts, total_counts = best_move
                assignment[unit] = destination
                improved = True

        cost = _assignment_cost(counts, total_counts, targets)
        signature = json.dumps(dict(sorted(assignment.items())), sort_keys=True)
        candidate = (cost, signature, assignment, counts)
        if best is None or candidate[:2] < best[:2]:
            best = candidate
    if best is None:
        raise ValueError("No biological components were available for splitting")
    return best[2], best[3], best[0], targets


def _relationship_key(record: dict[str, Any], metadata: dict[str, Any], field: str) -> str | None:
    if field == "sha256":
        return record["sha256"]
    if field == "split_unit_id":
        return record["split_unit_id"]
    if field == "group_id":
        return record["group_id"]
    return _identity(metadata, field)


def assert_zero_cross_partition_leakage(
    records_by_partition: dict[str, list[dict[str, Any]]],
    metadata: dict[str, dict[str, Any]],
    ssl_exclusion: dict[str, Any],
) -> dict[str, int]:
    assertions: dict[str, int] = {}
    for field in ("image_path", "sha256", "split_unit_id", "group_id", "leaf_id", "plant_id", "acquisition_session"):
        partitions_by_identity: dict[str, set[str]] = defaultdict(set)
        for partition, records in records_by_partition.items():
            for record in records:
                if field == "image_path":
                    identity = record["image_path"]
                else:
                    identity = _relationship_key(record, metadata[record["image_path"]], field)
                if identity:
                    partitions_by_identity[identity].add(partition)
        conflicts = {key: values for key, values in partitions_by_identity.items() if len(values) > 1}
        if conflicts:
            example, partitions = next(iter(conflicts.items()))
            raise AssertionError(f"Cross-partition {field} leakage: {example} in {sorted(partitions)}")
        assertions[f"cross_partition_{field}_conflicts"] = 0

    held_out = records_by_partition["validation"] + records_by_partition["test"]
    train = records_by_partition["train"]
    excluded_paths = set(ssl_exclusion["excluded_paths"])
    excluded_hashes = set(ssl_exclusion["excluded_sha256"])
    excluded_units = set(ssl_exclusion["excluded_split_unit_ids"])
    excluded_groups = set(ssl_exclusion["excluded_group_ids"])
    if {record["image_path"] for record in held_out} - excluded_paths:
        raise AssertionError("SSL exclusion manifest omits held-out image paths")
    if {record["sha256"] for record in held_out} - excluded_hashes:
        raise AssertionError("SSL exclusion manifest omits held-out exact hashes")
    if {record["split_unit_id"] for record in held_out} - excluded_units:
        raise AssertionError("SSL exclusion manifest omits held-out biological split units")
    if {record["group_id"] for record in held_out} - excluded_groups:
        raise AssertionError("SSL exclusion manifest omits held-out explicit groups")
    if any(
        record["image_path"] in excluded_paths
        or record["sha256"] in excluded_hashes
        or record["split_unit_id"] in excluded_units
        or record["group_id"] in excluded_groups
        for record in train
    ):
        raise AssertionError("Training/SSL allowlist overlaps held-out exclusion identities")
    assertions.update({
        "train_vs_ssl_exclusion_conflicts": 0,
        "validation_test_paths_missing_from_ssl_exclusion": 0,
        "validation_test_groups_missing_from_ssl_exclusion": 0,
    })
    return assertions


def _manifest_record(
    cohort_record: dict[str, Any],
    metadata: dict[str, Any],
    split_unit_id: str,
    class_names: Sequence[str],
) -> dict[str, Any]:
    class_name = metadata["canonical_class"]
    return {
        "image_path": cohort_record["image_path"],
        "sha256": cohort_record["sha256"],
        "canonical_class": class_name,
        "class_index": class_names.index(class_name),
        "group_id": cohort_record["group_id"],
        "split_unit_id": split_unit_id,
        "source_dataset": metadata["source_dataset"],
        "plant_id": metadata["plant_id"],
        "leaf_id": metadata["leaf_id"],
        "acquisition_session": metadata["acquisition_session"],
        "capture_device": metadata["capture_device"],
        "capture_date": metadata["capture_date"],
        "location": metadata["location"],
    }


def build_final_split(
    dataset_root: str | Path,
    cohort_manifest_path: str | Path,
    metadata_manifest_path: str | Path,
    adjudication_manifest_path: str | Path,
    split_config_path: str | Path,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]] | None]:
    root = Path(dataset_root).expanduser().resolve()
    cohort = json.loads(Path(cohort_manifest_path).read_text(encoding="utf-8"))
    _verify_fingerprint(cohort, "manifest_fingerprint")
    config = load_split_config(split_config_path)
    metadata = load_manifest_payload(metadata_manifest_path)
    adjudication = load_and_validate_adjudication(adjudication_manifest_path, root)
    input_artifacts = {
        "cohort_manifest": str(Path(cohort_manifest_path).resolve()),
        "metadata_manifest": str(Path(metadata_manifest_path).resolve()),
        "adjudication_manifest": str(Path(adjudication_manifest_path).resolve()),
        "split_config": str(Path(split_config_path).resolve()),
    }
    gate: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "split_version": config["split_version"],
        "status": "blocked",
        "split_manifests_written": False,
        "configuration": config,
        "input_artifacts": {
            name: {"path": path, "sha256": hashlib.sha256(Path(path).read_bytes()).hexdigest()}
            for name, path in input_artifacts.items()
        },
        "blockers": [],
    }
    if cohort.get("status") != "ready":
        gate["blockers"].append(
            f"cohort status is '{cohort.get('status')}', not ready"
        )
        gate["cohort_gate_blockers"] = cohort.get("gate_summary", {}).get("blockers", [])
        gate["gate_fingerprint"] = _json_fingerprint(gate)
        return gate, None

    selected = [
        record for class_name in config["class_names"]
        for record in cohort["selected_records"][class_name]
    ]
    if not selected:
        raise ValueError("Ready cohort contains no selected records")
    selected_paths = [record["image_path"] for record in selected]
    if len(selected_paths) != len(set(selected_paths)):
        raise ValueError("Ready cohort repeats selected paths")
    for record in selected:
        relative = record["image_path"]
        if relative not in metadata:
            raise ValueError(f"Selected path has no metadata record: {relative}")
        if sha256_file(root / relative) != record["sha256"]:
            raise ValueError(f"Selected image changed after cohort creation: {relative}")

    unresolved_pairs = [pair for pair in adjudication["pairs"] if pair["decision"] == "requires_review"]
    if unresolved_pairs:
        gate["blockers"].append(f"{len(unresolved_pairs)} near-duplicate pairs remain unresolved")
        gate["gate_fingerprint"] = _json_fingerprint(gate)
        return gate, None

    components, split_unit_by_path = _build_components(selected, metadata, adjudication)
    class_totals = Counter(metadata[record["image_path"]]["canonical_class"] for record in selected)
    assignment, achieved, cost, targets = _assign_components(
        components,
        class_totals,
        config["fractions"],
        config["seed"],
        config["optimization_restarts"],
    )
    records_by_partition: dict[str, list[dict[str, Any]]] = {name: [] for name in PARTITIONS}
    selected_by_path = {record["image_path"]: record for record in selected}
    for relative in sorted(selected_by_path):
        unit = split_unit_by_path[relative]
        partition = assignment[unit]
        records_by_partition[partition].append(
            _manifest_record(selected_by_path[relative], metadata[relative], unit, config["class_names"])
        )

    deviations: dict[str, dict[str, float]] = {name: {} for name in PARTITIONS}
    maximum_deviation = 0.0
    for partition in PARTITIONS:
        for class_name, total in class_totals.items():
            achieved_fraction = achieved[partition][class_name] / total
            deviation = achieved_fraction - config["fractions"][partition]
            deviations[partition][class_name] = round(deviation, 8)
            maximum_deviation = max(maximum_deviation, abs(deviation))
    tradeoff = {
        "target_counts": targets,
        "achieved_counts": {
            partition: {name: achieved[partition][name] for name in config["class_names"]}
            for partition in PARTITIONS
        },
        "fraction_deviation": deviations,
        "maximum_absolute_class_fraction_deviation": round(maximum_deviation, 8),
        "configured_tolerance": config["maximum_class_fraction_deviation"],
        "optimization_cost": cost,
        "grouping_constraints_relaxed": False,
    }
    if maximum_deviation > config["maximum_class_fraction_deviation"]:
        gate["blockers"].append(
            "group-aware stratification exceeds configured deviation tolerance; "
            "grouping was not relaxed"
        )
        gate["stratification_tradeoff"] = tradeoff
        gate["proposed_group_assignments"] = assignment
        gate["gate_fingerprint"] = _json_fingerprint(gate)
        return gate, None

    held_out = records_by_partition["validation"] + records_by_partition["test"]
    ssl_exclusion = {
        "schema_version": SCHEMA_VERSION,
        "split_version": config["split_version"],
        "purpose": "Deny validation/test pixels, exact hashes, and biological groups from SSL pretraining.",
        "excluded_partitions": ["validation", "test"],
        "excluded_paths": sorted({record["image_path"] for record in held_out}),
        "excluded_sha256": sorted({record["sha256"] for record in held_out}),
        "excluded_split_unit_ids": sorted({record["split_unit_id"] for record in held_out}),
        "excluded_group_ids": sorted({record["group_id"] for record in held_out}),
        "records": held_out,
    }
    assertions = assert_zero_cross_partition_leakage(records_by_partition, metadata, ssl_exclusion)
    usage_contracts = {
        "train": {
            "allowed": ["supervised_training", "labeled_ssl_pretraining", "quantization_calibration"],
            "forbidden": ["held_out_final_reporting"],
        },
        "validation": {
            "allowed": ["checkpoint_selection", "hyperparameter_tuning"],
            "forbidden": ["ssl_pretraining", "quantization_calibration", "final_test_reporting"],
        },
        "test": {
            "allowed": ["one_time_final_evaluation"],
            "forbidden": ["training", "ssl_pretraining", "checkpoint_selection", "hyperparameter_tuning", "quantization_calibration"],
            "locked": True,
        },
    }
    manifests: dict[str, dict[str, Any]] = {}
    for partition in PARTITIONS:
        manifest = {
            "schema_version": SCHEMA_VERSION,
            "split_version": config["split_version"],
            "partition": partition,
            "fraction": config["fractions"][partition],
            "usage_contract": usage_contracts[partition],
            "class_names": config["class_names"],
            "class_counts": dict(sorted(Counter(
                record["canonical_class"] for record in records_by_partition[partition]
            ).items())),
            "records": records_by_partition[partition],
        }
        manifest["manifest_fingerprint"] = _json_fingerprint(manifest)
        manifests[f"{partition}_manifest.json"] = manifest
    ssl_exclusion["manifest_fingerprint"] = _json_fingerprint(ssl_exclusion)
    manifests["ssl_exclusion_manifest.json"] = ssl_exclusion
    group_assignment = {
        "schema_version": SCHEMA_VERSION,
        "split_version": config["split_version"],
        "grouping_constraints_relaxed": False,
        "components": [
            {**component, "partition": assignment[component["split_unit_id"]]}
            for component in components
        ],
    }
    group_assignment["manifest_fingerprint"] = _json_fingerprint(group_assignment)
    manifests["group_assignment_manifest.json"] = group_assignment
    gate.update({
        "status": "ready",
        "split_manifests_written": True,
        "stratification_tradeoff": tradeoff,
        "leakage_assertions": assertions,
        "partition_usage_contracts": usage_contracts,
        "output_fingerprints": {
            name: payload["manifest_fingerprint"] for name, payload in manifests.items()
        },
    })
    gate["gate_fingerprint"] = _json_fingerprint(gate)
    manifests["split_summary.json"] = gate
    return gate, manifests


def write_split_outputs(
    gate: dict[str, Any],
    manifests: dict[str, dict[str, Any]] | None,
    output_dir: str | Path,
) -> list[Path]:
    output = Path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    if manifests is None:
        destination = output / "final_split_gate.blocked.json"
        serialized = json.dumps(gate, indent=2, ensure_ascii=False) + "\n"
        destination.write_text(serialized, encoding="utf-8")
        return [destination.resolve()]
    serialized_by_name = {
        name: json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
        for name, payload in manifests.items()
    }
    for name, serialized in serialized_by_name.items():
        destination = output / name
        if destination.is_file() and destination.read_text(encoding="utf-8") != serialized:
            raise ValueError(
                f"Frozen split output already exists with different content: {destination}. "
                "Use a new split_version/output directory."
            )
    written: list[Path] = []
    for name, serialized in serialized_by_name.items():
        destination = output / name
        temporary = output / f".{name}.tmp"
        temporary.write_text(serialized, encoding="utf-8")
        temporary.replace(destination)
        written.append(destination.resolve())
    return written


def load_final_dataset_splits(
    split_dir: str | Path,
    dataset_root: str | Path,
    expected_class_names: Sequence[str],
) -> DatasetSplits:
    root = Path(dataset_root).expanduser().resolve()
    directory = Path(split_dir).expanduser().resolve()
    summary_path = directory / "split_summary.json"
    group_path = directory / "group_assignment_manifest.json"
    ssl_path = directory / "ssl_exclusion_manifest.json"
    for required in (summary_path, group_path, ssl_path):
        if not required.is_file():
            raise FileNotFoundError(f"Frozen final split artifact is missing: {required}")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    _verify_fingerprint(summary, "gate_fingerprint")
    if summary.get("status") != "ready" or not summary.get("split_manifests_written"):
        raise ValueError("Frozen final split summary is not a passed quality gate")
    group_assignment = json.loads(group_path.read_text(encoding="utf-8"))
    _verify_fingerprint(group_assignment, "manifest_fingerprint")
    if summary.get("output_fingerprints", {}).get(group_path.name) != group_assignment["manifest_fingerprint"]:
        raise ValueError("Frozen group-assignment fingerprint does not match split summary")
    if group_assignment.get("grouping_constraints_relaxed") is not False:
        raise ValueError("Frozen final split relaxed a biological grouping constraint")
    if group_assignment.get("split_version") != summary.get("split_version"):
        raise ValueError("Frozen group-assignment split version mismatch")
    ssl_exclusion = json.loads(ssl_path.read_text(encoding="utf-8"))
    _verify_fingerprint(ssl_exclusion, "manifest_fingerprint")
    if summary.get("output_fingerprints", {}).get(ssl_path.name) != ssl_exclusion["manifest_fingerprint"]:
        raise ValueError("Frozen SSL-exclusion fingerprint does not match split summary")
    if ssl_exclusion.get("split_version") != summary.get("split_version"):
        raise ValueError("Frozen SSL-exclusion split version mismatch")
    values: dict[str, list[ImageRecord]] = {}
    record_payloads: dict[str, list[dict[str, Any]]] = {}
    for partition in PARTITIONS:
        path = directory / f"{partition}_manifest.json"
        if not path.is_file():
            raise FileNotFoundError(f"Frozen final split manifest is missing: {path}")
        payload = json.loads(path.read_text(encoding="utf-8"))
        _verify_fingerprint(payload, "manifest_fingerprint")
        if payload.get("partition") != partition or payload.get("class_names") != list(expected_class_names):
            raise ValueError(f"Frozen final split contract mismatch: {path}")
        if payload.get("split_version") != summary.get("split_version"):
            raise ValueError(f"Frozen final split version mismatch: {path}")
        if payload.get("usage_contract") != summary.get("partition_usage_contracts", {}).get(partition):
            raise ValueError(f"Frozen final split usage-contract mismatch: {path}")
        if summary.get("output_fingerprints", {}).get(path.name) != payload["manifest_fingerprint"]:
            raise ValueError(f"Frozen final split summary fingerprint mismatch: {path}")
        record_payloads[partition] = payload["records"]
        values[partition] = []
        for item in payload["records"]:
            image_path = (root / item["image_path"]).resolve()
            try:
                image_path.relative_to(root)
            except ValueError as error:
                raise ValueError(f"Frozen split path escapes dataset root: {item['image_path']}") from error
            expected_index = list(expected_class_names).index(item["canonical_class"])
            if item["class_index"] != expected_index:
                raise ValueError(f"Frozen split class index mismatch: {item['image_path']}")
            if sha256_file(image_path) != item["sha256"]:
                raise ValueError(f"Frozen split image changed: {image_path}")
            metadata_values = {
                "source": item.get("source_dataset", "unknown"),
                "plant_id": item.get("plant_id", "unknown"),
                "leaf_id": item.get("leaf_id", "unknown"),
                "site_id": item.get("location", "unknown"),
                "session_id": item.get("acquisition_session", "unknown"),
                "origin_type": "unknown",
                "capture_device": item.get("capture_device", "unknown"),
                "acquisition_date": item.get("capture_date", "unknown"),
                "field_subset": "none",
                "species_review_status": "banana",
                "visibility_quality_status": "acceptable",
                "inclusion_status": "included",
                "label_validator": "frozen-cohort",
                "label_review_status": "validated",
            }
            values[partition].append(ImageRecord(
                str(image_path), item["class_index"], item["canonical_class"],
                item["sha256"], item["split_unit_id"], **metadata_values,
            ))
    assignments = {
        component["split_unit_id"]: component
        for component in group_assignment.get("components", [])
    }
    manifested_members: dict[str, set[str]] = defaultdict(set)
    for partition in PARTITIONS:
        for item in record_payloads[partition]:
            unit = item["split_unit_id"]
            component = assignments.get(unit)
            if component is None or component.get("partition") != partition:
                raise ValueError(f"Frozen group assignment mismatch for: {item['image_path']}")
            manifested_members[unit].add(item["image_path"])
    if set(manifested_members) != set(assignments) or any(
        manifested_members[unit] != set(component.get("members", []))
        for unit, component in assignments.items()
    ):
        raise ValueError("Frozen group-assignment members do not match partition manifests")
    metadata_stub = {
        item["image_path"]: {
            "source_dataset": item.get("source_dataset", "unknown"),
            "location": item.get("location", "unknown"),
            "plant_id": item.get("plant_id", "unknown"),
            "leaf_id": item.get("leaf_id", "unknown"),
            "acquisition_session": item.get("acquisition_session", "unknown"),
        }
        for partition in PARTITIONS
        for item in record_payloads[partition]
    }
    assert_zero_cross_partition_leakage(record_payloads, metadata_stub, ssl_exclusion)
    return DatasetSplits(list(expected_class_names), values["train"], values["validation"], values["test"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--cohort-manifest", required=True)
    parser.add_argument("--metadata-manifest", required=True)
    parser.add_argument("--adjudication-manifest", required=True)
    parser.add_argument("--split-config", default="ai/config/final_split_v1.json")
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    gate, manifests = build_final_split(
        args.dataset_dir, args.cohort_manifest, args.metadata_manifest,
        args.adjudication_manifest, args.split_config,
    )
    written = write_split_outputs(gate, manifests, args.output_dir)
    print(json.dumps({
        "status": gate["status"],
        "written": [str(path) for path in written],
        "blockers": gate["blockers"],
        "stratification_tradeoff": gate.get("stratification_tradeoff"),
        "leakage_assertions": gate.get("leakage_assertions"),
    }, indent=2))
    if manifests is None:
        raise SystemExit("FINAL SPLIT BLOCKED: quality/cohort gates or stratification tolerance have not passed")


if __name__ == "__main__":
    main()
