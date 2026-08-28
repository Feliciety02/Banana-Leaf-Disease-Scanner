# Client–Server–Database and Thesis Boundary Audit

> [!NOTE]
> Historical snapshot from 2026-08-28. Source paths and test totals may have
> changed after repository organization; use `docs/architecture/overview.md`
> for the current boundary.

Audit date: 2026-08-28  
Repository: DahonMD  
Scope: tracked application source, active entry points, configuration, migrations, tests, and visible untracked workspace artifacts

## Executive verdict

The repository now documents the correct architectural story:

- The thesis production feature is a stateless Android client that performs image preparation and TensorFlow Lite inference locally.
- The React/Laravel/SQLite platform is a legacy/demo and research utility. Its client–server–database flow is separate and is not a dependency of the thesis classifier.
- No production client contains central database credentials, raw SQL, or a direct central database connection.
- The legacy web stack generally follows route → validation/middleware → controller → service/repository → Eloquent → SQLite → JSON response.

The architecture is **not release-verified**. `mobile-frontend/assets/models/ca_mobilenetv3_small_int8.tflite` is absent, so the required offline device scenario cannot complete. Static and mocked tests cannot substitute for a bundled model and physical/emulated Android execution.

## Two separate flows

### Flow A — thesis classification

```text
User action
  -> mobile-frontend/App.tsx::chooseImage
  -> camera/gallery URI
  -> App.tsx::classify
  -> src/services/inference.ts::analyzeLeaf
  -> src/services/preprocessing.ts::prepareImageForInference
  -> 224 x 224 image
  -> modules/dahonmd-tflite::classifyImage
  -> DahonMDTFLiteModule.kt
  -> bundled INT8 CA-MobileNetV3-Small
  -> four logits
  -> softmax class + confidence
  -> React state
  -> result UI
```

No HTTP, server, account, database, upload, or saved history belongs in this flow.

The fixed output order is:

1. Healthy
2. Sigatoka
3. Panama Disease
4. Cordana Leaf Spot

### Flow B — optional legacy/demo functionality

```text
Browser user action
  -> React component
  -> web-frontend/src/services/api.js
  -> HTTP /api route
  -> Laravel middleware and validation
  -> controller
  -> service/business rule
  -> repository interface / Eloquent model
  -> SQLite
  -> standardized JSON response
  -> React state and UI
```

Flow B includes accounts, diagnoses/history, reviewer/admin workflows, synchronization, research consent, and optional model comparison. These are outside the current thesis production scope.

## Folder responsibility audit

| Folder | Classification | Finding |
| --- | --- | --- |
| `mobile-frontend/App.tsx`, `index.ts`, `src/services/inference.ts`, `src/services/preprocessing.ts` | Active thesis client | Correct layer: UI, camera/gallery, preprocessing, local inference orchestration, result rendering |
| `mobile-frontend/modules/dahonmd-tflite/` | Active client-side ML runtime | Correct layer: native Android TFLite execution; does not call the server |
| `mobile-frontend/src/services/auth.ts`, `database.ts`, `http.ts`, `sync.ts`, `modelComparison.ts`, related hooks/components | Legacy/archived mobile utilities | Outside thesis scope; excluded from TypeScript production compilation and unreachable from the active entry point |
| `web-frontend/` | Legacy/demo client | Correct client layer for optional server-backed workflows |
| `backend/app/Http`, `app/Services`, `app/Repositories` | Legacy/demo server | Correct server layer; handles HTTP, validation, business rules, authorization, and persistence abstraction |
| `backend/database/migrations/` | Legacy/demo database schema | Correct database-schema layer |
| `ai/` | Research/model development | Necessary to train, evaluate, quantize, and audit the model; not a production inference server |
| `datasets/` | Research data governance | Four-class dataset documentation and review workspace; not runtime storage |
| `compose.yaml` | Legacy/demo deployment utility | Starts Laravel, web, and SQLite-backed Flow B only |
| `.vscode/`, `vscode-office/`, `dahonmd_colab_code.zip` | Local/untracked development artifacts | Not application layers and not tracked production dependencies |

No active file was found in the wrong runtime layer. The risk was documentation and dormant legacy code being mistaken for the thesis production design; the updated documentation makes the boundary explicit.

## Legacy client–server workflow trace

