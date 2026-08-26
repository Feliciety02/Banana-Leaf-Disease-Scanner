from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np
import tensorflow as tf

from ai.config.config import ExperimentConfig
from ai.config.labels import CLASS_LABELS, harmonize_source_label
from ai.data.dataset import DatasetSplits, ImageRecord, build_ssl_pretraining_records, select_stratified_representative_records
from ai.deployment.quantization_audit import audit_full_integer_model
from ai.losses.distillation_loss import feature_distillation_loss, logit_distillation_loss, total_distillation_loss
from ai.models.mobilenetv3_student import build_student
from ai.models.teacher import build_teacher


class ThesisDatasetProtocolTest(unittest.TestCase):
    def test_source_label_harmonization_and_moko_exclusion(self) -> None:
        self.assertEqual(harmonize_source_label("Black Sigatoka"), "sigatoka")
        self.assertEqual(harmonize_source_label("yellow_sigatoka"), "sigatoka")
        self.assertIsNone(harmonize_source_label("Moko disease"))
        with self.assertRaises(ValueError):
            harmonize_source_label("unknown disease")

    def test_ssl_pool_rejects_held_out_group(self) -> None:
        def record(path: str, group: str) -> ImageRecord:
            return ImageRecord(path, 0, "healthy", path, group)
        splits = DatasetSplits(list(CLASS_LABELS), [record("train", "leaf-1")], [record("val", "leaf-2")], [record("test", "leaf-3")])
        splits.ssl_unlabeled = [record("unlabeled", "leaf-2")]
        with self.assertRaisesRegex(ValueError, "Held-out image/group"):
            build_ssl_pretraining_records(splits)

    def test_calibration_is_stratified_over_training_classes(self) -> None:
        records = [ImageRecord(f"{name}-{index}", label, name, f"h-{name}-{index}", f"g-{name}-{index}") for label, name in enumerate(CLASS_LABELS) for index in range(3)]
        selected = select_stratified_representative_records(records, CLASS_LABELS, 8, 42)
        self.assertEqual(set(item.class_name for item in selected), set(CLASS_LABELS))


class ThesisModelProtocolTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = ExperimentConfig()
        cls.config.teacher.imagenet_weights = False
        cls.config.student.imagenet_weights = False

    def test_teacher_and_ca_student_have_four_outputs_and_aligned_maps(self) -> None:
        teacher = build_teacher(self.config, force_weights=None)
        student = build_student(self.config)
        self.assertEqual(teacher.output["logits"].shape[-1], 4)
        self.assertEqual(student.output["logits"].shape[-1], 4)
        self.assertEqual(tuple(teacher.output["feature_map"].shape[1:]), (7, 7, 2048))
        self.assertEqual(tuple(student.output["distill_features"].shape[1:]), (7, 7, 2048))

    def test_kd_loss_is_finite_mse_and_temperature_squared(self) -> None:
        teacher_logits = tf.constant([[2.0, 1.0, 0.0, -1.0]])
        student_logits = tf.Variable([[0.5, 0.2, -0.1, -0.3]])
        teacher_features = tf.ones([1, 2, 2, 3])
        student_features = tf.Variable(tf.zeros([1, 2, 2, 3]))
        with tf.GradientTape() as tape:
            soft = logit_distillation_loss(teacher_logits, student_logits, 4.0)
            feature = feature_distillation_loss(teacher_features, student_features)
            total = total_distillation_loss(tf.constant(1.0), soft, feature, 0.5, 0.5, 1.0)
        gradients = tape.gradient(total, [student_logits, student_features])
        self.assertTrue(np.isfinite(float(total)))
        self.assertTrue(all(gradient is not None for gradient in gradients))
        self.assertAlmostEqual(float(feature), 1.0, places=6)

    def test_teacher_can_be_frozen_for_kd(self) -> None:
        teacher = build_teacher(self.config, force_weights=None)
        teacher.trainable = False
        self.assertFalse(teacher.trainable)
        self.assertEqual(len(teacher.trainable_variables), 0)


class ThesisQuantizationProtocolTest(unittest.TestCase):
    def test_full_integer_conversion_and_audit(self) -> None:
        inputs = tf.keras.Input((224, 224, 3))
        x = tf.keras.layers.Rescaling(2.0, offset=-1.0)(inputs)
        x = tf.keras.layers.GlobalAveragePooling2D()(x)
        outputs = tf.keras.layers.Dense(4)(x)
        model = tf.keras.Model(inputs, outputs)
        samples = [np.zeros((1, 224, 224, 3), np.float32), np.ones((1, 224, 224, 3), np.float32)]
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.representative_dataset = lambda: ([sample] for sample in samples)
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
        converter.inference_input_type = tf.int8
        converter.inference_output_type = tf.int8
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.tflite"
            path.write_bytes(converter.convert())
            report = audit_full_integer_model(path)
        self.assertTrue(report["full_integer_verified"])
        self.assertEqual(report["output"]["shape"], [1, 4])


if __name__ == "__main__":
    unittest.main()
