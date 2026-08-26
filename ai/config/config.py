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

from ai.config.labels import CLASS_LABELS, NUM_CLASSES, QUARANTINED_CLASS_NAMES


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
    # Optional JSON object mapping known dataset-relative paths to indivisible
    # biological/acquisition group IDs (leaf, plant, site/session, burst, or
    # derived-image family). Unlisted images fall back to SHA-256 only as a final
    # exact-duplicate safeguard; that fallback does not establish independence.
    group_manifest: Optional[str] = None
    # Optional JSON mapping every experiment-relative image path to structured
    # provenance/review metadata. Missing fields are represented as "unknown";
    # they must never be invented.
    metadata_manifest: Optional[str] = None
    near_duplicate_review_manifest: Optional[str] = None
    # Optional external inventories. The final field test is never consumed by
    # training or validation; SSL-unlabeled images may be used only by the SSL
    # phase after overlap screening.
    final_field_test_dir: Optional[str] = None
    ssl_unlabeled_dir: Optional[str] = None
    image_height: int = 224
    image_width: int = 224
    image_channels: int = 3
    num_classes: int = NUM_CLASSES
    planned_labeled_per_class: int = 700
    planned_labeled_total: int = 2800
    planned_ssl_unlabeled_total: int = 8000
    # Fixed model output-index order. Dataset directory names must match these keys.
    class_names: tuple[str, ...] = CLASS_LABELS
    quarantined_class_names: tuple[str, ...] = QUARANTINED_CLASS_NAMES
    near_duplicate_hamming_distance: int = 6
    require_near_duplicate_review: bool = True
    require_complete_metadata: bool = True
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
    # Thesis sequence: ImageNet initialization -> banana-domain SSL -> supervised fine-tuning.
    imagenet_weights: bool = True
    ssl_enabled: bool = True
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
    lambda_cl: float = 1.0
    lambda_byol: float = 1.0
    lambda_mim: float = 1.0


@dataclass
class StudentConfig:
    backbone: str = "MobileNetV3SmallCoordinateAttention"
    coordinate_attention: bool = True
    # When enabled, only shape-compatible convolution and BatchNorm weights are
    # transferred from stock MobileNetV3-Small. New Coordinate Attention and
    # classifier layers remain newly initialized.
    imagenet_weights: bool = False
    width_multiplier: float = 1.0
    coordinate_attention_reduction: int = 32
    dropout_rate: float = 0.20
    epochs: int = 100
    learning_rate: float = 3e-4
    pretrained_warmup_epochs: int = 0
    pretrained_warmup_learning_rate: float = 1e-3
    weight_decay: float = 1e-5


@dataclass
class DistillationConfig:
    enabled: bool = True
    alpha: float = 0.5
    beta: float = 0.5
    gamma: float = 1.0
    temperature: float = 4.0
    feature_loss: str = "mse"
    teacher_feature_layer: str = "conv5_block3_out"
    student_feature_layer: str = "final_activation"
    aligned_height: int = 7
    aligned_width: int = 7
    aligned_channels: int = 2048