| Workflow | Client request | Server validation/authorization | Business/persistence | Response/UI |
| --- | --- | --- | --- | --- |
| Authentication/profile | `web-frontend/src/services/api.js::authenticate`, profile calls in `RoleApp.jsx` | `routes/api.php`, `LoginRequest`, `RegisterRequest`, Sanctum, role middleware | `AuthenticationService`, `AccountService`, `UserRepository`, `User` | Standard JSON; `RoleApp.jsx` stores session and renders states |
| Disease guide | `RoleApp.jsx` → `api('/diseases')` | Public throttled route; verified-only server rule | `DiseaseController`, `DiseaseRepository`, Eloquent relations | `DiseaseResource` in standard JSON; browser renders guide |
| Diagnosis/history | `RoleApp.jsx` → `/inference`, `/diagnoses` | Farmer role, image and `StoreDiagnosisRequest` validation, ownership policies | `InferenceService` is simulated legacy behavior; `DiagnosisService` and `DiagnosisRepository` persist only legacy history | Standard JSON; browser updates result/history UI |
| Mobile synchronization | Dormant `mobile-frontend/src/services/sync.ts` → `/mobile/sync` | Sanctum, farmer role, throttle, top-level and per-item validation | `MobileSyncService`, `DiagnosisRepository`; UUID idempotency | Per-item status response; not reachable from thesis app |
| Admin/reviewer | `RoleApp.jsx` admin/expert screens | Sanctum plus role middleware; record policies and request validation | Dedicated controllers/services/repositories and Eloquent | Standard JSON; role UI renders tables/forms/errors |
| Research comparison | Web multipart request → `/research/model-comparison` | Auth, image validation | `ModelComparisonService` calls optional research service and validates its response; no diagnosis is saved | Standard JSON; research-only comparison UI |

## Server and database assessment

### Database technology

| Item | Inspected value |
| --- | --- |
| Engine | SQLite |
| Local SQLite library | 3.39.2 |
| Backend framework | Laravel 12.66.0 on inspected PHP 8.2.12 |
| ORM | Eloquent |
| Migration system | Laravel migrations |
| Configuration | `backend/config/database.php`; `DB_*`/`DB_URL` environment variables; SQLite default |

The reference diagram's MySQL/PostgreSQL examples do not require migration away from SQLite. SQLite is a relational database and is adequate for this optional local/demo server workload.

### Validation, query safety, and constraints

- API Form Requests and inline Laravel validation enforce required fields, types, allow-lists, ranges, dates, UUIDs, and uploaded-image constraints.
- Authentication, farmer, admin, and agricultural reviewer access are enforced server-side in the legacy stack. Record ownership policies remain server-side.
- Repositories and Eloquent parameterize values. The audited raw expressions are constant aggregate expressions or migration literals, not concatenated client input.
- Migrations provide foreign keys, unique email/token/sync UUID constraints, diagnosis/review one-to-one uniqueness, and indexes for roles, class, dates, statuses, queues, and common filters.
- Eager-loaded relations in `DiagnosisRepository` and disease repositories address the principal N+1 risks found in list/detail workflows.
- `DiseaseVerificationService` uses a transaction for multi-record verification state changes.

No SQL injection path or client-to-central-database bypass was found. Production-scale query plans and load behavior were not benchmarked; that is an operational performance task, not evidence needed for the current stateless thesis runtime.

### Response and error handling

Success responses generally use `success`, `message`, and `data`; errors use `success`, `message`, and `errors`. The legacy inference endpoint was the outlier and was aligned during this audit.

Laravel centralizes API validation, authentication, and authorization JSON errors in `backend/bootstrap/app.php`. Framework production behavior hides debug traces when `APP_DEBUG=false`. A fully uniform custom envelope for every framework-generated 404/405/500 response is not implemented, so centralized error-contract coverage remains partial. Laravel logging configuration remains server-side.

### Configuration and secrets

- Server database and service settings use environment variables.
- Mobile production has no required environment variables or backend URL.
- No client database credential, connection string, or raw SQL was found.
- The repository includes documented development-only seed credentials/defaults. They must not be reused in production.

## Authentication scope

**NOT APPLICABLE — THE CURRENT THESIS DOES NOT REQUIRE USER ACCOUNTS.**

Authentication and roles remain only in the optional legacy/demo web/backend stack. No login, registration, farmer, admin, or reviewer role was introduced into the thesis mobile path.

## Required architecture audit table

