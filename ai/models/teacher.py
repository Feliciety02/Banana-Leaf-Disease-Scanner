"""Fixed ResNet-101 teacher for SSL pretraining, fine-tuning, and distillation."""

from __future__ import annotations

import tensorflow as tf

from ai.config.config import ExperimentConfig
from ai.models.byol_heads import prediction_head, projection_head
from ai.models.mim_head import mim_reconstruction_head


@tf.keras.utils.register_keras_serializable(package="DahonMD")
class ResNet101Preprocessing(tf.keras.layers.Layer):
    """Convert shared RGB [0, 1] inputs to ResNet-101's Caffe-style input space."""

    def call(self, inputs: tf.Tensor) -> tf.Tensor:
        pixels = tf.cast(inputs, self.compute_dtype) * 255.0
        bgr = tf.reverse(pixels, axis=[-1])
        mean_bgr = tf.cast([103.939, 116.779, 123.68], bgr.dtype)
        return bgr - mean_bgr


def build_teacher(config: ExperimentConfig, force_weights: str | None = None) -> tf.keras.Model:
    """Build the fixed ResNet-101 teacher with SSL, classifier, and feature outputs."""
    if config.teacher.backbone != "ResNet101":
        raise ValueError("Only the finalized ResNet101 teacher architecture is supported")
    weights = force_weights if force_weights is not None else ("imagenet" if config.teacher.imagenet_weights else None)
    inputs = tf.keras.Input((*config.image_size, 3), name="image")  # [B, H, W, 3], RGB [0, 1]
    normalized = ResNet101Preprocessing(name="resnet101_input_preprocessing")(inputs)
    backbone = tf.keras.applications.ResNet101(
        include_top=False,
        weights=weights,
        input_shape=(*config.image_size, 3),
    )
    feature_map = backbone(normalized)  # [B, h, w, 2048]
    feature_map = tf.keras.layers.Activation("linear", name="teacher_feature_map")(feature_map)  # [B, 7, 7, 2048]
    features = tf.keras.layers.GlobalAveragePooling2D(name="teacher_features")(feature_map)  # [B, 2048]
    dropped = tf.keras.layers.Dropout(config.teacher.dropout_rate, name="teacher_dropout")(features)
    logits = tf.keras.layers.Dense(config.data.num_classes, name="logits")(dropped)  # [B, 4]
    projection = projection_head(
        features,
        config.teacher.projection_hidden_dim,
        config.teacher.projection_dim,
    )  # [B, projection_dim]
    prediction = prediction_head(
        projection,
        config.teacher.predictor_hidden_dim,
        config.teacher.projection_dim,
    )  # [B, projection_dim]
    reconstruction = mim_reconstruction_head(feature_map, config.image_size)  # [B, H, W, 3]
    return tf.keras.Model(
        inputs,
        {
            "logits": logits,
            "features": features,
            "feature_map": feature_map,
            "projection": projection,
            "prediction": prediction,
            "reconstruction": reconstruction,
        },
        name="resnet101_teacher",
    )


def build_ema_target(config: ExperimentConfig, online_model: tf.keras.Model) -> tf.keras.Model:
    """Create the stop-gradient BYOL target initialized from the online ResNet-101."""
    target = tf.keras.models.clone_model(online_model)
    target.set_weights(online_model.get_weights())
    target.trainable = False
    return target


def update_ema_target(online_model: tf.keras.Model, target_model: tf.keras.Model, decay: tf.Tensor) -> None:
    """EMA update for trainable and non-trainable state, including BatchNorm statistics."""
    one_minus_decay = tf.cast(1.0, decay.dtype) - decay
    for online_variable, target_variable in zip(online_model.variables, target_model.variables):
        target_variable.assign(decay * target_variable + one_minus_decay * online_variable)
