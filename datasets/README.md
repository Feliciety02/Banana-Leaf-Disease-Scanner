# Dataset

The banana leaf image dataset is intentionally excluded from this repository.

Do not create disease-named class directories from demo UI content. First obtain the final, provenance-backed five-class dataset or its exported `label_map.json`. The expected dataset contains one Healthy class and four disease classes, but the four disease labels are not established in this repository.

Place the real dataset locally at:

```text
datasets/
`-- banana_leaf_5class/
    |-- <exact-class-label-0>/
    |-- <exact-class-label-1>/
    |-- <exact-class-label-2>/
    |-- <exact-class-label-3>/
    `-- <exact-class-label-4>/
```

Each class directory must contain its corresponding JPG, JPEG, PNG, BMP, or WEBP images. The loader also accepts an existing `train/`, `validation/`, and `test/` layout when every split contains the same exact five class directories.

After placing the images, copy `ai/.env.example` to `ai/.env`, set `DATASET_ROOT`, and run:

```powershell
python -m ai.data.validate_dataset
```

The validator checks for exactly five classes, empty classes, unreadable images, duplicate-label conflicts, and train/validation/test leakage before producing a split manifest. Training remains out of scope until the dataset and research plan are approved.
