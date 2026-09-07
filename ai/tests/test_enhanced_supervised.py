from __future__ import annotations

import unittest

import tensorflow as tf

from ai.config.config import ExperimentConfig, load_config
from ai.models.mobilenetv3_student import (
    build_student,
    configure_pretrained_student_stage,
    shared_backbone_layer_names,
)
from ai.training.train_enhanced_supervised import resume_stage_state, stage_for_epoch


class EnhancedSupervisedTrainingTest(unittest.TestCase):
    def test_recovery_config_matches_baseline_schedule(self) -> None:
        config = load_config("ai/config/diagnostics/ca_mobilenetv3_supervised_imagenet.json")
        self.assertFalse(config.distillation.enabled)
        self.assertEqual(config.data.batch_size, 32)
        self.assertEqual(config.student.pretrained_warmup_epochs, 20)
        self.assertEqual(config.student.epochs, 30)
        self.assertEqual(config.student.pretrained_warmup_learning_rate, 1e-3)
        self.assertEqual(config.student.learning_rate, 1e-5)
        self.assertTrue(config.student.freeze_batch_norm_during_finetune)

    def test_stage_keeps_attention_trainable_and_transferred_bn_frozen(self) -> None:
        student = build_student(ExperimentConfig())
        transferred = shared_backbone_layer_names()

        warmup = configure_pretrained_student_stage(
            student, transferred, head_only=True, freeze_batch_norm=True
        )
        self.assertEqual(warmup["stage"], "attention_head_warmup")
        self.assertFalse(student.get_layer("stem_conv").trainable)
        self.assertTrue(student.get_layer("coordinate_attention").trainable)

        fine_tune = configure_pretrained_student_stage(
            student, transferred, head_only=False, freeze_batch_norm=True
        )
        self.assertTrue(student.get_layer("stem_conv").trainable)
        self.assertFalse(student.get_layer("stem_bn").trainable)
        self.assertGreater(fine_tune["frozen_batch_norm_layers"], 0)

    def test_stage_and_resume_state_are_reconstructed(self) -> None:
        self.assertEqual(stage_for_epoch(20, 20), "attention_head_warmup")
        self.assertEqual(stage_for_epoch(21, 20), "backbone_finetune")
        history = [
            {"stage": "backbone_finetune", "validation_macro_f1": 0.8, "validation_loss": 0.5},
            {"stage": "backbone_finetune", "validation_macro_f1": 0.7, "validation_loss": 0.6},
        ]
        no_improvement, lr_wait, learning_rate, best_f1, best_loss = resume_stage_state(
            history, "backbone_finetune", 1e-5, 1, 1e-7
        )
        self.assertEqual(no_improvement, 1)
        self.assertEqual(lr_wait, 0)
        self.assertAlmostEqual(learning_rate, 5e-6)
        self.assertEqual(best_f1, 0.8)
        self.assertEqual(best_loss, 0.5)


if __name__ == "__main__":
    unittest.main()
