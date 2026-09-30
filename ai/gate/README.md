# Real-plant-photo gate

A small binary classifier that runs **before** disease classification in the
mobile app. It answers one question: *is this a real photograph of a plant or
leaf?* Paintings, drawings, clipart, cartoons, painted/filtered versions of
photos, and photos of non-plant objects are blocked: the app shows "Not a real
leaf photo", gives no diagnosis, and saves nothing.

The gate does **not** decide which plant is shown. Photos of other crops pass
and get a normal result (usually a low-confidence one). See "History" below
for why.

## Model (v3)

| Item | Value |
| --- | --- |
| Architecture | MobileNetV3-Small (ImageNet weights) + global average pooling + dropout 0.3 + 1 sigmoid unit |
| Parameters | 939,697 |
| App file | `mobile-frontend/assets/models/banana_leaf_gate_fp32.tflite` (3.7 MB, float32) |
| SHA-256 | `fe8304e935083acaff0826458dbd78966973922eadff14ad34b00a4c9c2bc495` |
| Input | `[1, 224, 224, 3]` float32 RGB, raw 0–255 (the model rescales internally) |
| Output | `[1, 1]` float32, probability of "real plant photo" |
| Threshold | **0.5** (`LEAF_GATE_THRESHOLD`); blocking on (`LEAF_GATE_BLOCKING`) in `mobile-frontend/src/features/classification/leafGate.ts` |
| On-device time | about 6 ms (Honor 200) |

The app feeds the gate the same stretched 224×224 image as the disease model.

## Data (all openly licensed or research-use)

**Accepted — real plant photos (10,460):**

| Source | Images | Licence |
| --- | ---: | --- |
| Ecuador thesis originals (Cordana, Healthy, Black Sigatoka) | 900 | CC BY 4.0 (companion article) |
| Banana Disease Recognition, leaf folders only — [Mendeley 79w2n6b4kf](https://data.mendeley.com/datasets/79w2n6b4kf/1) | 217 | CC BY 4.0 |
| BananaLSD original set — [Mendeley 9tb7k297ff](https://data.mendeley.com/datasets/9tb7k297ff/1) | 937 | CC BY-SA 4.0 |
| Nutrient-deficient banana leaves, raw (capped) — [Mendeley 7vpdrbdkd4](https://data.mendeley.com/datasets/7vpdrbdkd4/1) | 1,500 | CC BY 4.0 |
| **Field banana plants (held out, never trained on)** — [Mendeley 428ysdybvd](https://data.mendeley.com/datasets/428ysdybvd/1) | 1,000 | CC BY 4.0 |
| Other crops' leaves (bitter gourd, beans, sesame, chilli…) — [Mendeley hgshn2zg3t](https://data.mendeley.com/datasets/hgshn2zg3t/1) | 1,545 | CC BY 4.0 |
| DomainNet real photos: leaf, house plant, tree, bush, grass, flower, cactus | 2,861 | research use |
| TensorFlow flowers | 1,500 | CC BY 2.0 |

**Blocked (23,052):** DomainNet painting 4,117, sketch 3,307, clipart 1,380
(every plant class plus random others); OpenCV-generated painted copies of
each real plant photo (cartoon, oil, watercolour, posterised, pencil, stylised)
15,014; Imagenette objects/scenes 2,500; DomainNet real non-plant objects 734.

**Split:** 70 / 15 / 15 per source photo (painted copies follow their
original), plus the whole field-banana set kept out as an unseen source.

## Results (threshold 0.5)

| Group | Result |
| --- | --- |
| **Unseen-source banana field photos** | **98.7%** accepted (987 / 1,000) |
| Banana test photos (4 training sources) | 97.1% accepted |
| Other-plant test photos | 90.5% accepted |
| Sketches | 99.3% blocked |
| Painted copies of real plant photos | 96.6% blocked (unseen field copies: 69–99% depending on style) |
| Real non-plant objects and scenes | 94.7% blocked |
| Clipart | 91.6% blocked |
| Paintings | 80.9% blocked |

`sweep_v3.py` prints the full threshold table. Stricter thresholds block more
fakes but reject more real photos (at 0.7: 96.1% of unseen field photos
accepted, 87.6% of paintings blocked).

## History — why the gate accepts all real plants

- **v1** (banana photos vs. everything else, 1,117 banana photos from 2 sources)
  scored 97% on its own test split but rejected real banana photos taken on a
  phone. DomainNet's real "leaf" folder, used as rejects, is full of close-up
  green leaves that look like banana leaf close-ups.
- **v2** added two more banana sources and dropped those folders. It accepted
  97% of banana test photos but only **24%** of a banana dataset it had never
  seen: it learned each dataset's look, not "banana leaf".
- **v3** stops asking which plant it is. Real-vs-fake generalises across
  sources (98.7% of the unseen field set accepted).

## Limitations

- Other plants' leaves are **not** blocked; the disease model will classify them.
- About 1 in 5 DomainNet paintings still passes; photographic-looking paintings are the hardest case.
- About 3 in 100 real banana photos may be blocked; the farmer can retake the photo.
- No Davao field photos were available for testing; field validation is pending.
- Photos of a screen showing a leaf were not tested.
- DomainNet is research-use only; confirm terms before any commercial release.

## Reproduce

Scripts expect a working folder at `C:\dmd\gate` (short, outside OneDrive).

```powershell
python -m venv C:\dmd\gate\venv
C:\dmd\gate\venv\Scripts\python -m pip install "tensorflow==2.19.*" opencv-contrib-python-headless pillow numpy
python download_data.py                          # thesis photos, BDR, objects, flowers, DomainNet art + real plants
python download_mendeley.py 9tb7k297ff 1 C:\dmd\gate\raw\positive\bananalsd OriginalSet
python download_mendeley.py 7vpdrbdkd4 1 C:\dmd\gate\raw\positive\nutrient "RAW Images"
python download_mendeley.py 428ysdybvd 1 C:\dmd\gate\raw\positive\field_plants
python fetch_real_objects.py                     # DomainNet real non-plant sample
# other crops: extract "Resize plant_leaves dataset(1545).zip" (hgshn2zg3t) into raw\negative\other_crops
$env:GATE_HOLDOUT_SOURCE = "field_plants"
C:\dmd\gate\venv\Scripts\python train_gate.py prepare train
C:\dmd\gate\venv\Scripts\python sweep_v3.py
```
