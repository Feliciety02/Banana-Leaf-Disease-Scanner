from __future__ import annotations

import json
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

from ai.config.config import ExperimentConfig
from ai.config.labels import CLASS_LABELS
from ai.evaluation.compare_models import compare


class BaselineConfigurationTest(unittest.TestCase):
    def test_baseline_uses_same_variant_and_output_contract_as_enhanced(self) -> None:
        config = ExperimentConfig()

        self.assertEqual(config.student.backbone, "MobileNetV3SmallCoordinateAttention")
        self.assertEqual(config.baseline.backbone, "MobileNetV3Small")
        self.assertEqual(tuple(config.data.class_names), CLASS_LABELS)
        self.assertEqual(config.image_size, (224, 224))

    def test_large_baseline_is_rejected(self) -> None:
        config = ExperimentConfig()
        config.baseline.backbone = "MobileNetV3Large"

        with self.assertRaisesRegex(ValueError, "same MobileNetV3-Small variant"):
            config.validate()


class EvaluationComparisonTest(unittest.TestCase):
    def _report(self, model: str, contract: dict) -> dict:
        return {
            "model": model,
            "accuracy": 0.5,
            "macro_precision": 0.5,
            "macro_recall": 0.5,
            "macro_f1": 0.5,
            "per_class": {
                label: {"precision": 0.5, "recall": 0.5, "f1": 0.5, "support": 2}
                for label in CLASS_LABELS
            },
            "resources": {},
            "experiment_contract": contract,
        }

    def test_report_comparison_requires_identical_contracts(self) -> None:
        contract = {
            "mobilenet_variant": "MobileNetV3Small",
            "input_height": 224,
            "input_width": 224,
            "input_color": "RGB",
            "input_dtype": "float32",
            "input_range": [0.0, 1.0],
            "class_names": list(CLASS_LABELS),
            "split_manifest_sha256": "same-split",
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline_path = root / "baseline.json"
            enhanced_path = root / "enhanced.json"
            output_path = root / "comparison.json"
            baseline_path.write_text(json.dumps(self._report("baseline", contract)), encoding="utf-8")
            changed = {**contract, "split_manifest_sha256": "different-split"}
            enhanced_path.write_text(json.dumps(self._report("enhanced", changed)), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "contracts differ"):
                compare(Namespace(baseline_report=str(baseline_path), enhanced_report=str(enhanced_path), output=str(output_path)))


if __name__ == "__main__":
    unittest.main()
