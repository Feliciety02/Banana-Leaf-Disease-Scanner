"""Logit- and feature-level knowledge-distillation objectives."""

import tensorflow as tf


def logit_distillation_loss(
    teacher_logits: tf.Tensor,
    student_logits: tf.Tensor,
    temperature: float,
) -> tf.Tensor:
    """KL(teacher || student) at temperature T, including the required T^2 factor."""
    temperature_tensor = tf.cast(temperature, student_logits.dtype)
    teacher_probabilities = tf.nn.softmax(tf.stop_gradient(teacher_logits) / temperature_tensor, axis=-1)
    student_log_probabilities = tf.nn.log_softmax(student_logits / temperature_tensor, axis=-1)
    teacher_log_probabilities = tf.math.log(tf.clip_by_value(teacher_probabilities, 1e-7, 1.0))
    kl_per_example = tf.reduce_sum(
        teacher_probabilities * (teacher_log_probabilities - student_log_probabilities), axis=-1
    )
    return tf.reduce_mean(kl_per_example) * tf.square(temperature_tensor)


def feature_distillation_loss(teacher_features: tf.Tensor, projected_student_features: tf.Tensor) -> tf.Tensor:
    """MSE over explicitly aligned near-final spatial feature maps."""
    teacher = tf.stop_gradient(teacher_features)
    tf.debugging.assert_rank(teacher, 4, message="Teacher KD features must be [B, H, W, C]")
    tf.debugging.assert_rank(projected_student_features, 4, message="Student KD features must be [B, H, W, C]")
    tf.debugging.assert_equal(
        tf.shape(teacher),
        tf.shape(projected_student_features),
        message="Teacher/student feature maps must match after spatial and channel alignment",
    )
    return tf.reduce_mean(tf.math.squared_difference(teacher, projected_student_features))


def total_distillation_loss(
    classification: tf.Tensor,
    output_distillation: tf.Tensor,
    feature_matching: tf.Tensor,
    alpha: float,
    beta: float,
    gamma: float,
) -> tf.Tensor:
    """alpha*L_CE + beta*T^2*L_KD + gamma*L_feat.

    ``output_distillation`` already contains the explicit T^2 factor applied by
    :func:`logit_distillation_loss`.
    """
    return alpha * classification + beta * output_distillation + gamma * feature_matching
