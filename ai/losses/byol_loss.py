"""Bootstrap Your Own Latent (BYOL) symmetric regression objective."""

import tensorflow as tf


def _normalized_regression(online_prediction: tf.Tensor, target_projection: tf.Tensor) -> tf.Tensor:
    online_prediction = tf.math.l2_normalize(online_prediction, axis=1)
    target_projection = tf.stop_gradient(tf.math.l2_normalize(target_projection, axis=1))
    return tf.reduce_mean(2.0 - 2.0 * tf.reduce_sum(online_prediction * target_projection, axis=1))


def byol_loss(
    prediction_one: tf.Tensor,
    prediction_two: tf.Tensor,
    target_projection_one: tf.Tensor,
    target_projection_two: tf.Tensor,
) -> tf.Tensor:
    # Cross-view targets are essential: online view 1 predicts target view 2 and vice versa.
    return 0.5 * (
        _normalized_regression(prediction_one, target_projection_two)
        + _normalized_regression(prediction_two, target_projection_one)
    )
