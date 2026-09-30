"""Threshold sweep for the v3 gate on test + unseen splits."""
import sys
from collections import defaultdict

import numpy as np
import tensorflow as tf

sys.argv = ["sweep", "none"]
import train_gate as g

model = tf.keras.models.load_model(g.OUT / "banana_leaf_gate.keras")


def scored(split):
    ds, files, labels = g.dataset(split, False)
    return model.predict(ds, verbose=0).ravel(), files, labels


def group(file):
    category = file.name.split("__")[0]
    if file.parent.name == "positive":
        return "banana" if category.startswith("banana") else "other_plant"
    if category.startswith("stylised"):
        return "painted_copy"
    if category.startswith("domainnet_real_objects") or category == "imagenette":
        return "object"
    return "art_" + category.split("-")[0].replace("domainnet_", "")


val = scored("val")
test = scored("test")
unseen = scored("unseen")
print(f"{'thr':>5} | {'val real':>8} | {'test banana':>11} {'test plant':>10} | {'unseen field':>12} | {'painting':>8} {'clipart':>8} {'sketch':>8} {'painted':>8} {'objects':>8} (share BLOCKED)")
for threshold in [0.13, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98]:
    rates = defaultdict(lambda: [0, 0])
    for scores, files, labels in (test, unseen):
        for score, file in zip(scores, files):
            key = group(file) if file.parent.parent.name != "unseen" else ("unseen_field" if file.parent.name == "positive" else "unseen_painted")
            ok = score >= threshold
            rates[key][0] += ok if file.parent.name == "positive" else (not ok)
            rates[key][1] += 1
    f = lambda k: f"{rates[k][0] / max(1, rates[k][1]):8.3f}"
    val_real = (val[0][val[2] == 1] >= threshold).mean()
    print(f"{threshold:5.2f} | {val_real:8.3f} | {f('banana'):>11} {f('other_plant'):>10} | {f('unseen_field'):>12} | {f('art_painting')} {f('art_clipart')} {f('art_sketch')} {f('painted_copy')} {f('object')}")
