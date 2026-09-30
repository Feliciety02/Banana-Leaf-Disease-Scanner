"""Train the "real plant photo?" gate for DahonMD (v3).

Positive = a real photograph of a plant or leaf: banana leaves from several
sources plus other crops, trees, bushes, grass and flowers.
Negative = paintings, clipart, sketches, stylised ("painted"/cartoon) copies
of real plant photos, and real photos of non-plant objects, people and scenes.

v1/v2 tried to accept banana leaves only. They learned the look of each
banana dataset and rejected most banana photos from unseen sources (v2
accepted 24% of an unseen field set), so the gate no longer decides which
plant is shown - only whether it is a real plant photo.

Splits are made per source photo, so a stylised copy of a test photo never
appears in training. The decision threshold is chosen on the validation split
(target: at most TARGET_FALSE_REJECT of real leaves rejected) and reported on
the untouched test split.
"""
import json
import os
import random
import shutil
from collections import Counter, defaultdict
from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf
from PIL import Image

ROOT = Path(r"C:\dmd\gate")
RAW = ROOT / "raw"
PREPARED = ROOT / "prepared"
OUT = ROOT / "output"
SIZE = 224
SEED = 42
TARGET_FALSE_REJECT = 0.02
IMAGE_EXT = {".jpg", ".jpeg", ".png"}
# Banana Disease Recognition folders that show leaves; bract, fruit, pest and
# stem folders are left out entirely (neither accepted nor rejected).
BDR_LEAF_WORDS = ("healthy", "sigatoka", "panama")
# Cap each banana source so no single dataset's look dominates what
# "a banana leaf photo" means.
POSITIVE_CAP_PER_SOURCE = 1500
# One whole banana source is kept out of training and scored separately, to
# measure acceptance of photos from a source the gate has never seen.
HOLDOUT_SOURCE = os.environ.get("GATE_HOLDOUT_SOURCE", "")
# Real photos of other plants are accepted (positive), never rejected.
OTHER_PLANT_SOURCES = {"other_crops", "flowers"}
REAL_PLANT_CLASSES = {"leaf", "house_plant", "tree", "bush", "grass", "flower", "cactus"}
# Banana photos get two stylised copies each; other plants get one.
BANANA_STYLED_COPIES = 2
OTHER_STYLED_COPIES = 1

random.seed(SEED)
np.random.seed(SEED)
tf.random.set_seed(SEED)


def images_under(folder):
    return sorted(p for p in folder.rglob("*") if p.suffix.lower() in IMAGE_EXT)


def collect():
    positives = []
    for path in images_under(RAW / "positive"):
        rel = path.relative_to(RAW / "positive")
        source = rel.parts[0]
        if source == "bdr" and not any(word in str(rel).lower() for word in BDR_LEAF_WORDS):
            continue
        positives.append((path, f"banana_{source}"))
    by_source = defaultdict(list)
    for item in positives:
        by_source[item[1]].append(item)
    rng = random.Random(SEED)
    positives = []
    for source, items in sorted(by_source.items()):
        rng.shuffle(items)
        positives.extend(items[:POSITIVE_CAP_PER_SOURCE])
    negatives = []
    for path in images_under(RAW / "negative"):
        rel = path.relative_to(RAW / "negative")
        source = rel.parts[0]
        if source in OTHER_PLANT_SOURCES:
            positives.append((path, f"plant_{source}"))
        elif source == "domainnet_real":
            if len(rel.parts) > 2 and rel.parts[1] in REAL_PLANT_CLASSES:
                positives.append((path, "plant_domainnet_real"))
        elif source.startswith("domainnet_") and len(rel.parts) > 2 and source != "domainnet_real_objects":
            negatives.append((path, f"{source}/{rel.parts[1]}"))
        else:
            negatives.append((path, source))
    return positives, negatives


def split_of(index, total):
    fraction = index / total
    return "train" if fraction < 0.7 else "val" if fraction < 0.85 else "test"


