# DahonMD architecture boundary

The repository contains two deliberately separate architectures. Only Flow A is the thesis production system.

## System architecture and conceptual framework

DahonMD follows an offline-first edge-AI architecture. A user captures a banana
leaf photograph with the Android camera or selects one from the gallery. The
mobile application applies the fixed image-preprocessing contract and passes
the tensor through the native Kotlin module to the bundled full-integer INT8
TensorFlow Lite CA-MobileNetV3-Small model. The model returns four class scores,
which the application converts into the predicted banana-leaf condition and
relative model confidence for display.

The primary classification path runs entirely on the Android device and does
not require an Internet connection, account, centralized backend, or central
database. After a genuine local prediction, the application stores history in
app-private files and Expo SQLite. Signed-in users may optionally synchronize
diagnosis metadata with the Laravel/Eloquent relational store; image upload is
separate and consent-gated. These connected features are downstream of
classification and never provide or replace the model result.

The research pipeline is separate from mobile inference. Python,
TensorFlow/Keras, and a ResNet-101 teacher support self-supervised learning and
knowledge distillation into the Coordinate Attention–enhanced
MobileNetV3-Small student. Only the final audited INT8 student is intended for
the mobile package. The final trained model is currently absent, so the source
architecture is implemented but release-level on-device inference remains
pending experimental validation.

## Flow A — thesis classification

```text
camera/gallery image
  -> deterministic 224x224 RGB preparation
  -> bundled full-integer INT8 CA-MobileNetV3-Small
  -> class + relative model confidence
```

The thesis Android application performs classification entirely on-device. Inference requires no Internet connection, API, account, or role. A separate post-inference layer stores results and a private image copy in app-local SQLite/filesystem storage; failure of that layer does not replace or fabricate the model output.

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

`backend/` and `web-frontend/` remain optional connected utilities rather than inference dependencies. Authenticated farmer scans use a durable UUID outbox: Expo SQLite is the local source of truth while offline, Laravel/Eloquent writes the shared SQL record, and a successful pull refreshes local metadata. The web client uses IndexedDB for cached history and its own retry-safe outbox.

### Database implementation

- Engine: SQLite (configured default; locally inspected library version 3.39.2)
- Framework/ORM: Laravel 12.66.0 with Eloquent
- Schema management: Laravel migrations in `backend/database/migrations/`
- Connection configuration: server environment variables through `backend/config/database.php` and `backend/.env.example`
- Client isolation: browser and production mobile sources contain no central database connection strings, credentials, or raw SQL

### Offline/online synchronization

1. On-device inference completes without a network call.
2. The mobile client copies the selected image into app-private storage and inserts metadata into `dahonmd-offline.db`.
3. Signed-in farmer rows receive an RFC 4122 UUID and `pending` outbox status; signed-out rows remain `local_only`.
4. Reconnect or manual sync posts batches to `POST /api/sync`. The server UUID uniqueness constraint makes retries idempotent.
5. Per-record acknowledgements move local rows to `synced`, `failed`, `pending_delete`, or `delete_failed`; failures retain an error and remain retryable.
6. `GET /api/sync` returns ordered change-log pages. Clients persist the opaque monotonic cursor only after applying a page, so same-second edits cannot be skipped.
7. Server upserts and soft-delete tombstones are applied to Expo SQLite and browser IndexedDB, making web-created, reviewed, deleted, and other-device records converge.
8. Mobile reconnect listeners sync immediately. Expo BackgroundTask also requests best-effort periodic work under platform network and battery constraints.

Prediction metadata synchronizes by default. Leaf images are uploaded only through the separate consent-gated image endpoint.

See `docs/archive/audits/architecture-audit-2026-08-28.md` for the historical evidence table, workflow trace, limitations, and test record.
