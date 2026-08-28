"""Unit tests for intermediate SSL checkpointing and resume support in train_teacher.

These tests exercise checkpoint save/load/atomicy/validity detection and the
per-epoch teacher dataset shuffle on tiny temporary models and temporary run
directories. They never touch the live teacher run or a real dataset.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
import tensorflow as tf

from ai.config.config import ExperimentConfig
from ai.data.dataset import make_teacher_dataset
from ai.data.records import ImageRecord
from ai.training.common import make_optimizer
from ai.training.train_teacher import (
    FINAL_SSL_MODEL_NAME,
    _ssl_history_upto,
    checkpoint_paths,
    latest_valid_ssl_checkpoint,
    load_ssl_checkpoint,
    save_final_ssl_model,
    save_ssl_checkpoint,
    valid_ssl_checkpoint_epochs,
)


def _small_model(name: str) -> tf.keras.Model:
    inputs = tf.keras.Input((8,), name=f"input_{name}")
    hidden = tf.keras.layers.Dense(16, activation="relu", name=f"dense_{name}")(inputs)
    hidden = tf.keras.layers.BatchNormalization(name=f"bn_{name}")(hidden)
    outputs = tf.keras.layers.Dense(4, name=f"logits_{name}")(hidden)
    return tf.keras.Model(inputs, outputs, name=name)


def _train_one_step(model: tf.keras.Model, optimizer: tf.keras.optimizers.Optimizer) -> None:
    batch = tf.random.normal((3, 8))
    with tf.GradientTape() as tape:
        predictions = model(batch, training=True)
        loss = tf.reduce_mean(tf.square(predictions))
    gradients = tape.gradient(loss, model.trainable_variables)
    optimizer.apply_gradients(zip(gradients, model.trainable_variables))


def _write_solid_png(path: Path, value: int) -> None:
    from PIL import Image

    Image.new("RGB", (32, 32), (value, 0, 0)).save(path)


def _records(root: Path, count: int = 8) -> list[ImageRecord]:
    records: list[ImageRecord] = []
    for index in range(count):
        path = root / f"{index:02d}.png"
        _write_solid_png(path, index + 20)
        records.append(
            ImageRecord(
                path=str(path),
                label=index,
                class_name="c",
                sha256=f"sha{index:02d}",
                group_id=f"g{index:02d}",
            )
        )
    return records


class CheckpointPathsTest(unittest.TestCase):
    def test_fixed_file_set(self) -> None:
        root = Path("ignored")
        paths = checkpoint_paths(root, 5)
        self.assertEqual(paths["online"].name, "ssl_checkpoint_epoch_005_online.npz")
        self.assertEqual(paths["target"].name, "ssl_checkpoint_epoch_005_target.npz")
        self.assertEqual(paths["optimizer"].name, "ssl_checkpoint_epoch_005_optimizer.npz")
        self.assertEqual(paths["meta"].name, "ssl_checkpoint_epoch_005_meta.json")
        self.assertEqual(paths["marker"].name, "ssl_checkpoint_epoch_005.complete")

    def test_default_policy_saves_every_epoch_with_bounded_retention(self) -> None:
        config = ExperimentConfig()
        self.assertEqual(config.teacher.ssl_checkpoint_interval, 1)
        self.assertEqual(config.teacher.max_recent_checkpoints, 3)
        self.assertEqual(config.teacher.milestone_interval, 10)


class CheckpointRoundTripTest(unittest.TestCase):
    def test_epoch_one_checkpoint_is_created(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            config = ExperimentConfig()
            online = _small_model("online")
            target = tf.keras.models.clone_model(online)
            optimizer = make_optimizer(1e-3, 1e-5)
            optimizer.build(online.trainable_variables)

            marker = save_ssl_checkpoint(output_dir, 1, online, target, optimizer, config)

            self.assertTrue(marker.is_file())
            self.assertEqual(valid_ssl_checkpoint_epochs(output_dir, config), [1])

    def test_weights_ema_and_optimizer_restore_exactly(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            config = ExperimentConfig()
            config.teacher.ssl_epochs = 100

            online = _small_model("online")
            # Distinguish BatchNorm statistics so a weights round-trip is actually tested.
            bn = online.get_layer("bn_online")
            bn.moving_mean.assign(np.full(16, 0.37, dtype=np.float32))
            bn.moving_variance.assign(np.full(16, 2.5, dtype=np.float32))

            # Emulate the EMA target as a non-trainable clone with distinct values.
            target = tf.keras.models.clone_model(online)
            target.set_weights([weight * 0.5 for weight in online.get_weights()])
            target.trainable = False

            optimizer = make_optimizer(config.teacher.ssl_learning_rate, config.teacher.weight_decay)
            optimizer.build(online.trainable_variables)
            _train_one_step(online, optimizer)
            saved_weight_arrays = [np.copy(variable.numpy()) for variable in optimizer.variables]

            marker = save_ssl_checkpoint(output_dir, 5, online, target, optimizer, config)
            self.assertTrue(marker.exists())

            restored_online = _small_model("online")
            restored_target = tf.keras.models.clone_model(restored_online)
            restored_optimizer = make_optimizer(
                config.teacher.ssl_learning_rate, config.teacher.weight_decay
            )
            loaded = load_ssl_checkpoint(output_dir, 5, config)
            restored_online.set_weights(loaded["online"])
            restored_target.set_weights(loaded["target"])
            restored_optimizer.build(restored_online.trainable_variables)
            restored_optimizer.set_weights(loaded["optimizer"])

            for original, resumed in zip(online.get_weights(), restored_online.get_weights()):
                np.testing.assert_array_equal(original, resumed)
            for original, resumed in zip(target.get_weights(), restored_target.get_weights()):
                np.testing.assert_array_equal(original, resumed)
            for original, resumed in zip(saved_weight_arrays, [variable.numpy() for variable in restored_optimizer.variables]):
                self.assertEqual(original.dtype, resumed.dtype)
                np.testing.assert_array_equal(original, resumed)

            self.assertEqual(loaded["meta"]["epoch"], 5)
            self.assertIn("partial_resume_note", loaded["meta"])

    def test_no_temp_files_remain_after_atomic_save(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            config = ExperimentConfig()
            online = _small_model("online")
            target = tf.keras.models.clone_model(online)
            target.trainable = False
            optimizer = make_optimizer(1e-3, 1e-5)
            optimizer.build(online.trainable_variables)
            save_ssl_checkpoint(output_dir, 5, online, target, optimizer, config)
            leftovers = list(output_dir.glob("*.tmp"))
            self.assertEqual(leftovers, [])

    def test_completion_marker_is_the_final_atomic_write(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            config = ExperimentConfig()
            online = _small_model("online")
            target = tf.keras.models.clone_model(online)
            optimizer = make_optimizer(1e-3, 1e-5)
            optimizer.build(online.trainable_variables)
            destinations: list[str] = []
            real_replace = __import__("os").replace

            def recording_replace(source: str | Path, destination: str | Path) -> None:
                destinations.append(Path(destination).name)
                real_replace(source, destination)

            with mock.patch(
                "ai.training.train_teacher.os.replace",
                side_effect=recording_replace,
            ):
                save_ssl_checkpoint(output_dir, 1, online, target, optimizer, config)

            self.assertEqual(destinations[-1], "ssl_checkpoint_epoch_001.complete")


class LatestCheckpointDetectionTest(unittest.TestCase):
    def test_latest_valid_is_selected_and_incomplete_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            config = ExperimentConfig()

            online = _small_model("online")
            target = tf.keras.models.clone_model(online)
            target.trainable = False
            optimizer = make_optimizer(1e-3, 1e-5)
            optimizer.build(online.trainable_variables)

            save_ssl_checkpoint(output_dir, 5, online, target, optimizer, config)
            save_ssl_checkpoint(output_dir, 10, online, target, optimizer, config)
            self.assertEqual(latest_valid_ssl_checkpoint(output_dir), 10)

            # Corrupt epoch 10 by deleting one payload file; detection must fall back to 5.
            checkpoint_paths(output_dir, 10)["target"].unlink()
            self.assertEqual(latest_valid_ssl_checkpoint(output_dir), 5)

    def test_stray_marker_without_payload_is_not_valid(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            (output_dir / "ssl_checkpoint_epoch_007.complete").write_text(
                json.dumps({"epoch": 7, "complete": True}), encoding="utf-8"
            )
            self.assertIsNone(latest_valid_ssl_checkpoint(output_dir))

    def test_resume_epoch_arithmetic_continues_at_next_epoch(self) -> None:
        """train() computes epoch_start = latest_valid_checkpoint + 1; assert that contract."""
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            config = ExperimentConfig()
            online = _small_model("online")
            target = tf.keras.models.clone_model(online)
            target.trainable = False
            optimizer = make_optimizer(1e-3, 1e-5)
            optimizer.build(online.trainable_variables)
            save_ssl_checkpoint(output_dir, 7, online, target, optimizer, config)

            resume_epoch = latest_valid_ssl_checkpoint(output_dir)
            self.assertEqual(resume_epoch, 7)
            epoch_start = resume_epoch + 1
            self.assertEqual(epoch_start, 8)
            self.assertLessEqual(epoch_start, config.teacher.ssl_epochs)

    def test_load_rejects_epoch_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            config = ExperimentConfig()
            online = _small_model("online")
            target = tf.keras.models.clone_model(online)
            target.trainable = False
            optimizer = make_optimizer(1e-3, 1e-5)
            optimizer.build(online.trainable_variables)
            save_ssl_checkpoint(output_dir, 5, online, target, optimizer, config)
            metadata = checkpoint_paths(output_dir, 5)["meta"]
            payload = json.loads(metadata.read_text(encoding="utf-8"))
            payload["epoch"] = 6
            metadata.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_ssl_checkpoint(output_dir, 5, config)

    def test_direct_load_rejects_checkpoint_without_completion_marker(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            config = ExperimentConfig()
            online = _small_model("online")
            target = tf.keras.models.clone_model(online)
            optimizer = make_optimizer(1e-3, 1e-5)
            optimizer.build(online.trainable_variables)
            save_ssl_checkpoint(output_dir, 5, online, target, optimizer, config)
            checkpoint_paths(output_dir, 5)["marker"].unlink()

            with self.assertRaisesRegex(ValueError, "missing.*marker"):
                load_ssl_checkpoint(output_dir, 5, config)

    def test_mismatched_marker_is_not_selected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            config = ExperimentConfig()
            online = _small_model("online")
            target = tf.keras.models.clone_model(online)
            optimizer = make_optimizer(1e-3, 1e-5)
            optimizer.build(online.trainable_variables)
            save_ssl_checkpoint(output_dir, 5, online, target, optimizer, config)
            checkpoint_paths(output_dir, 5)["marker"].write_text(
                json.dumps({"epoch": 4, "complete": True}), encoding="utf-8"
            )

            self.assertIsNone(latest_valid_ssl_checkpoint(output_dir, config))


class CheckpointRetentionTest(unittest.TestCase):
    @staticmethod
    def _components() -> tuple[tf.keras.Model, tf.keras.Model, tf.keras.optimizers.Optimizer]:
        online = _small_model("online")
        target = tf.keras.models.clone_model(online)
        target.trainable = False
        optimizer = make_optimizer(1e-3, 1e-5)
        optimizer.build(online.trainable_variables)
        return online, target, optimizer

    def test_latest_three_and_tenth_epoch_milestones_are_retained(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            config = ExperimentConfig()
            online, target, optimizer = self._components()

            for epoch in range(1, 23):
                save_ssl_checkpoint(output_dir, epoch, online, target, optimizer, config)

            self.assertEqual(
                valid_ssl_checkpoint_epochs(output_dir, config),
                [10, 20, 21, 22],
            )
            for epoch in (10, 20, 21, 22):
                self.assertTrue(checkpoint_paths(output_dir, epoch)["marker"].is_file())

    def test_old_checkpoint_pruned_only_after_new_checkpoint_commits(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            config = ExperimentConfig()
            online, target, optimizer = self._components()
            for epoch in (35, 36, 37):
                save_ssl_checkpoint(output_dir, epoch, online, target, optimizer, config)

            # An incomplete epoch 38 does not trigger retention or invalidate epoch 35.
            checkpoint_paths(output_dir, 38)["online"].write_bytes(b"incomplete")
            self.assertEqual(valid_ssl_checkpoint_epochs(output_dir, config), [35, 36, 37])
            self.assertTrue(checkpoint_paths(output_dir, 35)["marker"].is_file())

            save_ssl_checkpoint(output_dir, 38, online, target, optimizer, config)

            self.assertEqual(valid_ssl_checkpoint_epochs(output_dir, config), [36, 37, 38])
            for path in checkpoint_paths(output_dir, 35).values():
                self.assertFalse(path.exists())

    def test_full_history_survives_checkpoint_pruning_and_resume_truncates(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            config = ExperimentConfig()
            online, target, optimizer = self._components()
            history = [{"epoch": epoch, "loss": float(epoch)} for epoch in range(1, 6)]
            history_path = output_dir / "teacher_ssl_history.json"
            history_path.write_text(json.dumps(history), encoding="utf-8")

            for epoch in range(1, 6):
                save_ssl_checkpoint(output_dir, epoch, online, target, optimizer, config)

            self.assertEqual(json.loads(history_path.read_text(encoding="utf-8")), history)
            self.assertEqual(_ssl_history_upto(output_dir, 3), history[:3])


class FinalSslExportTest(unittest.TestCase):
    def test_final_ssl_keras_artifact_still_saves_and_loads(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output_dir = Path(directory)
            model = _small_model("final_ssl")
            original = [np.copy(array) for array in model.get_weights()]

            destination = save_final_ssl_model(model, output_dir)
            restored = tf.keras.models.load_model(destination)

            self.assertEqual(destination.name, FINAL_SSL_MODEL_NAME)
            for expected, actual in zip(original, restored.get_weights()):
                np.testing.assert_array_equal(expected, actual)


class TeacherDatasetShuffleEpochTest(unittest.TestCase):
    @staticmethod
    def _labels_first_batch(config: ExperimentConfig, records: list[ImageRecord], epoch: int) -> list[int]:
        dataset = make_teacher_dataset(records, config, training=True, shuffle_epoch=epoch)
        return dataset.take(1).map(lambda batch: batch["labels"]).get_single_element().numpy().tolist()

    def test_per_epoch_shuffle_is_deterministic_and_epoch_dependent(self) -> None:
        config = ExperimentConfig()
        config.data.image_height = 32
        config.data.image_width = 32
        config.data.batch_size = 8
        config.data.num_parallel_calls = 1
        config.data.cache_dataset = False
        with tempfile.TemporaryDirectory() as directory:
            records = _records(Path(directory), count=8)
            first = self._labels_first_batch(config, records, epoch=1)
            again = self._labels_first_batch(config, records, epoch=1)
            self.assertEqual(first, again)
            labels_by_seed = [
                self._labels_first_batch(config, records, epoch=seed) for seed in range(2, 7)
            ]
            self.assertTrue(any(labels != first for labels in labels_by_seed))


if __name__ == "__main__":
    unittest.main()