def load_rgb(path):
    with Image.open(path) as image:
        # Decode large camera JPEGs at reduced size; every image ends up
        # 224x224 (or 512x512 for stylising), so full resolution is wasted.
        image.draft("RGB", (1024, 1024))
        return np.asarray(image.convert("RGB"))


def app_resize(rgb):
    # The app stretches every photo to 224x224 (no crop, no letterbox).
    return cv2.resize(rgb, (SIZE, SIZE), interpolation=cv2.INTER_AREA)


def stylise(rgb, style):
    """Painted / drawn versions of a real banana photo (hard negatives)."""
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    if style == "stylization":
        out = cv2.stylization(bgr, sigma_s=60, sigma_r=0.45)
    elif style == "oil":
        out = cv2.xphoto.oilPainting(bgr, 7, 1)
    elif style == "pencil_color":
        _, out = cv2.pencilSketch(bgr, sigma_s=60, sigma_r=0.07, shade_factor=0.05)
    elif style == "pencil_gray":
        gray, _ = cv2.pencilSketch(bgr, sigma_s=60, sigma_r=0.07, shade_factor=0.05)
        out = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    elif style == "cartoon":
        smooth = bgr
        for _ in range(5):
            smooth = cv2.bilateralFilter(smooth, 9, 75, 75)
        gray = cv2.medianBlur(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), 7)
        edges = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 9, 2)
        out = cv2.bitwise_and(smooth, smooth, mask=edges)
    elif style == "posterize":
        data = bgr.reshape(-1, 3).astype(np.float32)
        k = random.choice([4, 6, 8])
        _, labels, centers = cv2.kmeans(data, k, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0), 2, cv2.KMEANS_PP_CENTERS)
        out = centers.astype(np.uint8)[labels.flatten()].reshape(bgr.shape)
    elif style == "watercolor":
        out = cv2.edgePreservingFilter(bgr, flags=1, sigma_s=80, sigma_r=0.6)
        out = cv2.stylization(out, sigma_s=40, sigma_r=0.6)
    else:
        raise ValueError(style)
    return cv2.cvtColor(out, cv2.COLOR_BGR2RGB)


STYLES = ["stylization", "oil", "pencil_color", "pencil_gray", "cartoon", "posterize", "watercolor"]


def save(rgb, split, label, category, name):
    folder = PREPARED / split / label
    folder.mkdir(parents=True, exist_ok=True)
    safe = category.replace("/", "-")
    Image.fromarray(rgb).save(folder / f"{safe}__{name}.jpg", quality=95)


def _prepare_positive(job):
    index, path, category, split = job
    try:
        rgb = load_rgb(path)
    except Exception:
        return None
    rng = random.Random(SEED + index)
    # Stylise at a moderate resolution, then resize like the app does.
    work = cv2.resize(rgb, (512, 512), interpolation=cv2.INTER_AREA)
    stem = f"{index:05d}"
    save(app_resize(rgb), split, "positive", category, stem)
    styles = rng.sample(STYLES, BANANA_STYLED_COPIES if category.startswith("banana_") else OTHER_STYLED_COPIES)
    for style in styles:
        random.seed(SEED + index)  # posterize picks k with the module RNG
        save(app_resize(stylise(work, style)), split, "negative", f"stylised_{style}", stem)
    return split, category, styles


def _prepare_negative(job):
    index, path, category, split = job
    try:
        rgb = load_rgb(path)
    except Exception:
        return None
    save(app_resize(rgb), split, "negative", category, f"{index:05d}")
    return split, category


