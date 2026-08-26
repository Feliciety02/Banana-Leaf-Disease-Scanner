# Thesis runtime boundary

```text
camera/gallery image
  -> deterministic 224x224 RGB preparation
  -> bundled full-integer INT8 CA-MobileNetV3-Small
  -> class + relative model confidence
```

The thesis Android application is stateless and performs classification entirely on-device. It requires no Internet connection, API, account, role, database, saved image, scan history, or Grad-CAM output.

The offline research path is:

```text
acquisition
  -> harmonization / quality and expert-label control
  -> exact and near-duplicate screening
  -> biological/acquisition grouping
  -> frozen 70/15/15 split
  -> ImageNet ResNet-101 + training-only banana SSL (BYOL + MIM + contrastive)
  -> four-class teacher fine-tuning selected by validation macro F1
  -> frozen-teacher KD into CA-MobileNetV3-Small
  -> validation-macro-F1-selected FP32 student
  -> training-only calibration and full-integer INT8 TFLite audit
  -> held-out FP32/INT8 and Davao field-subset evaluation
```

`backend/`, `web-frontend/`, and the unused account/history/sync modules under `mobile-frontend/src/` are legacy research/demo utilities. They are not part of or dependencies of the thesis mobile production path.
