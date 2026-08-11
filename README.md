# BananaCare Monorepo

BananaCare is split into four independently runnable projects. There is no root runtime or shared database.

| Folder | Runtime | Purpose | Default URL |
| --- | --- | --- | --- |
| `web/` | React + Vite | Research dashboard and browser diagnosis | `http://127.0.0.1:4173` |
| `web-backend/` | Laravel 12 | Web uploads, web diagnosis records, metrics | `http://127.0.0.1:8001` |
| `mobile/` | Expo React Native SDK 54 | iOS/Android field application with offline SQLite | Expo development server |
| `mobile-backend/` | Laravel 12 | Mobile device records and offline batch sync | `http://0.0.0.0:8002` |
| `ai/` | TensorFlow/Keras | Thesis training, evaluation, and TFLite deployment code | CLI |
| `datasets/` | Local files only | Five-class banana leaf images excluded from Git | Not applicable |

## Run the web and mobile applications

The frontends and backends run as four separate processes. Open four PowerShell terminals from the repository root and keep them running while developing.

### Web application

Terminal 1 - start the web backend:

```powershell
cd web-backend
php artisan serve --host=127.0.0.1 --port=8001
```

Terminal 2 - start the web frontend:

```powershell
cd web
npm run dev -- --host 127.0.0.1 --port 4173
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173) in a browser.

### Mobile application

Terminal 3 - start the mobile backend:

```powershell
cd mobile-backend
php artisan serve --host=0.0.0.0 --port=8002
```

Terminal 4 - start the Expo development server:

```powershell
cd mobile
npm start
```

After Expo starts:

- Press `a` to open the application in an Android emulator.
- Scan the QR code with Expo Go to use a physical Android or iOS device.
- Running an iOS Simulator locally requires macOS. Building an iOS binary on Windows requires an EAS cloud build.

The default `mobile/.env` address is suitable for an Android emulator:

```env
EXPO_PUBLIC_MOBILE_API_URL=http://10.0.2.2:8002/api
```

For a physical phone, replace `10.0.2.2` with the development computer's IPv4 address. The phone and computer must be connected to the same network. Restart Expo after changing the environment file:

```powershell
npm start -- --clear
```

### First-time setup

Install dependencies and create the environment files if they do not exist yet:

```powershell
cd web
Copy-Item .env.example .env
npm install

cd ..\mobile
Copy-Item .env.example .env
npm install
```

Both Laravel projects use SQLite. From each backend directory, install dependencies, create the environment file, generate an application key, and initialize the database:

```powershell
composer install
Copy-Item .env.example .env
php artisan key:generate
php artisan migrate --seed
```

To completely reset and reseed a backend database, run the following command inside that backend directory:

```powershell
php artisan migrate:fresh --seed
```

> **Warning:** `migrate:fresh` deletes all existing records in that backend's database.

## Important boundary

The web and mobile backends intentionally use separate SQLite databases and do not read each other's records. Cross-system reporting requires an explicit integration job or event bridge. The current AI adapters return marked demo results until the final TFLite model and Python inference service are provided.

## Authentication and administrator setup

Both APIs use Laravel Sanctum bearer tokens. The web stores its token in browser local storage; the native Expo app stores its session only in Expo SecureStore (Android Keystore/iOS Keychain). A restored mobile session permits local inference and per-user SQLite history while offline. Server operations and synchronization wait for connectivity.

Public registration always creates a `user`. To seed the first web administrator, set development-only values in `web-backend/.env`, then run `php artisan db:seed`:

```env
DEV_ADMIN_NAME="Development Administrator"
DEV_ADMIN_EMAIL=admin@example.test
DEV_ADMIN_PASSWORD=choose-a-local-password
```

Do not reuse development credentials in production or commit populated secrets. Account deletion cascades that account's diagnoses. Disease deletion uses a nullable foreign key, preserving historical predictions while removing only the disease definition and stored disease image.

## API contract

Send authenticated requests with `Authorization: Bearer <token>` and `Accept: application/json`.

| Area | Routes |
| --- | --- |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Profile | `GET /api/profile`, `PUT /api/profile`, `PUT /api/profile/password`, `DELETE /api/profile` |
| User diagnoses | `GET/POST /api/diagnoses`, `GET/DELETE /api/diagnoses/{id}` |
| Diseases | `GET /api/diseases`, `GET /api/diseases/{id}` |
| Mobile | `POST /api/sync` on the mobile API; alias `POST /api/mobile/sync`; the web API also exposes authenticated `POST /api/mobile/sync` |
| Admin | `GET /api/admin/dashboard`; CRUD under `/api/admin/users`; create/update/delete under `/api/admin/diseases`; list/show/delete under `/api/admin/diagnoses` |

Registration example:

```json
{
  "name": "Field Researcher",
  "email": "researcher@example.test",
  "password": "minimum-eight-characters",
  "password_confirmation": "minimum-eight-characters"
}
```

Successful authentication returns:

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "user": { "id": 1, "name": "Field Researcher", "email": "researcher@example.test", "role": "user" },
    "token": "<sanctum-token>"
  }
}
```

