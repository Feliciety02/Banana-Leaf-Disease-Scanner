"""Lightweight reconstruction decoder for masked image modeling."""

from __future__ import annotations

import tensorflow as tf


def mim_reconstruction_head(
    feature_map: tf.Tensor,
    image_size: tuple[int, int],
    prefix: str = "mim",
) -> tf.Tensor:
    # feature_map: [B, h, w, C] -> reconstruction: [B, H, W, 3].
    x = tf.keras.layers.Conv2D(256, 3, padding="same", activation="gelu", name=f"{prefix}_conv")(feature_map)
    x = tf.keras.layers.Resizing(*image_size, interpolation="bilinear", name=f"{prefix}_resize")(x)
    return tf.keras.layers.Conv2D(3, 1, activation="sigmoid", name=f"{prefix}_reconstruction")(x)
