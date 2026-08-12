"""Central, serializable configuration for every experiment stage.

Defaults are reproducible starting points, not claimed optimal values. In particular,
all loss weights, augmentation strengths, temperatures, and learning rates must be
tuned and reported as part of the thesis experiments.
"""

from __future__ import annotations

import json
import os
import random
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
from dotenv import load_dotenv

from ai.config.labels import CLASS_LABELS


AI_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(AI_ROOT / ".env")


def _dataset_root_from_environment() -> Optional[str]:
    value = os.getenv("DATASET_ROOT")
    if not value:
        return None
    path = Path(value).expanduser()
    return str((AI_ROOT / path).resolve() if not path.is_absolute() else path.resolve())


@dataclass
class DataConfig:
    dataset_dir: Optional[str] = field(default_factory=_dataset_root_from_environment)
    # Optional JSON object mapping dataset-relative image paths to specimen/plant IDs.
    # Supply this whenever multiple non-identical images can originate from one leaf/plant.
    group_manifest: Optional[str] = None
    image_height: int = 224
    image_width: int = 224
    num_classes: int = 5
    # Fixed model output-index order. Dataset directory names must match these keys.
    class_names: tuple[str, ...] = CLASS_LABELS
    train_fraction: float = 0.70
    validation_fraction: float = 0.15
    test_fraction: float = 0.15
    batch_size: int = 32
    cache_dataset: bool = False
    verify_images: bool = True
    allowed_extensions: tuple[str, ...] = (".jpg", ".jpeg", ".png", ".bmp", ".webp")


@dataclass
class AugmentationConfig:
    horizontal_flip: bool = True
    # Enable only when vertical orientation is not a meaningful biological cue.
    vertical_flip: bool = False
    rotation_factor: float = 0.05
    zoom_factor: float = 0.10
    translation_factor: float = 0.05
    brightness_delta: float = 0.12
    contrast_lower: float = 0.85
    contrast_upper: float = 1.15
    ssl_color_jitter_strength: float = 0.25


@dataclass
class MaskingConfig:
    patch_size: int = 16
    mask_ratio: float = 0.40
    mask_value: float = 0.5


@dataclass
class TeacherConfig:
    backbone: str = "ResNet101"
    # False keeps the declared banana-dataset SSL phase free of supervised ImageNet initialization.
    imagenet_weights: bool = False
    feature_dim: int = 2048  # Native ResNet-101 global-average-pooled feature width.
    projection_dim: int = 256
    projection_hidden_dim: int = 1024
    predictor_hidden_dim: int = 512
    dropout_rate: float = 0.30
    ssl_epochs: int = 100
    finetune_epochs: int = 100
    ssl_learning_rate: float = 3e-4
    finetune_learning_rate: float = 1e-4
    weight_decay: float = 1e-5
    contrastive_temperature: float = 0.10
    byol_ema_decay: float = 0.996
    # SSL loss weights: tune these; zero disables an objective for ablation.
    lambda_contrastive: float = 1.0
    lambda_byol: float = 1.0
    lambda_mim: float = 1.0


@dataclass
class StudentConfig:
    backbone: str = "MobileNetV3SmallCoordinateAttention"
    # This custom topology replaces stock SE blocks, so stock pretrained weights
    # are intentionally not claimed to be directly compatible.
    imagenet_weights: bool = False
    width_multiplier: float = 1.0
    coordinate_attention_reduction: int = 32
    dropout_rate: float = 0.20
    epochs: int = 100
    learning_rate: float = 3e-4
    weight_decay: float = 1e-5
    # alpha is the hard-label weight; (1 - alpha) weights logit KD.
    distillation_alpha: float = 0.5
    distillation_temperature: float = 4.0
    feature_distillation_enabled: bool = True
    feature_distillation_weight: float = 1.0


@dataclass
class RuntimeConfig:
    seed: int = 42
    output_dir: str = "ai/artifacts"
    num_parallel_calls: int = -1  # -1 maps to tf.data.AUTOTUNE.
    early_stopping_patience: int = 15
    reduce_lr_patience: int = 6
    min_learning_rate: float = 1e-7


