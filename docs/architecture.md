# Consolidated Runtime Boundary

```text
web-frontend/ ---------------------+
                                   +--> backend/ --> central database
mobile-frontend/ -> local SQLite --+
          (offline/pending)             via /api/mobile/sync
```

`backend` is the single authoritative REST API. The same Sanctum-backed account works in React and Expo. Web diagnoses and acknowledged mobile diagnoses enter the same `diagnoses` table, so user history and administrator analytics share one source of truth.

## Central API contract

- `GET /api/diseases`
- `GET|POST /api/diagnoses`
- `GET /api/admin/dashboard`
- `POST /api/inference`
- `POST /api/mobile/sync`

`POST /api/mobile/sync` accepts up to 100 diagnoses and uses the mobile-generated UUID as an idempotency key. The unique `diagnoses.sync_uuid` constraint prevents duplicate central records.

## Offline mobile flow

```text
simulated/TFLite inference -> local SQLite pending row -> connectivity -> central sync
                                                        -> created/already_synchronized
                                                        -> local row marked synced
```

## Model pipeline and deployment boundary

```text
Banana leaf dataset
  -> ResNet-101 self-supervised pretraining (BYOL + contrastive + MIM)
  -> ResNet-101 five-class supervised fine-tuning
  -> frozen ResNet-101 teacher for logit and feature distillation
  -> MobileNetV3-Small student with Coordinate Attention replacing SE
  -> full INT8 TensorFlow Lite conversion
  -> React Native mobile inference
```

ResNet-101 is an offline training-time teacher and is never packaged with either client. The mobile application receives only `enhanced_mobilenetv3_int8.tflite`; its graph contains the student classifier and no teacher or self-supervised heads.
