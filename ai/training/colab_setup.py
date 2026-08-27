"""Package the DahonMD project for Google Colab upload.

Creates a zip of the codebase (without images) and provides instructions
for uploading the dataset to Google Drive.

Usage:
    python ai/training/colab_setup.py
"""
from __future__ import annotations

import os
import zipfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_ZIP = PROJECT_ROOT / "dahonmd_colab_code.zip"

# Directories/files to include in the code zip
INCLUDE_DIRS = [
    "ai/",
    "mobile-frontend/assets/models/",
    "mobile-frontend/modules/dahonmd-tflite/",
]

INCLUDE_FILES = [
    "mobile-frontend/package.json",
    "mobile-frontend/app.json",
]


def create_code_zip():
    """Create a zip of the codebase for Colab."""
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for dir_path in INCLUDE_DIRS:
            full = PROJECT_ROOT / dir_path
            if not full.exists():
                print(f"  Skipping (not found): {dir_path}")
                continue
            for file in full.rglob("*"):
                if file.is_file() and "__pycache__" not in str(file):
                    arcname = str(file.relative_to(PROJECT_ROOT))
                    zf.write(file, arcname)
                    print(f"  + {arcname}")

        for file_path in INCLUDE_FILES:
            full = PROJECT_ROOT / file_path
            if full.is_file():
                zf.write(full, file_path)
                print(f"  + {file_path}")

    size_mb = OUTPUT_ZIP.stat().st_size / (1024 * 1024)
    print(f"\nCode zip created: {OUTPUT_ZIP} ({size_mb:.1f} MB)")


def print_instructions():
    """Print Colab setup instructions."""
    print("""
╔══════════════════════════════════════════════════════════════╗
║          DahonMD Colab Training Setup Instructions           ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  1. Open Google Colab: https://colab.research.google.com    ║
║                                                              ║
║  2. Upload the dataset to Google Drive:                     ║
║     - Create folder: Drive > My Drive > DahonMD/            ║
║     - Upload: datasets/banana_leaf_thesis_4class/           ║
║       (the 4 class folders: healthy, sigatoka, etc.)        ║
║     - Upload: ai/artifacts/final_split/                     ║
║                                                              ║
║  3. Upload the code zip:                                    ║
║     - Upload dahonmd_colab_code.zip to Drive > DahonMD/     ║
║                                                              ║
║  4. In Colab:                                               ║
║     - Runtime > Change runtime type > GPU (T4)              ║
║     - Run the cells below                                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

Colab Notebook Cells:
━━━━━━━━━━━━━━━━━━━━━

# Cell 1: Setup
!pip install -q tqdm

import os, sys, zipfile
from pathlib import Path

os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

# Mount Google Drive
from google.colab import drive
drive.mount("/content/drive")

# Unzip code
code_zip = Path("/content/drive/MyDrive/DahonMD/dahonmd_colab_code.zip")
with zipfile.ZipFile(code_zip, "r") as zf:
    zf.extractall("/content/DahonMD")

sys.path.insert(0, "/content/DahonMD")
os.chdir("/content/DahonMD")

# Symlink dataset (faster than copying)
os.symlink(
    "/content/drive/MyDrive/DahonMD/banana_leaf_thesis_4class",
    "/content/DahonMD/datasets/banana_leaf_thesis_4class"
)

print("Setup complete!")


# Cell 2: Verify GPU
import tensorflow as tf
print(f"TensorFlow {tf.__version__}")
print(f"GPU: {tf.config.list_physical_devices('GPU')}")


# Cell 3: Train Teacher (Phase 1 + 2)
!python -m ai.training.train_teacher \
  --config ai/config/ablations/configuration_8_resnet101_thesis_teacher.json \
  --dataset-dir /content/DahonMD/datasets/banana_leaf_thesis_4class \
  --final-split-dir /content/DahonMD/ai/artifacts/final_split \
  --output-dir /content/DahonMD/ai/artifacts/configuration_8


# Cell 4: Train Student (Phase 3)
!python -m ai.training.train_student \
  --config ai/config/ablations/configuration_4_ca_mobilenetv3_small_kd_ssl_teacher.json \
  --dataset-dir /content/DahonMD/datasets/banana_leaf_thesis_4class \
  --final-split-dir /content/DahonMD/ai/artifacts/final_split \
  --teacher-model /content/DahonMD/ai/artifacts/configuration_8/best_teacher.keras \
  --output-dir /content/DahonMD/ai/artifacts/configuration_4


# Cell 5: Convert to TFLite
!python -m ai.deployment.convert_tflite \
  --config ai/config/ablations/configuration_4_ca_mobilenetv3_small_kd_ssl_teacher.json \
  --dataset-dir /content/DahonMD/datasets/banana_leaf_thesis_4class \
  --final-split-dir /content/DahonMD/ai/artifacts/final_split \
  --student-model /content/DahonMD/ai/artifacts/configuration_4/best_student.keras \
  --output-dir /content/DahonMD/ai/artifacts/configuration_4


# Cell 6: Download results
import shutil
from google.colab import files

# Copy model to Drive
shutil.copy2(
    "/content/DahonMD/ai/artifacts/configuration_4/enhanced_mobilenetv3_int8.tflite",
    "/content/drive/MyDrive/DahonMD/ca_mobilenetv3_small_int8.tflite"
)

# Download
files.download("/content/DahonMD/ai/artifacts/configuration_8/best_teacher.keras")
files.download("/content/DahonMD/ai/artifacts/configuration_4/best_student.keras")
files.download("/content/DahonMD/ai/artifacts/configuration_4/enhanced_mobilenetv3_int8.tflite")
""")


if __name__ == "__main__":
    print("Creating code zip...")
    create_code_zip()
    print_instructions()
