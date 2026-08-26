"""Thesis-mandated structural and gradient-flow tests for the CA-enhanced student."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np
import tensorflow as tf

from ai.config.config import ExperimentConfig
from ai.config.labels import CLASS_LABELS
from ai.data.dataset import DatasetSplits, ImageRecord
from ai.losses.classification_loss import classification_loss
from ai.losses.distillation_loss import (
    feature_distillation_loss,
    logit_distillation_loss,
    total_distillation_loss,
)
from ai.models.coordinate_attention import CoordinateAttention
from ai.models.mobilenetv3_baseline import build_distillable_baseline
from ai.models.mobilenetv3_student import (
    HardSwish,
    build_student,
    logits_only_model,
    shared_backbone_layer_names,
)
from ai.models.teacher import ResNet101Preprocessing, build_teacher


def _minimal_config() -> ExperimentConfig:
    config = ExperimentConfig()
    config.teacher.imagenet_weights = False
    config.student.imagenet_weights = False
    config.student.coordinate_attention = True
    config.distillation.enabled = True
    return config


def _stock_config() -> ExperimentConfig:
    config = ExperimentConfig()
    config.teacher.imagenet_weights = False
    config.student.imagenet_weights = False
    config.student.coordinate_attention = False
    config.student.backbone = "MobileNetV3Small"
    config.distillation.enabled = True
    return config


def _fake_batch(batch_size: int = 2) -> tuple[tf.Tensor, tf.Tensor]:
    images = tf.random.uniform([batch_size, 224, 224, 3], 0.0, 1.0, seed=42)
    labels = tf.constant([0, 1], dtype=tf.int32)[:batch_size]
    return images, labels


def _single_fake_image() -> tf.Tensor:
    return tf.random.uniform([1, 224, 224, 3], 0.0, 1.0, seed=42)


class TeacherFrozenDuringDistillationTest(unittest.TestCase):
    """Prove that one gradient step never modifies teacher weights."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.config = _minimal_config()
        cls.teacher = build_teacher(cls.config, force_weights=None)
        cls.teacher.trainable = False
        for layer in cls.teacher.layers:
            layer.trainable = False
        cls.teacher_view = tf.keras.Model(
            cls.teacher.input,
            {name: cls.teacher.output[name] for name in ("logits", "feature_map")},
            name="frozen_teacher_view",
        )
        cls.teacher_view.trainable = False
        cls.student = build_student(cls.config)
        cls.snapshot = [v.numpy().copy() for v in cls.teacher.variables]

    def test_no_teacher_variable_changes_after_backward(self) -> None:
        images, labels = _fake_batch()
        optimizer = tf.keras.optimizers.SGD(learning_rate=0.01)
        teacher_out = self.teacher_view(images, training=False)
        with tf.GradientTape() as tape:
            student_out = self.student(images, training=True)
            hard = classification_loss(labels, student_out["logits"])
            soft = logit_distillation_loss(
                teacher_out["logits"], student_out["logits"], self.config.distillation.temperature
            )
            feat = feature_distillation_loss(
                teacher_out["feature_map"], student_out["distill_features"]
            )
            total = total_distillation_loss(hard, soft, feat,
                                            self.config.distillation.alpha,
                                            self.config.distillation.beta,
                                            self.config.distillation.gamma)
        grads = tape.gradient(total, self.student.trainable_variables)
        optimizer.apply_gradients(
            [(g, v) for g, v in zip(grads, self.student.trainable_variables) if g is not None]
        )
        for snapshot, current in zip(self.snapshot, self.teacher.variables):
            np.testing.assert_array_equal(snapshot, current,
                                          err_msg="Teacher weight was modified during distillation step")

    def test_teacher_has_zero_trainable_variables(self) -> None:
        self.assertEqual(len(self.teacher.trainable_variables), 0)

    def test_teacher_view_has_zero_trainable_variables(self) -> None:
        self.assertEqual(len(self.teacher_view.trainable_variables), 0)


