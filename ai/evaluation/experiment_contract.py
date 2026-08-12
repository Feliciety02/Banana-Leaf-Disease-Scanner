"""Reproducible comparison metadata shared by baseline and enhanced reports."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Sequence


def file_sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def experiment_contract(
    manifest_path: str | Path,
    class_names: Sequence[str],
    image_size: tuple[int, int],
    mobilenet_variant: str = "MobileNetV3Small",
) -> dict:
    manifest = Path(manifest_path)
    if not manifest.is_file():
        raise FileNotFoundError(f"Split manifest not found: {manifest}")
    return {
        "mobilenet_variant": mobilenet_variant,
        "input_height": int(image_size[0]),
        "input_width": int(image_size[1]),
        "input_color": "RGB",
        "input_dtype": "float32",
        "input_range": [0.0, 1.0],
        "class_names": list(class_names),
        "split_manifest_sha256": file_sha256(manifest),
    }
