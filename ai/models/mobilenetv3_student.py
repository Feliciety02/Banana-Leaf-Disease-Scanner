"""MobileNetV3-Small student with Coordinate Attention replacing every SE block."""

from __future__ import annotations

import tensorflow as tf

from ai.config.config import ExperimentConfig
from ai.models.coordinate_attention import CoordinateAttention


@tf.keras.utils.register_keras_serializable(package="BananaCare")
class HardSwish(tf.keras.layers.Layer):
    def call(self, inputs: tf.Tensor) -> tf.Tensor:
        return inputs * tf.nn.relu6(inputs + 3.0) / 6.0


def _make_divisible(value: float, divisor: int = 8) -> int:
    adjusted = max(divisor, int(value + divisor / 2) // divisor * divisor)
    return adjusted + divisor if adjusted < 0.9 * value else adjusted


def _activation(inputs: tf.Tensor, kind: str, name: str) -> tf.Tensor:
    if kind == "RE":
        return tf.keras.layers.ReLU(name=name)(inputs)
    return HardSwish(name=name)(inputs)


def _inverted_residual(
    inputs: tf.Tensor,
    expansion_channels: int,
    output_channels: int,
    kernel_size: int,
    stride: int,
    activation: str,
    use_coordinate_attention: bool,
    attention_reduction: int,
    block_index: int,
    final_attention_block: bool,
) -> tf.Tensor:
    """MobileNetV3 bottleneck; Coordinate Attention occupies every original SE position."""
    prefix = f"block_{block_index}"
    input_channels = int(inputs.shape[-1])
    x = inputs
    if expansion_channels != input_channels:
        x = tf.keras.layers.Conv2D(expansion_channels, 1, use_bias=False, name=f"{prefix}_expand")(x)
        x = tf.keras.layers.BatchNormalization(name=f"{prefix}_expand_bn")(x)
        x = _activation(x, activation, f"{prefix}_expand_activation")
    x = tf.keras.layers.DepthwiseConv2D(
        kernel_size,
        strides=stride,
        padding="same",
        use_bias=False,
        name=f"{prefix}_depthwise",
    )(x)
    x = tf.keras.layers.BatchNormalization(name=f"{prefix}_depthwise_bn")(x)
    x = _activation(x, activation, f"{prefix}_depthwise_activation")
    if use_coordinate_attention:
        attention_name = "coordinate_attention" if final_attention_block else f"{prefix}_coordinate_attention"
        x = CoordinateAttention(reduction=attention_reduction, name=attention_name)(x)
    x = tf.keras.layers.Conv2D(output_channels, 1, use_bias=False, name=f"{prefix}_project")(x)
    x = tf.keras.layers.BatchNormalization(name=f"{prefix}_project_bn")(x)
    if stride == 1 and input_channels == output_channels:
        x = tf.keras.layers.Add(name=f"{prefix}_residual")([inputs, x])
    return x


def build_student(config: ExperimentConfig, force_weights: str | None = None) -> tf.keras.Model:
    if config.student.backbone != "MobileNetV3SmallCoordinateAttention":
        raise ValueError("Only the finalized Coordinate Attention-Enhanced MobileNetV3Small is supported")
    if force_weights is not None or config.student.imagenet_weights:
        raise ValueError("Stock MobileNetV3 weights cannot be loaded after replacing SE blocks")
    alpha = config.student.width_multiplier
    inputs = tf.keras.Input((*config.image_size, 3), name="image")  # RGB float32 [B, H, W, 3] in [0, 1]
    x = tf.keras.layers.Rescaling(2.0, offset=-1.0, name="student_input_normalization")(inputs)
    first_channels = _make_divisible(16 * alpha)
    x = tf.keras.layers.Conv2D(first_channels, 3, strides=2, padding="same", use_bias=False, name="stem_conv")(x)
    x = tf.keras.layers.BatchNormalization(name="stem_bn")(x)
    x = HardSwish(name="stem_activation")(x)

    # k, expansion, output, former-SE-position, nonlinearity, stride.
    specifications = (
        (3, 16, 16, True, "RE", 2),
        (3, 72, 24, False, "RE", 2),
        (3, 88, 24, False, "RE", 1),
        (5, 96, 40, True, "HS", 2),
        (5, 240, 40, True, "HS", 1),
        (5, 240, 40, True, "HS", 1),
        (5, 120, 48, True, "HS", 1),
        (5, 144, 48, True, "HS", 1),
        (5, 288, 96, True, "HS", 2),
        (5, 576, 96, True, "HS", 1),
        (5, 576, 96, True, "HS", 1),
    )
    attention_indices = [index for index, spec in enumerate(specifications) if spec[3]]
    final_attention_index = attention_indices[-1]
    for index, (kernel, expansion, output, use_attention, activation, stride) in enumerate(specifications):
        x = _inverted_residual(
            x,
            _make_divisible(expansion * alpha),
            _make_divisible(output * alpha),
            kernel,
            stride,
            activation,
            use_attention,
            config.student.coordinate_attention_reduction,
            index,
            index == final_attention_index,
        )

    last_channels = _make_divisible(576 * alpha)
    x = tf.keras.layers.Conv2D(last_channels, 1, use_bias=False, name="final_conv")(x)
    x = tf.keras.layers.BatchNormalization(name="final_bn")(x)
    x = HardSwish(name="final_activation")(x)
    pooled = tf.keras.layers.GlobalAveragePooling2D(name="student_global_pool")(x)
    feature_channels = _make_divisible(1024 * alpha)
    features = tf.keras.layers.Dense(feature_channels, name="student_feature_dense")(pooled)
    features = HardSwish(name="student_features")(features)  # [B, approximately 1024 * alpha]
    if config.student.feature_distillation_enabled:
        distill_features = tf.keras.layers.Dense(
            config.teacher.feature_dim, use_bias=False, name="feature_projection"
        )(features)  # [B, 2048]
    else:
        distill_features = features
    dropped = tf.keras.layers.Dropout(config.student.dropout_rate, name="student_dropout")(features)
    logits = tf.keras.layers.Dense(config.data.num_classes, name="logits")(dropped)  # [B, 5]
    return tf.keras.Model(
        inputs,
        {"logits": logits, "features": features, "distill_features": distill_features},
        name="coordinate_attention_enhanced_mobilenetv3",
    )


def logits_only_model(student: tf.keras.Model) -> tf.keras.Model:
    """The phone-facing graph: only the lightweight student's input-to-logits path."""
    return tf.keras.Model(student.input, student.output["logits"], name="enhanced_mobilenetv3_logits")