def prepare():
    from multiprocessing import Pool

    if PREPARED.exists():
        shutil.rmtree(PREPARED)
    positives, negatives = collect()
    random.shuffle(positives)
    random.shuffle(negatives)
    manifest = {"positives": Counter(), "negatives": Counter(), "splits": defaultdict(Counter)}

    positive_jobs = [
        (index, path, category, "unseen" if category == f"banana_{HOLDOUT_SOURCE}" else split_of(index, len(positives)))
        for index, (path, category) in enumerate(positives)
    ]
    negative_jobs = [(index, path, category, split_of(index, len(negatives))) for index, (path, category) in enumerate(negatives)]

    with Pool(max(1, (os.cpu_count() or 2) - 1)) as pool:
        for done, result in enumerate(pool.imap_unordered(_prepare_positive, positive_jobs, chunksize=8)):
            if result:
                split, category, styles = result
                manifest["positives"][category] += 1
                manifest["splits"][split]["positive"] += 1
                for style in styles:
                    manifest["negatives"][f"stylised_{style}"] += 1
                    manifest["splits"][split]["negative"] += 1
            if done % 1000 == 0:
                print(f"positives {done}/{len(positive_jobs)}", flush=True)
        for done, result in enumerate(pool.imap_unordered(_prepare_negative, negative_jobs, chunksize=16)):
            if result:
                split, category = result
                manifest["negatives"][category.split("/")[0]] += 1
                manifest["splits"][split]["negative"] += 1
            if done % 2000 == 0:
                print(f"negatives {done}/{len(negative_jobs)}", flush=True)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "dataset_manifest.json").write_text(json.dumps(manifest, indent=2))
    print(json.dumps(manifest["splits"], indent=2), flush=True)


def dataset(split, training, class_weight=None):
    files = sorted((PREPARED / split).rglob("*.jpg"))
    labels = [1.0 if f.parent.name == "positive" else 0.0 for f in files]
    ds = tf.data.Dataset.from_tensor_slices(([str(f) for f in files], labels))
    if training:
        ds = ds.shuffle(len(files), seed=SEED, reshuffle_each_iteration=True)

    def load(path, label):
        image = tf.io.decode_jpeg(tf.io.read_file(path), channels=3)
        image = tf.cast(tf.reshape(image, (SIZE, SIZE, 3)), tf.float32)
        return image, label

    ds = ds.map(load, num_parallel_calls=tf.data.AUTOTUNE)
    if training:
        augment = tf.keras.Sequential([
            tf.keras.layers.RandomFlip("horizontal_and_vertical"),
            tf.keras.layers.RandomRotation(0.5, fill_mode="reflect"),
            tf.keras.layers.RandomZoom((-0.5, 0.2), fill_mode="reflect"),
            tf.keras.layers.RandomBrightness(0.25, value_range=(0, 255)),
            tf.keras.layers.RandomContrast(0.25),
        ])
        ds = ds.map(lambda x, y: (tf.clip_by_value(augment(x, training=True), 0, 255), y), num_parallel_calls=tf.data.AUTOTUNE)
    ds = ds.map(lambda x, y: (x, tf.reshape(y, (1,))))
    if class_weight is not None:
        # Balance real leaves vs. rejects with per-sample weights (Keras 3's
        # class_weight argument does not support a single sigmoid output).
        ds = ds.map(lambda x, y: (x, y, tf.where(y[0] > 0.5, class_weight[1], class_weight[0])))
    return ds.batch(32).prefetch(tf.data.AUTOTUNE), files, np.array(labels)


def build_model():
    base = tf.keras.applications.MobileNetV3Small(
        input_shape=(SIZE, SIZE, 3), include_top=False, weights="imagenet",
        include_preprocessing=True, pooling="avg",
    )
    base.trainable = False
    inputs = tf.keras.Input((SIZE, SIZE, 3), name="image_0_255")
    x = base(inputs, training=False)
    x = tf.keras.layers.Dropout(0.3)(x)
    outputs = tf.keras.layers.Dense(1, activation="sigmoid", name="banana_leaf_photo")(x)
    return tf.keras.Model(inputs, outputs), base


