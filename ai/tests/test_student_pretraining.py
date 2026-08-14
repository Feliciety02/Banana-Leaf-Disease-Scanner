from __future__ import annotations

import unittest

import numpy as np

from ai.config.config import ExperimentConfig
from ai.models.mobilenetv3_student import build_student, initialize_shared_backbone_from_mobilenetv3


class StudentPretrainingTest(unittest.TestCase):
    def test_shared_stock_layers_transfer_without_touching_attention(self) -> None:
        config = ExperimentConfig()
        student = build_student(config)
        stem = student.get_layer("stem_conv")
        stem.set_weights([np.zeros_like(stem.get_weights()[0])])

        transferred = initialize_shared_backbone_from_mobilenetv3(student, config, weights=None)

        self.assertEqual(len(transferred), 68)
        self.assertIn("stem_conv", transferred)
        self.assertIn("final_bn", transferred)
        self.assertFalse(np.allclose(stem.get_weights()[0], 0.0))
        attention = student.get_layer("coordinate_attention")
        self.assertTrue(np.allclose(attention.height_conv.get_weights()[0], 0.0))
        self.assertTrue(np.all(np.isfinite(attention.height_conv.get_weights()[1])))
        self.assertFalse(np.allclose(attention.height_conv.get_weights()[1], 0.881))


if __name__ == "__main__":
    unittest.main()
