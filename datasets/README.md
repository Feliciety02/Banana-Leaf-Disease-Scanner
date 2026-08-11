# Dataset

The banana leaf disease image dataset is intentionally excluded from this repository.

Place the five-class dataset locally at:

```text
datasets/
└── banana_leaf_5class/
    ├── <class_1>/
    ├── <class_2>/
    ├── <class_3>/
    ├── <class_4>/
    └── <class_5>/
```

Replace the placeholders with the exact class names used by the final dataset. Each class directory must contain its corresponding JPG, JPEG, PNG, BMP, or WEBP images.

The loader also accepts an existing split:

```text
banana_leaf_5class/
├── train/<five class directories>/
├── validation/<five class directories>/
└── test/<five class directories>/
```

After placing the images, copy `ai/.env.example` to `ai/.env`, set `DATASET_ROOT`, and run:

```powershell
python -m ai.data.validate_dataset
```

The validator checks for exactly five classes, unreadable images, duplicate-label conflicts, and train/validation/test leakage before producing a split manifest.
