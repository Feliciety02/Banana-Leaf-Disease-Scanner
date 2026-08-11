"""SimCLR NT-Xent contrastive objective with in-batch negatives."""

import tensorflow as tf


def nt_xent_loss(projection_one: tf.Tensor, projection_two: tf.Tensor, temperature: float) -> tf.Tensor:
    """Symmetric normalized temperature-scaled cross entropy.

    Each sample's other augmented view is its sole positive; all other 2B-2 views
    are negatives. Inputs have shape [B, projection_dim].
    """
    z_one = tf.math.l2_normalize(projection_one, axis=1)
    z_two = tf.math.l2_normalize(projection_two, axis=1)
    embeddings = tf.concat([z_one, z_two], axis=0)  # [2B, D]
    similarities = tf.matmul(embeddings, embeddings, transpose_b=True) / temperature
    count = tf.shape(embeddings)[0]
    similarities = similarities - tf.eye(count, dtype=similarities.dtype) * 1e9
    batch = tf.shape(z_one)[0]
    positive_indices = tf.concat([tf.range(batch, count), tf.range(0, batch)], axis=0)
    losses = tf.keras.losses.sparse_categorical_crossentropy(
        positive_indices, similarities, from_logits=True
    )
    return tf.reduce_mean(losses)