@dataclass
class BaselineConfig:
    """Plain supervised control model for the enhanced student experiment."""

    backbone: str = "MobileNetV3Small"
    imagenet_weights: bool = True
    dropout_rate: float = 0.20
    frozen_backbone_epochs: int = 20
    fine_tune_epochs: int = 10
    frozen_backbone_learning_rate: float = 1e-3
    fine_tune_learning_rate: float = 1e-5
    weight_decay: float = 1e-5


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
    task: str = "banana_leaf_classification"
    experiment_name: str = "configuration_4_ca_mobilenetv3_small_kd_ssl_teacher"
    experimental_status: str = "candidate_configuration_pending_validation"
    selection_metric: str = "macro_f1"
    data: DataConfig = field(default_factory=DataConfig)
    augmentation: AugmentationConfig = field(default_factory=AugmentationConfig)
    masking: MaskingConfig = field(default_factory=MaskingConfig)
    teacher: TeacherConfig = field(default_factory=TeacherConfig)
    student: StudentConfig = field(default_factory=StudentConfig)
    distillation: DistillationConfig = field(default_factory=DistillationConfig)
    baseline: BaselineConfig = field(default_factory=BaselineConfig)
    runtime: RuntimeConfig = field(default_factory=RuntimeConfig)

    def validate(self) -> None:
        if self.task != "banana_leaf_classification":
            raise ValueError("The thesis task is fixed to banana_leaf_classification")
        if self.selection_metric != "macro_f1":
            raise ValueError("Teacher and student checkpoint selection must use validation macro F1")
        if self.experimental_status != "candidate_configuration_pending_validation":
            raise ValueError("Experiment configurations must remain marked pending until results are run")
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
        if tuple(self.data.quarantined_class_names) != QUARANTINED_CLASS_NAMES:
            raise ValueError(
                "data.quarantined_class_names is fixed to "
                f"{list(QUARANTINED_CLASS_NAMES)} so preserved dead-leaf data cannot enter the experiment"
            )
        if set(self.data.class_names).intersection(self.data.quarantined_class_names):
            raise ValueError("Active and quarantined class names must be disjoint")
        if (self.data.image_height, self.data.image_width, self.data.image_channels) != (224, 224, 3):
            raise ValueError("Teacher, student, calibration, and mobile inference require 224x224 RGB input")
        if self.data.planned_labeled_per_class * NUM_CLASSES != self.data.planned_labeled_total:
            raise ValueError("Planned labeled totals must remain 700 per class / 2,800 overall")
        if not 0 <= self.data.near_duplicate_hamming_distance <= 16:
            raise ValueError("data.near_duplicate_hamming_distance must be in [0, 16]")
        if self.teacher.backbone != "ResNet101":
            raise ValueError("The finalized thesis teacher architecture is fixed to ResNet101")
        if self.teacher.feature_dim != 2048:
            raise ValueError("ResNet101 teacher feature_dim must remain 2048")
        expected_student = (
            "MobileNetV3SmallCoordinateAttention"
            if self.student.coordinate_attention
            else "MobileNetV3Small"
        )
        if self.student.backbone != expected_student:
            raise ValueError(
                "student.backbone must match the explicit Coordinate Attention ablation choice"
            )
        if self.baseline.backbone != "MobileNetV3Small":
            raise ValueError("The research baseline must use the same MobileNetV3-Small variant as the enhanced student")
        for name, value in {
            "teacher.ssl_epochs": self.teacher.ssl_epochs,
            "teacher.finetune_epochs": self.teacher.finetune_epochs,
            "student.epochs": self.student.epochs,
            "data.batch_size": self.data.batch_size,
            "student.width_multiplier": self.student.width_multiplier,
            "student.coordinate_attention_reduction": self.student.coordinate_attention_reduction,
            "baseline.frozen_backbone_epochs": self.baseline.frozen_backbone_epochs,
            "baseline.fine_tune_epochs": self.baseline.fine_tune_epochs,
        }.items():
            if value <= 0:
                raise ValueError(f"{name} must be positive")
        if self.student.pretrained_warmup_epochs < 0:
            raise ValueError("student.pretrained_warmup_epochs cannot be negative")
        for name, value in {
            "baseline.frozen_backbone_learning_rate": self.baseline.frozen_backbone_learning_rate,
            "baseline.fine_tune_learning_rate": self.baseline.fine_tune_learning_rate,
            "baseline.weight_decay": self.baseline.weight_decay,
            "student.pretrained_warmup_learning_rate": self.student.pretrained_warmup_learning_rate,
        }.items():
            if value <= 0:
                raise ValueError(f"{name} must be positive")
        if self.data.image_height % self.masking.patch_size or self.data.image_width % self.masking.patch_size:
            raise ValueError("image dimensions must be divisible by masking.patch_size")
        for name, value in {
            "mask_ratio": self.masking.mask_ratio,
            "distillation.alpha": self.distillation.alpha,
        }.items():
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be in [0, 1]")
        if self.distillation.temperature <= 1 or self.teacher.contrastive_temperature <= 0:
            raise ValueError("KD temperature must exceed 1 and contrastive temperature must be positive")
        for name, value in {
            "lambda_cl": self.teacher.lambda_cl,
            "lambda_byol": self.teacher.lambda_byol,
            "lambda_mim": self.teacher.lambda_mim,
            "distillation.alpha": self.distillation.alpha,
            "distillation.beta": self.distillation.beta,
            "distillation.gamma": self.distillation.gamma,
        }.items():
            if value < 0:
                raise ValueError(f"{name} cannot be negative")
        if self.teacher.ssl_enabled and not any(
            value > 0
            for value in (
                self.teacher.lambda_cl,
                self.teacher.lambda_byol,
                self.teacher.lambda_mim,
            )
        ):
            raise ValueError("At least one teacher self-supervised objective must have a positive lambda")
        if self.distillation.feature_loss != "mse":
            raise ValueError("The thesis feature-matching loss is fixed to MSE")
        if self.distillation.enabled and not all(
            value > 0 for value in (self.distillation.alpha, self.distillation.beta, self.distillation.gamma)
        ):
            raise ValueError("Enabled KD requires positive alpha, beta, and gamma coefficients")
        if (
            self.distillation.aligned_height,
            self.distillation.aligned_width,
            self.distillation.aligned_channels,
        ) != (7, 7, 2048):
            raise ValueError("Feature matching is fixed to aligned [B, 7, 7, 2048] near-final maps")

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