Create a diagnosis with `predicted_class`, confidence in the `0..100` contract, `diagnosed_at`, and `source` (`web` or `mobile`). Optional fields are `disease_id`, `model_version`, `inference_time_ms`, `sync_uuid`, and an image upload. Predictions have no update endpoint: they are immutable research history.

Mobile sync accepts up to 100 records and responds per record with `created`, `already_synchronized`, or `rejected`. UUID uniqueness makes retries idempotent. A validation response follows this shape:

```json
{
  "success": false,
  "message": "The given data was invalid.",
  "errors": { "email": ["The email has already been taken."] }
}
```

## Enhanced MobileNetV3 thesis pipeline

The finalized architecture is:

```text
Banana leaf dataset
  -> ResNet-101 teacher
  -> self-supervised pretraining (BYOL + contrastive learning + MIM)
  -> five-class supervised fine-tuning
  -> knowledge distillation (cross-entropy + KL soft logits + optional feature matching)
  -> MobileNetV3-Small student with Coordinate Attention replacing SE
  -> full INT8 quantization
  -> TensorFlow Lite
  -> React Native mobile application
```

The `ai/` Python package implements four reproducible research stages:

1. `ai/data/` discovers exactly five class folders, validates images, hashes every image, and either validates an existing train/validation/test layout or creates a stratified split. Exact duplicates stay in one split. Optional plant/specimen group metadata keeps related but non-identical images together. The persisted `split_manifest.json` is reused by every later stage. Only training pipelines use stochastic augmentation; decoded inputs are consistently RGB `float32` in `[0, 1]`.
2. `ai/models/teacher.py` builds the fixed ResNet-101 teacher. `ai/training/train_teacher.py` first performs label-free self-supervised pretraining with SimCLR NT-Xent, symmetric BYOL with an EMA target encoder, and masked-only image reconstruction. It then fine-tunes the complete ResNet-101 and its classifier using five-class supervised cross-entropy. A zero SSL lambda disables that objective for ablation.
3. `ai/models/mobilenetv3_student.py` implements MobileNetV3-Small directly and replaces every squeeze-and-excitation position with Coordinate Attention. Distillation combines hard-label cross-entropy and temperature-scaled KL divergence (including the required `T^2` factor). Optional feature matching aligns a projected student representation with the frozen ResNet-101 representation.
4. `ai/evaluation/` reports accuracy, macro precision/recall/F1, per-class metrics, confusion matrices, parameters, model bytes, best-effort FLOPs, latency, and Grad-CAM examples. `ai/deployment/` exports FP32 and full-integer INT8 TFLite models, evaluates the INT8 model on the identical test manifest, and runs one-image inference.

No dataset location or banana disease names are built into the source. `DATASET_ROOT` is read from the ignored `ai/.env`, and class names are sorted from the dataset directories and written to `ai/artifacts/label_map.json`.

ResNet-101 exists only in the training, fine-tuning, evaluation, and distillation workflow. The phone-facing graph contains only the Coordinate Attention-Enhanced MobileNetV3 student; the teacher and all SSL heads are excluded from both TFLite artifacts.

### Environment

Use a TensorFlow-supported Python version and create an isolated environment:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r ai\requirements.txt
Copy-Item ai\.env.example ai\.env
python -m ai.data.validate_dataset
```

Run all commands from the repository root. Replace only the angle-bracket placeholders with real paths.

### Accepted dataset structures

For a pipeline-created split:

```text
<DATASET_DIR>/
  <class-name-1>/images...
  ... exactly five class directories ...
```

For an externally defined split:

```text
<DATASET_DIR>/
  train/<five class directories>/images...
  validation/<same five class directories>/images...
  test/<same five class directories>/images...