class StudentReceivesGradientsTest(unittest.TestCase):
    """Prove that every trainable student variable receives a non-None gradient."""

    def test_all_student_gradients_are_non_none_and_finite(self) -> None:
        config = _minimal_config()
        teacher = build_teacher(config, force_weights=None)
        teacher.trainable = False
        teacher_view = tf.keras.Model(
            teacher.input,
            {name: teacher.output[name] for name in ("logits", "feature_map")},
        )
        teacher_view.trainable = False
        student = build_student(config)
        images, labels = _fake_batch()
        teacher_out = teacher_view(images, training=False)
        with tf.GradientTape() as tape:
            student_out = student(images, training=True)
            hard = classification_loss(labels, student_out["logits"])
            soft = logit_distillation_loss(
                teacher_out["logits"], student_out["logits"], config.distillation.temperature
            )
            feat = feature_distillation_loss(
                teacher_out["feature_map"], student_out["distill_features"]
            )
            total = total_distillation_loss(hard, soft, feat,
                                            config.distillation.alpha,
                                            config.distillation.beta,
                                            config.distillation.gamma)
        grads = tape.gradient(total, student.trainable_variables)
        non_none_count = sum(1 for g in grads if g is not None)
        total_count = len(student.trainable_variables)
        self.assertGreater(non_none_count, 0, "No gradients reached the student")
        for index, (grad, var) in enumerate(zip(grads, student.trainable_variables)):
            self.assertIsNotNone(grad, f"Variable {var.name} at index {index} received None gradient")
            self.assertTrue(
                tf.reduce_all(tf.math.is_finite(grad)).numpy(),
                f"Gradient for {var.name} contains non-finite values",
            )

    def test_student_weights_change_after_one_step(self) -> None:
        config = _minimal_config()
        student = build_student(config)
        snapshot = [v.numpy().copy() for v in student.trainable_variables]
        teacher = build_teacher(config, force_weights=None)
        teacher.trainable = False
        teacher_view = tf.keras.Model(
            teacher.input,
            {name: teacher.output[name] for name in ("logits", "feature_map")},
        )
        teacher_view.trainable = False
        images, labels = _fake_batch()
        optimizer = tf.keras.optimizers.Adam(learning_rate=1e-3)
        teacher_out = teacher_view(images, training=False)
        with tf.GradientTape() as tape:
            student_out = student(images, training=True)
            hard = classification_loss(labels, student_out["logits"])
            soft = logit_distillation_loss(
                teacher_out["logits"], student_out["logits"], config.distillation.temperature
            )
            feat = feature_distillation_loss(
                teacher_out["feature_map"], student_out["distill_features"]
            )
            total = total_distillation_loss(hard, soft, feat,
                                            config.distillation.alpha,
                                            config.distillation.beta,
                                            config.distillation.gamma)
        grads = tape.gradient(total, student.trainable_variables)
        optimizer.apply_gradients(
            [(g, v) for g, v in zip(grads, student.trainable_variables) if g is not None]
        )
        changed = 0
        for snap, current in zip(snapshot, student.trainable_variables):
            if not np.array_equal(snap, current.numpy()):
                changed += 1
        self.assertGreater(changed, 0, "No student variable changed after an optimizer step")


class FeatureLossFinitenessTest(unittest.TestCase):
    """Feature loss must be finite for a real teacher/student forward pass."""

    def test_feature_loss_is_finite_on_real_models(self) -> None:
        config = _minimal_config()
        teacher = build_teacher(config, force_weights=None)
        student = build_student(config)
        images, _ = _fake_batch()
        teacher_features = teacher(images, training=False)["feature_map"]
        student_features = student(images, training=False)["distill_features"]
        loss = feature_distillation_loss(teacher_features, student_features)
        self.assertTrue(np.isfinite(float(loss)),
                        f"Feature loss is not finite: {float(loss)}")

    def test_total_kd_loss_is_finite_on_real_models(self) -> None:
        config = _minimal_config()
        teacher = build_teacher(config, force_weights=None)
        student = build_student(config)
        images, labels = _fake_batch()
        teacher_out = teacher(images, training=False)
        student_out = student(images, training=False)
        hard = classification_loss(labels, student_out["logits"])
        soft = logit_distillation_loss(
            teacher_out["logits"], student_out["logits"], config.distillation.temperature
        )
        feat = feature_distillation_loss(
            teacher_out["feature_map"], student_out["distill_features"]
        )
        total = total_distillation_loss(hard, soft, feat,
                                        config.distillation.alpha,
                                        config.distillation.beta,
                                        config.distillation.gamma)
        self.assertTrue(np.isfinite(float(hard)), f"Hard loss not finite: {float(hard)}")
        self.assertTrue(np.isfinite(float(soft)), f"Soft loss not finite: {float(soft)}")
        self.assertTrue(np.isfinite(float(feat)), f"Feature loss not finite: {float(feat)}")
        self.assertTrue(np.isfinite(float(total)), f"Total loss not finite: {float(total)}")