| Requirement | Current implementation | Issue found | Change made | Final status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Client separation | Thesis app owns UI, camera/gallery, preprocessing, native inference, and display; legacy web calls HTTP API | Root documentation described the old synchronized platform as production | Split documentation into Flow A and Flow B | ✅ COMPLIANT | `mobile-frontend/App.tsx`; `src/services/inference.ts`; root README; `docs/architecture.md` |
| Server separation | Legacy Laravel owns validation, authorization, business workflows, logging/config, and persistence access | Server is not required by thesis and was previously easy to mistake as required | Explicitly classified server as legacy/demo | ✅ COMPLIANT for Flow B; N/A for Flow A | `backend/routes/api.php`; `app/Services`; `app/Repositories` |
| Database isolation | Central SQLite is reachable only through Laravel/Eloquent | Dormant device SQLite could be mistaken for central DB access | Documented local-device versus central database distinction | ✅ COMPLIANT | `backend/config/database.php`; `mobile-frontend/src/services/database.ts`; production release gate |
| Request/response flow | Web uses shared API client; Laravel routes to controllers/services/repos | Legacy `/inference` omitted `success` and `message` | Standardized endpoint response and added feature test | ✅ COMPLIANT | `web-frontend/src/services/api.js`; `InferenceController`; `ArchitectureBoundaryTest` |
| Validation | Server validates request bodies, files, types, ranges, labels, and roles | No thesis server validation is needed because Flow A has no request | No new thesis API added | ✅ COMPLIANT for Flow B; N/A for Flow A | `backend/app/Http/Requests`; controller validation; backend tests |
| Business logic | Legacy rules reside primarily in services; simple reads use repositories directly | No business logic should move into the thesis server | Preserved local ML boundary | ✅ COMPLIANT | `backend/app/Services`; `mobile-frontend/src/services/inference.ts` |
| DB queries | Eloquent/repositories plus parameterized constant raw aggregates | No injection found; production load/query-plan testing not performed | No schema migration added | ✅ COMPLIANT for audited scope | `backend/app/Repositories`; migrations; feature tests |
| Offline ML inference | Source path is local native TFLite | Final INT8 model is absent; no offline Android run can succeed | Fixed Android build typo, added tensor-contract fail-closed checks and broader release scan | ❌ NON-COMPLIANT | Missing `mobile-frontend/assets/models/ca_mobilenetv3_small_int8.tflite`; `npm run release:status` fails |
| Stateless classification | Active entry point has no account, persistence, upload, history, or sync imports | Legacy files remain in repository | Release gate now scans all production source files for legacy/network dependencies | ✅ COMPLIANT at source level | `index.ts`; `App.tsx`; `scripts/check-release-readiness.mjs` |
| No client DB access | Neither browser nor thesis app directly accesses central DB | Dormant mobile SQLite is local legacy storage, not central access | Documented classification and verified production graph | ✅ COMPLIANT | client source scans; `.env.example` files; Eloquent-only central access |
| Four-class contract | TS, Kotlin, backend label config, and AI configuration use the fixed four classes | Runtime previously trusted hard-coded dtype/shape metadata | Native loader now verifies INT8 tensors and exact shapes | ✅ COMPLIANT at source level | `DahonMDTFLiteModule.kt`; `ai/config/labels.py`; mobile tests |
| Error handling | Laravel handles validation/auth/authz centrally; web maps API failures to UI errors | Not every framework 404/405/500 has the custom envelope | Documented as partial; no unnecessary exception layer added | ⚠️ PARTIAL | `backend/bootstrap/app.php`; `web-frontend/src/services/api.js` |
| Architecture tests | Backend, mobile, AI tests and web build exist | No physical-device/offline test; web has build but no unit tests | Added boundary tests and strengthened release gate | ⚠️ PARTIAL | test record below |

## Verification record

| Check | Result |
| --- | --- |
| Backend `php artisan test` | 39 passed, 288 assertions |
| Web `npm run build` | Passed; Vite production bundle created |
| Mobile `npm test` | 27 passed |
| Mobile `npm run typecheck` | Passed |
| Mobile `npm run release:status` | Failed as designed: final INT8 model not bundled |
| AI `python -m unittest discover -s ai/tests -v` | 76 passed |
| Android native compilation/device instrumentation | Not available from the current non-prebuilt workspace/device environment |
| Offline device classification with backend and radios disabled | Not run; blocked by missing model artifact |

## Remaining blockers

1. Train/select the final four-class CA-MobileNetV3-Small model under the documented thesis protocol.
2. Convert and independently audit the full-integer INT8 artifact.
3. Copy it to `mobile-frontend/assets/models/ca_mobilenetv3_small_int8.tflite` with its approved label-map/artifact provenance.
4. Build the Android production/development client and run the instrumentation/inference tests.
5. Disable backend, Wi-Fi, and mobile data; verify camera and gallery classification, all four output mappings, and confidence display on representative Android hardware.

Until these steps pass, the design boundary is defensible but the complete architecture cannot be claimed as verified.
