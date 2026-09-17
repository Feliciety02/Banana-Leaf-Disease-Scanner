"""CPU-only stage gates for the balanced-dataset PILOT-05 through PILOT-08.

This module deliberately imports no TensorFlow code.  It may be used while a GPU
training process is active to inspect readiness, freeze validation-only choices,
and prepare later configuration files without reserving GPU memory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import sys
from copy import deepcopy
from pathlib import Path
from typing import Any


PILOT_ROOT_DEFAULT = Path("ai/artifacts/four_class/pilot_2878_v1")
CONFIG_ROOT_DEFAULT = Path("ai/config/pilot_2878_v1")
PYTHON_BIN = "/home/feanne/.venvs/dahonmd-tf-gpu/bin/python"
DATASET_DIR = "/home/feanne/dahonmd-data/banana_leaf_thesis_4class"
SPLIT_DIR = "datasets/outputs/final-split/banana-leaf-thesis-split-2878-v1"
SEEDS = (42, 1337, 2026)


class StageBlocked(RuntimeError):
    """Raised when a later pilot is requested before its prerequisites exist."""


def _load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise StageBlocked(f"Required artifact is missing: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as error:
        raise StageBlocked(f"Required artifact is unreadable: {path}: {error}") from error
    if not isinstance(payload, dict):
        raise StageBlocked(f"Required artifact must contain a JSON object: {path}")
    return payload


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _atomic_write(path: Path, payload: dict[str, Any]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)
    return path


def _validation_value(path: Path) -> float:
    payload = _load_json(path)
    if payload.get("partition") != "validation":
        raise StageBlocked(f"Selection metric is not validation-only: {path}")
    if payload.get("test_set_evaluated") is not False:
        raise StageBlocked(f"Selection artifact does not affirm an untouched test set: {path}")
    try:
        return float(payload["value"])
    except (KeyError, TypeError, ValueError) as error:
        raise StageBlocked(f"Validation metric has no numeric value: {path}") from error


def _require_complete(run_dir: Path, marker_name: str) -> None:
    marker = _load_json(run_dir / marker_name)
    if marker.get("status") != "complete":
        raise StageBlocked(f"Run is not marked complete: {run_dir / marker_name}")


def _write_once(path: Path, payload: dict[str, Any]) -> Path:
    """Make selection records immutable but allow an identical retry."""
    if path.exists():
        existing = _load_json(path)
        if existing != payload:
            raise StageBlocked(f"Frozen selection already exists and differs: {path}")
        return path
    return _atomic_write(path, payload)


def select_teacher(pilot_root: Path = PILOT_ROOT_DEFAULT) -> Path:
    candidates = {
        "pilot_03_imagenet": pilot_root / "pilot_03_teacher_imagenet_seed42",
        "pilot_04_ssl": pilot_root / "pilot_04_teacher_fresh_ssl_seed42",
    }
    rows: list[dict[str, Any]] = []
    for candidate_id, run_dir in candidates.items():
        _require_complete(run_dir, "teacher_training.complete.json")
        metric_path = run_dir / "validation_metrics.json"
        model_path = run_dir / "best_teacher.keras"
        config_path = run_dir / "teacher_experiment_config.json"
        value = _validation_value(metric_path)
        for required in (model_path, config_path):
            if not required.is_file():
                raise StageBlocked(f"Completed teacher is missing: {required}")
        rows.append({
            "candidate_id": candidate_id,
            "validation_macro_f1": value,
            "model_path": model_path.as_posix(),
            "model_sha256": _sha256(model_path),
            "config_path": config_path.as_posix(),
            "config_sha256": _sha256(config_path),
            "metrics_path": metric_path.as_posix(),
            "metrics_sha256": _sha256(metric_path),
        })
    # The documented tie rule keeps the ImageNet-only control when SSL is not higher.
    selected = max(rows, key=lambda row: (row["validation_macro_f1"], row["candidate_id"] == "pilot_03_imagenet"))
    return _write_once(pilot_root / "pilot_05_teacher_selection.json", {
        "schema_version": 1,
        "selection_partition": "validation",
        "selection_metric": "macro_f1",
        "tie_rule": "select pilot_03_imagenet unless pilot_04_ssl is strictly higher",
        "test_set_evaluated": False,
        "candidates": rows,
        "selected": selected,
    })


def prepare_pilot6_config(
    pilot_root: Path = PILOT_ROOT_DEFAULT,
    config_root: Path = CONFIG_ROOT_DEFAULT,
) -> Path:
    selection = _load_json(pilot_root / "pilot_05_teacher_selection.json")["selected"]
    candidate_id = selection["candidate_id"]
    branch = "ssl" if candidate_id == "pilot_04_ssl" else "imagenet"
    source_path = pilot_root / "pilot_02_ca_supervised_seed42" / "student_supervised_experiment_config.json"
    config = deepcopy(_load_json(source_path))
    config["experiment_name"] = f"pilot_06_ca_kd_{branch}_teacher_seed42"
    config["teacher"]["ssl_enabled"] = branch == "ssl"
    config["distillation"]["enabled"] = True
    # The selected supervised protocol used batch 32. Preserve that optimizer
    # batch with eight micro-batches that fit beside the frozen ResNet teacher.
    config["data"]["batch_size"] = 4
    config["data"]["evaluation_batch_size"] = 32
    config["student"]["gradient_accumulation_steps"] = 8
    config["data"]["decoded_cache_dir"] = "/home/feanne/dahonmd-data/tf-cache/pilot_2878_v1_shared"
    output_dir = pilot_root / f"pilot_06_ca_kd_{branch}_teacher_seed42"
    config["runtime"]["output_dir"] = output_dir.as_posix()
    provenance = {
        "source_student_protocol": source_path.as_posix(),
        "source_student_protocol_sha256": _sha256(source_path),
        "teacher_selection": (pilot_root / "pilot_05_teacher_selection.json").as_posix(),
        "selected_teacher_model": selection["model_path"],
        "selected_teacher_model_sha256": selection["model_sha256"],
        "allowed_method_change": "distillation enabled; student protocol otherwise preserved",
        "memory_policy": "micro-batch 4 x 8 accumulation steps preserves effective batch 32",
    }
    path = config_root / f"pilot_06_ca_kd_{branch}_teacher_seed42.json"
    written = _write_once(path, config)
    _write_once(path.with_name(f"{path.stem}_provenance.json"), provenance)
    return written


def _require_empty_output(output: Path) -> None:
    if output.exists() and any(output.iterdir()):
        raise StageBlocked(f"New-run output directory already exists and is not empty: {output}")


def _active_training_processes() -> list[str]:
    proc = Path("/proc")
    if not proc.is_dir():
        return []
    active: list[str] = []
    for entry in proc.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            command = (entry / "cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace")
        except OSError:
            continue
        if "ai.training.train_" in command:
            active.append(f"PID {entry.name}: {command.strip()}")
    return active


def _require_linux_launch_context() -> None:
    """Ensure the process guard can see trainers running inside WSL/Linux."""
    if sys.platform != "linux" or not Path("/proc").is_dir():
        raise StageBlocked(
            "Generate launch commands inside the same Linux/WSL environment used "
            "for training; a Windows process cannot safely detect WSL trainers"
        )


def _require_no_active_training() -> None:
    """Refuse GPU launch preparation when another repository trainer is active."""
    active = _active_training_processes()
    if active:
        raise StageBlocked("Another training process is active; preserve single-GPU isolation: " + "; ".join(active))


def _format_training_command(parts: list[str], output: Path) -> str:
    guard = """set -o pipefail
