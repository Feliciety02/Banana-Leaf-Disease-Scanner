"""Reusable exact and perceptual image-fingerprint primitives."""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image


def sha256_file(path: Path) -> str:
    """Return a streaming SHA-256 digest without modifying the file."""
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise OSError(f"Could not read image: {path}: {error}") from error
    return digest.hexdigest()


def difference_hash(image: Image.Image) -> int:
    """Return a 64-bit difference hash for one image orientation."""
    resized = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = resized.tobytes()
    value = 0
    for row in range(8):
        offset = row * 9
        for column in range(8):
            value = (value << 1) | int(pixels[offset + column] > pixels[offset + column + 1])
    return value


def flip_aware_difference_hash(image: Image.Image) -> int:
    """Return the minimum dHash across original, flipped, and rotated views."""
    variants = (
        image,
        image.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
        image.transpose(Image.Transpose.FLIP_TOP_BOTTOM),
        image.transpose(Image.Transpose.ROTATE_180),
    )
    return min(difference_hash(variant) for variant in variants)


class HammingBkTree:
    """BK-tree for reusable, sub-quadratic perceptual-hash searches."""

    def __init__(self) -> None:
        self._nodes: list[tuple[int, dict[int, int]]] = []

    def add(self, value: int) -> None:
        if not self._nodes:
            self._nodes.append((value, {}))
            return
        index = 0
        while True:
            current, children = self._nodes[index]
            distance = (current ^ value).bit_count()
            child = children.get(distance)
            if child is None:
                children[distance] = len(self._nodes)
                self._nodes.append((value, {}))
                return
            index = child

    def query(self, value: int, radius: int) -> set[int]:
        if not self._nodes:
            return set()
        matches: set[int] = set()
        pending = [0]
        while pending:
            current, children = self._nodes[pending.pop()]
            distance = (current ^ value).bit_count()
            if distance <= radius:
                matches.add(current)
            lower, upper = distance - radius, distance + radius
            pending.extend(index for edge, index in children.items() if lower <= edge <= upper)
        return matches
