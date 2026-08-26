from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from ai.config.labels import CLASS_LABELS
from ai.data.metadata_manifest import (
    THESIS_FIELDS,
    enrich_metadata,
    formal_metadata_issues,
    load_manifest_payload,
    validation_report,
    write_manifest,
)


class MetadataEnrichmentTest(unittest.TestCase):
    def _inventory(self, workspace: Path) -> Path:
        root = workspace / "dataset"
        for class_name in CLASS_LABELS:
            (root / class_name).mkdir(parents=True)
        (root / "healthy" / "healthy-zenodo-0001.jpg").write_bytes(b"known")
        (root / "sigatoka" / "mystery.jpg").write_bytes(b"unknown")
        return root

    def test_enrichment_is_deterministic_and_does_not_invent_field_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            root = self._inventory(workspace)
            groups = workspace / "groups.json"
            groups.write_text(
                json.dumps({"healthy/healthy-zenodo-0001.jpg": "reviewed-leaf-1"}),
                encoding="utf-8",
            )
            first = enrich_metadata(
                root, CLASS_LABELS, ["dead"], [".jpg"], None, groups, None
            )
            second = enrich_metadata(
                root, CLASS_LABELS, ["dead"], [".jpg"], None, groups, None
            )
            self.assertEqual(first, second)
            known = first["images"]["healthy/healthy-zenodo-0001.jpg"]
            self.assertEqual(known["source_dataset"], "zenodo-tanzania-7670326")
            self.assertEqual(known["original_label"], "HEALTHY")
            self.assertEqual(known["location"], "Tanzania (source-level)")
            self.assertEqual(known["group_id"], "reviewed-leaf-1")
            self.assertEqual(known["plant_id"], "unknown")
            self.assertEqual(known["leaf_id"], "unknown")
            self.assertEqual(known["acquisition_session"], "unknown")
            self.assertEqual(known["expert_validated"], "pending")
            unresolved = first["images"]["sigatoka/mystery.jpg"]
            self.assertEqual(unresolved["source_dataset"], "unknown")
            self.assertEqual(unresolved["group_id"], "pending")

    def test_schema_round_trip_and_fingerprint_tampering_fail_formal_gate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            root = self._inventory(workspace)
            payload = enrich_metadata(root, CLASS_LABELS, ["dead"], [".jpg"], None)
            manifest = write_manifest(payload, workspace / "metadata.json")
            loaded = load_manifest_payload(manifest)
            relative = "healthy/healthy-zenodo-0001.jpg"
            record = loaded[relative]
            self.assertTrue(all(field in record for field in THESIS_FIELDS))
            record["canonical_class"] = "sigatoka"
            issues = formal_metadata_issues(relative, record, CLASS_LABELS)
            self.assertIn("mismatch:canonical_class", issues)
            self.assertIn("mismatch:record_fingerprint", issues)

    def test_formal_gate_accepts_unknown_optional_capture_fields_but_not_pending_reviews(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            root = self._inventory(workspace)
            payload = enrich_metadata(root, CLASS_LABELS, ["dead"], [".jpg"], None)
            relative = "healthy/healthy-zenodo-0001.jpg"
            record = copy.deepcopy(payload["images"][relative])
            issues = formal_metadata_issues(relative, record, CLASS_LABELS)
            self.assertIn("unresolved:expert_validated", issues)
            self.assertIn("unresolved:group_id", issues)
            self.assertNotIn("unresolved:capture_device", issues)
            report, missing, unresolved = validation_report(
                root,
                [root / "healthy" / "healthy-zenodo-0001.jpg"],
                {relative: record},
            )
            self.assertEqual(missing, 0)
            self.assertEqual(unresolved, 1)
            self.assertEqual(report["summary"]["schema_complete_records"], 1)

    def test_enrichment_never_changes_or_deletes_inventory_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            workspace = Path(directory)
            root = self._inventory(workspace)
            before = {path.relative_to(root): path.read_bytes() for path in root.rglob("*.jpg")}
            enrich_metadata(root, CLASS_LABELS, ["dead"], [".jpg"], None)
            after = {path.relative_to(root): path.read_bytes() for path in root.rglob("*.jpg")}
            self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
