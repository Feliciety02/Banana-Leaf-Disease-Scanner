from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from ai.config.labels import CLASS_LABELS
from ai.config.config import ExperimentConfig
from ai.data.build_final_split import (
    _json_fingerprint,
    assert_zero_cross_partition_leakage,
    build_final_split,
    load_final_dataset_splits,
    write_split_outputs,
)
from ai.data.build_labeled_cohort import build_cohort, load_cohort_config, write_cohort_manifest
from ai.data.dataset import prepare_splits
from ai.data.image_fingerprints import sha256_file
from ai.data.metadata_manifest import _record_fingerprint, enrich_metadata, write_manifest


class FinalSplitBuilderTest(unittest.TestCase):
    def _workspace(self, directory: str) -> dict[str, Path | dict[str, str]]:
        workspace = Path(directory)
        root = workspace / "dataset"
        prefixes = {
            "healthy": "healthy-zenodo-",
            "sigatoka": "sigatoka-zenodo-",
            "panama-disease": "panama-zenodo2-FW_",
            "cordana-leaf-spot": "cordana-bananalsd-",
        }
        by_class: dict[str, list[str]] = {}
        for class_index, class_name in enumerate(CLASS_LABELS):
            class_dir = root / class_name
            class_dir.mkdir(parents=True)
            by_class[class_name] = []
            for index in range(12):
                path = class_dir / f"{prefixes[class_name]}{index:04d}.png"
                # Every byte stream is unique; exact-duplicate handling is tested
                # independently from the cohort's exact-unique quality gate.
                Image.new(
                    "RGB", (8, 8),
                    (class_index * 50 + index, index * 17 % 256, class_index * 31 + index),
                ).save(path)
                by_class[class_name].append(path.relative_to(root).as_posix())

        groups = {
            relative: f"singleton::{relative}"
            for paths in by_class.values() for relative in paths
        }
        cordana = by_class["cordana-leaf-spot"]
        groups[cordana[0]] = groups[cordana[1]] = "cordana-explicit-related"
        groups_path = workspace / "groups.json"
        groups_path.write_text(json.dumps(groups), encoding="utf-8")

        metadata_payload = enrich_metadata(
            root, CLASS_LABELS, ["dead"], [".png"], None, groups_path, None
        )
        for relative, record in metadata_payload["images"].items():
            record.update({
                "expert_validated": "validated",
                "label_review_status": "validated",
                "label_validator": "test-reviewer",
                "qc_status": "approved",
                "species_review_status": "banana",
                "visibility_quality_status": "acceptable",
                "inclusion_status": "included",
                "duplicate_status": "reviewed_clear",
                "originality_status": "original",
            })
        # Separate constraints deliberately overlap no explicit group, proving
        # that leaf, plant and session identities independently create units.
        for relative in by_class["healthy"][2:4]:
            metadata_payload["images"][relative].update({
                "plant_id": "plant-h", "leaf_id": "leaf-h",
            })
        for relative in by_class["sigatoka"][0:2]:
            metadata_payload["images"][relative]["plant_id"] = "plant-s"
        for relative in by_class["panama-disease"][0:2]:
            metadata_payload["images"][relative]["acquisition_session"] = "session-p"
        for record in metadata_payload["images"].values():
            record["record_fingerprint"] = _record_fingerprint(record)
        metadata_path = write_manifest(metadata_payload, workspace / "metadata.json")

        left, right = by_class["healthy"][0:2]
        evidence = {
            "review_key": f"{left}||{right}",
            "sha256_a": sha256_file(root / left),
            "sha256_b": sha256_file(root / right),
            "flip_aware_dhash64_a": "0000000000000000",
            "flip_aware_dhash64_b": "0000000000000000",
            "hamming_distance": 0,
            "class_a": "healthy",
            "class_b": "healthy",
        }
        pair = {
            **evidence,
            "path_a": left,
            "path_b": right,
            "same_class": True,
            "decision": "same_leaf_or_related_capture",
            "reviewer": "test-reviewer",
            "reviewed_at": "2026-08-26",
            "evidence_note": "Synthetic confirmed related capture for leakage test.",
        }
        adjudication_path = workspace / "adjudication.json"
        adjudication_path.write_text(json.dumps({
            "schema_version": 2,
            "candidate_fingerprint": _json_fingerprint([evidence]),
            "pairs": [pair],
        }), encoding="utf-8")

        inventory_path = workspace / "inventory.json"
        inventory_path.write_text(json.dumps({
            "summary": {
                "scanned": 48,
                "cross_label_exact_conflicts": 0,
                "exact_duplicate_copies_excluded": 0,
            },
            "rejected_images": [],
        }), encoding="utf-8")
        cohort_config = load_cohort_config("ai/config/cohort_labeled_v1.json")
        cohort_config.update({"cohort_version": "test-cohort-12", "target_per_class": 12})
        cohort_config_path = workspace / "cohort-config.json"
        cohort_config_path.write_text(json.dumps(cohort_config), encoding="utf-8")
        cohort = build_cohort(
            root, metadata_path, groups_path, adjudication_path,
            inventory_path, cohort_config_path,
        )
        self.assertEqual(cohort["status"], "ready", cohort["gate_summary"]["blockers"])
        cohort_path = write_cohort_manifest(cohort, workspace / "cohort.json")

        split_config = json.loads(Path("ai/config/final_split_v1.json").read_text(encoding="utf-8"))
        split_config["split_version"] = "test-split-v1"
        # With 12/class, the integer-perfect 8/2/2 allocation is 66.7/16.7/16.7.
        split_config["maximum_class_fraction_deviation"] = 0.04
        split_config_path = workspace / "split-config.json"
        split_config_path.write_text(json.dumps(split_config), encoding="utf-8")
        return {
            "root": root,
            "metadata": metadata_path,
            "adjudication": adjudication_path,
            "cohort": cohort_path,
            "split_config": split_config_path,
            "by_class": by_class,
        }

    @staticmethod
    def _build(paths: dict[str, Path | dict[str, str]]):
        return build_final_split(
            paths["root"], paths["cohort"], paths["metadata"],
            paths["adjudication"], paths["split_config"],
        )

    def test_deterministic_split_preserves_every_grouping_level_and_ssl_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            paths = self._workspace(directory)
            first_gate, first = self._build(paths)
            second_gate, second = self._build(paths)
            self.assertEqual(first_gate, second_gate)
            self.assertEqual(first, second)
            self.assertEqual(first_gate["status"], "ready")
            self.assertIsNotNone(first)
            assert first is not None
            for partition, expected in (("train", 8), ("validation", 2), ("test", 2)):
                self.assertEqual(
                    first[f"{partition}_manifest.json"]["class_counts"],
                    {class_name: expected for class_name in CLASS_LABELS},
                )

            partition_by_path = {
                record["image_path"]: partition
                for partition in ("train", "validation", "test")
                for record in first[f"{partition}_manifest.json"]["records"]
            }
            by_class = paths["by_class"]
            assert isinstance(by_class, dict)
            constrained_pairs = (
                by_class["healthy"][0:2],       # adjudicated related capture
                by_class["healthy"][2:4],       # same leaf
                by_class["sigatoka"][0:2],      # same plant
                by_class["panama-disease"][0:2],# same acquisition session
                by_class["cordana-leaf-spot"][0:2],  # explicit group
            )
            for pair in constrained_pairs:
                self.assertEqual(len({partition_by_path[path] for path in pair}), 1)

            ssl = first["ssl_exclusion_manifest.json"]
            held_out = set()
            train = set(partition_by_path) - set(ssl["excluded_paths"])
            for partition in ("validation", "test"):
                held_out.update(
                    row["image_path"] for row in first[f"{partition}_manifest.json"]["records"]
                )
            self.assertEqual(held_out, set(ssl["excluded_paths"]))
            self.assertTrue(train.isdisjoint(ssl["excluded_paths"]))
            self.assertTrue(all(value == 0 for value in first_gate["leakage_assertions"].values()))
            self.assertFalse(first_gate["stratification_tradeoff"]["grouping_constraints_relaxed"])

            output = Path(directory) / "split"
            write_split_outputs(first_gate, first, output)
            loaded = load_final_dataset_splits(output, paths["root"], CLASS_LABELS)
            self.assertEqual((len(loaded.train), len(loaded.validation), len(loaded.test)), (32, 8, 8))
            config = ExperimentConfig()
            config.data.dataset_dir = str(paths["root"])
            config.data.final_split_dir = str(output)
            routed = prepare_splits(config, Path(directory) / "must-not-create-ad-hoc.json")
            self.assertEqual((len(routed.train), len(routed.validation), len(routed.test)), (32, 8, 8))
            self.assertFalse((Path(directory) / "must-not-create-ad-hoc.json").exists())
            self.assertIn("quantization_calibration", first["test_manifest.json"]["usage_contract"]["forbidden"])
            self.assertIn("hyperparameter_tuning", first["test_manifest.json"]["usage_contract"]["forbidden"])

    def test_exact_hash_leakage_assertion_fails_loudly(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            paths = self._workspace(directory)
            _gate, manifests = self._build(paths)
            assert manifests is not None
            records = {
                partition: copy.deepcopy(manifests[f"{partition}_manifest.json"]["records"])
                for partition in ("train", "validation", "test")
            }
            records["validation"][0]["sha256"] = records["train"][0]["sha256"]
            metadata = json.loads(Path(paths["metadata"]).read_text(encoding="utf-8"))["images"]
            with self.assertRaisesRegex(AssertionError, "sha256 leakage"):
                assert_zero_cross_partition_leakage(
                    records, metadata, manifests["ssl_exclusion_manifest.json"]
                )

    def test_impossible_stratification_blocks_without_relaxing_groups(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            paths = self._workspace(directory)
            metadata_path = Path(paths["metadata"])
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            for relative, record in metadata["images"].items():
                if relative.startswith("cordana-leaf-spot/"):
                    record["plant_id"] = "one-indivisible-cordana-plant"
                    record["record_fingerprint"] = _record_fingerprint(record)
            metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
            config_path = Path(paths["split_config"])
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["maximum_class_fraction_deviation"] = 0
            config_path.write_text(json.dumps(config), encoding="utf-8")

            gate, manifests = self._build(paths)
            self.assertIsNone(manifests)
            self.assertEqual(gate["status"], "blocked")
            self.assertFalse(gate["stratification_tradeoff"]["grouping_constraints_relaxed"])
            output = Path(directory) / "blocked-split"
            written = write_split_outputs(gate, manifests, output)
            self.assertEqual([path.name for path in written], ["final_split_gate.blocked.json"])
            self.assertFalse((output / "train_manifest.json").exists())

    def test_failed_cohort_gate_writes_no_partition_manifests(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            paths = self._workspace(directory)
            cohort_path = Path(paths["cohort"])
            cohort = json.loads(cohort_path.read_text(encoding="utf-8"))
            cohort["status"] = "blocked"
            cohort["gate_summary"]["blockers"] = ["manual quality review pending"]
            cohort["manifest_fingerprint"] = _json_fingerprint({
                key: value for key, value in cohort.items() if key != "manifest_fingerprint"
            })
            cohort_path.write_text(json.dumps(cohort), encoding="utf-8")
            gate, manifests = self._build(paths)
            self.assertEqual(gate["status"], "blocked")
            self.assertIsNone(manifests)
            self.assertIn("manual quality review pending", gate["cohort_gate_blockers"])


if __name__ == "__main__":
    unittest.main()
