"""Canonical output-label contract shared by every AI pipeline stage."""

from __future__ import annotations


# The tuple order is the model output-index order. These stable keys are also valid
# API/database slugs, avoiding a separate and error-prone inference-time remapping.
CLASS_LABELS: tuple[str, ...] = (
    "healthy",
    "dead",
    "black-sigatoka",
    "yellow-sigatoka",
    "cordana-leaf-spot",
)

CLASS_DISPLAY_NAMES: dict[str, str] = {
    "healthy": "Healthy",
    "dead": "Dead leaf",
    "black-sigatoka": "Black Sigatoka",
    "yellow-sigatoka": "Yellow Sigatoka",
    "cordana-leaf-spot": "Cordana leaf spot",
}
