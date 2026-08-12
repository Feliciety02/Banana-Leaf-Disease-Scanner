from __future__ import annotations

import unittest

from ai.config.config import ExperimentConfig


class BaselineModelTest(unittest.TestCase):
    def test_stock_small_model_uses_shared_input_and_five_logits(self) -> None:
        from ai.models.mobilenetv3_baseline import BASELINE_BACKBONE_NAME, BASELINE_MODEL_NAME, build_baseline

        config = ExperimentConfig()
        config.baseline.imagenet_weights = False
        model, backbone = build_baseline(config)

        self.assertEqual(model.name, BASELINE_MODEL_NAME)
        self.assertEqual(backbone.name, BASELINE_BACKBONE_NAME)
        self.assertEqual(tuple(model.input_shape[1:]), (224, 224, 3))
        self.assertEqual(model.output_shape, (None, 5))
        normalization = model.get_layer("baseline_input_normalization")
        self.assertEqual(float(normalization.scale), 2.0)
        self.assertEqual(float(normalization.offset), -1.0)
        self.assertNotIn("coordinate_attention", " ".join(layer.name for layer in model.layers))


if __name__ == "__main__":
    unittest.main()
