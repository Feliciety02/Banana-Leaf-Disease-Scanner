from __future__ import annotations

import json
import random
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from ai.config.config import ExperimentConfig
from ai.data.build_ssl_manifest import (
    _json_fingerprint,
    build_ssl_manifest,
    load_source_registry,
    load_ssl_dataset_records,
    write_ssl_manifest,
)
from ai.data.build_final_split import write_split_outputs
from ai.data.dataset import build_ssl_pretraining_records, prepare_splits


class ExternalSslIngestionTest(unittest.TestCase):
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
    def _source(source_id: str = "public-source", license_status: str = "approved") -> dict[str, str]:
        return {
            "source_id": source_id,
            "source_name": "Synthetic public banana-leaf source",
            "source_url": "https://example.test/dataset",
            "accessed_at": "2026-08-26",
            "license_name": "CC BY 4.0",
            "license_url": "https://creativecommons.org/licenses/by/4.0/",
            "license_status": license_status,
            "citation": "Synthetic test source, 2026",
            "source_type": "public",
            "notes": "Test-only source record",
        }

    @staticmethod
    def _record(source_id: str = "public-source", relevance: str = "confirmed_banana_leaf") -> dict[str, str]:
        resolved = relevance != "requires_review"
        return {
            "source_id": source_id,
            "source_item_id": "item-id",
            "original_filename": "original.png",
            "acquired_at": "2026-08-26",
            "banana_leaf_status": relevance,
            "relevance_reviewer": "reviewer" if resolved else "pending",
            "relevance_reviewed_at": "2026-08-26" if resolved else "pending",
            "relevance_evidence": "Visual banana leaf confirmation" if resolved else "pending",
            "biological_group_id": "unknown",
            "plant_id": "unknown",
            "leaf_id": "unknown",
            "acquisition_session": "unknown",
            "capture_device": "unknown",
            "capture_date": "unknown",
            "location": "unknown",
        }

    @staticmethod
    def _write_heldout(path: Path, heldout_image: Path) -> Path:
        import hashlib

        digest = hashlib.sha256(heldout_image.read_bytes()).hexdigest()
        record = {
            "image_path": "healthy/heldout.png",
            "sha256": digest,
            "canonical_class": "healthy",
            "class_index": 0,
            "group_id": "heldout-group",
            "split_unit_id": "heldout-unit",
            "source_dataset": "public-source",
            "plant_id": "heldout-plant",
            "leaf_id": "heldout-leaf",
            "acquisition_session": "heldout-session",
            "capture_device": "unknown",
            "capture_date": "unknown",
            "location": "unknown",
        }
        payload = {
            "schema_version": 1,
            "split_version": "test-split",
            "purpose": "test",
            "excluded_partitions": ["validation", "test"],
            "excluded_paths": [record["image_path"]],
            "excluded_sha256": [digest],
            "excluded_split_unit_ids": [record["split_unit_id"]],
            "excluded_group_ids": [record["group_id"]],
            "records": [record],
        }
        payload["manifest_fingerprint"] = _json_fingerprint(payload)
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def _fixture(self, directory: str):
        workspace = Path(directory)
        ssl_root = workspace / "ssl"
        ssl_root.mkdir()
        labeled = workspace / "labeled"
        heldout_dir = labeled / "healthy"
        heldout_dir.mkdir(parents=True)
        heldout_image = heldout_dir / "heldout.png"
        self._image(heldout_image, 1)
        train_dir = labeled / "sigatoka"
        train_dir.mkdir()
        self._image(train_dir / "train.png", 2)

        accepted = ssl_root / "accepted.png"
        self._image(accepted, 10)
        (ssl_root / "copy-of-accepted.png").write_bytes(accepted.read_bytes())
        (ssl_root / "exact-labeled.png").write_bytes(heldout_image.read_bytes())
        near = ssl_root / "near-heldout.png"
        near.write_bytes(heldout_image.read_bytes())
        with Image.open(near) as image:
            image.load()
            image.putpixel((32, 32), (255, 0, 255))
            image.save(near)
        (ssl_root / "corrupt.png").write_bytes(b"not an image")
        self._image(ssl_root / "non-banana.png", 20)
        self._image(ssl_root / "same-plant.png", 30)

        images = {
            name: self._record(source_id="external-source")
            for name in (
                "accepted.png", "copy-of-accepted.png", "exact-labeled.png",
                "near-heldout.png", "corrupt.png", "non-banana.png", "same-plant.png",
            )
        }
        images["non-banana.png"] = self._record(source_id="external-source", relevance="non_banana")
        images["same-plant.png"]["source_id"] = "public-source"
        images["same-plant.png"]["plant_id"] = "heldout-plant"
        for name, record in images.items():
            record["source_item_id"] = name
            record["original_filename"] = name
        registry = {
            "schema_version": 1,
            "registry_version": "test-registry-v1",
            "sources": [self._source(), self._source("external-source")],
            "images": images,
        }
        registry_path = workspace / "registry.json"
        registry_path.write_text(json.dumps(registry), encoding="utf-8")
        heldout_path = self._write_heldout(workspace / "ssl-exclusion.json", heldout_image)
        return workspace, ssl_root, labeled, registry_path, heldout_path

    def test_empty_inventory_reports_zero_without_claiming_target(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            ssl_root = workspace / "ssl"
            ssl_root.mkdir()
            labeled = workspace / "labeled"
            labeled.mkdir()
            registry = workspace / "registry.json"
            registry.write_text(json.dumps({
                "schema_version": 1,
                "registry_version": "empty-v1",
                "sources": [],
                "images": {},
            }), encoding="utf-8")
            payload = build_ssl_manifest(
                ssl_root, registry, labeled, None, "ai/config/ssl_ingestion_v1.json"
            )
            self.assertEqual(payload["status"], "empty")
            for field in (
                "acquired", "accepted", "rejected", "duplicate",
                "near_duplicate", "invalid", "non_banana", "total_ssl_ready",
            ):
                self.assertEqual(payload["summary"][field], 0)
            self.assertFalse(payload["summary"]["target_reached"])
            self.assertEqual(payload["summary"]["target_shortage"], 8000)

    def test_mixed_inventory_is_fail_closed_and_preserves_all_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            _workspace, ssl_root, labeled, registry, heldout = self._fixture(directory)
            before = {path.name: path.read_bytes() for path in ssl_root.iterdir()}
            payload = build_ssl_manifest(
                ssl_root, registry, labeled, heldout, "ai/config/ssl_ingestion_v1.json"
            )
            self.assertEqual(payload, build_ssl_manifest(
                ssl_root, registry, labeled, heldout, "ai/config/ssl_ingestion_v1.json"
            ))
            self.assertEqual(payload["status"], "ready_with_shortfall")
            self.assertEqual(payload["summary"]["acquired"], 7)
            self.assertEqual(payload["summary"]["accepted"], 1)
            self.assertEqual(payload["summary"]["rejected"], 6)
            self.assertEqual(payload["summary"]["duplicate"], 2)
            self.assertGreaterEqual(payload["summary"]["near_duplicate"], 1)
            self.assertEqual(payload["summary"]["invalid"], 1)
            self.assertEqual(payload["summary"]["non_banana"], 1)
            self.assertEqual(payload["summary"]["total_ssl_ready"], 1)
            self.assertFalse(payload["summary"]["target_reached"])
            self.assertEqual(
                [row["image_path"] for row in payload["ssl_ready_records"]],
                ["accepted.png"],
            )
            rows = {row["image_path"]: row for row in payload["records"]}
            self.assertIn("biological_overlap:plant_id", rows["same-plant.png"]["reason_codes"])
            self.assertTrue(any(
                reason.startswith("near_duplicate:")
                for reason in rows["near-heldout.png"]["reason_codes"]
            ))
            after = {path.name: path.read_bytes() for path in ssl_root.iterdir()}
            self.assertEqual(before, after)

            without_heldout = build_ssl_manifest(
                ssl_root, registry, labeled, None, "ai/config/ssl_ingestion_v1.json"
            )
            self.assertEqual(without_heldout["summary"]["total_ssl_ready"], 0)
            self.assertTrue(all(
                "gate:missing_frozen_heldout_exclusion" in row["reason_codes"]
                for row in without_heldout["records"]
            ))

    def test_reviewed_independent_near_matches_can_be_loaded_but_not_duplicates(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace, ssl_root, labeled, registry, heldout = self._fixture(directory)
            initial = build_ssl_manifest(
                ssl_root, registry, labeled, heldout, "ai/config/ssl_ingestion_v1.json"
            )
            reviews = {
                pair["review_key"]: {
                    "decision": "visually_similar_but_independent",
                    "reviewer": "test-reviewer",
                    "reviewed_at": "2026-08-26",
                    "evidence_note": "Synthetic independent-image decision.",
                }
                for pair in initial["near_duplicate_pairs"]
            }
            review_path = workspace / "near-reviews.json"
            review_path.write_text(json.dumps({"schema_version": 1, "reviews": reviews}), encoding="utf-8")
            payload = build_ssl_manifest(
                ssl_root, registry, labeled, heldout,
                "ai/config/ssl_ingestion_v1.json", review_path,
            )
            ready_paths = {row["image_path"] for row in payload["ssl_ready_records"]}
            self.assertEqual(ready_paths, {"accepted.png", "near-heldout.png"})
            output = write_ssl_manifest(payload, workspace / "ssl-manifest.json")
            loaded = load_ssl_dataset_records(output, ssl_root, heldout)
            self.assertEqual({Path(record.path).name for record in loaded}, ready_paths)
            self.assertTrue(all(record.label == -1 and record.class_name == "unlabeled" for record in loaded))
            self.assertNotIn("exact-labeled.png", ready_paths)

    def test_registry_rejects_disease_labels_and_unlicensed_sources(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            bad = self._record()
            bad["disease_label"] = "sigatoka"
            registry = workspace / "bad-registry.json"
            registry.write_text(json.dumps({
                "schema_version": 1,
                "registry_version": "bad-v1",
                "sources": [self._source(license_status="pending")],
                "images": {"image.png": bad},
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "disease labels"):
                load_source_registry(registry)

    def test_training_route_loads_only_manifest_ready_external_records(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            from ai.tests.test_final_split_builder import FinalSplitBuilderTest

            final_fixture = FinalSplitBuilderTest()
            paths = final_fixture._workspace(directory)
            gate, split_manifests = final_fixture._build(paths)
            self.assertEqual(gate["status"], "ready")
            assert split_manifests is not None
            split_dir = Path(directory) / "final-split"
            write_split_outputs(gate, split_manifests, split_dir)

            ssl_root = Path(directory) / "external-ssl"
            ssl_root.mkdir()
            self._image(ssl_root / "banana-leaf.png", 999)
            registry_path = Path(directory) / "external-registry.json"
            registry_path.write_text(json.dumps({
                "schema_version": 1,
                "registry_version": "training-route-v1",
                "sources": [self._source("external-source")],
                "images": {
                    "banana-leaf.png": self._record(source_id="external-source"),
                },
            }), encoding="utf-8")
            ssl_payload = build_ssl_manifest(
                ssl_root, registry_path, paths["root"],
                split_dir / "ssl_exclusion_manifest.json",
                "ai/config/ssl_ingestion_v1.json",
            )
            self.assertEqual(ssl_payload["summary"]["total_ssl_ready"], 1)
            ssl_manifest = write_ssl_manifest(ssl_payload, Path(directory) / "ssl-manifest.json")

            config = ExperimentConfig()
            config.data.dataset_dir = str(paths["root"])
            config.data.final_split_dir = str(split_dir)
            config.data.ssl_unlabeled_dir = str(ssl_root)
            config.data.ssl_manifest = str(ssl_manifest)
            splits = prepare_splits(config)
            self.assertEqual(len(splits.ssl_unlabeled), 1)
            ssl_pool = build_ssl_pretraining_records(splits)
            self.assertEqual(len(ssl_pool), len(splits.train) + 1)
            self.assertTrue({record.sha256 for record in ssl_pool}.isdisjoint(
                {record.sha256 for record in splits.validation + splits.test}
            ))


if __name__ == "__main__":
    unittest.main()
