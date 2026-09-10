from __future__ import annotations

import unittest

from ai.data.apply_expert_validation import apply_attestation
from ai.data.metadata_manifest import THESIS_FIELDS


def record(path: str) -> dict[str, object]:
    item: dict[str, object] = {field: "unknown" for field in THESIS_FIELDS}
    item.update({
        "image_path": path,
        "canonical_class": path.split("/", 1)[0],
        "expert_validated": "pending",
        "label_review_status": "pending",
        "label_validator": "unknown",
        "field_provenance": {},
    })
    return item


class ExpertValidationAttestationTest(unittest.TestCase):
    def test_only_usable_nonduplicate_records_are_validated(self) -> None:
        metadata = {"images": {
            "healthy/a.jpg": record("healthy/a.jpg"),
            "healthy/b.jpg": record("healthy/b.jpg"),
            "healthy/c.jpg": record("healthy/c.jpg"),
        }}
        report = {
            "summary": {"scanned": 3, "accepted": 1},
            "rejected_images": [{"path": "healthy/b.jpg"}],
            "exact_duplicate_groups": [{
                "kept": "healthy/a.jpg",
                "excluded_copies": ["healthy/c.jpg"],
            }],
            "cross_label_exact_conflicts": [],
        }

        updated, attestation = apply_attestation(
            metadata, report, "expert-reviewer-01", "2026-09-09", "User attestation."
        )

        self.assertEqual(updated["images"]["healthy/a.jpg"]["expert_validated"], "validated")
        self.assertEqual(updated["images"]["healthy/a.jpg"]["label_validator"], "expert-reviewer-01")
        self.assertEqual(updated["images"]["healthy/a.jpg"]["qc_status"], "approved")
        self.assertEqual(updated["images"]["healthy/a.jpg"]["species_review_status"], "banana")
        self.assertEqual(updated["images"]["healthy/a.jpg"]["visibility_quality_status"], "acceptable")
        self.assertEqual(updated["images"]["healthy/a.jpg"]["inclusion_status"], "included")
        self.assertEqual(updated["images"]["healthy/b.jpg"]["expert_validated"], "pending")
        self.assertEqual(updated["images"]["healthy/c.jpg"]["expert_validated"], "pending")
        self.assertEqual(updated["images"]["healthy/b.jpg"]["inclusion_status"], "excluded")
        self.assertEqual(updated["images"]["healthy/c.jpg"]["qc_status"], "excluded")
        self.assertEqual(attestation["validated_record_count"], 1)
        self.assertEqual(attestation["excluded_record_count"], 2)
        self.assertEqual(attestation["unreadable_or_rejected_record_count"], 1)
        self.assertEqual(attestation["exact_duplicate_copy_count"], 1)

    def test_inventory_mismatch_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "different inventories"):
            apply_attestation(
                {"images": {"healthy/a.jpg": record("healthy/a.jpg")}},
                {"summary": {"scanned": 2, "accepted": 1}},
                "expert-reviewer-01",
                "2026-09-09",
                "User attestation.",
            )


if __name__ == "__main__":
    unittest.main()
