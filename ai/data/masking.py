"""Patch masking used by the masked-image-modeling objective."""

from __future__ import annotations

import tensorflow as tf


def apply_patch_mask(
    images: tf.Tensor,
    patch_size: int,
    mask_ratio: float,
    mask_value: float = 0.5,
) -> tuple[tf.Tensor, tf.Tensor]:
    """Return masked images and a binary pixel mask.

    images: [B, H, W, 3]. The returned mask is [B, H, W, 1], where one means
    the corresponding patch must be reconstructed.
    """
    shape = tf.shape(images)
    batch, height, width = shape[0], shape[1], shape[2]
    grid_h = height // patch_size
    grid_w = width // patch_size
    patch_mask = tf.cast(
        tf.random.uniform([batch, grid_h, grid_w, 1], dtype=tf.float32) < mask_ratio,
        images.dtype,
    )
    pixel_mask = tf.repeat(tf.repeat(patch_mask, patch_size, axis=1), patch_size, axis=2)
    pixel_mask = pixel_mask[:, :height, :width, :]
    masked = images * (1.0 - pixel_mask) + tf.cast(mask_value, images.dtype) * pixel_mask
    return masked, pixel_mask
