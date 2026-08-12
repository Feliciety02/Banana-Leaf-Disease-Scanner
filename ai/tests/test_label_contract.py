from __future__ import annotations

import unittest
from pathlib import Path

from ai.config.config import ExperimentConfig
from ai.config.labels import CLASS_DISPLAY_NAMES, CLASS_LABELS
from ai.data.dataset import _validate_class_directories


class LabelContractTest(unittest.TestCase):
    def test_fixed_output_order_and_display_names(self) -> None:
        config = ExperimentConfig()

        self.assertEqual(tuple(config.data.class_names), CLASS_LABELS)
        self.assertEqual(config.data.num_classes, len(CLASS_LABELS))
        self.assertEqual(
            [CLASS_DISPLAY_NAMES[label] for label in CLASS_LABELS],
            ["Healthy", "Moko disease", "Black Sigatoka", "Yellow Sigatoka", "Cordana leaf spot"],
        )

    def test_configuration_cannot_override_final_classes(self) -> None:
        config = ExperimentConfig()
        config.data.class_names = (*CLASS_LABELS[:-1], "unexpected-class")

        with self.assertRaisesRegex(ValueError, "output-index order are fixed"):
            config.validate()

    def test_dataset_directories_must_match_contract(self) -> None:
        valid = {name: Path(name) for name in reversed(CLASS_LABELS)}
        self.assertEqual(_validate_class_directories(valid, CLASS_LABELS, Path("dataset")), list(CLASS_LABELS))

        invalid = dict(valid)
        invalid.pop("moko-disease")
        invalid["not-moko"] = Path("not-moko")
        with self.assertRaisesRegex(ValueError, "moko-disease"):
            _validate_class_directories(invalid, CLASS_LABELS, Path("dataset"))


if __name__ == "__main__":
    unittest.main()
