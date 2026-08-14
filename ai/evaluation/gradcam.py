"""Grad-CAM heatmaps for correct and incorrect student predictions."""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from PIL import Image

from ai.data.dataset import ImageRecord, decode_and_resize


def _grad_model(model: tf.keras.Model, layer_name: str) -> tf.keras.Model:
    try:
        feature_layer = model.get_layer(layer_name)
    except ValueError as error:
        raise ValueError(
            f"Grad-CAM layer '{layer_name}' was not found. Available top-level layers: "
            f"{[layer.name for layer in model.layers]}"
        ) from error
    logits = model.output["logits"] if isinstance(model.output, dict) else model.output
    try:
        return tf.keras.Model(model.input, [feature_layer.output, logits])
    except ValueError as error:
        # Keras 3 gives a nested Functional model its own symbolic input/output
        # tensors. Use the tensor from the nested model's outer call node so the
        # feature map remains connected to the classifier logits.
        inbound_nodes = getattr(feature_layer, "_inbound_nodes", ())
        if len(inbound_nodes) != 1:
            raise ValueError(
                f"Grad-CAM layer '{layer_name}' is not connected unambiguously to the model input"
            ) from error
        connected_output = inbound_nodes[0].output_tensors
        if isinstance(connected_output, (list, tuple)):
            if len(connected_output) != 1:
                raise ValueError(
                    f"Grad-CAM layer '{layer_name}' has multiple connected outputs"
                ) from error
            connected_output = connected_output[0]
        return tf.keras.Model(model.input, [connected_output, logits])


def gradcam_heatmap(
    model: tf.keras.Model,
    image: tf.Tensor,
    predicted_class: int,
    layer_name: str = "coordinate_attention",
) -> np.ndarray:
    probe = _grad_model(model, layer_name)
    with tf.GradientTape() as tape:
        feature_map, logits = probe(image[None, ...], training=False)
        score = logits[:, predicted_class]
    gradients = tape.gradient(score, feature_map)
    if gradients is None:
        raise RuntimeError(f"No gradient connected logits to Grad-CAM layer '{layer_name}'")
    weights = tf.reduce_mean(gradients, axis=(1, 2), keepdims=True)
    heatmap = tf.reduce_sum(weights * feature_map, axis=-1)[0]
    heatmap = tf.maximum(heatmap, 0)
    heatmap /= tf.reduce_max(heatmap) + tf.keras.backend.epsilon()
    return heatmap.numpy()


def save_gradcam_examples(
    model: tf.keras.Model,
    records: Sequence[ImageRecord],
    predictions: Sequence[int],
    class_names: Sequence[str],
    image_size: tuple[int, int],
    output_dir: str | Path,
    maximum_per_group: int = 5,
    layer_name: str = "coordinate_attention",
) -> None:
    output = Path(output_dir)
    correct_dir = output / "correct"
    incorrect_dir = output / "incorrect"
    correct_dir.mkdir(parents=True, exist_ok=True)
    incorrect_dir.mkdir(parents=True, exist_ok=True)
    counts = {"correct": 0, "incorrect": 0}
    for index, (record, prediction) in enumerate(zip(records, predictions)):
        group = "correct" if record.label == int(prediction) else "incorrect"
        if counts[group] >= maximum_per_group:
            continue
        image = decode_and_resize(tf.constant(record.path), image_size)
        heatmap = gradcam_heatmap(model, image, int(prediction), layer_name)
        heatmap = np.asarray(Image.fromarray(np.uint8(heatmap * 255)).resize((image_size[1], image_size[0]))) / 255.0
        colored = plt.get_cmap("jet")(heatmap)[..., :3]
        original = image.numpy()
        overlay = np.clip(0.6 * original + 0.4 * colored, 0.0, 1.0)
        figure, axes = plt.subplots(1, 3, figsize=(11, 4))
        axes[0].imshow(original)
        axes[0].set_title("Input")
        axes[1].imshow(heatmap, cmap="jet")
        axes[1].set_title("Grad-CAM")
        axes[2].imshow(overlay)
        axes[2].set_title(f"True: {class_names[record.label]}\nPredicted: {class_names[int(prediction)]}")
        for axis in axes:
            axis.axis("off")
        destination = (correct_dir if group == "correct" else incorrect_dir) / f"{index:05d}.png"
        figure.tight_layout()
        figure.savefig(destination, dpi=180, bbox_inches="tight")
        plt.close(figure)
        counts[group] += 1
        if all(value >= maximum_per_group for value in counts.values()):
            break
