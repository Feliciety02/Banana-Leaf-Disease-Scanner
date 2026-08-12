from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from ai.deployment.comparison_service import _required_artifacts, health


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


if __name__ == "__main__":
    unittest.main()
