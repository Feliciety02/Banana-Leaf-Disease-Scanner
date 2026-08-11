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
    teacher = tf.stop_gradient(tf.math.l2_normalize(teacher_features, axis=-1))
    student = tf.math.l2_normalize(projected_student_features, axis=-1)
    return tf.reduce_mean(1.0 - tf.reduce_sum(teacher * student, axis=-1))
