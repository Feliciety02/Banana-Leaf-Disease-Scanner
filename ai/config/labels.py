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

CLASS_DISPLAY_NAMES: dict[str, str] = {
    "healthy": "Healthy",
    "sigatoka": "Sigatoka",
    "panama-disease": "Panama Disease",
    "cordana-leaf-spot": "Cordana Leaf Spot",
}

NUM_CLASSES = 4
assert len(CLASS_LABELS) == NUM_CLASSES
assert set(CLASS_DISPLAY_NAMES) == set(CLASS_LABELS)

# Source-dataset spellings are harmonized before quality control and splitting.
SOURCE_LABEL_ALIASES: dict[str, str | None] = {
    "healthy": "healthy",
    "sigatoka": "sigatoka",
    "black-sigatoka": "sigatoka",
    "black_sigatoka": "sigatoka",
    "black sigatoka": "sigatoka",
    "yellow-sigatoka": "sigatoka",
    "yellow_sigatoka": "sigatoka",
    "yellow sigatoka": "sigatoka",
    "panama-disease": "panama-disease",
    "panama_disease": "panama-disease",
    "panama disease": "panama-disease",
    "fusarium-wilt": "panama-disease",
    "cordana-leaf-spot": "cordana-leaf-spot",
    "cordana_leaf_spot": "cordana-leaf-spot",
    "cordana leaf spot": "cordana-leaf-spot",
    "moko": None,
    "moko-disease": None,
    "moko_disease": None,
}


def harmonize_source_label(value: str) -> str | None:
    """Map a documented source label to the fixed thesis taxonomy.

    Unknown labels fail loudly so acquisition code cannot silently invent a
    fifth class or assign an uncertain sample.
    """
    normalized = " ".join(value.strip().lower().replace("_", " ").replace("-", " ").split())
    normalized_aliases = {
        " ".join(key.replace("_", " ").replace("-", " ").split()): target
        for key, target in SOURCE_LABEL_ALIASES.items()
    }
    if normalized not in normalized_aliases:
        raise ValueError(f"Unsupported or uncertain banana-leaf source label: {value!r}")
    return normalized_aliases[normalized]
