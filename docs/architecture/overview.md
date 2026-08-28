# DahonMD architecture boundary

The repository contains two deliberately separate architectures. Only Flow A is the thesis production system.

## Flow A — thesis classification

```text
camera/gallery image
  -> deterministic 224x224 RGB preparation
  -> bundled full-integer INT8 CA-MobileNetV3-Small
  -> class + relative model confidence
```

The thesis Android application is stateless and performs classification entirely on-device. It requires no Internet connection, API, account, role, database, saved image, scan history, or Grad-CAM output.

The production dependency path is:

```text
mobile-frontend/index.ts
  -> src/app/App.tsx
  -> src/features/classification/inference.ts
  -> src/features/classification/preprocessing.ts
  -> modules/dahonmd-tflite
  -> bundled assets/models/ca_mobilenetv3_small_int8.tflite
```

The final model asset is not currently present. The source boundary is compliant, but an offline device run cannot be verified until the trained artifact is bundled and exercised on Android hardware.

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

## Flow B — optional legacy/demo client–server functionality

```text
React web client
  -> HTTP request
  -> Laravel route / middleware / validation
  -> controller
  -> service / business rule
  -> repository interface / Eloquent model
  -> SQLite relational database
  -> standardized JSON response
  -> React state and UI
```

`backend/` and `web-frontend/` are legacy research/demo utilities. They are not part of or dependencies of the thesis mobile production path. Authentication and authorization apply only to this legacy stack. Obsolete mobile account, database, history, HTTP, and synchronization source was removed from the active application tree during repository organization.

### Database implementation

- Engine: SQLite (configured default; locally inspected library version 3.39.2)
- Framework/ORM: Laravel 12.66.0 with Eloquent
- Schema management: Laravel migrations in `backend/database/migrations/`
- Connection configuration: server environment variables through `backend/config/database.php` and `backend/.env.example`
- Client isolation: browser and production mobile sources contain no central database connection strings, credentials, or raw SQL

See `docs/archive/audits/architecture-audit-2026-08-28.md` for the historical evidence table, workflow trace, limitations, and test record.
