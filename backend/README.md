<div align="center">

# DahonMD API

The authoritative Laravel 12 and Sanctum backend shared by the web and mobile applications.

</div>

## What It Owns

| Domain | Responsibility |
| --- | --- |
| Identity | Registration, login, tokens, profile, password recovery, email verification, and deletion |
| Roles | Farmer, agricultural reviewer, and administrator authorization |
| Diagnoses | Central history, validated images, model metadata, and immutable original predictions |
| Mobile sync | Retry-safe UUID synchronization from device SQLite |
| Review | Prioritized diagnosis queues, structured assessments, and dataset-candidate nomination |
| Disease guide | Evidence-backed disease, symptom, management, source, and verification records |
| Operations | Health checks, request IDs, rate limits, failure logs, and SQLite backups |

> [!IMPORTANT]
> This is the only runtime backend. The mobile SQLite database is an offline client store, not another API.

## Start Here

Use this folder when your task involves Laravel, API routes, authentication, the central database, reviews, or administrator data.

| Goal | Section |
| --- | --- |
| Run the API for the first time | [Quick start](#quick-start) |
| Sign in with test data | [Development accounts](#development-accounts) |
| Connect another component | [Environment settings](#environment-settings) |
| Find an endpoint | [Main API routes](#main-api-routes) |
| Run backend tests | [Checks](#checks) |
| Fix a setup error | [Common problems](#common-problems) |

### Terms you will see

| Term | Meaning |
| --- | --- |
| API | The server interface used by the web and mobile apps |
| Route | A URL and HTTP method handled by the API |
| Migration | A versioned change to the database structure |
| Seeder | Code that creates safe development records |
| Sanctum token | The login credential sent by an authenticated client |
| SQLite | The file-based database used for local development |

## Quick Start

### 1. Open the correct folder

From the main repository:

```powershell
cd backend
```

### 2. Install PHP packages

```powershell
composer install
```

### 3. Prepare the environment and database

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
php artisan key:generate
if (-not (Test-Path database/database.sqlite)) { New-Item database/database.sqlite -ItemType File }
php artisan migrate --seed
```

### 4. Start the API

```powershell
php artisan serve --host=0.0.0.0 --port=8001
```

Leave the terminal open. The API will be available at <http://127.0.0.1:8001/api>.

Check it in a browser at <http://127.0.0.1:8001/api/health>. A successful response means Laravel can also reach the database.

### Later runs

After setup, use only:

```powershell
cd backend
php artisan serve --host=0.0.0.0 --port=8001
```

Use `php artisan migrate` during normal development. `php artisan migrate:fresh --seed` deletes and rebuilds the local database, so reserve it for deliberate development resets.

## Development Accounts

Non-production seeding creates one account per role. The default password is `DahonMD@2026`, configurable through `DEV_USER_PASSWORD`.

| Email | Role |
| --- | --- |
| `admin@dahonmd.test` | Administrator |
| `reviewer@dahonmd.test` | Agricultural reviewer |
| `maria.santos@dahonmd.test` | Farmer |

Set `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`, and optionally `DEV_ADMIN_NAME` to create a custom initial development administrator. No administrator password is stored in source, and development accounts are not seeded in production.

## Environment Settings

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public application URL used for signed links |
| `PRIVACY_CONTACT_EMAIL` | Contact shown on privacy and deletion pages |
| `RESEARCH_CONSENT_VERSION` | Version recorded when a farmer opts to contribute an image for future research |
| `DEV_USER_PASSWORD` | Local seeded-account password |
| `AI_MODE` | Visible inference mode, currently simulated/development |
| `AI_LABEL_MAP_PATH` | Path to the deployed model's matching label map |
| `AI_COMPARISON_URL` | Optional baseline-versus-enhanced research service |
| `AI_COMPARISON_TIMEOUT_SECONDS` | Timeout for research comparison calls |
| `REGULATORY_REVIEW_MONTHS` | Freshness window for time-sensitive product checks |

Production also requires real mail transport, sender details, HTTPS, protected secrets, and a correctly configured `APP_URL`.

## Main API Routes

| Method and route | Purpose | Access |
| --- | --- | --- |
| `GET /api/health` | Application and database readiness | Public |
| `POST /api/auth/register` | Create an account | Public |
| `POST /api/auth/login` | Issue a Sanctum token | Public |
| `GET /api/diseases` | Read verified disease-guide content | Public |
| `GET, POST /api/diagnoses` | List or create diagnoses | Farmer |
| `POST /api/inference` | Submit an image for the normal screening flow | Farmer |
| `POST /api/mobile/sync` | Synchronize queued mobile records | Farmer |
| `POST /api/diagnoses/{diagnosis}/review-request` | Request agricultural review | Record owner |
| `POST /api/research/model-comparison` | Run an unsaved research comparison | Authenticated |
| `/api/expert/diagnosis-reviews/*` | Review uncertain or requested diagnoses | Reviewer |
| `/api/expert/diseases/*` | Verify researched disease content | Reviewer |
| `/api/expert/dataset-candidates/*` | Manage research candidates | Reviewer |
| `/api/admin/*` | Manage users, content, diagnoses, analytics, and settings | Administrator |

## Image and Inference Contract

Stored diagnosis images accept JPG/JPEG, PNG, and WEBP up to 10 MB. BMP is accepted by the offline Python training decoder but not by the diagnosis-upload contract.

`POST /api/inference` remains an explicitly simulated development boundary until a validated production model service is connected. A real service must:

1. Treat uploaded bytes as untrusted input and verify actual decodability.
2. Normalize orientation and convert the decoded image to RGB.
3. Resize to `224 × 224` and reproduce the evaluated normalization contract.
4. Load the exact `label_map.json` paired with the deployed model.
5. Preserve prediction, model version, latency, uncertainty, simulation state, and provenance.

A label map alone does not make inference production-ready. Readiness also requires a validated model artifact, preprocessing parity, health checks, and deployment evaluation.

## Agricultural Review and Content Governance

Original AI predictions are immutable. Reviewer assessments are stored separately with supported label, image quality, next steps, notes, and field-inspection status.

Disease content follows this lifecycle:

```text
DRAFT → RESEARCHED → VERIFIED → ARCHIVED
```

Only verified records are exposed to farmers. Editing verified content or its supporting evidence returns it to review. Chemical instructions remain hidden unless a current Philippine regulatory check supports them.

The non-production scientific seeder is idempotent and populates diseases, symptoms, management, research sources, claim evidence, regulatory checks, and verification history. It never fabricates a trained model artifact.

## Research Model Comparison

Set `AI_COMPARISON_URL=http://127.0.0.1:8100/compare` only while the matching local research service is running.

- Administrators use the model-comparison workspace.
- Authenticated farmers may see an optional side-by-side result after a scan.
- Comparison outputs never create a `diagnoses` row.
- Unconfigured or unavailable services return `503` instead of fabricated predictions.
- The held-out study report—not confidence on one photo—determines the current leader.

## Operations

### SQLite backup

```powershell
php artisan dahonmd:backup --keep=7
```

Backups are stored under `storage/app/private/backups`. Laravel schedules the task daily at 02:00. Production must run `php artisan schedule:run` every minute or keep `php artisan schedule:work` active. Replicate backups to separate protected storage and test restoration periodically.

### Role migration

The `2026_08_12_000005_rename_user_role_to_farmer` migration converts the legacy `user` role to `farmer` without deleting accounts, tokens, or diagnoses. Its rollback restores the former value.

## Checks

```powershell
php artisan test
vendor\bin\pint --test
```

| Command | What success looks like |
| --- | --- |
| `php artisan test` | All automated tests pass |
| `vendor\bin\pint --test` | No PHP formatting changes are required |

## Common Problems

| Problem | Student-friendly fix |
| --- | --- |
| `php` is not recognized | Install PHP 8.2+, reopen PowerShell, and run `php --version`. |
| `composer` is not recognized | Install Composer and reopen PowerShell. |
| `No application encryption key` | Run `php artisan key:generate`. |
| SQLite file is missing | Run the `New-Item database/database.sqlite` setup command. |
| A table does not exist | Run `php artisan migrate`. |
| Port 8001 is already in use | Stop the other Laravel terminal with `Ctrl+C`. |
| Web or mobile receives a network error | Keep this API terminal running and verify its URL in the client `.env`. |
| A phone cannot connect | Use host `0.0.0.0` and the computer's LAN IP in the mobile app. |

## Folder Map

| Path | What students usually change there |
| --- | --- |
| `app/Contracts/Repositories/` | Persistence interfaces consumed through dependency injection |
| `app/Http/Controllers/` | HTTP validation, authorization, and API responses |
| `app/Models/` | Database entities and relationships |
| `app/Providers/RepositoryServiceProvider.php` | Repository interface-to-implementation bindings |
| `app/Repositories/` | Eloquent queries and persistence operations |
| `app/Services/` | Business rules and application workflows |
| `database/migrations/` | Database structure changes |
| `database/seeders/` | Development and scientific seed data |
| `routes/api.php` | API route definitions |
| `tests/Feature/` | End-to-end API behavior tests |

> [!TIP]
> New backend behavior should normally flow through `Route -> Controller -> Service -> Repository -> Model`. Keep validation and authorization at the HTTP boundary, business decisions in services, and reusable Eloquent queries in repositories. Update the tests with every behavior change.

Return to the [main project guide](../README.md), or read the [scientific content governance](../docs/scientific-content-governance.md).
