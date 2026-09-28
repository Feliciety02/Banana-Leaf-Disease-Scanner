"""Threshold sweep (validation) and per-class acceptance (test) for the gate."""
import json
import random
import sys
from collections import defaultdict

import numpy as np
import tensorflow as tf

CHOSEN = float(sys.argv[1]) if len(sys.argv) > 1 else 0.9
sys.argv = ["analyze", "none"]
import train_gate as g  # re-seeds random with SEED on import

# Rebuild the positive index -> source path mapping exactly as prepare() did.
random.seed(g.SEED)
positives, negatives = g.collect()
random.shuffle(positives)
index_to_path = {f"{i:05d}": path for i, (path, _) in enumerate(positives)}

model = tf.keras.models.load_model(g.OUT / "banana_leaf_gate.keras")


def scores(split):
    ds, files, labels = g.dataset(split, False)
    return model.predict(ds, verbose=0).ravel(), files, labels


def group_of(file):
    category = file.name.split("__")[0]
    if file.parent.name == "positive":
        stem = file.stem.split("__")[1]
        path = str(index_to_path[stem]).lower()
        for word, name in (("cordana", "cordana"), ("sanas", "healthy"), ("healthy", "healthy"),
                           ("sigatoka", "sigatoka"), ("panama", "panama")):
            if word in path:
                return f"positive/{name}"
        return "positive/other"
    if category.startswith("stylised"):
        return f"negative/{category}"
    return "negative/" + category.split("-")[0]


val_scores, val_files, val_labels = scores("val")
test_scores, test_files, test_labels = scores("test")

sweep = []
for threshold in [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.93, 0.95, 0.97]:
    accepted = val_scores >= threshold
    groups = defaultdict(lambda: [0, 0])
    for file, ok in zip(val_files, accepted):
        groups[group_of(file)][0] += int(ok)
        groups[group_of(file)][1] += 1
    stylised = [k for k in groups if k.startswith("negative/stylised")]
    sweep.append({
        "threshold": threshold,
        "real_leaves_accepted": round(float(accepted[val_labels == 1].mean()), 4),
        "all_rejects_blocked": round(float((~accepted[val_labels == 0]).mean()), 4),
        "painted_banana_blocked": round(1 - sum(groups[k][0] for k in stylised) / sum(groups[k][1] for k in stylised), 4),
    })

report = {"validation_sweep": sweep}
for threshold in (0.5, CHOSEN):
    accepted = test_scores >= threshold
    groups = defaultdict(lambda: [0, 0])
    for file, ok in zip(test_files, accepted):
        groups[group_of(file)][0] += int(ok)
        groups[group_of(file)][1] += 1
    report[f"test_at_{threshold}"] = {k: f"{ok}/{n} accepted" for k, (ok, n) in sorted(groups.items())}

print(json.dumps(report, indent=2))
