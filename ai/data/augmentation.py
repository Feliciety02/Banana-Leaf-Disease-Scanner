"""Training-only augmentations. Model inputs always remain float32 in [0, 1]."""

from __future__ import annotations

import tensorflow as tf

from ai.config.config import AugmentationConfig


class ColorJitter(tf.keras.layers.Layer):
    """TensorFlow-native saturation and hue jitter for SSL views."""

    def __init__(self, strength: float, seed: int, **kwargs):
        super().__init__(**kwargs)
        self.strength = strength
        self.seed = seed

    def call(self, images: tf.Tensor, training: bool = True) -> tf.Tensor:
        if not training:
            return images
        images = tf.image.random_saturation(
            images, lower=max(0.0, 1.0 - self.strength), upper=1.0 + self.strength, seed=self.seed
        )
        return tf.image.random_hue(images, max_delta=min(self.strength / 2.0, 0.5), seed=self.seed + 1)


class ImageAugmenter(tf.keras.layers.Layer):
    def __init__(self, config: AugmentationConfig, seed: int, strong: bool = False, **kwargs):
        super().__init__(**kwargs)
        flip_mode = "horizontal_and_vertical" if config.vertical_flip else "horizontal"
        layers: list[tf.keras.layers.Layer] = []
        if config.horizontal_flip or config.vertical_flip:
            if not config.horizontal_flip and config.vertical_flip:
                flip_mode = "vertical"
            layers.append(tf.keras.layers.RandomFlip(flip_mode, seed=seed))
        layers.extend(
            [
                tf.keras.layers.RandomRotation(config.rotation_factor, fill_mode="reflect", seed=seed + 1),
                tf.keras.layers.RandomZoom(
                    (-config.zoom_factor, config.zoom_factor),
                    (-config.zoom_factor, config.zoom_factor),
                    fill_mode="reflect",
                    seed=seed + 2,
                ),
                tf.keras.layers.RandomTranslation(
                    config.translation_factor,
                    config.translation_factor,
                    fill_mode="reflect",
                    seed=seed + 3,
                ),
                tf.keras.layers.RandomBrightness(config.brightness_delta, value_range=(0.0, 1.0), seed=seed + 4),
                tf.keras.layers.RandomContrast(
                    factor=(1.0 - config.contrast_lower, config.contrast_upper - 1.0), seed=seed + 5
                ),
            ]
        )
        if strong:
            strength = config.ssl_color_jitter_strength
            layers.append(ColorJitter(strength, seed=seed + 6, name="color_jitter"))
        self.pipeline = tf.keras.Sequential(layers, name="strong_ssl_augmentation" if strong else "augmentation")

    def call(self, images: tf.Tensor, training: bool = True) -> tf.Tensor:
        return tf.clip_by_value(self.pipeline(images, training=training), 0.0, 1.0)


def build_augmentation(config: AugmentationConfig, seed: int, strong: bool = False) -> ImageAugmenter:
    return ImageAugmenter(config, seed=seed, strong=strong)
