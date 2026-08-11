"""Projection and prediction heads shared by contrastive and BYOL objectives."""

from __future__ import annotations

import tensorflow as tf


def projection_head(
    features: tf.Tensor,
    hidden_dim: int,
    projection_dim: int,
    prefix: str = "projector",
) -> tf.Tensor:
    x = tf.keras.layers.Dense(hidden_dim, use_bias=False, name=f"{prefix}_dense_1")(features)
    x = tf.keras.layers.BatchNormalization(name=f"{prefix}_bn_1")(x)
    x = tf.keras.layers.Activation("relu", name=f"{prefix}_relu")(x)
    x = tf.keras.layers.Dense(projection_dim, use_bias=False, name=f"{prefix}_dense_2")(x)
    return tf.keras.layers.BatchNormalization(center=False, name=f"{prefix}_bn_2")(x)


def prediction_head(
    projection: tf.Tensor,
    hidden_dim: int,
    projection_dim: int,
    prefix: str = "predictor",
) -> tf.Tensor:
    x = tf.keras.layers.Dense(hidden_dim, use_bias=False, name=f"{prefix}_dense_1")(projection)
    x = tf.keras.layers.BatchNormalization(name=f"{prefix}_bn")(x)
    x = tf.keras.layers.Activation("relu", name=f"{prefix}_relu")(x)
    return tf.keras.layers.Dense(projection_dim, name=f"{prefix}_dense_2")(x)
