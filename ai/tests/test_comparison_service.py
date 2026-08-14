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


if __name__ == "__main__":
    unittest.main()
