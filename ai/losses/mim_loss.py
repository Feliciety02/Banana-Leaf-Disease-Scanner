"""Masked-only pixel reconstruction objective."""

import tensorflow as tf


def masked_reconstruction_loss(
    target_images: tf.Tensor,
    reconstructed_images: tf.Tensor,
    pixel_mask: tf.Tensor,
) -> tf.Tensor:
    absolute_error = tf.abs(target_images - reconstructed_images)
    mask = tf.cast(pixel_mask, absolute_error.dtype)  # [B, H, W, 1], broadcasts over RGB
    numerator = tf.reduce_sum(absolute_error * mask)
    denominator = tf.maximum(tf.reduce_sum(mask) * tf.cast(tf.shape(target_images)[-1], mask.dtype), 1.0)
    return numerator / denominator