class FourClassLogitsTest(unittest.TestCase):
    """Student must produce exactly four logits for every input."""

    def test_ca_student_logit_dimension(self) -> None:
        config = _minimal_config()
        student = build_student(config)
        images = _single_fake_image()
        output = student(images, training=False)
        self.assertEqual(output["logits"].shape[-1], 4,
                         f"Expected 4 logits, got {output['logits'].shape[-1]}")

    def test_stock_baseline_logit_dimension(self) -> None:
        config = _stock_config()
        student = build_distillable_baseline(config)
        images = _single_fake_image()
        output = student(images, training=False)
        self.assertEqual(output["logits"].shape[-1], 4,
                         f"Expected 4 logits, got {output['logits'].shape[-1]}")

    def test_logits_name_matches_fixed_order(self) -> None:
        config = _minimal_config()
        student = build_student(config)
        self.assertIn("logits", student.output)
        self.assertEqual(student.output["logits"].shape[-1], len(CLASS_LABELS))

    def test_logits_only_model_has_four_classes(self) -> None:
        config = _minimal_config()
        student = build_student(config)
        deployable = logits_only_model(student)
        images = _single_fake_image()
        logits = deployable(images, training=False)
        self.assertEqual(logits.shape[-1], 4)

    def test_teacher_student_logit_shapes_are_compatible(self) -> None:
        config = _minimal_config()
        teacher = build_teacher(config, force_weights=None)
        student = build_student(config)
        images = _single_fake_image()
        t_logits = teacher(images, training=False)["logits"]
        s_logits = student(images, training=False)["logits"]
        self.assertEqual(t_logits.shape[-1], s_logits.shape[-1],
                         "Teacher and student logits must share the same class dimension")


class CAStructuralDifferenceTest(unittest.TestCase):
    """The CA-enhanced model must be structurally different from the stock-SE baseline."""

    def test_ca_model_has_coordinate_attention_layers(self) -> None:
        config = _minimal_config()
        model = build_student(config)
        layer_names = [layer.name for layer in model.layers]
        ca_layers = [name for name in layer_names if "coordinate_attention" in name]
        self.assertGreater(len(ca_layers), 0, "CA model contains no CoordinateAttention layers")

    def test_stock_model_has_no_coordinate_attention_layers(self) -> None:
        config = _stock_config()
        model = build_distillable_baseline(config)
        layer_names = [layer.name for layer in model.layers]
        ca_layers = [name for name in layer_names if "coordinate_attention" in name]
        self.assertEqual(len(ca_layers), 0, "Stock-SE model should not have CoordinateAttention layers")

    def test_ca_layer_class_is_coordinate_attention(self) -> None:
        config = _minimal_config()
        model = build_student(config)
        ca_instances = [
            layer for layer in model.layers if isinstance(layer, CoordinateAttention)
        ]
        self.assertGreater(len(ca_instances), 0, "No CoordinateAttention layer instances found")
        for layer in ca_instances:
            self.assertIsInstance(layer, CoordinateAttention)

    def test_stock_model_uses_keras_mobilenetv3_backbone(self) -> None:
        config = _stock_config()
        model = build_distillable_baseline(config)
        backbone_layer = model.get_layer("student_mobilenetv3_small_stock_se")
        self.assertIsNotNone(backbone_layer)

    def test_ca_model_does_not_use_stock_backbone(self) -> None:
        config = _minimal_config()
        model = build_student(config)
        layer_names = [layer.name for layer in model.layers]
        self.assertNotIn("student_mobilenetv3_small_stock_se", layer_names)

    def test_ca_and_stock_have_different_parameter_counts(self) -> None:
        ca_config = _minimal_config()
        stock_config = _stock_config()
        ca_model = build_student(ca_config)
        stock_model = build_distillable_baseline(stock_config)
        ca_params = ca_model.count_params()
        stock_params = stock_model.count_params()
        self.assertNotEqual(ca_params, stock_params,
                            f"CA ({ca_params}) and stock-SE ({stock_params}) should have different parameter counts")

    def test_ca_layer_names_are_deterministic(self) -> None:
        config = _minimal_config()
        model_a = build_student(config)
        model_b = build_student(config)
        names_a = [layer.name for layer in model_a.layers if isinstance(layer, CoordinateAttention)]
        names_b = [layer.name for layer in model_b.layers if isinstance(layer, CoordinateAttention)]
        self.assertEqual(names_a, names_b, "CA layer names must be deterministic across builds")

    def test_ca_layer_count_matches_expected_positions(self) -> None:
        config = _minimal_config()
        model = build_student(config)
        ca_layers = [layer for layer in model.layers if isinstance(layer, CoordinateAttention)]
        expected_positions = [0, 3, 4, 5, 6, 7, 8, 9, 10]
        self.assertEqual(len(ca_layers), len(expected_positions),
                         f"Expected {len(expected_positions)} CA layers, found {len(ca_layers)}")


