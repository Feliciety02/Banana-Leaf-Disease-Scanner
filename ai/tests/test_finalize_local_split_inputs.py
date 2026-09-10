from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from ai.config.labels import CLASS_LABELS
from ai.data.finalize_local_split_inputs import finalize_inputs
from ai.data.metadata_manifest import enrich_metadata


class FinalizeLocalSplitInputsTest(unittest.TestCase):
    def test_declares_unknown_original_and_excludes_candidate_endpoints(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            root = workspace / "dataset"
            for class_name in CLASS_LABELS:
                (root / class_name).mkdir(parents=True)
            first = root / "cordana-leaf-spot" / "local-a.png"
            second = root / "cordana-leaf-spot" / "local-b.png"
            Image.new("RGB", (8, 8), "green").save(first)
            Image.new("RGB", (8, 8), "yellow").save(second)

            metadata = enrich_metadata(root, CLASS_LABELS, [".png"], None)
            metadata_path = workspace / "metadata.json"
            metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
            inventory_path = workspace / "inventory.json"
            inventory_path.write_text(json.dumps({
                "rejected_images": [],
                "exact_duplicate_groups": [],
            }), encoding="utf-8")
            adjudication_path = workspace / "adjudication.json"
            adjudication_path.write_text(json.dumps({
                "pairs": [{
                    "path_a": "cordana-leaf-spot/local-a.png",
                    "path_b": "cordana-leaf-spot/local-a.png",
                }],
            }), encoding="utf-8")

            finalized, groups, attestation = finalize_inputs(
                root, metadata_path, inventory_path, adjudication_path
            )

            excluded = finalized["images"]["cordana-leaf-spot/local-a.png"]
            included = finalized["images"]["cordana-leaf-spot/local-b.png"]
            self.assertEqual(excluded["inclusion_status"], "excluded")
            self.assertEqual(included["source_dataset"], "dahonmd-team-local-dataset")
            self.assertEqual(included["originality_status"], "original")
            self.assertIn("cordana-leaf-spot/local-b.png", groups)
            self.assertEqual(attestation["included_by_class"], {"cordana-leaf-spot": 1})


if __name__ == "__main__":
    unittest.main()