@dataclass
class ExperimentConfig:
    data: DataConfig = field(default_factory=DataConfig)
    augmentation: AugmentationConfig = field(default_factory=AugmentationConfig)
    masking: MaskingConfig = field(default_factory=MaskingConfig)
    teacher: TeacherConfig = field(default_factory=TeacherConfig)
    student: StudentConfig = field(default_factory=StudentConfig)
    runtime: RuntimeConfig = field(default_factory=RuntimeConfig)

    def validate(self) -> None:
        fractions = (
            self.data.train_fraction,
            self.data.validation_fraction,
            self.data.test_fraction,
        )
        if any(x <= 0 for x in fractions) or not np.isclose(sum(fractions), 1.0):
            raise ValueError("train/validation/test fractions must be positive and sum to 1.0")
        if self.data.num_classes != len(CLASS_LABELS):
            raise ValueError(f"This thesis pipeline requires exactly {len(CLASS_LABELS)} classes")
        if tuple(self.data.class_names) != CLASS_LABELS:
            raise ValueError(
                "data.class_names and their output-index order are fixed to "
                f"{list(CLASS_LABELS)}"
            )
        if self.teacher.backbone != "ResNet101":
            raise ValueError("The finalized thesis teacher architecture is fixed to ResNet101")
        if self.teacher.feature_dim != 2048:
            raise ValueError("ResNet101 teacher feature_dim must remain 2048")
        if self.student.backbone != "MobileNetV3SmallCoordinateAttention":
            raise ValueError("The deployed student is fixed to Coordinate Attention-Enhanced MobileNetV3Small")
        if self.student.imagenet_weights:
            raise ValueError("Stock MobileNetV3 weights are incompatible after replacing SE with Coordinate Attention")
        if self.student.feature_distillation_enabled and self.student.feature_distillation_weight <= 0:
            raise ValueError("Enabled feature distillation requires a positive feature_distillation_weight")
        for name, value in {
            "teacher.ssl_epochs": self.teacher.ssl_epochs,
            "teacher.finetune_epochs": self.teacher.finetune_epochs,
            "student.epochs": self.student.epochs,
            "data.batch_size": self.data.batch_size,
            "student.width_multiplier": self.student.width_multiplier,
            "student.coordinate_attention_reduction": self.student.coordinate_attention_reduction,
        }.items():
            if value <= 0:
                raise ValueError(f"{name} must be positive")
        if self.data.image_height % self.masking.patch_size or self.data.image_width % self.masking.patch_size:
            raise ValueError("image dimensions must be divisible by masking.patch_size")
        for name, value in {
            "mask_ratio": self.masking.mask_ratio,
            "distillation_alpha": self.student.distillation_alpha,
        }.items():
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be in [0, 1]")
        if self.student.distillation_temperature <= 0 or self.teacher.contrastive_temperature <= 0:
            raise ValueError("distillation and contrastive temperatures must be positive")
        for name, value in {
            "lambda_contrastive": self.teacher.lambda_contrastive,
            "lambda_byol": self.teacher.lambda_byol,
            "lambda_mim": self.teacher.lambda_mim,
            "feature_distillation_weight": self.student.feature_distillation_weight,
        }.items():
            if value < 0:
                raise ValueError(f"{name} cannot be negative")
        if not any(
            value > 0
            for value in (
                self.teacher.lambda_contrastive,
                self.teacher.lambda_byol,
                self.teacher.lambda_mim,
            )
        ):
            raise ValueError("At least one teacher self-supervised objective must have a positive lambda")

    @property
    def image_size(self) -> tuple[int, int]:
        return self.data.image_height, self.data.image_width

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _merge_dataclass(instance: Any, values: Dict[str, Any]) -> None:
    unknown = set(values) - set(instance.__dataclass_fields__)
    if unknown:
        raise ValueError(f"Unknown configuration keys for {type(instance).__name__}: {sorted(unknown)}")
    for key, value in values.items():
        current = getattr(instance, key)
        if hasattr(current, "__dataclass_fields__"):
            if not isinstance(value, dict):
                raise ValueError(f"Configuration section '{key}' must be an object")
            _merge_dataclass(current, value)
        else:
            # JSON represents tuples as arrays; restore extension tuples.
            if isinstance(current, tuple) and isinstance(value, list):
                value = tuple(value)
            setattr(instance, key, value)


def load_config(path: Optional[str] = None) -> ExperimentConfig:
    config = ExperimentConfig()
    if path:
        config_path = Path(path).expanduser().resolve()
        if not config_path.is_file():
            raise FileNotFoundError(f"Configuration file not found: {config_path}")
        with config_path.open("r", encoding="utf-8") as handle:
            values = json.load(handle)
        if not isinstance(values, dict):
            raise ValueError("The configuration JSON root must be an object")
        _merge_dataclass(config, values)
    config.validate()
    return config


def save_config(config: ExperimentConfig, path: str | Path) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(config.to_dict(), indent=2), encoding="utf-8")


def set_global_determinism(seed: int) -> None:
    """Set Python, NumPy, and TensorFlow seeds and request deterministic kernels."""
    os.environ.setdefault("TF_DETERMINISTIC_OPS", "1")
    os.environ.setdefault("PYTHONHASHSEED", str(seed))
    random.seed(seed)
    np.random.seed(seed)
    import tensorflow as tf  # Imported lazily so CLI validation remains lightweight.

    tf.keras.utils.set_random_seed(seed)
    try:
        tf.config.experimental.enable_op_determinism()
    except (AttributeError, RuntimeError):
        pass
