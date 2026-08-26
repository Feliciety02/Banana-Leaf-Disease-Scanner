"""Unified thesis ablation runner.

Orchestrates all seven (plus one optional) experiments with:
  - Identical dataset partitions derived from one shared split
  - Deterministic seed (inherited from ExperimentConfig)
  - Explicit experiment IDs and configuration snapshots
  - Separate checkpoint directories per experiment
  - Validation macro-F1 model selection only
  - Test-set evaluation frozen until all selection decisions are complete

Usage:
    python -m ai.training.experiments --dataset-dir /path/to/data [--only 1 2 3] [--skip-tests]

The runner never evaluates on the test set during training.  Test metrics are
written only after every experiment has its best validation checkpoint selected,
at which point ``--run-tests`` enables a single, isolated evaluation pass.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Sequence

# ---------------------------------------------------------------------------
# Environment setup (must happen before TF import)
# ---------------------------------------------------------------------------
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
os.environ.setdefault("OMP_NUM_THREADS", "8")
os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "8")


# ---------------------------------------------------------------------------
# Experiment registry
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ExperimentSpec:
    """Immutable descriptor for one ablation experiment."""

    experiment_id: str
    config_path: str
    phase: str  # "teacher" or "student"
    description: str
    depends_on: str | None = None  # experiment_id of the teacher this student distills from
    tags: dict[str, str] = field(default_factory=dict)


EXPERIMENTS: list[ExperimentSpec] = [
    # --- Phase 1: Teachers (independent, no student dependency) ---
    ExperimentSpec(
        experiment_id="config_1",
        config_path="ai/config/ablations/configuration_1_mobilenetv3_small_supervised.json",
        phase="baseline",
        description="MobileNetV3-Small supervised baseline",
        tags={"ssl": "no", "ca": "no", "kd": "no"},
    ),
    ExperimentSpec(
        experiment_id="config_2",
        config_path="ai/config/ablations/configuration_2_ca_mobilenetv3_small_supervised.json",
        phase="supervised_ablation",
        description="CA-MobileNetV3-Small supervised",
        tags={"ssl": "no", "ca": "yes", "kd": "no"},
    ),
    ExperimentSpec(
        experiment_id="config_5",
        config_path="ai/config/ablations/configuration_5_resnet101_supervised_no_ssl.json",
        phase="supervised_ablation",
        description="ResNet-101 supervised without banana-domain SSL",
        tags={"ssl": "no", "ca": "no", "kd": "no"},
    ),
    ExperimentSpec(
        experiment_id="config_8",
        config_path="ai/config/ablations/configuration_8_resnet101_thesis_teacher.json",
        phase="teacher",
        description="ResNet-101 SSL-pretrained + supervised fine-tuned",
        tags={"ssl": "yes", "ca": "no", "kd": "no"},
    ),
    # --- Phase 1b: Non-SSL teacher for optional config 7 ---
    ExperimentSpec(
        experiment_id="config_5_teacher",
        config_path="ai/config/ablations/configuration_5_resnet101_supervised_no_ssl.json",
        phase="teacher",
        description="ResNet-101 supervised (serves as non-SSL teacher for config 7)",
        tags={"ssl": "no", "ca": "no", "kd": "no"},
    ),
    # --- Phase 2: Students (depend on a teacher checkpoint) ---
    ExperimentSpec(
        experiment_id="config_3",
        config_path="ai/config/ablations/configuration_3_mobilenetv3_small_kd_ssl_teacher.json",
        phase="student",
        description="MobileNetV3-Small + KD from SSL teacher",
        depends_on="config_8",
        tags={"ssl": "yes", "ca": "no", "kd": "yes"},
    ),
    ExperimentSpec(
        experiment_id="config_4",
        config_path="ai/config/ablations/configuration_4_ca_mobilenetv3_small_kd_ssl_teacher.json",
        phase="student",
        description="CA-MobileNetV3-Small + KD from SSL teacher",
        depends_on="config_8",
        tags={"ssl": "yes", "ca": "yes", "kd": "yes"},
    ),
    ExperimentSpec(
        experiment_id="config_7",
        config_path="ai/config/ablations/configuration_7_optional_ca_kd_non_ssl_teacher.json",
        phase="student",
        description="CA-MobileNetV3-Small distilled from non-SSL teacher (optional)",
        depends_on="config_5_teacher",
        tags={"ssl": "no", "ca": "yes", "kd": "yes"},
    ),
]

EXPERIMENT_MAP: dict[str, ExperimentSpec] = {spec.experiment_id: spec for spec in EXPERIMENTS}


# ---------------------------------------------------------------------------
# Output names produced by each entry point
# ---------------------------------------------------------------------------
CHECKPOINT_NAMES: dict[str, str] = {
    "baseline": "best_baseline.keras",
    "supervised_ablation": "best_ca_supervised_student.keras",
    "teacher": "best_teacher.keras",
    "student": "best_student.keras",
}

TRAINING_HISTORY_NAMES: dict[str, str] = {
    "baseline": "baseline_history.json",
    "supervised_ablation": "supervised_ablation_history.json",
    "teacher": "teacher_history.json",
    "student": "student_history.json",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _load_config_value(config_path: str) -> dict[str, Any]:
    """Load a config JSON without importing TF."""
    return json.loads(Path(config_path).read_text(encoding="utf-8"))


def _experiment_output_dir(config_path: str) -> Path:
    return Path(_load_config_value(config_path).get("runtime", {}).get("output_dir", "ai/artifacts"))


def _checkpoint_path(spec: ExperimentSpec) -> Path:
    output_dir = _experiment_output_dir(spec.config_path)
    phase = spec.phase
    if phase == "teacher" and spec.experiment_id == "config_5_teacher":
        return output_dir / "best_teacher_no_ssl.keras"
    return output_dir / CHECKPOINT_NAMES.get(phase, "best_model.keras")


def _config_snapshot_path(spec: ExperimentSpec) -> Path:
    return _experiment_output_dir(spec.config_path) / "experiment_config.json"


def experiment_metadata(spec: ExperimentSpec) -> dict[str, Any]:
    """Return the serialisable metadata record for one experiment."""
    config = _load_config_value(spec.config_path)
    teacher_config = config.get("teacher", {})
    student_config = config.get("student", {})
    return {
        "experiment_id": spec.experiment_id,
        "config_path": spec.config_path,
        "description": spec.description,
        "phase": spec.phase,
        "depends_on": spec.depends_on,
        "tags": spec.tags,
        "teacher_backbone": teacher_config.get("backbone", "N/A"),
        "student_backbone": student_config.get("backbone", "N/A"),
        "ssl_enabled": teacher_config.get("ssl_enabled", False),
        "coordinate_attention": student_config.get("coordinate_attention", False),
        "distillation_enabled": config.get("distillation", {}).get("enabled", False),
        "output_dir": str(_experiment_output_dir(spec.config_path)),
    }


# ---------------------------------------------------------------------------
# Training dispatch
# ---------------------------------------------------------------------------
def _run_baseline(spec: ExperimentSpec, args: argparse.Namespace) -> Path:
    from ai.training.train_baseline import train as train_baseline

    sys_args = [
        "--config", spec.config_path,
        "--dataset-dir", args.dataset_dir,
        "--output-dir", str(_experiment_output_dir(spec.config_path)),
    ]
    if args.split_manifest:
        sys_args.extend(["--split-manifest", args.split_manifest])
    namespace = argparse.Namespace(
        config=spec.config_path,
        dataset_dir=args.dataset_dir,
        output_dir=str(_experiment_output_dir(spec.config_path)),
        split_manifest=args.split_manifest or None,
        final_split_dir=getattr(args, "final_split_dir", None),
        ssl_unlabeled_dir=getattr(args, "ssl_unlabeled_dir", None),
        ssl_manifest=getattr(args, "ssl_manifest", None),
        davao_field_dir=getattr(args, "davao_field_dir", None),
        davao_field_manifest=getattr(args, "davao_field_manifest", None),
        skip_fine_tune=False,
    )
    return train_baseline(namespace)


def _run_supervised_ablation(spec: ExperimentSpec, args: argparse.Namespace) -> Path:
    from ai.training.train_supervised_ablation import train as train_supervised

    namespace = argparse.Namespace(
        config=spec.config_path,
        dataset_dir=args.dataset_dir,
        output_dir=str(_experiment_output_dir(spec.config_path)),
        split_manifest=args.split_manifest or None,
        final_split_dir=getattr(args, "final_split_dir", None),
        ssl_unlabeled_dir=getattr(args, "ssl_unlabeled_dir", None),
        ssl_manifest=getattr(args, "ssl_manifest", None),
        davao_field_dir=getattr(args, "davao_field_dir", None),
        davao_field_manifest=getattr(args, "davao_field_manifest", None),
    )
    return train_supervised(namespace)


def _run_teacher(spec: ExperimentSpec, args: argparse.Namespace) -> Path:
    from ai.training.train_teacher import train as train_teacher

    namespace = argparse.Namespace(
        config=spec.config_path,
        dataset_dir=args.dataset_dir,
        output_dir=str(_experiment_output_dir(spec.config_path)),
        split_manifest=args.split_manifest or None,
        final_split_dir=getattr(args, "final_split_dir", None),
        ssl_unlabeled_dir=getattr(args, "ssl_unlabeled_dir", None),
        ssl_manifest=getattr(args, "ssl_manifest", None),
        davao_field_dir=getattr(args, "davao_field_dir", None),
        davao_field_manifest=getattr(args, "davao_field_manifest", None),
        resume_ssl=False,
        resume_finetune=False,
    )
    return train_teacher(namespace)


def _run_student(spec: ExperimentSpec, teacher_path: Path, args: argparse.Namespace) -> Path:
    from ai.training.train_student import train as train_student

    namespace = argparse.Namespace(
        config=spec.config_path,
        dataset_dir=args.dataset_dir,
        output_dir=str(_experiment_output_dir(spec.config_path)),
        split_manifest=args.split_manifest or None,
        final_split_dir=getattr(args, "final_split_dir", None),
        ssl_unlabeled_dir=getattr(args, "ssl_unlabeled_dir", None),
        ssl_manifest=getattr(args, "ssl_manifest", None),
        davao_field_dir=getattr(args, "davao_field_dir", None),
        davao_field_manifest=getattr(args, "davao_field_manifest", None),
        teacher_model=str(teacher_path),
        initial_student_model=None,
    )
    return train_student(namespace)


# ---------------------------------------------------------------------------
# Evaluation dispatch (test-set only, called after all training is frozen)
# ---------------------------------------------------------------------------
def _evaluate_baseline(spec: ExperimentSpec, checkpoint: Path, args: argparse.Namespace) -> dict[str, Any]:
    from ai.evaluation.evaluate_baseline import evaluate as eval_baseline

    namespace = argparse.Namespace(
        config=spec.config_path,
        dataset_dir=args.dataset_dir,
        output_dir=str(_experiment_output_dir(spec.config_path)),
        split_manifest=args.split_manifest or None,
        final_split_dir=getattr(args, "final_split_dir", None),
        ssl_unlabeled_dir=getattr(args, "ssl_unlabeled_dir", None),
        ssl_manifest=getattr(args, "ssl_manifest", None),
        davao_field_dir=getattr(args, "davao_field_dir", None),
        davao_field_manifest=getattr(args, "davao_field_manifest", None),
        baseline_model=str(checkpoint),
        gradcam_count=0,
        latency_runs=10,
    )
    return eval_baseline(namespace)


def _evaluate_teacher(spec: ExperimentSpec, checkpoint: Path, args: argparse.Namespace) -> dict[str, Any]:
    from ai.evaluation.evaluate_teacher import evaluate as eval_teacher

    namespace = argparse.Namespace(
        config=spec.config_path,
        dataset_dir=args.dataset_dir,
        output_dir=str(_experiment_output_dir(spec.config_path)),
        split_manifest=args.split_manifest or None,
        final_split_dir=getattr(args, "final_split_dir", None),
        ssl_unlabeled_dir=getattr(args, "ssl_unlabeled_dir", None),
        ssl_manifest=getattr(args, "ssl_manifest", None),
        davao_field_dir=getattr(args, "davao_field_dir", None),
        davao_field_manifest=getattr(args, "davao_field_manifest", None),
        teacher_model=str(checkpoint),
    )
    return eval_teacher(namespace)


def _evaluate_student(spec: ExperimentSpec, checkpoint: Path, args: argparse.Namespace) -> dict[str, Any]:
    from ai.evaluation.evaluate_student import evaluate as eval_student

    namespace = argparse.Namespace(
        config=spec.config_path,
        dataset_dir=args.dataset_dir,
        output_dir=str(_experiment_output_dir(spec.config_path)),
        split_manifest=args.split_manifest or None,
        final_split_dir=getattr(args, "final_split_dir", None),
        ssl_unlabeled_dir=getattr(args, "ssl_unlabeled_dir", None),
        ssl_manifest=getattr(args, "ssl_manifest", None),
        davao_field_dir=getattr(args, "davao_field_dir", None),
        davao_field_manifest=getattr(args, "davao_field_manifest", None),
        student_model=str(checkpoint),
        gradcam_count=0,
        latency_runs=10,
    )
    return eval_student(namespace)


# ---------------------------------------------------------------------------
# Shared split initialisation
# ---------------------------------------------------------------------------
def ensure_shared_split(args: argparse.Namespace) -> Path:
    """Create the dataset split once and return the manifest path.

    All experiments reference this single manifest so partitions are identical.
    """
    from ai.config.config import ExperimentConfig, load_config, save_config, set_global_determinism

    config = load_config(args.config_path if hasattr(args, "config_path") and args.config_path else None)
    if getattr(args, "dataset_dir", None):
        config.data.dataset_dir = args.dataset_dir
    if getattr(args, "final_split_dir", None):
        config.data.final_split_dir = args.final_split_dir
    if getattr(args, "output_dir", None):
        config.runtime.output_dir = args.output_dir
    config.validate()
    set_global_determinism(config.runtime.seed)

    shared_manifest_dir = Path(config.runtime.output_dir) / "shared_splits"
    shared_manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = shared_manifest_dir / "split_manifest.json"

    if manifest_path.is_file():
        print(f"Reusing existing shared split manifest: {manifest_path}")
        return manifest_path

    from ai.data.dataset import prepare_splits

    print(f"Creating shared split manifest at {manifest_path} ...")
    prepare_splits(config, manifest_path)
    print(f"Shared split manifest created: {manifest_path}")
    return manifest_path


# ---------------------------------------------------------------------------
# Training phase
# ---------------------------------------------------------------------------
def _dependency_chain(specs: list[ExperimentSpec]) -> list[list[ExperimentSpec]]:
    """Topological sort into parallelisable levels."""
    by_id = {s.experiment_id: s for s in specs}
    resolved: set[str] = set()
    levels: list[list[ExperimentSpec]] = []

    remaining = list(specs)
    while remaining:
        ready = [
            s for s in remaining
            if s.depends_on is None or s.depends_on in resolved
        ]
        if not ready:
            raise ValueError(
                f"Circular or unsatisfiable dependencies among: {[s.experiment_id for s in remaining]}"
            )
        levels.append(ready)
        resolved |= {s.experiment_id for s in ready}
        remaining = [s for s in remaining if s.experiment_id not in resolved]

    return levels


def run_training(
    specs: list[ExperimentSpec],
    args: argparse.Namespace,
    shared_manifest: Path,
) -> dict[str, Path]:
    """Train all experiments in dependency order. Return {experiment_id: checkpoint_path}."""
    checkpoints: dict[str, Path] = {}
    levels = _dependency_chain(specs)

    for level_index, level in enumerate(levels):
        print(f"\n{'='*70}")
        print(f"Training level {level_index + 1}/{len(levels)}: {[s.experiment_id for s in level]}")
        print(f"{'='*70}")

        for spec in level:
            start = time.time()
            print(f"\n--- [{spec.experiment_id}] {spec.description} ---")

            snapshot_dest = _config_snapshot_path(spec)
            snapshot_dest.parent.mkdir(parents=True, exist_ok=True)
            snapshot_dest.write_text(
                json.dumps(experiment_metadata(spec), indent=2, sort_keys=True),
                encoding="utf-8",
            )

            if spec.phase == "baseline":
                checkpoint = _run_baseline(spec, args)
            elif spec.phase == "supervised_ablation":
                checkpoint = _run_supervised_ablation(spec, args)
            elif spec.phase == "teacher":
                checkpoint = _run_teacher(spec, args)
            elif spec.phase == "student":
                teacher_checkpoint = checkpoints.get(spec.depends_on)
                if teacher_checkpoint is None:
                    raise RuntimeError(
                        f"Teacher checkpoint for {spec.experiment_id} "
                        f"(depends_on={spec.depends_on}) not found"
                    )
                checkpoint = _run_student(spec, teacher_checkpoint, args)
            else:
                raise ValueError(f"Unknown phase: {spec.phase}")

            elapsed = time.time() - start
            checkpoints[spec.experiment_id] = checkpoint
            print(f"[{spec.experiment_id}] completed in {elapsed:.1f}s -> {checkpoint}")

    return checkpoints


# ---------------------------------------------------------------------------
# Evaluation phase (test-set, after ALL training is frozen)
# ---------------------------------------------------------------------------
def run_test_evaluation(
    specs: list[ExperimentSpec],
    checkpoints: dict[str, Path],
    args: argparse.Namespace,
) -> dict[str, dict[str, Any]]:
    """Evaluate every experiment on the held-out test set. Returns metrics keyed by experiment_id."""
    results: dict[str, dict[str, Any]] = {}

    for spec in specs:
        if spec.experiment_id not in checkpoints:
            print(f"Skipping {spec.experiment_id}: no checkpoint")
            continue
        checkpoint = checkpoints[spec.experiment_id]
        if not checkpoint.is_file():
            print(f"Skipping {spec.experiment_id}: checkpoint not found at {checkpoint}")
            continue

        print(f"\n--- Evaluating {spec.experiment_id} on test set ---")
        try:
            if spec.phase in ("baseline",):
                metrics = _evaluate_baseline(spec, checkpoint, args)
            elif spec.phase in ("teacher",):
                metrics = _evaluate_teacher(spec, checkpoint, args)
            elif spec.phase in ("student", "supervised_ablation"):
                if spec.experiment_id == "config_5":
                    metrics = _evaluate_teacher(spec, checkpoint, args)
                else:
                    metrics = _evaluate_student(spec, checkpoint, args)
            else:
                print(f"No evaluator for phase={spec.phase}")
                continue
            results[spec.experiment_id] = metrics
            print(f"  accuracy={metrics.get('accuracy', 'N/A')}, macro_f1={metrics.get('macro_f1', 'N/A')}")
        except Exception as error:
            print(f"  ERROR evaluating {spec.experiment_id}: {error}")
            results[spec.experiment_id] = {"error": str(error)}

    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset-dir", required=True, help="Root directory of the banana leaf dataset")
    parser.add_argument("--output-root", default="ai/artifacts", help="Root directory for all experiment outputs")
    parser.add_argument(
        "--only",
        nargs="*",
        help="Run only these experiment IDs (e.g. --only config_1 config_2 config_4)",
    )
    parser.add_argument(
        "--run-tests",
        action="store_true",
        help="After all training completes, evaluate every model on the held-out test set",
    )
    parser.add_argument("--split-manifest", default=None, help="Pre-existing shared split manifest (optional)")
    parser.add_argument("--final-split-dir", default=None, help="Frozen final split directory")
    parser.add_argument("--ssl-unlabeled-dir", default=None)
    parser.add_argument("--ssl-manifest", default=None)
    parser.add_argument("--davao-field-dir", default=None)
    parser.add_argument("--davao-field-manifest", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    start = time.time()

    specs = EXPERIMENTS
    if args.only:
        selected = set(args.only)
        # Always include dependency teachers
        extras: set[str] = set()
        for spec in specs:
            if spec.experiment_id in selected and spec.depends_on:
                extras.add(spec.depends_on)
        specs = [s for s in specs if s.experiment_id in selected or s.experiment_id in extras]

    print("Thesis ablation runner")
    print(f"  Experiments: {[s.experiment_id for s in specs]}")
    print(f"  Dataset dir: {args.dataset_dir}")
    print(f"  Output root: {args.output_root}")
    print(f"  Run tests: {args.run_tests}")
    print()

    # Phase 0: Create shared split
    shared_manifest = ensure_shared_split(args)

    # Phase 1: Training
    checkpoints = run_training(specs, args, shared_manifest)

    # Phase 2: Test evaluation (only after ALL training is complete)
    test_results: dict[str, dict[str, Any]] = {}
    if args.run_tests:
        print(f"\n{'='*70}")
        print("Phase 2: Test-set evaluation (all training frozen)")
        print(f"{'='*70}")
        test_results = run_test_evaluation(specs, checkpoints, args)

    # Phase 3: Write manifest and result table
    elapsed = time.time() - start
    runner_manifest = {
        "schema_version": 1,
        "status": "complete",
        "total_elapsed_seconds": elapsed,
        "experiments": [experiment_metadata(spec) for spec in specs],
        "checkpoints": {eid: str(path) for eid, path in checkpoints.items()},
    }
    manifest_dir = Path(args.output_root)
    manifest_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = manifest_dir / "experiment_runner_manifest.json"
    manifest_path.write_text(json.dumps(runner_manifest, indent=2, sort_keys=True), encoding="utf-8")
    print(f"\nRunner manifest: {manifest_path}")

    if test_results:
        from ai.evaluation.results_table import build_result_table

        table_path = build_result_table(specs, checkpoints, test_results, args.output_root)
        print(f"Result table: {table_path}")

    print(f"\nTotal elapsed: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
