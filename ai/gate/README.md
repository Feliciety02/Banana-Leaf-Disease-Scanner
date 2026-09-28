# Banana-leaf photo gate

A small binary classifier that runs **before** disease classification in the
mobile app. It answers one question: *is this a real photograph of a banana
leaf?* If not (other plants, objects, people, paintings, drawings, clipart, or
painted/cartoon versions of banana leaves), the app shows "Not a banana leaf",
gives no diagnosis, and saves nothing.

The disease model cannot do this on its own: it was trained only on banana
leaves, so it always picks one of the four classes, whatever the image.

## Model

| Item | Value |
| --- | --- |
| Architecture | MobileNetV3-Small (ImageNet weights) + global average pooling + dropout 0.3 + 1 sigmoid unit |
| Parameters | 939,697 |
| App file | `mobile-frontend/assets/models/banana_leaf_gate_fp32.tflite` (3.7 MB, float32) |
| SHA-256 | `0ca56490fb3c90cc22c3267df4fab2ed6c04e3b53234381cf56b00dd521b0bb5` |
| Input | `[1, 224, 224, 3]` float32 RGB, raw 0–255 (the model rescales internally) |
| Output | `[1, 1]` float32, probability of "real banana leaf photo" |
| Threshold | **0.7** (`LEAF_GATE_THRESHOLD` in `mobile-frontend/src/features/classification/leafGate.ts`) |

The app feeds the gate the same stretched 224×224 image it gives the disease
model; training resizes images the same way.

## Data

**Accepted (positive):** 1,117 real banana leaf photographs.
- 900 originals from the Ecuador thesis set (`Data-Tesis`: Cordana, Healthy, Black Sigatoka).
- 217 leaf originals from the Banana Disease Recognition Dataset (Mendeley DOI 10.17632/79w2n6b4kf.1, CC BY 4.0): Healthy, Black and Yellow Sigatoka, Panama. Bract, fruit, pest and stem folders were excluded entirely.

**Rejected (negative):** about 15,700 images.
- DomainNet (Peng et al., 2019): painting 4,117, sketch 3,307, clipart 1,380 — every image of leaf, tree, house plant, flower, palm tree, bush, grass, banana, cactus and mushroom, plus random other drawings; real-photo plant classes 2,861 (leaf, tree, house plant, flower, bush, grass, cactus).
- Imagenette-160 (ImageNet subset) 2,500 everyday objects and scenes; TensorFlow flowers 1,500.
- Two generated "painted" copies of every banana photo (oil, watercolour, cartoon, posterised, pencil colour and grey, stylisation), made with OpenCV.

**Split:** 70 / 15 / 15 per source photo, so painted copies of a test photo
never appear in training. The threshold was chosen on validation only.

## Test results (threshold 0.7, 2,850 unseen images)

| Group | Result |
| --- | --- |
| Real banana leaves accepted | **162 / 167 (97.0%)** — Cordana 40/40, Sigatoka 62/62, Panama 8/9, Healthy 52/56 |
| Non-banana images wrongly accepted | **12 / 2,683 (0.45%)** |
| Objects, flowers, sketches, clipart | 0 accepted |
| Paintings of plants (DomainNet) | 1 / 605 accepted |
| Real photos of other plants (DomainNet) | 3 / 456 accepted |
| Painted copies of real banana photos | 8 / 334 accepted (oil 4/46, posterised 4/56, all other styles 0) |

`gate_evaluation.json` holds the per-category numbers at the untuned 0.5
threshold; `analyze_gate.py <threshold>` reproduces the table above.

## Limitations

- **Panama disease has only 41 training photos**, so real Panama leaves are the most likely to be wrongly rejected. Retraining with the full 9,881-image four-class dataset should fix this.
- Photos taken in Davao fields were not part of training or testing; field validation is still pending.
- Oil-painting and posterised versions of real banana photos are the hardest cases (about 1 in 12 still pass).
- Photos of a screen showing a banana leaf were not specifically tested.
- DomainNet is licensed for research use; confirm terms before any commercial release.

## Reproduce

The scripts expect a working folder at `C:\dmd\gate` (short, outside OneDrive).

```powershell
python -m venv C:\dmd\gate\venv
C:\dmd\gate\venv\Scripts\python -m pip install "tensorflow==2.19.*" opencv-contrib-python-headless pillow numpy
python download_data.py                                     # ~15k images, range-fetches DomainNet
C:\dmd\gate\venv\Scripts\python train_gate.py prepare train # ~45 min on CPU
C:\dmd\gate\venv\Scripts\python analyze_gate.py 0.7
```

To add more real banana photos (for example the full four-class dataset),
put them under `C:\dmd\gate\raw\positive\<source>\` before `prepare`.
