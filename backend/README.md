<div align="center">

# DahonMD legacy research/demo API

This Laravel service is outside the thesis mobile production path. The stateless
Android classifier does not call it and does not require accounts, roles,
history, storage, or synchronization. Retain this folder only as an isolated
research/demo utility.

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
> This is the backend for the separate legacy web/demo workflow only. It is not a thesis application dependency.

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
| Sanctum session/token | `HttpOnly` session cookie for the same-origin website; expiring bearer token for mobile |
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
| `agriculturist@dahonmd.test` | Agriculturist |
| `maria.santos@dahonmd.test` | Farmer |

Set `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`, and optionally `DEV_ADMIN_NAME` to create a custom initial development administrator. No administrator password is stored in source, and development accounts are not seeded in production.

## Environment Settings

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public application URL used for signed links |
| `PRIVACY_CONTACT_EMAIL` | Contact shown on privacy and deletion pages |
| `RESEARCH_CONSENT_VERSION` | Version recorded when a farmer opts to contribute an image for future research |
| `DEV_USER_PASSWORD` | Local seeded-account password |
| `AI_MODE` | Development-mode setting; it does not validate a model by itself |
| `AI_LABEL_MAP_PATH` | Optional override for the deployed model's label map; defaults to the tracked `resources/models/label_map.json` |
| `AI_COMPARISON_URL` | Optional baseline-versus-enhanced research service |
| `AI_COMPARISON_TIMEOUT_SECONDS` | Timeout for research comparison calls |
| `REGULATORY_REVIEW_MONTHS` | Freshness window for time-sensitive product checks |

Production also requires real mail transport, sender details, HTTPS, protected secrets, and a correctly configured `APP_URL`.

## Main API Routes

| Method and route | Purpose | Access |
| --- | --- | --- |
| `GET /api/health` | Application and database readiness | Public |
| `POST /api/auth/register` | Create an account | Public |
| `POST /api/auth/login` | Start a CSRF-protected web session or issue a mobile bearer token | Public |
| `GET /api/diseases` | Read verified disease-guide content | Public |
| `GET, POST /api/diagnoses` | List or create diagnoses | Farmer |
| `POST /api/inference` | Optional web screening; returns a receipt only for a real supported result | Public |
| `POST /api/sync` | Synchronize queued mobile or web records (UUID-idempotent) | Farmer |
| `GET /api/sync` | Pull incremental upserts and deletion tombstones using an opaque cursor | Farmer |
| `POST /api/sync/{syncUuid}/image` | Upload the photo of a synchronized scan | Record owner |
| `GET, POST /api/mobile/sync` | Backward-compatible mobile sync aliases | Farmer |
| `GET, POST /api/v1/sync` | Versioned sync aliases for future client migration | Farmer |
| `POST /api/diagnoses/{diagnosis}/review-request` | Request agricultural review | Record owner |
| `POST /api/diagnoses/{diagnosis}/review-seen` | Acknowledge a specific review version after opening it | Record owner |
| `POST /api/diagnoses/{diagnosis}/follow-up` | Send farmer follow-up on a completed assessment | Record owner |
| `POST, DELETE /api/diagnoses/{diagnosis}/research-consent` | Grant or withdraw research-image consent | Record owner; grant requires verified email when configured |
| `GET, DELETE /api/research-images[/{researchImage}]` | List or remove approved private research copies, including after scan deletion | Farmer owner |
| `GET, DELETE /api/admin/research-images[/{researchImage}]` | Inspect the research-image audit or remove a copy with a reason | Administrator |
| `GET /api/admin/research-images/{researchImage}/photo` | Retrieve an active private research photo | Administrator |
| `POST /api/research/model-comparison` | Run an unsaved research comparison | Authenticated |
| `/api/expert/diagnosis-reviews/*` | Review uncertain or requested diagnoses | Reviewer |
| `/api/expert/diseases/*` | Verify researched disease content | Reviewer |
| `/api/expert/dataset-candidates/*` | Manage research candidates | Reviewer |
| `/api/admin/*` | Manage users, content, diagnoses, analytics, and settings | Administrator |

## Image and Inference Contract

Stored diagnosis images accept JPG/JPEG, PNG, and WEBP up to 10 MB, 5000 × 5000 pixels, and 13 megapixels. They are decoded, resized when needed, re-encoded to remove embedded metadata/content, and stored on Laravel's private disk. Media is served only through an authorization-checked API endpoint with private, non-cacheable responses.

The same-origin website must obtain `/sanctum/csrf-cookie` before unsafe API
requests. Production must set `SESSION_SECURE_COOKIE=true`, serve the public
site through HTTPS, keep `APP_DEBUG=false`, and avoid publishing the local API
port. The supplied Compose workflow binds both services to loopback and is for
development only.

