"""Canonical output-label contract shared by every AI pipeline stage."""

from __future__ import annotations


# The tuple order is the model output-index order. These stable keys are also valid
# API/database slugs, avoiding a separate and error-prone inference-time remapping.
CLASS_LABELS: tuple[str, ...] = (
    "healthy",
    "sigatoka",
    "panama-disease",
    "cordana-leaf-spot",
)

# These folders are intentionally preserved in the source inventory but can
# never become model outputs or split records for the four-class thesis study.
QUARANTINED_CLASS_NAMES: tuple[str, ...] = ("dead",)

CLASS_DISPLAY_NAMES: dict[str, str] = {
    "healthy": "Healthy",
    "sigatoka": "Sigatoka leaf spot",
    "panama-disease": "Panama disease",
    "cordana-leaf-spot": "Cordana leaf spot",
}
