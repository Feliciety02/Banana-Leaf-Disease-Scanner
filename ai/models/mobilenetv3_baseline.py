"""Stock MobileNetV3-Small baseline for the DahonMD controlled comparison."""

from __future__ import annotations

import tensorflow as tf

from ai.config.config import ExperimentConfig


BASELINE_MODEL_NAME = "baseline_mobilenetv3_small"
BASELINE_BACKBONE_NAME = "baseline_mobilenetv3_small_backbone"


def build_baseline(
    config: ExperimentConfig,
    force_weights: str | None = None,
) -> tuple[tf.keras.Model, tf.keras.Model]:
    """Build ordinary MobileNetV3-Small with the shared four-class head.

    The shared dataset supplies RGB float32 images in [0, 1]. The explicit
    rescaling below matches the enhanced student's deployment preprocessing.
    No Coordinate Attention, teacher, SSL objective, or distillation loss is
    included in this graph.
    """

    if config.baseline.backbone != "MobileNetV3Small":
        raise ValueError("Baseline backbone must remain MobileNetV3Small")
    weights = force_weights if force_weights is not None else ("imagenet" if config.baseline.imagenet_weights else None)
    inputs = tf.keras.Input((*config.image_size, 3), name="image")
    normalized = tf.keras.layers.Rescaling(2.0, offset=-1.0, name="baseline_input_normalization")(inputs)
    backbone = tf.keras.applications.MobileNetV3Small(
        input_shape=(*config.image_size, 3),
        alpha=config.student.width_multiplier,
        include_top=False,
        weights=weights,
        include_preprocessing=False,
        pooling=None,
        name=BASELINE_BACKBONE_NAME,
    )
    feature_map = backbone(normalized, training=False)
    features = tf.keras.layers.GlobalAveragePooling2D(name="baseline_global_pool")(feature_map)
    dropped = tf.keras.layers.Dropout(config.baseline.dropout_rate, name="baseline_dropout")(features)
    logits = tf.keras.layers.Dense(config.data.num_classes, name="logits")(dropped)
    model = tf.keras.Model(inputs, logits, name=BASELINE_MODEL_NAME)
    return model, backbone


def build_distillable_baseline(config: ExperimentConfig) -> tf.keras.Model:
    """Stock-SE MobileNetV3-Small with training-only spatial KD alignment."""
    if config.student.coordinate_attention or config.student.backbone != "MobileNetV3Small":
        raise ValueError("Distillable baseline requires the explicit stock MobileNetV3-Small ablation")
    inputs = tf.keras.Input((*config.image_size, 3), name="image")
    normalized = tf.keras.layers.Rescaling(2.0, offset=-1.0, name="student_input_normalization")(inputs)
    backbone = tf.keras.applications.MobileNetV3Small(
        input_shape=(*config.image_size, 3),
        alpha=config.student.width_multiplier,
        include_top=False,
        weights="imagenet" if config.student.imagenet_weights else None,
        include_preprocessing=False,
        pooling=None,
        name="student_mobilenetv3_small_stock_se",
    )
    feature_map = backbone(normalized)
    feature_map = tf.keras.layers.Activation("linear", name="student_feature_map")(feature_map)
    aligned = tf.keras.layers.Resizing(
        config.distillation.aligned_height,
        config.distillation.aligned_width,
        interpolation="bilinear",
        name="feature_spatial_alignment",
    )(feature_map)
    distill_features = tf.keras.layers.Conv2D(
        config.distillation.aligned_channels,
        1,
        use_bias=False,
        name="feature_channel_alignment",
    )(aligned)
    features = tf.keras.layers.GlobalAveragePooling2D(name="student_features")(feature_map)
    logits = tf.keras.layers.Dense(config.data.num_classes, name="logits")(
        tf.keras.layers.Dropout(config.student.dropout_rate)(features)
    )
    return tf.keras.Model(
        inputs,
        {
            "logits": logits,
            "features": features,
            "feature_map": feature_map,
            "distill_features": distill_features,
        },
        name="mobilenetv3_small_stock_se_distillation_student",
    )
