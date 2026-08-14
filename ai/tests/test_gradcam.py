from __future__ import annotations

import unittest

import numpy as np
import tensorflow as tf

from ai.evaluation.gradcam import gradcam_heatmap


class GradCamCompatibilityTest(unittest.TestCase):
    def test_nested_backbone_output_stays_connected_under_keras_three(self) -> None:
        backbone_input = tf.keras.Input((8, 8, 3))
        features = tf.keras.layers.Conv2D(4, 3, name="features")(backbone_input)
        backbone = tf.keras.Model(backbone_input, features, name="nested_backbone")

        image = tf.keras.Input((8, 8, 3))
        feature_map = backbone(image)
        pooled = tf.keras.layers.GlobalAveragePooling2D()(feature_map)
        logits = tf.keras.layers.Dense(2)(pooled)
        model = tf.keras.Model(image, logits)

        heatmap = gradcam_heatmap(
            model,
            tf.ones((8, 8, 3), dtype=tf.float32),
            predicted_class=0,
            layer_name="nested_backbone",
        )

        self.assertEqual(heatmap.shape, (6, 6))
        self.assertTrue(np.isfinite(heatmap).all())


if __name__ == "__main__":
    unittest.main()
