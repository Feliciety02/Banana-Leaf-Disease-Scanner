from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from ai.config.config import ExperimentConfig
from ai.config.labels import CLASS_LABELS
from ai.data.dataset import prepare_splits
from ai.data.image_fingerprints import flip_aware_difference_hash
from ai.data.metadata_manifest import enrich_metadata, write_manifest
from ai.data.near_duplicate_adjudication import apply_decisions, generate_manifest


class NearDuplicateAdjudicationTest(unittest.TestCase):
    def _write_pattern(self, path: Path, offset: int, changed_pixel: int | None = None) -> None:
        image = Image.new("RGB", (16, 16))
        pixels = image.load()
        for y in range(16):
            for x in range(16):
                value = (x * 11 + y * 7 + offset) % 256
                pixels[x, y] = (value, (value * 3) % 256, (value * 5) % 256)
        if changed_pixel is not None:
            pixels[changed_pixel % 16, changed_pixel // 16] = (255, 0, changed_pixel)
        image.save(path)

    def _dataset(self, workspace: Path) -> tuple[Path, list[str]]:
        root = workspace / "dataset"
        for class_index, class_name in enumerate(CLASS_LABELS):
            class_dir = root / class_name
            class_dir.mkdir(parents=True)
            for index in range(5):
                self._write_pattern(class_dir / f"base-{index}.png", class_index * 31 + index * 9)
        related = ["healthy/related-a.png", "healthy/related-b.png", "healthy/related-c.png"]
        self._write_pattern(root / related[0], 4)
        self._write_pattern(root / related[1], 4, 1)
        self._write_pattern(root / related[2], 4, 2)
        return root, related

    def _report(self, root: Path, pairs: list[tuple[str, str]], destination: Path) -> Path:
        rows = []
        for left, right in pairs:
            with Image.open(root / left) as image_a, Image.open(root / right) as image_b:
                hash_a = flip_aware_difference_hash(image_a.convert("RGB"))
                hash_b = flip_aware_difference_hash(image_b.convert("RGB"))
            rows.append({
                "review_key": "||".join(sorted((left, right))),
                "path_a": left,
                "path_b": right,
                "class_a": left.split("/", 1)[0],
                "class_b": right.split("/", 1)[0],
                "hamming_distance": (hash_a ^ hash_b).bit_count(),
                "requires_review": True,
                "review": None,
            })
        destination.write_text(json.dumps({
            "near_duplicate_method": {"hamming_distance_threshold": 6},
            "near_duplicate_pairs": rows,
        }), encoding="utf-8")
        return destination

    def _metadata(self, root: Path, destination: Path) -> Path:
        payload = enrich_metadata(root, CLASS_LABELS, [".png"], None)
        return write_manifest(payload, destination)

    def test_confirmed_transitive_relations_share_one_split_without_image_changes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            root, related = self._dataset(workspace)
            before = {relative: (root / relative).read_bytes() for relative in related}
            report = self._report(root, [(related[0], related[1]), (related[1], related[2])], workspace / "inventory.json")
            metadata = self._metadata(root, workspace / "metadata.json")
            adjudication = workspace / "adjudication.json"
            payload = generate_manifest(root, report, metadata, adjudication, workspace / "review.csv")
            self.assertEqual(payload["summary"]["candidate_components"], 1)
            for pair in payload["pairs"]:
                pair.update({
                    "decision": "same_leaf_or_related_capture",
                    "reviewer": "qualified-reviewer",
                    "reviewed_at": "2026-08-26",
                    "evidence_note": "Synthetic fixture confirms one related capture sequence.",
                })
            adjudication.write_text(json.dumps(payload), encoding="utf-8")
            group_manifest = workspace / "groups.json"
            summary = apply_decisions(
                adjudication, root, None, group_manifest, workspace / "summary.json"
            )
            groups = json.loads(group_manifest.read_text(encoding="utf-8"))
            self.assertEqual(len({groups[path] for path in related}), 1)
            self.assertEqual(summary["shared_group_images"], 3)
            self.assertEqual(summary["labels_changed"], 0)
            self.assertEqual(summary["images_deleted_moved_or_rewritten"], 0)

            config = ExperimentConfig()
            config.data.dataset_dir = str(root)
            config.data.group_manifest = str(group_manifest)
            config.data.require_complete_metadata = False
            config.data.require_near_duplicate_review = False
            splits = prepare_splits(config, workspace / "split.json")
            assigned = {
                split_name
                for split_name in ("train", "validation", "test")
                for record in getattr(splits, split_name)
                if Path(record.path).relative_to(root).as_posix() in related
            }
            self.assertEqual(len(assigned), 1)
            self.assertEqual(before, {relative: (root / relative).read_bytes() for relative in related})

    def test_unresolved_cross_label_pair_blocks_application_and_preserves_labels(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            root, related = self._dataset(workspace)
            cross_path = "sigatoka/cross.png"
            (root / cross_path).write_bytes((root / related[0]).read_bytes())
            report = self._report(root, [(related[0], cross_path)], workspace / "inventory.json")
            metadata = self._metadata(root, workspace / "metadata.json")
            adjudication = workspace / "adjudication.json"
            payload = generate_manifest(root, report, metadata, adjudication)
            self.assertEqual(payload["pairs"][0]["priority"], "high")
            output_groups = workspace / "groups.json"
            with self.assertRaisesRegex(ValueError, "High-risk cross-label"):
                apply_decisions(adjudication, root, None, output_groups, workspace / "summary.json")
            self.assertFalse(output_groups.exists())
            self.assertTrue((root / related[0]).is_file())
            self.assertTrue((root / cross_path).is_file())
            self.assertEqual(payload["pairs"][0]["class_a"], "healthy")
            self.assertEqual(payload["pairs"][0]["class_b"], "sigatoka")


if __name__ == "__main__":
    unittest.main()