def train():
    labels = np.array([1.0 if f.parent.name == "positive" else 0.0 for f in sorted((PREPARED / "train").rglob("*.jpg"))])
    positives = labels.sum()
    negatives = len(labels) - positives
    class_weight = {0: float(len(labels) / (2 * negatives)), 1: float(len(labels) / (2 * positives))}
    train_ds, _, _ = dataset("train", True, class_weight)
    val_ds, _, _ = dataset("val", False)
    model, base = build_model()
    metrics = [tf.keras.metrics.AUC(name="auc"), tf.keras.metrics.BinaryAccuracy(name="acc")]
    stop = tf.keras.callbacks.EarlyStopping(monitor="val_auc", mode="max", patience=3, restore_best_weights=True)

    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss="binary_crossentropy", metrics=metrics)
    model.fit(train_ds, validation_data=val_ds, epochs=8, callbacks=[stop], verbose=2)

    base.trainable = True
    for layer in base.layers[:-45]:
        layer.trainable = False
    for layer in base.layers:
        if isinstance(layer, tf.keras.layers.BatchNormalization):
            layer.trainable = False
    model.compile(optimizer=tf.keras.optimizers.Adam(2e-5), loss="binary_crossentropy", metrics=metrics)
    model.fit(train_ds, validation_data=val_ds, epochs=10, callbacks=[stop], verbose=2)
    model.save(OUT / "banana_leaf_gate.keras")
    return model


def evaluate(model):
    val_ds, _, val_labels = dataset("val", False)
    val_scores = model.predict(val_ds, verbose=0).ravel()
    positive_scores = np.sort(val_scores[val_labels == 1])
    threshold = float(positive_scores[int(np.floor(TARGET_FALSE_REJECT * len(positive_scores)))])
    threshold = min(threshold, 0.5)

    test_ds, test_files, test_labels = dataset("test", False)
    scores = model.predict(test_ds, verbose=0).ravel()
    accepted = scores >= threshold
    by_category = defaultdict(lambda: [0, 0])
    for file, ok in zip(test_files, accepted):
        category = file.name.split("__")[0]
        group = category if file.parent.name == "positive" else category.split("-")[0] if category.startswith("domainnet") else category
        by_category[(file.parent.name, group)][0] += int(ok)
        by_category[(file.parent.name, group)][1] += 1

    report = {
        "threshold": threshold,
        "test_real_leaves_accepted": float(accepted[test_labels == 1].mean()),
        "test_non_leaf_rejected": float((~accepted[test_labels == 0]).mean()),
        "test_counts": {"positive": int(test_labels.sum()), "negative": int((test_labels == 0).sum())},
        "per_category": {
            f"{label}/{group}": {
                "images": total,
                ("accepted" if label == "positive" else "wrongly_accepted"): round(ok / total, 4),
            }
            for (label, group), (ok, total) in sorted(by_category.items())
        },
    }
    if (PREPARED / "unseen").exists():
        unseen_ds, _, unseen_labels = dataset("unseen", False)
        unseen_scores = model.predict(unseen_ds, verbose=0).ravel()
        report["unseen_source"] = {
            "source": HOLDOUT_SOURCE,
            "real_photos": int(unseen_labels.sum()),
            "accepted_at_threshold": float((unseen_scores[unseen_labels == 1] >= threshold).mean()),
            "accepted_at_0.5": float((unseen_scores[unseen_labels == 1] >= 0.5).mean()),
            "painted_copies_blocked_at_threshold": float((unseen_scores[unseen_labels == 0] < threshold).mean()),
        }
    (OUT / "gate_evaluation.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2), flush=True)
    return threshold


def export(model):
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    tflite = converter.convert()
    (OUT / "banana_leaf_gate_fp32.tflite").write_bytes(tflite)
    interpreter = tf.lite.Interpreter(model_content=tflite)
    interpreter.allocate_tensors()
    detail_in = interpreter.get_input_details()[0]
    detail_out = interpreter.get_output_details()[0]
    print("tflite", len(tflite), "bytes", detail_in["shape"], detail_in["dtype"], detail_out["shape"], detail_out["dtype"], flush=True)


if __name__ == "__main__":
    import sys
    steps = sys.argv[1:] or ["prepare", "train"]
    if "prepare" in steps:
        prepare()
    if "train" in steps:
        trained = train()
        evaluate(trained)
        export(trained)