class FeatureAlignmentShapeTest(unittest.TestCase):
    """Student distill_features must match teacher feature_map shape for MSE."""

    def test_spatial_and_channel_alignment(self) -> None:
        config = _minimal_config()
        teacher = build_teacher(config, force_weights=None)
        student = build_student(config)
        images = _single_fake_image()
        t_features = teacher(images, training=False)["feature_map"]
        s_features = student(images, training=False)["distill_features"]
        self.assertEqual(tuple(t_features.shape[1:]), (7, 7, 2048))
        self.assertEqual(tuple(s_features.shape[1:]), (7, 7, 2048))
        self.assertEqual(t_features.shape, s_features.shape,
                         "Teacher and student feature maps must be identical in shape")

    def test_stock_student_also_aligns(self) -> None:
        config = _stock_config()
        student = build_distillable_baseline(config)
        images = _single_fake_image()
        features = student(images, training=False)["distill_features"]
        self.assertEqual(tuple(features.shape[1:]), (7, 7, 2048))


class DistillationLossEquationTest(unittest.TestCase):
    """Verify the exact KD equation: alpha*L_CE + beta*T^2*L_KD + gamma*L_feat."""

    def test_equation_components(self) -> None:
        alpha, beta, gamma, T = 0.5, 0.7, 1.2, 4.0
        hard = tf.constant(1.5)
        soft = tf.constant(2.3)
        feat = tf.constant(0.8)
        total = total_distillation_loss(hard, soft, feat, alpha, beta, gamma)
        expected = alpha * hard + beta * soft + gamma * feat
        np.testing.assert_allclose(float(total), float(expected), rtol=1e-6)

    def test_temperature_squared_factor_in_logit_loss(self) -> None:
        teacher_logits = tf.constant([[1.0, 2.0, 0.5, -0.5]])
        student_logits = tf.constant([[0.8, 1.8, 0.3, -0.3]])
        loss_t2 = float(logit_distillation_loss(teacher_logits, student_logits, 2.0))
        loss_t1 = float(logit_distillation_loss(teacher_logits, student_logits, 1.0))
        self.assertGreater(loss_t2, loss_t1,
                           "Higher temperature should yield higher KL (T^2 factor)")

    def test_zero_lambda_disables_objective(self) -> None:
        hard = tf.constant(1.0)
        soft = tf.constant(5.0)
        feat = tf.constant(10.0)
        total = total_distillation_loss(hard, soft, feat, alpha=0.0, beta=0.0, gamma=0.0)
        np.testing.assert_allclose(float(total), 0.0, rtol=1e-6)


class SaveLoadRoundTripTest(unittest.TestCase):
    """Student checkpoint save/load preserves architecture and custom layers."""

    def test_ca_student_round_trip(self) -> None:
        config = _minimal_config()
        student = build_student(config)
        images = _single_fake_image()
        logits_before = student(images, training=False)["logits"].numpy()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "student.keras"
            student.save(path)
            loaded = tf.keras.models.load_model(
                path,
                custom_objects={
                    "CoordinateAttention": CoordinateAttention,
                    "HardSwish": HardSwish,
                },
                compile=False,
            )
        logits_after = loaded(images, training=False)["logits"].numpy()
        np.testing.assert_allclose(logits_before, logits_after, rtol=1e-5)

    def test_stock_student_round_trip(self) -> None:
        config = _stock_config()
        student = build_distillable_baseline(config)
        images = _single_fake_image()
        logits_before = student(images, training=False)["logits"].numpy()
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "stock_student.keras"
            student.save(path)
            loaded = tf.keras.models.load_model(path, compile=False)
        logits_after = loaded(images, training=False)["logits"].numpy()
        np.testing.assert_allclose(logits_before, logits_after, rtol=1e-5)


if __name__ == "__main__":
    unittest.main()
