"""Score images with the exported gate .tflite exactly as the app feeds it."""
import sys
from pathlib import Path

import numpy as np
import tensorflow as tf
from PIL import Image

MODEL = Path(sys.argv[1])
interpreter = tf.lite.Interpreter(model_path=str(MODEL))
interpreter.allocate_tensors()
inp = interpreter.get_input_details()[0]
out = interpreter.get_output_details()[0]

for arg in sys.argv[2:]:
    for path in sorted(Path(arg).rglob("*")) if Path(arg).is_dir() else [Path(arg)]:
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        with Image.open(path) as image:
            rgb = image.convert("RGB").resize((224, 224), Image.BILINEAR)
        x = np.asarray(rgb, dtype=np.float32)[None]
        interpreter.set_tensor(inp["index"], x)
        interpreter.invoke()
        score = float(interpreter.get_tensor(out["index"])[0, 0])
        print(f"{score:6.3f}  {'ACCEPT' if score >= 0.7 else 'reject'}  {path.name}")
