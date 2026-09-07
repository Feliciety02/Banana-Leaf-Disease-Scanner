"""Regression tests for stable ResNet-101 diagnostic fine-tuning."""

from __future__ import annotations

import unittest

import tensorflow as tf

from ai.config.config import ExperimentConfig, load_config
from ai.data.dataset import ImageRecord
from ai.training.teacher_protocol import _record_fingerprint
from ai.training.train_teacher import configure_finetune_stage


def _small_classifier() -> tuple[tf.keras.Model, tf.keras.Model]:
    backbone_input = tf.keras.Input((4,), name="backbone_input")
    hidden = tf.keras.layers.Dense(4, name="backbone_dense")(backbone_input)
    hidden = tf.keras.layers.BatchNormalization(name="backbone_bn")(hidden)
    backbone = tf.keras.Model(backbone_input, hidden, name="resnet101_test_backbone")

    inputs = tf.keras.Input((4,), name="image")
    features = backbone(inputs)
    logits = tf.keras.layers.Dense(4, name="finetune_logits")(features)
    classifier = tf.keras.Model(
        inputs,
        {
            "logits": logits,
            "features": features,
            "feature_map": tf.keras.layers.Reshape((1, 1, 4))(features),
        },
        name="resnet101_classifier",
    )
    return classifier, backbone


class TeacherDiagnosticConfigTest(unittest.TestCase):
    def test_diagnostic_configs_enable_stable_schedule(self) -> None:
        for path, ssl_enabled in (
            ("ai/config/diagnostics/resnet101_imagenet_frozen_bn.json", False),
            ("ai/config/diagnostics/resnet101_ssl_frozen_bn.json", True),
        ):
            with self.subTest(path=path):
                config = load_config(path)
                self.assertEqual(config.teacher.ssl_enabled, ssl_enabled)
                self.assertEqual(config.teacher.head_warmup_epochs, 5)
                self.assertTrue(config.teacher.freeze_batch_norm_during_finetune)
                self.assertEqual(config.data.final_split_dir, "ai/artifacts/final_split")

    def test_invalid_warmup_length_is_rejected(self) -> None:
        config = ExperimentConfig()
        config.teacher.finetune_epochs = 5
        config.teacher.head_warmup_epochs = 5
        with self.assertRaisesRegex(ValueError, "smaller than"):
            config.validate()


class FineTuneStageTest(unittest.TestCase):
    def test_head_warmup_freezes_entire_backbone(self) -> None:
        classifier, backbone = _small_classifier()

        info = configure_finetune_stage(
            classifier,
            head_only=True,
            freeze_batch_norm=True,
        )

        self.assertFalse(backbone.trainable)
        self.assertEqual(info["stage"], "head_warmup")
        self.assertEqual(info["trainable_variables"], 2)

    def test_backbone_finetune_keeps_batch_norm_frozen(self) -> None:
        classifier, backbone = _small_classifier()
        configure_finetune_stage(classifier, head_only=True, freeze_batch_norm=True)

        info = configure_finetune_stage(
            classifier,
            head_only=False,
            freeze_batch_norm=True,
        )

        self.assertTrue(backbone.trainable)
        self.assertTrue(backbone.get_layer("backbone_dense").trainable)
        self.assertFalse(backbone.get_layer("backbone_bn").trainable)
        self.assertEqual(info["stage"], "backbone_finetune")
        self.assertEqual(info["frozen_batch_norm_layers"], 1)


class PartitionFingerprintTest(unittest.TestCase):
    def test_record_fingerprint_is_order_independent(self) -> None:
        first = ImageRecord("a.jpg", 0, "healthy", "sha-a", "group-a")
        second = ImageRecord("b.jpg", 1, "sigatoka", "sha-b", "group-b")

        self.assertEqual(
            _record_fingerprint([first, second]),
            _record_fingerprint([second, first]),
        )


if __name__ == "__main__":
    unittest.main()
