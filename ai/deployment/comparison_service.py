"""HTTP boundary for admin-only baseline-versus-enhanced research inference."""

from __future__ import annotations

import os
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv

from ai.deployment.compare_tflite import compare_models


MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
AI_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(AI_ROOT / ".env")

app = FastAPI(title="DahonMD Research Comparison Service", version="1.0.0")


def _required_artifacts() -> tuple[Path, Path, Path]:
    values = {
        "DAHONMD_BASELINE_TFLITE": os.getenv("DAHONMD_BASELINE_TFLITE"),
        "DAHONMD_ENHANCED_TFLITE": os.getenv("DAHONMD_ENHANCED_TFLITE"),
        "DAHONMD_LABEL_MAP": os.getenv("DAHONMD_LABEL_MAP"),
    }
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise HTTPException(status_code=503, detail=f"Research artifacts are not configured: {', '.join(missing)}")
    paths = tuple(
        (path if path.is_absolute() else AI_ROOT / path).resolve()
        for value in values.values()
        if value
        for path in [Path(value).expanduser()]
    )
    absent = [str(path) for path in paths if not path.is_file()]
    if absent:
        raise HTTPException(status_code=503, detail=f"Configured research artifacts were not found: {', '.join(absent)}")
    return paths  # type: ignore[return-value]


@app.get("/health")
def health() -> dict:
    try:
        baseline, enhanced, label_map = _required_artifacts()
    except HTTPException as error:
        return {"service": "dahonmd-research-comparison", "status": "unconfigured", "detail": error.detail}
    return {
        "service": "dahonmd-research-comparison",
        "status": "ready",
        "baseline_model_bytes": baseline.stat().st_size,
        "enhanced_model_bytes": enhanced.stat().st_size,
        "label_map": label_map.name,
    }


@app.post("/compare")
async def compare_image(image: Annotated[UploadFile, File(description="One banana leaf image")]) -> dict:
    if image.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=422, detail="Only JPG, PNG, and WEBP images are accepted")
    contents = await image.read(MAX_IMAGE_BYTES + 1)
    await image.close()
    if not contents or len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="Image must be non-empty and no larger than 10 MB")
    baseline, enhanced, label_map = _required_artifacts()
    suffix = Path(image.filename or "leaf.jpg").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        suffix = ".jpg"
    with TemporaryDirectory(prefix="dahonmd-comparison-") as directory:
        image_path = Path(directory) / f"leaf{suffix}"
        image_path.write_bytes(contents)
        try:
            return await run_in_threadpool(compare_models, baseline, enhanced, image_path, label_map)
        except (FileNotFoundError, ValueError) as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except Exception as error:
            raise HTTPException(status_code=422, detail="The uploaded image could not be processed") from error
