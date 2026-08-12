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
    """Build ordinary MobileNetV3-Small with the shared five-class head.

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
