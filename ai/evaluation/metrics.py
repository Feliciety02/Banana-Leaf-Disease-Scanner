"""Classification metrics and model resource measurements."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Sequence

import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, precision_recall_fscore_support


def classification_metrics(
    true_labels: Sequence[int], predicted_labels: Sequence[int], class_names: Sequence[str]
) -> dict[str, Any]:
    labels = list(range(len(class_names)))
    precision, recall, f1, support = precision_recall_fscore_support(
        true_labels, predicted_labels, labels=labels, zero_division=0
    )
    macro_precision, macro_recall, macro_f1, _ = precision_recall_fscore_support(
        true_labels, predicted_labels, labels=labels, average="macro", zero_division=0
    )
    matrix = confusion_matrix(true_labels, predicted_labels, labels=labels)
    return {
        "accuracy": float(accuracy_score(true_labels, predicted_labels)),
        "precision": float(macro_precision),
        "recall": float(macro_recall),
        "f1_score": float(macro_f1),
        "macro_precision": float(macro_precision),
        "macro_recall": float(macro_recall),
        "macro_f1": float(macro_f1),
        "per_class": {
            class_name: {
                "precision": float(precision[index]),
                "recall": float(recall[index]),
                "f1": float(f1[index]),
                "support": int(support[index]),
            }
            for index, class_name in enumerate(class_names)
        },
        "confusion_matrix": matrix.tolist(),
        "classification_report": classification_report(
            true_labels,
            predicted_labels,
            labels=labels,
            target_names=list(class_names),
            output_dict=True,
            zero_division=0,
        ),
    }


def save_confusion_matrix(matrix: Sequence[Sequence[int]], class_names: Sequence[str], path: str | Path) -> None:
    matrix_array = np.asarray(matrix)
    figure, axis = plt.subplots(figsize=(8, 7))
    image = axis.imshow(matrix_array, interpolation="nearest", cmap="Blues")
    figure.colorbar(image, ax=axis)
    axis.set(
        xticks=np.arange(len(class_names)),
        yticks=np.arange(len(class_names)),
        xticklabels=class_names,
        yticklabels=class_names,
        ylabel="True label",
        xlabel="Predicted label",
        title="Confusion matrix",
    )
    plt.setp(axis.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor")
    threshold = matrix_array.max() / 2.0 if matrix_array.size else 0
    for row in range(matrix_array.shape[0]):
        for column in range(matrix_array.shape[1]):
            axis.text(column, row, str(matrix_array[row, column]), ha="center", va="center", color="white" if matrix_array[row, column] > threshold else "black")
    figure.tight_layout()
    figure.savefig(path, dpi=200, bbox_inches="tight")
    plt.close(figure)


def benchmark_keras_latency(model: tf.keras.Model, image_size: tuple[int, int], warmup: int = 10, runs: int = 100) -> dict[str, float]:
    sample = tf.zeros([1, *image_size, 3], tf.float32)
    for _ in range(warmup):
        output = model(sample, training=False)
        output = output["logits"] if isinstance(output, dict) else output
        _ = output.numpy()
    timings = []
    for _ in range(runs):
        start = time.perf_counter()
        output = model(sample, training=False)
        output = output["logits"] if isinstance(output, dict) else output
        _ = output.numpy()
        timings.append((time.perf_counter() - start) * 1000.0)
    return {
        "mean_ms": float(np.mean(timings)),
        "median_ms": float(np.median(timings)),
        "p95_ms": float(np.percentile(timings, 95)),
        "runs": runs,
    }


def count_flops(model: tf.keras.Model, image_size: tuple[int, int]) -> int | None:
    """Best-effort count of float operations for batch size one."""
    try:
        from tensorflow.python.framework.convert_to_constants import convert_variables_to_constants_v2

        @tf.function
        def forward(images):
            output = model(images, training=False)
            return output["logits"] if isinstance(output, dict) else output

        concrete = forward.get_concrete_function(tf.TensorSpec([1, *image_size, 3], tf.float32))
        frozen = convert_variables_to_constants_v2(concrete)
        graph = tf.Graph()
        with graph.as_default():
            tf.graph_util.import_graph_def(frozen.graph.as_graph_def(), name="")
            options = tf.compat.v1.profiler.ProfileOptionBuilder.float_operation()
            profile = tf.compat.v1.profiler.profile(graph=graph, options=options)
        return int(profile.total_float_ops) if profile else None
    except Exception as error:  # TensorFlow profiler support varies by build.
        print(f"Warning: FLOP profiling was unavailable: {error}")
        return None


def save_json(payload: dict[str, Any], path: str | Path) -> None:
    Path(path).write_text(json.dumps(payload, indent=2), encoding="utf-8")
