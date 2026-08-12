"""Coordinate Attention from Hou et al., adapted as a serializable Keras layer."""

from __future__ import annotations

import tensorflow as tf


@tf.keras.utils.register_keras_serializable(package="DahonMD")
class CoordinateAttention(tf.keras.layers.Layer):
    """Encode long-range spatial context separately along height and width."""

    def __init__(self, reduction: int = 32, minimum_channels: int = 8, **kwargs):
        super().__init__(**kwargs)
        self.reduction = reduction
        self.minimum_channels = minimum_channels

    def build(self, input_shape):
        if input_shape[1] is None or input_shape[2] is None:
            raise ValueError("CoordinateAttention requires fixed spatial dimensions for full INT8 export")
        self.spatial_height = int(input_shape[1])
        self.spatial_width = int(input_shape[2])
        channels = int(input_shape[-1])
        reduced = max(self.minimum_channels, channels // self.reduction)
        self.shared_conv = tf.keras.layers.Conv2D(reduced, 1, use_bias=False, name="shared_conv")
        self.shared_bn = tf.keras.layers.BatchNormalization(name="shared_bn")
        self.height_conv = tf.keras.layers.Conv2D(channels, 1, activation="sigmoid", name="height_attention")
        self.width_conv = tf.keras.layers.Conv2D(channels, 1, activation="sigmoid", name="width_attention")
        super().build(input_shape)

    def call(self, inputs, training=None):
        # inputs: [B, H, W, C]. Preserve one coordinate while pooling the other.
        height_context = tf.reduce_mean(inputs, axis=2, keepdims=True)  # [B, H, 1, C]
        width_context = tf.reduce_mean(inputs, axis=1, keepdims=True)   # [B, 1, W, C]
        width_context = tf.transpose(width_context, [0, 2, 1, 3])      # [B, W, 1, C]
        merged = tf.concat([height_context, width_context], axis=1)    # [B, H+W, 1, C]
        merged = self.shared_conv(merged)
        merged = self.shared_bn(merged, training=training)
        merged = merged * tf.nn.relu6(merged + 3.0) / 6.0  # h-swish
        height_context, width_context = tf.split(
            merged, [self.spatial_height, self.spatial_width], axis=1
        )
        width_context = tf.transpose(width_context, [0, 2, 1, 3])
        return inputs * self.height_conv(height_context) * self.width_conv(width_context)

    def get_config(self):
        return {
            **super().get_config(),
            "reduction": self.reduction,
            "minimum_channels": self.minimum_channels,
        }