```

`val/` may replace `validation/`. If byte-identical images occur across predefined splits, preparation stops with a leakage error. Corrupt images and identical images assigned to different labels also stop the run with an actionable error.

When several images can come from the same leaf, plant, video, farm sampling unit, or augmented source, set `data.group_manifest` to a JSON file whose keys are dataset-relative POSIX paths and whose values are stable source-group IDs:

```json
{
  "class-folder/image-001.jpg": "plant-001",
  "class-folder/image-002.jpg": "plant-001"
}
```

Splitting is then stratified by class at group level, and predefined splits are rejected if a group crosses a boundary. This is the preferred thesis setup; hashing alone can detect exact copies but cannot infer biological relatedness.

### Configuration and experimental tuning

All settings live in `ai/config/config.py`. A JSON file may override any subset without changing source code. For example:

```json
{
  "teacher": {
    "ssl_epochs": 100,
    "finetune_epochs": 100,
    "lambda_contrastive": 1.0,
    "lambda_byol": 1.0,
    "lambda_mim": 1.0
  },
  "student": {
    "distillation_alpha": 0.5,
    "distillation_temperature": 4.0,
    "feature_distillation_enabled": true,
    "feature_distillation_weight": 1.0
  }
}
```

These numbers are starting configurations, not predetermined optima. The SSL lambdas, contrastive temperature, EMA decay, masking ratio, augmentation strengths, learning rates, KD alpha/temperature, feature-loss weight, and width multiplier require controlled validation experiments and ablations. The teacher is fixed to ResNet-101 and the student is fixed to Coordinate Attention-Enhanced MobileNetV3-Small. `distillation_alpha` weights the hard loss; `1 - alpha` weights logit distillation.

The ResNet-101 default uses random initialization so the declared first learning phase is genuinely self-supervised on the banana-leaf training split. If `teacher.imagenet_weights` is enabled for a separate transfer-learning experiment, that supervised external initialization must be disclosed and compared as a distinct experimental condition.

### Exact experiment commands

1. Self-supervise ResNet-101, then fine-tune it and save the best validation checkpoint:

```powershell
python -m ai.training.train_teacher --output-dir ai/artifacts
```

Append `--config "<CONFIG_JSON>"` to any experiment command when using JSON overrides.

2. Train/distill only the student (the loaded teacher is frozen):

```powershell
python -m ai.training.train_student --output-dir ai/artifacts --teacher-model ai\artifacts\best_teacher.keras
```

3. Evaluate the FP32 Keras student and generate Grad-CAM images:

```powershell
python -m ai.evaluation.evaluate_student --output-dir ai/artifacts --student-model ai\artifacts\best_student.keras
```

4. Convert the best student to FP32 and fully INT8 TensorFlow Lite:

```powershell
python -m ai.deployment.convert_tflite --output-dir ai/artifacts --student-model ai\artifacts\best_student.keras --representative-samples 200
```

This creates `ai/artifacts/enhanced_mobilenetv3_fp32.tflite` and the final deployable artifact `ai/artifacts/enhanced_mobilenetv3_int8.tflite`.

5. Evaluate and benchmark INT8 on the same held-out test split:

```powershell
python -m ai.deployment.benchmark_tflite --output-dir ai/artifacts --tflite-model ai\artifacts\enhanced_mobilenetv3_int8.tflite --fp32-tflite-model ai\artifacts\enhanced_mobilenetv3_fp32.tflite --num-threads 1
```

The resulting `int8_evaluation.json` includes accuracy and latency changes relative to the FP32 TFLite model under the same interpreter settings, plus the Keras FP32 reference when `student_evaluation.json` exists. For a defensible thesis comparison, use the same machine, power mode, thread count, warm-up policy, and repeated runs.

6. Run inference on one banana leaf image:

```powershell
python -m ai.deployment.inference_tflite --tflite-model ai\artifacts\enhanced_mobilenetv3_int8.tflite --label-map ai\artifacts\label_map.json --image "<BANANA_LEAF_IMAGE>"
```

### Main artifacts

- `experiment_config.json`: exact resolved experiment configuration.
- `split_manifest.json`: immutable class indices and split membership shared across stages.
- `resnet101_ssl_pretrained.keras`: ResNet-101 after label-free SSL pretraining.
- `best_teacher.keras` and `best_student.keras`: best supervised validation-accuracy checkpoints.
- `teacher_ssl_history.json`, `teacher_finetune_history.json`, and `student_history.json`: per-phase losses and metrics.
- `student_evaluation.json`, confusion matrix, and `gradcam/{correct,incorrect}/`.
- `enhanced_mobilenetv3_fp32.tflite` and `enhanced_mobilenetv3_int8.tflite`.
- `int8_evaluation.json` and INT8 confusion matrix.

Latency is device- and runtime-specific. The desktop benchmark is a reproducible reference, but final mobile claims should also be measured on the target phones after integrating the INT8 artifact.
#   B a n a n a - L e a f - D i s e a s e - S c a n n e r  
 