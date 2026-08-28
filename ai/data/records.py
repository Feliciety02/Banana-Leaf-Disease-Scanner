"""Shared records used by dataset preparation, training, and evaluation."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from ai.data.metadata_manifest import LEGACY_DEFAULTS, LEGACY_FIELDS


@dataclass(frozen=True)
class ImageRecord:
    path: str
    label: int
    class_name: str
    sha256: str
    group_id: str
    source: str = "unknown"
    plant_id: str = "unknown"
    leaf_id: str = "unknown"
    site_id: str = "unknown"
    session_id: str = "unknown"
    origin_type: str = "unknown"
    capture_device: str = "unknown"
    acquisition_date: str = "unknown"
    field_subset: str = "none"
    species_review_status: str = "pending"
    visibility_quality_status: str = "pending"
    inclusion_status: str = "pending"
    label_validator: str = "unknown"
    label_review_status: str = "pending"


@dataclass
class DatasetSplits:
    class_names: list[str]
    train: list[ImageRecord]
    validation: list[ImageRecord]
    test: list[ImageRecord]
    ssl_unlabeled: list[ImageRecord] = field(default_factory=list)
    final_field_test: list[ImageRecord] = field(default_factory=list)


@dataclass(frozen=True)
class ImageInventoryValidation:
    hashes_by_path: dict[Path, str]
    perceptual_hashes_by_path: dict[Path, int]
    report_path: Path
    scanned_count: int
    rejected_count: int
    exact_duplicate_count: int
    near_duplicate_pair_count: int


METADATA_FIELDS = LEGACY_FIELDS
METADATA_DEFAULTS = LEGACY_DEFAULTS
