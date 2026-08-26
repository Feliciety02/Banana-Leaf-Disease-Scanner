import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from ai.config.config import ExperimentConfig
from ai.config.labels import CLASS_LABELS
from ai.data.dataset import prepare_splits


class DatasetManifestInventoryTest(unittest.TestCase):
    def _allow_synthetic_exploration(self, config: ExperimentConfig) -> None:
        config.data.require_near_duplicate_review = False
        config.data.require_complete_metadata = False

    def _make_minimum_dataset(self, root: Path) -> None:
        for class_index, class_name in enumerate(CLASS_LABELS):
            class_dir = root / class_name
            class_dir.mkdir(parents=True)
            for image_index in range(3):
                Image.new(
                    "RGB",
                    (4, 4),
                    (class_index * 30, image_index * 40, class_index * 30 + image_index),
                ).save(class_dir / f"{image_index}.png")

    def test_existing_manifest_rejects_new_images(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            dataset = workspace / "dataset"
            for class_index, class_name in enumerate(CLASS_LABELS):
                class_dir = dataset / class_name
                class_dir.mkdir(parents=True)
                for image_index in range(3):
                    Image.new(
                        "RGB",
                        (4, 4),
                        (class_index * 30, image_index * 40, class_index * 30 + image_index),
                    ).save(class_dir / f"{image_index}.png")

            config = ExperimentConfig()
            self._allow_synthetic_exploration(config)
            config.data.dataset_dir = str(dataset)
            config.data.group_manifest = None
            config.data.verify_images = True
            manifest = workspace / "split_manifest.json"

            prepare_splits(config, manifest)
            Image.new("RGB", (4, 4), (255, 254, 253)).save(dataset / "healthy" / "new.png")

            with self.assertRaisesRegex(ValueError, "Dataset inventory changed"):
                prepare_splits(config, manifest)

    def test_invalid_images_are_rejected_and_reported_before_splitting(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            dataset = workspace / "dataset"
            self._make_minimum_dataset(dataset)
            (dataset / "healthy" / "corrupt.png").write_bytes(b"not an image")
            invalid_class = dataset / "dead"
            invalid_class.mkdir()
            Image.new("RGB", (4, 4), (1, 2, 3)).save(invalid_class / "dead.png")
            Image.new("L", (4, 4), 128).save(dataset / "healthy" / "grayscale.png")

            config = ExperimentConfig()
            self._allow_synthetic_exploration(config)
            config.data.dataset_dir = str(dataset)
            manifest = workspace / "split.json"
            splits = prepare_splits(config, manifest)

            report = json.loads((workspace / "image_validation_report.json").read_text(encoding="utf-8"))
            self.assertEqual(report["summary"]["scanned"], 15)
            self.assertEqual(report["summary"]["accepted"], 13)
            self.assertEqual(report["summary"]["rejected"], 1)
            self.assertEqual(report["summary"]["quarantined"], 1)
            self.assertEqual(report["summary"]["rejected_by_reason"]["unreadable_image"], 1)
            self.assertNotIn("dead", splits.class_names)
            self.assertTrue(
                any(Path(record.path).name == "grayscale.png" for record in splits.train + splits.validation + splits.test)
            )

    def test_formal_gate_blocks_incomplete_metadata_and_near_duplicate_review(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            dataset = workspace / "dataset"
            self._make_minimum_dataset(dataset)
            config = ExperimentConfig()
            config.data.dataset_dir = str(dataset)

            with self.assertRaisesRegex(ValueError, "Formal split gate failed"):
                prepare_splits(config, workspace / "split.json")

            self.assertFalse((workspace / "split.json").exists())
            self.assertTrue((workspace / "image_validation_report.json").is_file())
            self.assertTrue((workspace / "metadata_coverage_report.json").is_file())

    def test_same_label_exact_copy_is_reported_and_excluded_without_deletion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            dataset = workspace / "dataset"
            self._make_minimum_dataset(dataset)
            original = dataset / "healthy" / "0.png"
            duplicate = dataset / "healthy" / "copy.png"
            duplicate.write_bytes(original.read_bytes())
            config = ExperimentConfig()
            self._allow_synthetic_exploration(config)
            config.data.dataset_dir = str(dataset)

            splits = prepare_splits(config, workspace / "split.json")
            report = json.loads((workspace / "image_validation_report.json").read_text(encoding="utf-8"))

            self.assertTrue(original.is_file())
            self.assertTrue(duplicate.is_file())
            self.assertEqual(report["summary"]["exact_duplicate_copies_excluded"], 1)
            self.assertEqual(len(splits.train + splits.validation + splits.test), 12)

    def test_designated_ssl_inventory_rejects_primary_overlap(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            dataset = workspace / "dataset"
            self._make_minimum_dataset(dataset)
            unlabeled = workspace / "ssl-unlabeled"
            unlabeled.mkdir()
            (unlabeled / "copy.png").write_bytes((dataset / "healthy" / "0.png").read_bytes())
            config = ExperimentConfig()
            self._allow_synthetic_exploration(config)
            config.data.dataset_dir = str(dataset)
            config.data.ssl_unlabeled_dir = str(unlabeled)

            with self.assertRaisesRegex(ValueError, "External dataset exact overlap"):
                prepare_splits(config, workspace / "split.json")

            overlap = json.loads((workspace / "external_overlap_report.json").read_text(encoding="utf-8"))
            self.assertEqual(len(overlap["exact_cross_inventory_overlaps"]), 1)
            self.assertFalse((workspace / "split.json").exists())

    def test_related_images_are_assigned_to_one_split(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            dataset = workspace / "dataset"
            for class_index, class_name in enumerate(CLASS_LABELS):
                class_dir = dataset / class_name
                class_dir.mkdir(parents=True)
                for image_index in range(5):
                    Image.new(
                        "RGB",
                        (4, 4),
                        (class_index * 30, image_index * 35, class_index * 20 + image_index),
                    ).save(class_dir / f"{image_index}.png")

            group_manifest = workspace / "groups.json"
            group_manifest.write_text(
                json.dumps(
                    {
                        "healthy/0.png": "healthy-same-leaf",
                        "healthy/1.png": "healthy-same-leaf",
                    }
                ),
                encoding="utf-8",
            )
            config = ExperimentConfig()
            self._allow_synthetic_exploration(config)
            config.data.dataset_dir = str(dataset)
            config.data.group_manifest = str(group_manifest)

            splits = prepare_splits(config, workspace / "split.json")
            assigned_splits = {
                split_name
                for split_name in ("train", "validation", "test")
                for record in getattr(splits, split_name)
                if record.group_id == "healthy-same-leaf"
            }

            self.assertEqual(len(assigned_splits), 1)
            self.assertEqual(
                sum(
                    record.group_id == "healthy-same-leaf"
                    for split_name in ("train", "validation", "test")
                    for record in getattr(splits, split_name)
                ),
                2,
            )

    def test_presplit_dataset_rejects_group_leakage(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            dataset = workspace / "dataset"
            for split_index, split_name in enumerate(("train", "validation", "test")):
                for class_index, class_name in enumerate(CLASS_LABELS):
                    class_dir = dataset / split_name / class_name
                    class_dir.mkdir(parents=True)
                    Image.new(
                        "RGB",
                        (4, 4),
                        (split_index * 70, class_index * 35, split_index + class_index),
                    ).save(class_dir / "image.png")

            group_manifest = workspace / "groups.json"
            group_manifest.write_text(
                json.dumps(
                    {
                        "train/healthy/image.png": "leaked-leaf",
                        "test/healthy/image.png": "leaked-leaf",
                    }
                ),
                encoding="utf-8",
            )
            config = ExperimentConfig()
            self._allow_synthetic_exploration(config)
            config.data.dataset_dir = str(dataset)
            config.data.group_manifest = str(group_manifest)

            with self.assertRaisesRegex(ValueError, "Data leakage detected: group 'leaked-leaf'"):
                prepare_splits(config, workspace / "split.json")


if __name__ == "__main__":
    unittest.main()
