"""Colab-ready training script for DahonMD thesis models.

Usage in Google Colab:
1. Upload datasets/banana_leaf_thesis_4class/ to Google Drive under "DahonMD/"
2. Upload ai/ directory to Google Drive under "DahonMD/"
3. Upload ai/artifacts/final_split/ to Google Drive under "DahonMD/"
4. Run this script in Colab (GPU runtime required)
"""
from __future__ import annotations

import os
import sys
import json
import shutil
from pathlib import Path

# ── Phase 0: Environment setup ──────────────────────────────────────────────

def setup_colab():
    """Mount Google Drive and install dependencies."""
    try:
        from google.colab import drive
        drive.mount("/content/drive")
        print("Google Drive mounted at /content/drive")
    except ImportError:
        print("Not running in Colab — using local paths")

    os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
    os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

    # Install dependencies
    os.system("pip install -q tqdm")


def find_project_root() -> Path:
    """Locate the DahonMD project root."""
    candidates = [
        Path("/content/drive/MyDrive/DahonMD"),
        Path("C:/Users/Admin/Documents/Project Fe/DahonMD"),
        Path.cwd(),
    ]
    for candidate in candidates:
        if (candidate / "ai").is_dir():
            print(f"Project root: {candidate}")
            return candidate
    raise FileNotFoundError("Cannot find DahonMD project root")


def validate_gpu():
    """Check GPU availability."""
    import tensorflow as tf
    gpus = tf.config.list_physical_devices("GPU")
    if not gpus:
        print("WARNING: No GPU detected. Training will be extremely slow.")
        print("Go to Runtime > Change runtime type > T4 GPU")
        return False
    print(f"GPU available: {[gpu.name for gpu in gpus]}")
    # Enable memory growth
    for gpu in gpus:
        tf.config.experimental.set_memory_growth(gpu, True)
    return True


# ── Phase 1: Teacher SSL Pretraining + Fine-tuning ──────────────────────────

def train_teacher(project_root: Path):
    """Run the full teacher training pipeline."""
    import subprocess

    cmd = [
        sys.executable, "-m", "ai.training.train_teacher",
        "--config", "ai/config/ablations/configuration_8_resnet101_thesis_teacher.json",
        "--dataset-dir", str(project_root / "datasets" / "banana_leaf_thesis_4class"),
        "--final-split-dir", str(project_root / "ai" / "artifacts" / "final_split"),
        "--output-dir", str(project_root / "ai" / "artifacts" / "configuration_8"),
    ]
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(project_root))
    if result.returncode != 0:
        raise RuntimeError(f"Teacher training failed with code {result.returncode}")
    best_path = project_root / "ai" / "artifacts" / "configuration_8" / "best_teacher.keras"
    if not best_path.is_file():
        raise FileNotFoundError(f"Teacher model not found: {best_path}")
    print(f"Teacher trained successfully: {best_path}")
    return best_path


# ── Phase 2: Student Knowledge Distillation ─────────────────────────────────

def train_student(project_root: Path, teacher_path: Path):
    """Run student knowledge distillation."""
    import subprocess

    cmd = [
        sys.executable, "-m", "ai.training.train_student",
        "--config", "ai/config/ablations/configuration_4_ca_mobilenetv3_small_kd_ssl_teacher.json",
        "--dataset-dir", str(project_root / "datasets" / "banana_leaf_thesis_4class"),
        "--final-split-dir", str(project_root / "ai" / "artifacts" / "final_split"),
        "--teacher-model", str(teacher_path),
        "--output-dir", str(project_root / "ai" / "artifacts" / "configuration_4"),
    ]
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(project_root))
    if result.returncode != 0:
        raise RuntimeError(f"Student training failed with code {result.returncode}")
    best_path = project_root / "ai" / "artifacts" / "configuration_4" / "best_student.keras"
    if not best_path.is_file():
        raise FileNotFoundError(f"Student model not found: {best_path}")
    print(f"Student trained successfully: {best_path}")
    return best_path


# ── Phase 3: TFLite Conversion ─────────────────────────────────────────────

def convert_tflite(project_root: Path):
    """Convert student model to INT8 TFLite."""
    import subprocess

    cmd = [
        sys.executable, "-m", "ai.deployment.convert_tflite",
        "--config", "ai/config/ablations/configuration_4_ca_mobilenetv3_small_kd_ssl_teacher.json",
        "--dataset-dir", str(project_root / "datasets" / "banana_leaf_thesis_4class"),
        "--final-split-dir", str(project_root / "ai" / "artifacts" / "final_split"),
        "--student-model", str(project_root / "ai" / "artifacts" / "configuration_4" / "best_student.keras"),
        "--output-dir", str(project_root / "ai" / "artifacts" / "configuration_4"),
    ]
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(project_root))
    if result.returncode != 0:
        raise RuntimeError(f"TFLite conversion failed with code {result.returncode}")
    tflite_path = project_root / "ai" / "artifacts" / "configuration_4" / "enhanced_mobilenetv3_int8.tflite"
    if not tflite_path.is_file():
        raise FileNotFoundError(f"TFLite model not found: {tflite_path}")
    print(f"TFLite model: {tflite_path}")
    return tflite_path


def copy_model_to_mobile(project_root: Path, tflite_path: Path):
    """Copy INT8 TFLite model to mobile assets."""
    dest = project_root / "mobile-frontend" / "assets" / "models" / "ca_mobilenetv3_small_int8.tflite"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(tflite_path, dest)
    print(f"Copied to: {dest}")


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("DahonMD Thesis Training Pipeline (Colab)")
    print("=" * 60)

    setup_colab()
    project_root = find_project_root()

    if not validate_gpu():
        response = input("Continue without GPU? (y/N): ")
        if response.lower() != "y":
            return

    # Phase 1: Teacher
    print("\n" + "=" * 60)
    print("PHASE 1: ResNet-101 Teacher Training")
    print("=" * 60)
    teacher_path = train_teacher(project_root)

    # Phase 2: Student
    print("\n" + "=" * 60)
    print("PHASE 2: CA-MobileNetV3-Small Student + KD")
    print("=" * 60)
    student_path = train_student(project_root, teacher_path)

    # Phase 3: TFLite
    print("\n" + "=" * 60)
    print("PHASE 3: INT8 TFLite Conversion")
    print("=" * 60)
    tflite_path = convert_tflite(project_root)

    # Copy to mobile
    print("\n" + "=" * 60)
    print("PHASE 4: Copy to Mobile Assets")
    print("=" * 60)
    copy_model_to_mobile(project_root, tflite_path)

    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)
    print(f"Teacher: {teacher_path}")
    print(f"Student: {student_path}")
    print(f"TFLite:  {tflite_path}")
    print(f"Mobile:  {project_root / 'mobile-frontend' / 'assets' / 'models' / 'ca_mobilenetv3_small_int8.tflite'}")


if __name__ == "__main__":
    main()
