from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from ai.deployment.comparison_service import _required_artifacts, _study_summary, health


class ComparisonServiceTest(unittest.TestCase):
    @patch.dict(os.environ, {
        "DAHONMD_BASELINE_TFLITE": "",
        "DAHONMD_ENHANCED_TFLITE": "",
        "DAHONMD_LABEL_MAP": "",
    })
    def test_missing_artifacts_are_reported_without_fake_readiness(self) -> None:
        with self.assertRaises(HTTPException) as context:
            _required_artifacts()
        self.assertEqual(context.exception.status_code, 503)
        self.assertEqual(health()["status"], "unconfigured")

    def test_study_summary_names_the_reported_macro_f1_leader(self) -> None:
        report = {
            "metrics": {
                "accuracy": {"baseline": 0.91, "enhanced": 0.96},
                "macro_f1": {"baseline": 0.90, "enhanced": 0.96},
            }
        }
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / "comparison.json"
            report_path.write_text(json.dumps(report), encoding="utf-8")
            with patch.dict(os.environ, {"DAHONMD_MODEL_COMPARISON_REPORT": str(report_path)}):
                summary = _study_summary()

        self.assertIsNotNone(summary)
        self.assertEqual(summary["current_leader"], "enhanced")
        self.assertIn("proposed CA-MobileNetV3-Small leads", summary["decision_note"])

    def test_obsolete_label_map_keeps_service_unconfigured(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline = root / "baseline.tflite"
            enhanced = root / "enhanced.tflite"
            label_map = root / "label_map.json"
            baseline.write_bytes(b"fixture")
            enhanced.write_bytes(b"fixture")
            label_map.write_text(json.dumps({
                "0": "healthy", "1": "dead", "2": "black-sigatoka",
                "3": "yellow-sigatoka", "4": "cordana-leaf-spot",
            }), encoding="utf-8")
            with patch.dict(os.environ, {
                "DAHONMD_BASELINE_TFLITE": str(baseline),
                "DAHONMD_ENHANCED_TFLITE": str(enhanced),
                "DAHONMD_LABEL_MAP": str(label_map),
            }):
                with self.assertRaises(HTTPException) as context:
                    _required_artifacts()

        self.assertEqual(context.exception.status_code, 503)
        self.assertIn("obsolete", context.exception.detail)


if __name__ == "__main__":
    unittest.main()
