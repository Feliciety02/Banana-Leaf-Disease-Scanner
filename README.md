<div align="center">

# DahonMD

### Banana Leaf Disease Detection and Field Diagnosis System

One backend, one source of truth, and two clients designed for connected and offline field use.

![Laravel](https://img.shields.io/badge/Laravel-12-FF2D20?logo=laravel&logoColor=white)
![React](https://img.shields.io/badge/React-Vite-61DAFB?logo=react&logoColor=0B1F2A)
![Expo](https://img.shields.io/badge/Expo-SDK_54-000020?logo=expo&logoColor=white)
![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white)
![TypeScript](https://img.shields.io/badge/Mobile-TypeScript-3178C6?logo=typescript&logoColor=white)

</div>

---

## Overview

DahonMD is a monorepo for identifying banana leaf diseases, recording diagnoses, and synchronizing field observations. The React web application and Expo mobile application share one authoritative Laravel REST API, one identity system, and one central database.

The mobile application also maintains a private on-device SQLite database. This allows an authenticated farmer to view local history and save pending diagnoses when a network connection is unavailable. Pending records are synchronized to the central API when connectivity returns.

> [!IMPORTANT]
> `backend/` is the only runtime backend for both the web and mobile applications.

## Highlights

- One Sanctum identity works across the web and mobile clients.
- Web and synchronized mobile diagnoses share the same central history.
- Mobile diagnoses remain available offline through on-device SQLite.
- UUID-based synchronization safely handles retries without duplicate records.
- Three scoped roles separate field use, agricultural review, and system administration.
- Agricultural reviewers assess uncertain diagnoses and verify researched disease content without changing original AI outputs.
- Review queues prioritize farmer requests, low-confidence results, and repeated uncertain scans.
- Structured reviewer feedback records assessment, image quality, recommended next steps, and field-inspection needs for agreement analysis.
- Reviewed images may be nominated for a separate manual research-candidate workflow but are never added to training data automatically.
- Administrator routes provide protected farmer/reviewer management, disease editing, analytics, and system/model configuration.
- The AI workspace separates teacher training, student distillation, evaluation, and TFLite deployment tooling.

## System Architecture

```mermaid
flowchart LR
    Web[React Web Client] -->|REST API| API[Laravel API]
    Mobile[Expo Mobile Client] --> Local[(On-device SQLite)]
    Local -->|Pending UUID sync| API
    API --> Central[(Authoritative Database)]

    classDef client fill:#FFF8DC,stroke:#D4A017,color:#332600;
    classDef service fill:#E8F5E9,stroke:#2E7D32,color:#173A19;
    classDef data fill:#E3F2FD,stroke:#1565C0,color:#102A43;
    class Web,Mobile client;
    class API service;
    class Local,Central data;
```

The API is the source of truth for accounts, diseases, synchronized diagnoses, and administrator analytics. By default, its development database is `backend/database/database.sqlite`. Mobile SQLite is a device-local cache and synchronization queue, not a second server database.

## Repository Layout

| Folder | Responsibility | Runtime status |
| --- | --- | --- |
| `backend/` | Laravel 12 API, Sanctum authentication, central database, sync, and analytics | Authoritative |
| `web-frontend/` | React and Vite browser application | Active client |
| `mobile-frontend/` | Expo React Native application with offline SQLite | Active client |
| `ai/` | ResNet-101 teacher and Coordinate Attention MobileNetV3-Small student pipeline | Training and deployment tooling |
| `datasets/` | Local dataset location and preparation notes | Development data |
| `docs/` | Architecture and backend-consolidation documentation | Reference |

## Before You Start

### Docker quick start

The authoritative API and web client can run together with Docker Desktop. From the repository root, run:

```powershell
docker compose up --build
```

> [!IMPORTANT]
> Type `up` without a hyphen. The correct command is `docker compose up --build`; `docker compose -u --build` and `docker compose -up --build` are invalid.
>
> DahonMD has only one backend: the Laravel application in `backend/`. Docker starts this backend as the `api` service for both the web and mobile clients. Do not start a separate or second backend alongside it.

Then open `http://localhost:4173`. The API is also available directly at `http://localhost:8001/api`, including for the Expo mobile client. The first startup installs the image dependencies, creates a persistent SQLite database, runs migrations, and seeds the development accounts.

Stop the stack with:

```powershell
docker compose down
```

Application data and the generated Laravel key remain in the `dahonmd_backend_data` Docker volume. To deliberately reset all Docker-managed application data, use `docker compose down --volumes`.

To change the seeded development password without editing tracked files, set `DEV_USER_PASSWORD` before the first startup:

```powershell
$env:DEV_USER_PASSWORD = "choose-a-local-password"
docker compose up --build
```

The Expo app remains a host/device development process; start it from `mobile-frontend/` as described below and point `EXPO_PUBLIC_API_URL` at port `8001` on the Docker host.

### Native development

This guide uses **PowerShell on Windows**. Install these tools first:

- PHP 8.2 or newer with SQLite enabled
- Composer
- Node.js and npm
- For mobile only: Expo Go on a phone, or Android Studio with an emulator

Check that the main tools are installed:

```powershell
php --version
composer --version
node --version
npm --version
```

Each command should print a version number. If PowerShell says that a command is not recognized, install that tool before continuing.

> [!IMPORTANT]
> Open every terminal in the main `Banana Leaf Disease Scanner` folder. A command such as `cd backend` will not work correctly if the terminal starts in a different folder.

## Choose What You Want to Run

You do not need to start every project folder.

| Goal | Terminals needed | Programs to run |
| --- | ---: | --- |
| Web app only | 2 | Laravel backend + web frontend |
| Mobile app only | 2 | Laravel backend + mobile frontend |
| Web and mobile together | 3 | Laravel backend + web frontend + mobile frontend |

Both applications use the single Laravel application in `backend/`.

## Run the Web App

The web app needs two terminals. Keep both terminals open while using the app.

### Web — Terminal 1: Laravel backend

For the **first run**, enter these commands one line at a time:

```powershell
cd backend
composer install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
php artisan key:generate
if (-not (Test-Path database/database.sqlite)) { New-Item database/database.sqlite -ItemType File }
php artisan migrate --seed
php artisan serve --host=0.0.0.0 --port=8001
```

When you see that the server is running, leave Terminal 1 open. The API is now available at `http://127.0.0.1:8001/api`.

For **later runs**, only these commands are needed:

```powershell
cd backend
php artisan serve --host=0.0.0.0 --port=8001
```

### Web — Terminal 2: React frontend

Open a new terminal in the main project folder. For the **first run**, enter:

```powershell
cd web-frontend
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev -- --host 127.0.0.1 --port 4173
```

Leave Terminal 2 open, then visit `http://127.0.0.1:4173` in a browser.

For **later runs**, enter:

```powershell
cd web-frontend
npm run dev -- --host 127.0.0.1 --port 4173
```

## Run the Mobile App

The mobile app also needs two terminals. It uses the same Laravel backend as the web app.

### Mobile — Terminal 1: Laravel backend

If the backend from the web instructions is already running, keep it open and skip this terminal. Otherwise, follow the first-run backend setup below:

```powershell
cd backend
composer install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
php artisan key:generate
if (-not (Test-Path database/database.sqlite)) { New-Item database/database.sqlite -ItemType File }
php artisan migrate --seed
php artisan serve --host=0.0.0.0 --port=8001
```

For **later runs**, enter:

```powershell
cd backend
php artisan serve --host=0.0.0.0 --port=8001
```

Leave Terminal 1 open. The `0.0.0.0` host is important because it allows an emulator or phone on the same network to reach the backend.

### Mobile — Terminal 2: Expo frontend

Open a new terminal in the main project folder. For the **first run**, enter:

```powershell
cd mobile-frontend
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm start
```

For **later runs**, enter:

```powershell
cd mobile-frontend
npm start
```

Keep Terminal 2 open. Then choose one way to open the app:

- **Android emulator:** press `a` in the Expo terminal.
- **Physical Android or iPhone:** open Expo Go and scan the QR code.
- **iOS simulator:** press `i`; this option requires macOS.

### Connect a Physical Phone to the Backend

The default mobile setting works with an Android emulator. A physical phone needs the computer's local network address instead.

1. Connect the phone and computer to the same Wi-Fi network.
2. In PowerShell, run `ipconfig` and find the computer's **IPv4 Address**, such as `192.168.1.10`.
3. Open `mobile-frontend/.env` and change the API line to use that address:

   ```dotenv
   EXPO_PUBLIC_API_URL=http://192.168.1.10:8001/api
   ```

4. Replace `192.168.1.10` with the actual IPv4 address from your computer.
5. Stop Expo with `Ctrl+C`, run `npm start` again, and rescan the QR code.

> [!TIP]
> The setup commands create a local `.env` file only when one does not exist. They will not overwrite your current settings.

## Test Accounts

The first-run command `php artisan migrate --seed` creates exactly three demonstration accounts, one for each supported role. All seeded users use the password `DahonMD@2026`.

| Email | Role |
| --- | --- |
| `admin@dahonmd.test` | Administrator |
| `reviewer@dahonmd.test` | Agricultural Reviewer |
| `maria.santos@dahonmd.test` | Farmer |

These accounts are for local development only. Change `DEV_USER_PASSWORD` in `backend/.env` before reseeding if your group wants a different test password. They are never seeded when `APP_ENV=production`.

## Stop the Apps

Click each running terminal and press `Ctrl+C`. Closing a frontend terminal does not automatically stop the backend terminal.

## Common Terminal Problems

| Problem | What to do |
| --- | --- |
| `php`, `composer`, `node`, or `npm` is not recognized | Install the missing tool, close PowerShell, and open a new terminal. |
| `cd backend` says the path does not exist | Reopen the terminal in the main `Banana Leaf Disease Scanner` folder. |
| The terminal looks stuck after starting a server | This is normal. The server is waiting for requests. Leave it open and use a new terminal for the next program. |
| Port `8001` or `4173` is already in use | Another copy may already be running. Find its terminal and press `Ctrl+C`, then start it again. |
| The web page opens but cannot load data | Confirm that both the Laravel backend and React frontend terminals are still running. |
| A phone cannot connect to the API | Confirm that both devices use the same Wi-Fi, the phone's `.env` URL contains the computer's IPv4 address, and the Laravel server uses `--host=0.0.0.0`. |
| Expo does not use a changed `.env` value | Stop Expo with `Ctrl+C`, run `npm start` again, and reopen the app. |

## Client API Configuration

| Client | Environment variable | Development value |
| --- | --- | --- |
| Web browser | `VITE_WEB_API_URL` | `http://127.0.0.1:8001/api` |
| Android emulator | `EXPO_PUBLIC_API_URL` | `http://10.0.2.2:8001/api` |
| Physical phone | `EXPO_PUBLIC_API_URL` | `http://<computer-lan-ip>:8001/api` |

The Laravel server must use `--host=0.0.0.0` for access from another device. The phone and development computer must also be connected to the same local network.

## Shared Data Flow

1. A farmer signs in through either client using the same email and password.
2. Web diagnoses are stored directly through the central API.
3. Mobile diagnoses are first written to the farmer's device-local SQLite history.
4. The mobile client sends pending records to `POST /api/mobile/sync` when online.
5. The server uses each diagnosis UUID as an idempotency key.
6. A local record is marked as synchronized only after the API returns `created` or `already_synchronized`.

This flow prevents retry-related duplicates while keeping field diagnosis available during unreliable connectivity.

## Main API Routes

| Method and route | Purpose | Authentication |
| --- | --- | --- |
| `GET /api/health` | API health check | Public |
| `POST /api/auth/register` | Create an account | Public |
| `POST /api/auth/login` | Issue a Sanctum token | Public |
| `GET /api/diseases` | Read the disease catalog | Public |
| `GET, POST /api/diagnoses` | List or create diagnoses | Farmer |
| `POST /api/inference` | Submit an inference request | Farmer |
| `POST /api/mobile/sync` | Synchronize queued mobile diagnoses | Farmer |
| `POST /api/diagnoses/{diagnosis}/review-request` | Request agricultural review of an owned diagnosis | Farmer |
| `/api/expert/diagnosis-reviews/*` | Assess uncertain and farmer-requested cases | Agricultural Reviewer |
| `/api/expert/diseases/*` | Verify or return researched disease content | Agricultural Reviewer |
| `/api/expert/dataset-candidates/*` | Manually nominate and review future-dataset candidates | Agricultural Reviewer |
| `/api/admin/*` | Manage users, diseases, diagnoses, and analytics | Administrator |

## Development Checks

Run the checks for the part your group changed. Start each block in a new terminal opened at the main project folder.

### Backend checks

```powershell
cd backend
php artisan test
vendor\bin\pint --test
```

### Web frontend check

```powershell
cd web-frontend
npm run build
```

### Mobile frontend check

```powershell
cd mobile-frontend
npx tsc --noEmit
```

## AI Pipeline

```text
Banana leaf dataset
  -> ResNet-101 self-supervised pretraining
  -> five-class supervised teacher
  -> logit and feature distillation
  -> Coordinate Attention MobileNetV3-Small student
  -> full INT8 TensorFlow Lite conversion
  -> mobile inference adapter
```

The ResNet-101 teacher is used only during offline training. It is never packaged into either client. The mobile application is designed to receive only the optimized student model; its current inference service is an adapter that can be replaced by the final TFLite bridge without changing screen code.

## Image Compatibility and Accuracy

The training decoder accepts JPG/JPEG, PNG, BMP, and WEBP. The client-facing diagnosis flow uses the common field formats JPG/JPEG, PNG, and WEBP. A file's extension is not supplied to the neural network: every supported image is decoded to three-channel RGB, resized to `224 x 224`, converted to `float32`, and normalized to `[0, 1]` before inference. A farmer's PNG capture can therefore be classified by a model trained from WEBP files.

Matching tensor shapes does not guarantee matching field accuracy. Lossy WEBP or JPEG artifacts, camera processing, lighting, blur, distance, background, cultivar, disease stage, and acquisition device can all create a distribution shift. A model trained from one curated source may learn source-specific visual cues that are absent from farmer photographs.

Dataset and evaluation rules:

- Include genuine field photographs from the intended phones and capture workflow; do not rely only on format-converted copies.
- Keep all images of the same leaf, plant, or capture session in one split by supplying specimen/plant group IDs.
- Reserve an untouched test set containing the formats and capture conditions expected during deployment.
- Never place a WEBP image and a PNG conversion of that same image in different splits. Conversion does not restore information lost by compression and can cause leakage.
- Apply exactly the same orientation handling, RGB conversion, resize, normalization, label order, and INT8 quantization parameters in Python, web-service, and mobile inference paths.
- Report performance overall and, when sample counts permit, by device, source, file format, image quality, and class. Small subgroups should be reported with their support counts and interpreted cautiously.

See [the dataset guide](datasets/README.md) for layout and quality requirements, [the AI guide](ai/README.md) for the complete training sequence, and [the dataset/model trainer checklist](docs/dataset-model-trainer-todo.md) for the assigned thesis-member tasks and required evidence.

## Documentation

- [System architecture](docs/architecture.md)
- [Backend consolidation record](docs/backend-consolidation.md)
- [AI pipeline guide](ai/README.md)
- [Backend guide](backend/README.md)
- [Mobile frontend guide](mobile-frontend/README.md)

## Scientific Content Governance

Disease content is not hard-coded from AI-generated text. The target contract is fixed to Healthy, Moko disease, Black Sigatoka, Yellow Sigatoka, and Cordana leaf spot, using the stable model keys documented in `datasets/README.md`. The authoritative API reads the trained model's five-entry `label_map.json` through `AI_LABEL_MAP_PATH`; until that artifact exists and passes structural validation, the system reports **DISEASE CONTENT PENDING — a validated trained-model label map is not yet available** and does not seed disease records.

Content follows a controlled lifecycle: `DRAFT` → `RESEARCHED` → `VERIFIED` → `ARCHIVED`. Only `VERIFIED` records are returned by the farmer disease API. Editing verified disease content or a supporting source automatically returns affected content to `RESEARCHED` for another review. Normal farmers cannot access knowledge or source mutation routes.

Scientific facts and farmer recommendations must be supported by claim-level evidence. Peer-reviewed and authoritative agricultural sources are prioritized, with Philippine evidence preferred whenever available. A disease cannot be verified without at least two peer-reviewed sources, one authoritative institutional source, causal-agent and curative-status mappings, and mappings for any symptom or management content. Missing evidence is represented as “Insufficient verified evidence available,” never guessed.

Chemical guidance is not inferred from academic efficacy studies. It is marked separately as requiring regulatory review and is withheld from farmer responses unless its Philippine regulatory check is current. Administrators and agricultural reviewers see `REGULATORY RE-CHECK REQUIRED` when a time-sensitive check is missing or stale. Exact product directions must come from the current FPA-approved label or a licensed agricultural professional; the system does not invent doses, intervals, application methods, re-entry intervals, or pre-harvest intervals.

The classifier is a screening aid, not laboratory confirmation. Model confidence measures the strength of a match to learned class patterns and is not the biological probability that a plant has a disease. The healthy class must not be presented as proof that a plant is disease-free. Image results cannot perform PCR, culture, isolation, or molecular diagnosis. Simulated records are explicitly flagged and remain distinct from later research-deployment records.

### Source database schema

- `diseases`: model class key, accepted/common/scientific names, causal agent, pathogen type, farmer summary, curative status, evidence level, review dates, verification state, verifier, image-only limitations, and referral guidance.
- `disease_symptoms`: disease, stage, plant part, technical and farmer text, leaf-image visibility, and display order.
- `disease_management`: category, technical and farmer recommendation, evidence strength, professional/referral flag, regulatory-review flag/date, and display order.
- `research_sources`: APA-ready authorship and publication fields, DOI/URL, source type, geography, peer-review and Philippine flags, access date, and notes.
- `disease_evidence`: disease/source mapping at claim level, claim type/text, evidence strength, and disagreement/context notes.
- `pesticide_regulatory_checks`: separate product/crop/target registration status, expiry, FPA/regulatory source, approved-label URL, reviewer, and check date linked to a chemical management claim.
- `diagnoses`: immutable original prediction, confidence, model version, inference time, diagnosis date, source, and simulation flag.
- `diagnosis_reviews`: separate agricultural assessment, supported label, image-quality category, structured next steps, professional notes, field-inspection flag, reviewer, and review timestamps; original predictions are never overwritten.
- `disease_verifications`: auditable agricultural-review decisions and notes for researched disease records.
- `dataset_candidates`: manual research-only nominations and approval decisions linked to reviewed diagnoses; approval does not itself export or train on an image.

The finalized production AI architecture remains unchanged: ResNet-101 teacher with BYOL, NT-Xent contrastive learning and masked image modeling; five-class fine-tuning; and a custom Coordinate Attention MobileNetV3-Small student distilled and deployed as INT8 TensorFlow Lite. A separate stock MobileNetV3-Small supervised baseline now exists under `ai/` for controlled research comparison only; farmer diagnosis remains enhanced-only.

---

<div align="center">

Built for dependable banana disease monitoring across web, mobile, and offline field workflows.

</div>
