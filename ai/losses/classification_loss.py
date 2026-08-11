"""Supervised classification objective."""

import tensorflow as tf


def classification_loss(labels: tf.Tensor, logits: tf.Tensor) -> tf.Tensor:
    losses = tf.keras.losses.sparse_categorical_crossentropy(labels, logits, from_logits=True)
    return tf.reduce_mean(losses)
