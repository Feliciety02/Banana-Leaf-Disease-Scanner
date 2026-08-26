from __future__ import annotations

import json
import random
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from ai.config.config import ExperimentConfig
from ai.data.build_davao_field_manifest import (
    build_davao_field_manifest,
    load_field_registry,
    write_field_manifest,
)
from ai.data.build_final_split import write_split_outputs
from ai.data.dataset import build_ssl_pretraining_records, prepare_splits, select_stratified_representative_records


class DavaoFieldIngestionTest(unittest.TestCase):
    @staticmethod
    def _image(path: Path, seed: int) -> None:
        generator = random.Random(seed)
        image = Image.new("RGB", (64, 64))
        image.putdata([
            (generator.randrange(256), generator.randrange(256), generator.randrange(256))
            for _ in range(64 * 64)
        ])
        image.save(path)

    @staticmethod
    def _record(
        review_status: str = "validated",
        preliminary_label: str = "worker-observation: sigatoka-like",
        expert_label: str = "healthy",
    ) -> dict[str, str]:
        validated = review_status == "validated"
        return {
            "site": "davao-site-01",
            "plant_id": "plant-01",
            "leaf_id": "leaf-01",
            "acquisition_session": "session-01",
            "capture_device": "camera-01",
            "capture_date": "2026-08-26",
            "collector_role": "plantation-worker",
            "preliminary_label": preliminary_label,
            "preliminary_label_provider": "plantation-worker",
            "preliminary_label_recorded_at": "2026-08-26",
            "expert_reviewed_label": expert_label if validated else "pending",
            "review_status": review_status,
            "expert_reviewer": "agricultural-expert-01" if validated else "pending",
            "expert_reviewed_at": "2026-08-27" if validated else "pending",
            "expert_evidence": "Field context and leaf review" if validated else "pending",
            "banana_leaf_status": "confirmed_banana_leaf",
            "qc_status": "approved",
            "qc_reviewer": "qc-reviewer-01",
            "qc_reviewed_at": "2026-08-27",
            "qc_note": "Readable banana leaf with sufficient visibility",
            "exclusion_reason": "none" if validated else "pending expert review",
        }

    @staticmethod
    def _collection() -> dict[str, str]:
        return {
            "collection_id": "davao-test-collection",
            "project_name": "Davao banana leaf field evaluation",
            "collecting_organization": "test-organization",
            "collection_authority_status": "approved",
            "collection_authority_reference": "test-authority-record",
            "notes": "Synthetic test collection; no personal data",
        }

    def _fixture(self, directory: str):
        from ai.tests.test_final_split_builder import FinalSplitBuilderTest

        workspace = Path(directory)
        final_fixture = FinalSplitBuilderTest()
        paths = final_fixture._workspace(directory)
        gate, split_manifests = final_fixture._build(paths)
        self.assertEqual(gate["status"], "ready")
        assert split_manifests is not None
        split_dir = workspace / "final-split"
        write_split_outputs(gate, split_manifests, split_dir)

        field_root = workspace / "davao-field"
        field_root.mkdir()
        self._image(field_root / "validated-a.png", 1001)
        self._image(field_root / "validated-b.png", 1002)
        self._image(field_root / "pending.png", 1003)
        self._image(field_root / "conflict.png", 1004)
        self._image(field_root / "excluded.png", 1005)
        (field_root / "corrupt.png").write_bytes(b"not an image")
        (field_root / "zz-exact-copy.png").write_bytes((field_root / "validated-a.png").read_bytes())

        images = {
            "validated-a.png": self._record(),
            "validated-b.png": self._record(
                preliminary_label="farmer observation: yellowing",
                expert_label="healthy",
            ),
            "pending.png": self._record(review_status="pending"),
            "conflict.png": self._record(review_status="conflict"),
            "excluded.png": self._record(review_status="excluded"),
            "corrupt.png": self._record(),
            "zz-exact-copy.png": self._record(),
        }
        images["validated-b.png"]["leaf_id"] = "leaf-02"
        images["pending.png"].update({"plant_id": "plant-02", "leaf_id": "leaf-03"})
        images["conflict.png"].update({"plant_id": "plant-03", "leaf_id": "leaf-04"})
        images["excluded.png"].update({"plant_id": "plant-04", "leaf_id": "leaf-05"})
        images["corrupt.png"].update({"plant_id": "plant-05", "leaf_id": "leaf-06"})
        registry_path = workspace / "field-registry.json"
        registry_path.write_text(json.dumps({
            "schema_version": 1,
            "registry_version": "davao-test-registry-v1",
            "collection": self._collection(),
            "images": images,
        }), encoding="utf-8")
        review_path = workspace / "field-near-reviews.json"
        review_path.write_text(json.dumps({"schema_version": 1, "reviews": {}}), encoding="utf-8")
        return paths, split_dir, field_root, registry_path, review_path

    def test_empty_inventory_reports_zero_validated_without_fabrication(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            root = workspace / "field"
            root.mkdir()
            labeled = workspace / "labeled"
            labeled.mkdir()
            registry = workspace / "registry.json"
            collection = self._collection()
            collection["collection_authority_status"] = "pending"
            collection["collection_authority_reference"] = "pending"
            registry.write_text(json.dumps({
                "schema_version": 1,
                "registry_version": "empty-field-v1",
                "collection": collection,
                "images": {},
            }), encoding="utf-8")
            payload = build_davao_field_manifest(
                root, registry, labeled, None, "ai/config/davao_field_ingestion_v1.json"
            )
            self.assertEqual(payload["status"], "empty")
            self.assertEqual(payload["summary"]["acquired"], 0)
            self.assertEqual(payload["summary"]["expert_validated"], 0)
            self.assertEqual(payload["summary"]["held_out_test_ready"], 0)
            self.assertEqual(payload["pending_validation_summary"]["preliminary_labels_promoted_automatically"], 0)
            self.assertEqual(payload["pending_validation_summary"]["global_blockers"], [
                "no_field_images_acquired",
                "collection_authority_not_approved",
                "frozen_final_split_unavailable",
            ])

    def test_preliminary_labels_never_become_targets_and_groups_are_transitive(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            paths, split_dir, field_root, registry, reviews = self._fixture(directory)
            before = {path.name: path.read_bytes() for path in field_root.iterdir()}
            payload = build_davao_field_manifest(
                field_root, registry, paths["root"], split_dir,
                "ai/config/davao_field_ingestion_v1.json", reviews,
            )
            self.assertEqual(payload, build_davao_field_manifest(
                field_root, registry, paths["root"], split_dir,
                "ai/config/davao_field_ingestion_v1.json", reviews,
            ))
            self.assertEqual(payload["status"], "ready_with_pending")
            self.assertEqual(payload["summary"]["acquired"], 7)
            self.assertEqual(payload["summary"]["held_out_test_ready"], 2)
            self.assertEqual(payload["summary"]["pending_review"], 1)
            self.assertEqual(payload["summary"]["conflicting_review"], 1)
            self.assertEqual(payload["summary"]["exact_duplicate"], 1)
            subset = payload["davao_field_evaluation_subset"]
            self.assertEqual({row["image_path"] for row in subset}, {"validated-a.png", "validated-b.png"})
            self.assertTrue(all(row["canonical_class"] == "healthy" for row in subset))
            self.assertTrue(all(row["partition"] == "test" for row in subset))
            self.assertEqual({row["field_group_id"] for row in subset}, {subset[0]["field_group_id"]})
            pending_paths = {
                row["image_path"]
                for row in payload["pending_validation_summary"]["pending_or_conflicting_records"]
            }
            self.assertEqual(pending_paths, {"pending.png", "conflict.png"})
            self.assertEqual(payload["pending_validation_summary"]["preliminary_labels_promoted_automatically"], 0)
            self.assertIn("supervised_training", payload["usage_contract"]["forbidden"])
            self.assertIn("ssl_pretraining", payload["usage_contract"]["forbidden"])
            self.assertIn("hyperparameter_tuning", payload["usage_contract"]["forbidden"])
            self.assertIn("quantization_calibration", payload["usage_contract"]["forbidden"])
            self.assertEqual(before, {path.name: path.read_bytes() for path in field_root.iterdir()})

    def test_manifest_loader_attaches_only_expert_records_to_held_out_test(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            paths, split_dir, field_root, registry, reviews = self._fixture(directory)
            payload = build_davao_field_manifest(
                field_root, registry, paths["root"], split_dir,
                "ai/config/davao_field_ingestion_v1.json", reviews,
            )
            manifest = write_field_manifest(payload, Path(directory) / "davao-field-manifest.json")
            config = ExperimentConfig()
            config.data.dataset_dir = str(paths["root"])
            config.data.final_split_dir = str(split_dir)
            config.data.final_field_test_dir = str(field_root)
            config.data.final_field_test_manifest = str(manifest)
            splits = prepare_splits(config)
            davao = [record for record in splits.test if record.field_subset == "davao"]
            self.assertEqual(len(davao), 2)
            self.assertFalse(any(record.field_subset == "davao" for record in splits.train + splits.validation))
            self.assertTrue(all(record.label_review_status == "validated" for record in davao))
            self.assertTrue(all(record.class_name == "healthy" for record in davao))
            self.assertEqual(len({record.group_id for record in davao}), 1)
            ssl_pool = build_ssl_pretraining_records(splits)
            self.assertFalse({record.sha256 for record in davao}.intersection(
                {record.sha256 for record in ssl_pool}
            ))
            calibration = select_stratified_representative_records(
                splits.train, splits.class_names, 8, 42
            )
            self.assertFalse({record.sha256 for record in davao}.intersection(
                {record.sha256 for record in calibration}
            ))

    def test_registry_cannot_expose_unvalidated_expert_label(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            record = self._record(review_status="pending")
            record["expert_reviewed_label"] = "sigatoka"
            registry = workspace / "bad-registry.json"
            registry.write_text(json.dumps({
                "schema_version": 1,
                "registry_version": "bad-field-v1",
                "collection": self._collection(),
                "images": {"image.png": record},
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "cannot expose a final expert label"):
                load_field_registry(registry)


if __name__ == "__main__":
    unittest.main()
