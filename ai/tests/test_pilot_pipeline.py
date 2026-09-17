"""CPU-only tests for the PILOT-05 through PILOT-08 stage gates."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ai.config.config import ExperimentConfig, load_config
from ai.evaluation.pilot_pipeline import (
    StageBlocked,
    freeze_pilot7,
    pilot8_command,
    pilot6_command,
    pilot7_commands,
    prepare_pilot6_config,
    prepare_pilot7_configs,
    select_student,
    select_teacher,
)


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def _complete(path: Path) -> None:
    _write_json(path, {"status": "complete"})


def _metric(path: Path, value: float) -> None:
    _write_json(path, {
        "partition": "validation",
        "value": value,
        "test_set_evaluated": False,
    })


def _model(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"model-checkpoint")


class PilotPipelineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.pilots = self.root / "pilots"
        self.configs = self.root / "configs"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _teacher(self, name: str, score: float) -> Path:
        run = self.pilots / name
        _complete(run / "teacher_training.complete.json")
        _metric(run / "validation_metrics.json", score)
        _model(run / "best_teacher.keras")
        _write_json(run / "teacher_experiment_config.json", {"teacher": name})
        return run

    def _pilot02(self, score: float = 0.94) -> Path:
        run = self.pilots / "pilot_02_ca_supervised_seed42"
        _complete(run / "student_supervised_training.complete.json")
        _metric(run / "student_supervised_validation_metrics.json", score)
        _model(run / "best_supervised_student.keras")
        _write_json(run / "student_supervised_experiment_config.json", {
            "experiment_name": "pilot02",
            "experimental_status": "candidate_configuration_pending_validation",
            "data": {"batch_size": 32, "cache_dataset": True},
            "teacher": {"ssl_enabled": True},
            "student": {"epochs": 30},
            "distillation": {"enabled": False},
            "runtime": {"seed": 42, "output_dir": str(run)},
        })
        return run

    def test_teacher_selection_blocks_until_both_runs_complete(self) -> None:
        self._teacher("pilot_03_teacher_imagenet_seed42", 0.98)
        with self.assertRaises(StageBlocked):
            select_teacher(self.pilots)

    def test_gradient_accumulation_steps_must_be_positive(self) -> None:
        config = ExperimentConfig()
        config.student.gradient_accumulation_steps = 0
        with self.assertRaisesRegex(ValueError, "gradient_accumulation_steps"):
            config.validate()

    def test_evaluation_batch_size_must_be_positive_when_set(self) -> None:
        config = ExperimentConfig()
        config.data.evaluation_batch_size = 0
        with self.assertRaisesRegex(ValueError, "evaluation_batch_size"):
            config.validate()

    @patch("ai.evaluation.pilot_pipeline.sys.platform", "win32")
    def test_launch_command_requires_same_linux_context_as_trainer(self) -> None:
        with self.assertRaisesRegex(StageBlocked, "same Linux/WSL environment"):
            pilot6_command(self.pilots, self.configs)

    def test_teacher_tie_retains_imagenet_control(self) -> None:
        self._teacher("pilot_03_teacher_imagenet_seed42", 0.98)
        self._teacher("pilot_04_teacher_fresh_ssl_seed42", 0.98)
        output = select_teacher(self.pilots)
        selected = json.loads(output.read_text(encoding="utf-8"))["selected"]
        self.assertEqual(selected["candidate_id"], "pilot_03_imagenet")
        self.assertFalse(json.loads(output.read_text(encoding="utf-8"))["test_set_evaluated"])

    @patch("ai.evaluation.pilot_pipeline._require_linux_launch_context")
    def test_full_gated_preparation_reuses_seed42_and_freezes_before_test(self, _linux_guard) -> None:
        self._teacher("pilot_03_teacher_imagenet_seed42", 0.98)
        self._teacher("pilot_04_teacher_fresh_ssl_seed42", 0.99)
        self._pilot02(score=0.94)
        select_teacher(self.pilots)

        pilot6_config_path = prepare_pilot6_config(self.pilots, self.configs)
        pilot6_config = json.loads(pilot6_config_path.read_text(encoding="utf-8"))
        self.assertTrue(pilot6_config["distillation"]["enabled"])
        self.assertTrue(pilot6_config["teacher"]["ssl_enabled"])
        self.assertEqual(pilot6_config["runtime"]["seed"], 42)
        resolved = load_config(pilot6_config_path)
        self.assertTrue(resolved.distillation.enabled)
        self.assertEqual(resolved.data.batch_size, 4)
        self.assertEqual(resolved.data.evaluation_batch_size, 32)
        self.assertEqual(resolved.student.gradient_accumulation_steps, 8)
        pilot6_launch = pilot6_command(self.pilots, self.configs)
        self.assertIn("ai.training.train_student", pilot6_launch)
        self.assertIn("/home/feanne/dahonmd-data/banana_leaf_thesis_4class", pilot6_launch)
        self.assertNotIn("\n+  ", pilot6_launch)

        pilot6 = self.pilots / "pilot_06_ca_kd_ssl_teacher_seed42"
        _complete(pilot6 / "student_training.complete.json")
        _metric(pilot6 / "student_validation_metrics.json", 0.95)
        _model(pilot6 / "best_student.keras")
        _write_json(
            pilot6 / "student_experiment_config.json",
            pilot6_config,
        )
        selection_path = select_student(self.pilots)
        selection = json.loads(selection_path.read_text(encoding="utf-8"))["selected"]
        self.assertEqual(selection["candidate_id"], "pilot_06_kd")

        seed_configs = prepare_pilot7_configs(self.pilots, self.configs)
        self.assertEqual([path.name for path in seed_configs], [
            "pilot_07_kd_seed1337.json",
            "pilot_07_kd_seed2026.json",
        ])
        for path, seed in zip(seed_configs, (1337, 2026)):
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(payload["runtime"]["seed"], seed)
            self.assertEqual(load_config(path).runtime.seed, seed)
        commands = pilot7_commands(self.pilots, self.configs)
        self.assertIn("seed1337", commands)
        self.assertIn("seed2026", commands)
        self.assertNotIn("\n+  ", commands)

        for seed, score in ((1337, 0.945), (2026, 0.955)):
            run = self.pilots / f"pilot_07_selected_student_seed{seed}"
            _complete(run / "student_training.complete.json")
            _metric(run / "student_validation_metrics.json", score)
            _model(run / "best_student.keras")

        frozen_path = freeze_pilot7(self.pilots)
        frozen = json.loads(frozen_path.read_text(encoding="utf-8"))
        self.assertEqual(frozen["final"]["seed"], 42)
        self.assertEqual(len(frozen["seeds"]), 3)
        command = pilot8_command(self.pilots)
        self.assertIn("ai.evaluation.evaluate_student", command)
        self.assertIn("best_student.keras", command)
        self.assertIn("mkdir -p", command)
        self.assertNotIn("\n+  ", command)

    def test_student_selection_retains_supervised_on_tie(self) -> None:
        self._teacher("pilot_03_teacher_imagenet_seed42", 0.99)
        self._teacher("pilot_04_teacher_fresh_ssl_seed42", 0.98)
        self._pilot02(score=0.95)
        select_teacher(self.pilots)
        pilot6 = self.pilots / "pilot_06_ca_kd_imagenet_teacher_seed42"
        _complete(pilot6 / "student_training.complete.json")
        _metric(pilot6 / "student_validation_metrics.json", 0.95)
        _model(pilot6 / "best_student.keras")
        _write_json(pilot6 / "student_experiment_config.json", {"runtime": {"seed": 42}})
        selected = json.loads(select_student(self.pilots).read_text(encoding="utf-8"))["selected"]
        self.assertEqual(selected["candidate_id"], "pilot_02_supervised")


if __name__ == "__main__":
    unittest.main()
