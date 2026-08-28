from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from ai.config.labels import CLASS_LABELS
from ai.data.build_labeled_cohort import build_cohort, load_cohort_config
from ai.data.metadata_manifest import _record_fingerprint, enrich_metadata, write_manifest


class LabeledCohortBuilderTest(unittest.TestCase):
    def _workspace(self, directory: str, counts: dict[str, int] | None = None):
        workspace = Path(directory)
        root = workspace / "dataset"
        counts = counts or {name: 4 for name in CLASS_LABELS}
        prefixes = {
            "healthy": "healthy-zenodo-",
            "sigatoka": "sigatoka-zenodo-",
            "panama-disease": "panama-zenodo2-FW_",
            "cordana-leaf-spot": "cordana-bananalsd-",
        }
        paths: list[str] = []
        for class_index, class_name in enumerate(CLASS_LABELS):
            class_dir = root / class_name
            class_dir.mkdir(parents=True)
            for index in range(counts[class_name]):
                name = f"{prefixes[class_name]}{index:04d}.png"
                path = class_dir / name
                Image.new("RGB", (8, 8), (class_index * 50, index * 31, class_index + index)).save(path)
                paths.append(path.relative_to(root).as_posix())

        groups: dict[str, str] = {}
        for relative in paths:
            groups[relative] = f"singleton::{relative}"
        healthy = sorted(path for path in paths if path.startswith("healthy/"))
        if len(healthy) >= 2:
            groups[healthy[0]] = groups[healthy[1]] = "healthy-related-group"
        group_path = workspace / "groups.json"
        group_path.write_text(json.dumps(groups), encoding="utf-8")

        metadata_payload = enrich_metadata(
            root, CLASS_LABELS, [".png"], None, group_path, None
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
                "duplicate_status": "automated_clear",
                "lighting_condition": "natural" if relative.endswith("0.png") else "unknown",
                "disease_appearance": "early" if relative.endswith("0.png") else "unknown",
                "capture_device": "camera-a" if relative.endswith("0.png") else "unknown",
            })
            record["record_fingerprint"] = _record_fingerprint(record)
        metadata_path = write_manifest(metadata_payload, workspace / "metadata.json")

        inventory_path = workspace / "inventory.json"
        inventory_path.write_text(json.dumps({
            "summary": {
                "scanned": len(paths),
                "cross_label_exact_conflicts": 0,
                "exact_duplicate_copies_excluded": 0,
            },
            "rejected_images": [],
        }), encoding="utf-8")
        adjudication_path = workspace / "adjudication.json"
        adjudication_path.write_text(json.dumps({
            "schema_version": 2,
            "candidate_fingerprint": hashlib.sha256(b"[]").hexdigest(),
            "pairs": [],
        }), encoding="utf-8")
        return workspace, root, group_path, metadata_path, inventory_path, adjudication_path

    def _config(self, workspace: Path, target: int) -> Path:
        config = load_cohort_config("ai/config/cohort_labeled_v1.json")
        config["cohort_version"] = f"test-cohort-{target}"
        config["target_per_class"] = target
        path = workspace / "cohort-config.json"
        path.write_text(json.dumps(config), encoding="utf-8")
        return path

    def test_ready_selection_is_deterministic_exact_unique_and_group_indivisible(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace, root, groups_path, metadata, inventory, adjudication = self._workspace(directory)
            config = self._config(workspace, 3)
            arguments = (root, metadata, groups_path, adjudication, inventory, config)
            first = build_cohort(*arguments)
            second = build_cohort(*arguments)
            self.assertEqual(first, second)
            self.assertEqual(first["status"], "ready")
            all_selected = []
            groups = json.loads(groups_path.read_text(encoding="utf-8"))
            for class_name in CLASS_LABELS:
                selected = first["selected_paths"][class_name]
                self.assertEqual(len(selected), 3)
                self.assertEqual(len(selected), len(set(selected)))
                all_selected.extend(selected)
            self.assertEqual(len(all_selected), len(set(all_selected)))
            selected_hashes = [
                record["sha256"]
                for records in first["selected_records"].values()
                for record in records
            ]
            self.assertEqual(len(selected_hashes), len(set(selected_hashes)))
            for group_id in set(groups.values()):
                members = {path for path, value in groups.items() if value == group_id}
                selected_members = members.intersection(all_selected)
                self.assertIn(len(selected_members), {0, len(members)})
            self.assertFalse(first["split_generated"])

    def test_raw_class_shortage_writes_no_partial_selection(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            counts = {name: 4 for name in CLASS_LABELS}
            counts["cordana-leaf-spot"] = 2
            workspace, root, groups, metadata, inventory, adjudication = self._workspace(directory, counts)
            config = self._config(workspace, 3)
            payload = build_cohort(root, metadata, groups, adjudication, inventory, config)
            self.assertEqual(payload["status"], "blocked")
            self.assertEqual(payload["unresolved_shortages"]["cordana-leaf-spot"]["raw_shortage"], 1)
            self.assertTrue(all(not paths for paths in payload["selected_paths"].values()))

    def test_augmented_record_is_excluded_and_never_used_to_fill_quota(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace, root, groups, metadata_path, inventory, adjudication = self._workspace(directory)
            payload = json.loads(Path(metadata_path).read_text(encoding="utf-8"))
            relative = sorted(payload["images"])[0]
            payload["images"][relative]["originality_status"] = "augmented"
            payload["images"][relative]["record_fingerprint"] = _record_fingerprint(payload["images"][relative])
            Path(metadata_path).write_text(json.dumps(payload), encoding="utf-8")
            config = self._config(workspace, 4)
            cohort = build_cohort(root, metadata_path, groups, adjudication, inventory, config)
            self.assertEqual(cohort["status"], "blocked")
            class_name = relative.split("/", 1)[0]
            self.assertEqual(cohort["unresolved_shortages"][class_name]["validated_shortage"], 1)
            self.assertIn("excluded:augmented_or_derived", cohort["excluded_image_summary"][class_name])
            self.assertTrue(all(not paths for paths in cohort["selected_paths"].values()))


if __name__ == "__main__":
    unittest.main()