if pgrep -af 'ai[.]training[.]train_'; then
  echo "Another repository trainer is active; do not share the GPU." >&2
  exit 1
fi
"""
    return guard + f'mkdir -p "{output.as_posix()}"\n\n' + " \\\n  ".join(
        parts + [f'2>&1 | tee "{(output / "training.log").as_posix()}"']
    )


def pilot6_command(
    pilot_root: Path = PILOT_ROOT_DEFAULT,
    config_root: Path = CONFIG_ROOT_DEFAULT,
) -> str:
    _require_linux_launch_context()
    _require_no_active_training()
    selection = _load_json(pilot_root / "pilot_05_teacher_selection.json")["selected"]
    branch = "ssl" if selection["candidate_id"] == "pilot_04_ssl" else "imagenet"
    config = config_root / f"pilot_06_ca_kd_{branch}_teacher_seed42.json"
    if not config.is_file():
        raise StageBlocked(f"Prepare the PILOT-06 config first: {config}")
    output = pilot_root / f"pilot_06_ca_kd_{branch}_teacher_seed42"
    _require_empty_output(output)
    return _format_training_command([
        f'"{PYTHON_BIN}" -u -m ai.training.train_student',
        f'--config "{config.as_posix()}"',
        f'--dataset-dir "{DATASET_DIR}"',
        f'--final-split-dir "{SPLIT_DIR}"',
        f'--output-dir "{output.as_posix()}"',
        f'--teacher-model "{selection["model_path"]}"',
    ], output)


def select_student(pilot_root: Path = PILOT_ROOT_DEFAULT) -> Path:
    teacher_selection = _load_json(pilot_root / "pilot_05_teacher_selection.json")["selected"]
    branch = "ssl" if teacher_selection["candidate_id"] == "pilot_04_ssl" else "imagenet"
    pilot02 = pilot_root / "pilot_02_ca_supervised_seed42"
    pilot06 = pilot_root / f"pilot_06_ca_kd_{branch}_teacher_seed42"
    candidates = [
        {
            "candidate_id": "pilot_02_supervised",
            "run_dir": pilot02,
            "metric": pilot02 / "student_supervised_validation_metrics.json",
            "model": pilot02 / "best_supervised_student.keras",
            "config": pilot02 / "student_supervised_experiment_config.json",
            "complete": "student_supervised_training.complete.json",
            "model_filename": "best_supervised_student.keras",
        },
        {
            "candidate_id": "pilot_06_kd",
            "run_dir": pilot06,
            "metric": pilot06 / "student_validation_metrics.json",
            "model": pilot06 / "best_student.keras",
            "config": pilot06 / "student_experiment_config.json",
            "complete": "student_training.complete.json",
            "model_filename": "best_student.keras",
        },
    ]
    rows: list[dict[str, Any]] = []
    for candidate in candidates:
        _require_complete(candidate["run_dir"], candidate["complete"])
        value = _validation_value(candidate["metric"])
        for required in (candidate["model"], candidate["config"]):
            if not required.is_file():
                raise StageBlocked(f"Completed student is missing: {required}")
        rows.append({
            "candidate_id": candidate["candidate_id"],
            "validation_macro_f1": value,
            "run_dir": candidate["run_dir"].as_posix(),
            "model_filename": candidate["model_filename"],
            "model_path": candidate["model"].as_posix(),
            "model_sha256": _sha256(candidate["model"]),
            "config_path": candidate["config"].as_posix(),
            "config_sha256": _sha256(candidate["config"]),
            "metrics_path": candidate["metric"].as_posix(),
        })
    # KD must strictly beat the already selected supervised student.
    selected = rows[1] if rows[1]["validation_macro_f1"] > rows[0]["validation_macro_f1"] else rows[0]
    return _write_once(pilot_root / "pilot_06_student_selection.json", {
        "schema_version": 1,
        "selection_partition": "validation",
        "selection_metric": "macro_f1",
        "tie_rule": "retain pilot_02_supervised unless pilot_06_kd is strictly higher",
        "test_set_evaluated": False,
        "candidates": rows,
        "selected": selected,
    })


def prepare_pilot7_configs(
    pilot_root: Path = PILOT_ROOT_DEFAULT,
    config_root: Path = CONFIG_ROOT_DEFAULT,
) -> list[Path]:
    selected = _load_json(pilot_root / "pilot_06_student_selection.json")["selected"]
    source_path = Path(selected["config_path"])
    source = _load_json(source_path)
    kind = "kd" if selected["candidate_id"] == "pilot_06_kd" else "supervised"
    written: list[Path] = []
    # Seed 42 is the selection run itself. Reusing it avoids a mathematically
    # duplicate GPU run; only the two new confirmation seeds need training.
    for seed in SEEDS[1:]:
        config = deepcopy(source)
        config["experiment_name"] = f"pilot_07_{kind}_seed{seed}"
        config["runtime"]["seed"] = seed
        config["runtime"]["output_dir"] = (
            pilot_root / f"pilot_07_selected_student_seed{seed}"
        ).as_posix()
        config["data"]["decoded_cache_dir"] = "/home/feanne/dahonmd-data/tf-cache/pilot_2878_v1_shared"
        config["data"]["evaluation_batch_size"] = 32
        provenance = {
            "selected_configuration": selected["candidate_id"],
            "seed_42_source_run": selected["run_dir"],
            "seed_42_model_sha256": selected["model_sha256"],
            "only_scientific_change_from_selected_config": "runtime.seed",
            "operational_cache_path_change": "decoded_cache_dir only; decoded tensors are identical",
        }
        path = config_root / f"pilot_07_{kind}_seed{seed}.json"
        written.append(_write_once(path, config))
        _write_once(path.with_name(f"{path.stem}_provenance.json"), provenance)
    return written


def pilot7_commands(
    pilot_root: Path = PILOT_ROOT_DEFAULT,
    config_root: Path = CONFIG_ROOT_DEFAULT,
) -> str:
    _require_linux_launch_context()
    _require_no_active_training()
    selected = _load_json(pilot_root / "pilot_06_student_selection.json")["selected"]
    kd = selected["candidate_id"] == "pilot_06_kd"
    kind = "kd" if kd else "supervised"
    blocks: list[str] = []
    for seed in SEEDS[1:]:
        config = config_root / f"pilot_07_{kind}_seed{seed}.json"
        if not config.is_file():
            raise StageBlocked(f"Prepare the PILOT-07 configs first: {config}")
        output = pilot_root / f"pilot_07_selected_student_seed{seed}"
        _require_empty_output(output)
        parts = [
            f'"{PYTHON_BIN}" -u -m ai.training.{"train_student" if kd else "train_enhanced_supervised"}',
            f'--config "{config.as_posix()}"',
            f'--dataset-dir "{DATASET_DIR}"',
            f'--final-split-dir "{SPLIT_DIR}"',
            f'--output-dir "{output.as_posix()}"',
        ]
        if kd:
            teacher = _load_json(pilot_root / "pilot_05_teacher_selection.json")["selected"]
            parts.append(f'--teacher-model "{teacher["model_path"]}"')
        blocks.append(_format_training_command(parts, output))
    return "\n\n# Run the next seed only after the preceding process exits successfully.\n\n".join(blocks)


def freeze_pilot7(pilot_root: Path = PILOT_ROOT_DEFAULT) -> Path:
    selected = _load_json(pilot_root / "pilot_06_student_selection.json")["selected"]
    kd = selected["candidate_id"] == "pilot_06_kd"
    metric_name = "student_validation_metrics.json" if kd else "student_supervised_validation_metrics.json"
    model_name = "best_student.keras" if kd else "best_supervised_student.keras"
    complete_name = "student_training.complete.json" if kd else "student_supervised_training.complete.json"
    rows: list[dict[str, Any]] = []
    for seed in SEEDS:
        run_dir = Path(selected["run_dir"]) if seed == 42 else pilot_root / f"pilot_07_selected_student_seed{seed}"
        _require_complete(run_dir, complete_name)
        metric_path = run_dir / metric_name
        model_path = run_dir / model_name
        value = _validation_value(metric_path)
        if not model_path.is_file():
            raise StageBlocked(f"Completed seed is missing its model: {model_path}")
        rows.append({
            "seed": seed,
            "run_dir": run_dir.as_posix(),
            "validation_macro_f1": value,
            "model_path": model_path.as_posix(),
            "model_sha256": _sha256(model_path),
        })
    values = [row["validation_macro_f1"] for row in rows]
    # Seed 42 is predeclared as the deployment checkpoint. The other seeds measure
    # robustness and are never searched for a more favorable test candidate.
    final = rows[0]
    return _write_once(pilot_root / "pilot_07_final_selection.json", {
        "schema_version": 1,
        "selection_partition": "validation",
        "test_set_evaluated": False,
        "seed_policy": "seed 42 predeclared; seeds 1337 and 2026 are robustness confirmations",
        "validation_macro_f1_mean": statistics.fmean(values),
        "validation_macro_f1_sample_stddev": statistics.stdev(values),
        "seeds": rows,
        "final": {
            **final,
            "config_path": selected["config_path"],
            "config_sha256": selected["config_sha256"],
        },
    })


def pilot8_command(pilot_root: Path = PILOT_ROOT_DEFAULT) -> str:
    _require_linux_launch_context()
    _require_no_active_training()
    frozen = _load_json(pilot_root / "pilot_07_final_selection.json")
    if frozen.get("test_set_evaluated") is not False:
        raise StageBlocked("PILOT-07 freeze record does not preserve the locked-test boundary")
    final = frozen["final"]
    output = pilot_root / "pilot_08_locked_test"
    if output.exists() and any(output.iterdir()):
        raise StageBlocked(f"Locked-test output already exists and is not empty: {output}")
    guard = """set -o pipefail