`POST /api/sync` accepts up to 100 `diagnoses` and/or 100 `deletions` per
request. Each result is acknowledged independently. `GET /api/sync` uses an
opaque monotonic cursor backed by `diagnosis_sync_changes`, avoiding lost
same-second updates. Diagnosis deletes are soft deletes so authenticated clients
can receive durable tombstones. Deletion accepts a server ID, a sync UUID, or
both; UUID-only deletion resolves the case where creation succeeded but its
acknowledgement was lost. Sync logs record counts and request IDs without
logging diagnosis payloads or images.

`POST /api/inference` is an optional web screening boundary. When
`AI_COMPARISON_URL` is configured and returns a supported enhanced result, the
API returns it with a 30-day encrypted receipt. When the service is unavailable,
the API returns an uncertain development-unconfigured result without a receipt.
This route is not called by the thesis Android classifier. A deployed model
service must:

1. Treat uploaded bytes as untrusted input and verify actual decodability.
2. Normalize orientation and convert the decoded image to RGB.
3. Resize to `224 × 224` and reproduce the evaluated normalization contract.
4. Load the exact `label_map.json` paired with the deployed model.
5. Preserve prediction, model version, latency, uncertainty, simulation state, and provenance.

A label map alone does not make inference production-ready. Readiness also requires a validated model artifact, preprocessing parity, health checks, and deployment evaluation.

Saving a web scan can set `prediction_verified` only when its original image,
class, confidence, and model match an unexpired receipt. Mobile sync and other
client-reported predictions remain `prediction_verified=false` even if the
phone performed real local inference. Admin model-performance summaries use
verified predictions; general case and review counts include all saved scans.
Private photo upload supports history and agricultural review. Research use
requires current active consent, enabled by the new account signup agreement or Account settings; the default server policy requires verified
email, while the isolated test profile can disable that requirement.

## Agricultural Review and Content Governance

Original AI predictions are immutable. Reviewer assessments are stored separately
with supported label, image quality, next steps, internal notes, a farmer-facing
message, and field-inspection status. Farmer and admin views receive the current
verdict; internal notes and revision reasons remain staff-only. Review saves
check `expected_review_version`, and changing a completed assessment requires
`revision_reason` so the previous assessment remains auditable. Farmer follow-up
 reopens the review and marks an unapproved research candidate `uncertain`. A
 completed review automatically queues a candidate when the scan has a retained
 photo and current research consent. The queue is never approved automatically;
 candidate approval requires current consent, a determinate completed review, and good
 image quality; an approved candidate locks subsequent review edits.
 The candidate queue also receives eligible older reviews once through the
 `2026_10_07_000002` migration. A fresh assessment returns a candidate made
 stale by farmer follow-up to the pending queue.
Approval requires current v2 research-copy consent and saves a separate private
file plus `research_images` audit row. Existing v1 consent must be renewed.
Set `RESEARCH_CONSENT_VERSION=research-image-consent-v2` in existing deployments
that explicitly configured v1, then run `php artisan migrate`. Earlier approved
candidates are not backfilled with files; they need a new consent and approval
decision before a retained copy exists.
Deleting a scan removes its normal photo and candidate row but keeps the
independent approved copy. Farmers can remove that copy from their research
photo list even after deleting the scan. Account deletion offers an explicit
`remove_research_copies` choice; staff can revoke an active copy with a reason
through the admin research-image API. Revocation deletes the private file and
retains the audit row. Approval does not add the file to training data.

The October 2026 review/provenance migration adds `diagnosis_reviews.version`,
`diagnosis_review_revisions.revision_reason`, and
`diagnoses.prediction_verified`. Existing installations must run
`php artisan migrate` after updating the backend. The repository's
`start-free-test.ps1` copies migrations and applies them to its isolated test
database on the next start.

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
composer test:unit
composer test:feature
composer quality
```

| Command | What success looks like |
| --- | --- |
| `composer test:unit` | Isolated business-rule tests pass without a database |
| `composer test:feature` | API, authorization, and in-memory persistence tests pass |
| `composer quality` | Both suites and the PHP formatting check pass |

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
| `tests/Unit/` | Isolated business-rule tests with no database |
| `tests/Feature/` | End-to-end API behavior tests |

> [!TIP]
> New backend behavior should normally flow through `Route -> Controller -> Service -> Repository -> Model`. Keep validation and authorization at the HTTP boundary, business decisions in services, and reusable Eloquent queries in repositories. Update the tests with every behavior change.

Return to the [main project guide](../README.md), or read the [scientific content governance](../docs/research/scientific-content-governance.md).