if pgrep -af 'ai[.]training[.]train_'; then
  echo "Another repository trainer is active; do not share the GPU." >&2
  exit 1
fi
"""
    return guard + f'mkdir -p "{output.as_posix()}"\n\n' + " \\\n  ".join([
        f'"{PYTHON_BIN}" -u -m ai.evaluation.evaluate_student',
        f'--config "{final["config_path"]}"',
        f'--dataset-dir "{DATASET_DIR}"',
        f'--final-split-dir "{SPLIT_DIR}"',
        f'--output-dir "{output.as_posix()}"',
        f'--student-model "{final["model_path"]}"',
        '--gradcam-count 5',
        '--latency-runs 100',
        f'2>&1 | tee "{(output / "evaluation.log").as_posix()}"',
    ])


def status(pilot_root: Path = PILOT_ROOT_DEFAULT) -> dict[str, str]:
    stages = {
        "PILOT-04": pilot_root / "pilot_04_teacher_fresh_ssl_seed42" / "teacher_training.complete.json",
        "PILOT-05": pilot_root / "pilot_05_teacher_selection.json",
        "PILOT-06": pilot_root / "pilot_06_student_selection.json",
        "PILOT-07": pilot_root / "pilot_07_final_selection.json",
        "PILOT-08": pilot_root / "pilot_08_locked_test" / "student_evaluation.json",
    }
    complete = {stage: artifact.is_file() for stage, artifact in stages.items()}
    active = _active_training_processes()
    result = {
        "PILOT-04": (
            "complete" if complete["PILOT-04"]
            else "running; completion marker pending" if any("train_teacher" in item for item in active)
            else "incomplete; completion marker absent"
        ),
        "PILOT-05": (
            "complete" if complete["PILOT-05"] else "ready" if complete["PILOT-04"] else "blocked by PILOT-04"
        ),
        "PILOT-06": (
            "complete" if complete["PILOT-06"] else "ready" if complete["PILOT-05"] else "blocked by PILOT-05"
        ),
        "PILOT-07": (
            "complete" if complete["PILOT-07"] else "ready" if complete["PILOT-06"] else "blocked by PILOT-06"
        ),
        "PILOT-08": "complete" if complete["PILOT-08"] else "locked until PILOT-07 freeze",
    }
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action",
        choices=(
            "status", "select-teacher", "prepare-pilot6", "pilot6-command",
            "select-student", "prepare-pilot7", "pilot7-commands",
            "freeze-pilot7", "pilot8-command",
        ),
    )
    parser.add_argument("--pilot-root", type=Path, default=PILOT_ROOT_DEFAULT)
    parser.add_argument("--config-root", type=Path, default=CONFIG_ROOT_DEFAULT)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        if args.action == "status":
            print(json.dumps(status(args.pilot_root), indent=2))
        elif args.action == "select-teacher":
            print(select_teacher(args.pilot_root))
        elif args.action == "prepare-pilot6":
            print(prepare_pilot6_config(args.pilot_root, args.config_root))
        elif args.action == "pilot6-command":
            print(pilot6_command(args.pilot_root, args.config_root))
        elif args.action == "select-student":
            print(select_student(args.pilot_root))
        elif args.action == "prepare-pilot7":
            print("\n".join(str(path) for path in prepare_pilot7_configs(args.pilot_root, args.config_root)))
        elif args.action == "pilot7-commands":
            print(pilot7_commands(args.pilot_root, args.config_root))
        elif args.action == "freeze-pilot7":
            print(freeze_pilot7(args.pilot_root))
        else:
            print(pilot8_command(args.pilot_root))
    except (StageBlocked, KeyError, TypeError) as error:
        raise SystemExit(f"BLOCKED: {error}") from error


if __name__ == "__main__":
    main()
