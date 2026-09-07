# DahonMD — QA Checklist

End-to-end quality checklist covering every part of the repository: repository/build
hygiene, backend API, web frontend, the thesis mobile client, the AI research
pipeline, dataset governance, security, performance, deployment, and accessibility.

> **How to use.** Work through each section top-to-bottom for a release candidate.
> Each item is a checkbox. Mark `[x]` when verified. Leave a short note under
> items that fail or need follow-up. The **Production path** tags mark items that
> are mandatory for the thesis (Flow A) submission; everything else is for the
> legacy/demo research stack (Flow B).

Quick commands for the automated checks are at the bottom in [Run All Automated Checks](#run-all-automated-checks).

---

## 1. Repository & Build Hygiene

- [ ] `git status` is clean of unintended changes before a release.
- [ ] `.env` / secrets are never committed (only `.env.example` tracked).
- [ ] No generated artifacts are tracked (`node_modules/`, `vendor/`, `dist/`, `artifacts/`, build dirs, model weights).
- [ ] No stray dev/verification scripts or temporary files remain at the repo root or in `web-frontend/`.
- [ ] The protected root `README.md` blob hash matches the known-good value (`68071aae3edda2f78c2652f729b6676d8c386422`).
- [ ] Lockfiles are present and in sync: `backend/composer.lock`, `web-frontend/package-lock.json`, `mobile-frontend/package-lock.json`.
- [ ] The monorepo builds from a clean checkout with the documented commands (see README "Native Development").

---

## 2. Backend (Laravel / Flow B)

### Setup & boot
- [ ] `composer install` succeeds.
- [ ] `php artisan migrate` and `php artisan migrate --seed` succeed on a fresh SQLite DB.
- [ ] `php artisan serve --port=8001` boots without errors; `config:clear` run after editing config.
- [ ] `/api/health` returns `{ "status": "ok" }` and includes the DB check and `X-Request-ID` header.

### Auth & session security
- [ ] Register — creates a farmer, returns `201` + token; duplicate email rejected (`422`).
- [ ] Login — correct credentials return `200` + token; wrong credentials return `422` (generic message, no account enumeration).
- [ ] Password policy enforced on register, reset, admin set-password, and profile change (min 8; letters; mixed case; numbers; symbols; uncompromised in non-testing).
- [ ] Sanctum tokens expire: normal session respects `SANCTUM_TOKEN_TTL_MINUTES` (24h default); remember-me respects `SANCTUM_TOKEN_REMEMBER_DAYS` (30d default). `remember` flag honored.
- [ ] `401` (expired/invalid token) is returned correctly and handled by clients (see web & mobile sections).
- [ ] Logout revokes the current token.
- [ ] Password reset flow: forgot-password is generic; reset revokes all existing tokens.
- [ ] Email verification notification sent on register; resend throttled (`6,1`).
- [ ] Rate limits: auth `10/min` per email+IP; public-api `60/min`; authenticated-api `120/min`; sync `20/min`.

### Role-based authorization
- [ ] Farmer-only routes reject admin/expert with `403` (`diagnoses`, `inference`, `mobile/sync`).
- [ ] Admin-only routes reject farmers with `403` (`admin/*`).
- [ ] Expert-only routes reject non-experts with `403` (`expert/*`).
- [ ] Farmers can only read/update/delete their **own** diagnoses; cross-user access returns `403`.
- [ ] Farmer cannot escalate their own role to admin via any endpoint.
- [ ] `POST /diagnoses` never trusts a client-supplied `user_id` (assignment from authenticated user).

### Admin features
- [ ] User management: list/create/update/delete farmers and experts; create enforces role + strong password.
- [ ] Dashboard/analytics return correct counts and per-source breakdowns.
- [ ] System info endpoint reports `ai_mode`, model, deployment, and final-model-classes-known correctly.
- [ ] Disease knowledge CRUD + status, symptoms, management, regulatory checks, and evidence endpoints work and are role-gated.
- [ ] Research sources CRUD works and is role-gated.
- [ ] Admin diagnoses: list/show/destroy work.

### Expert features
- [ ] Expert dashboard loads.
- [ ] Diagnosis review queue: index/show/update (approve/reject + notes) works.
- [ ] Disease verification record submission works.
- [ ] Research sources + dataset-candidates (incl. `from-diagnosis`) endpoints work.

### Profile & account
- [ ] GET/PUT profile works; update validates email uniqueness.
- [ ] PUT profile/password requires `current_password` and applies the strong policy.
- [ ] DELETE profile destroys the account.
- [ ] Deletion via `PublicAccountController` credential check (privacy/deletion form) works.

### Mobile sync & data integrity
- [ ] `POST /mobile/sync` is idempotent by `sync_uuid` (second submit = `already_synchronized`, no duplicate row).
- [ ] `POST /mobile/sync/{uuid}/image` stores the image only when research consent is active; consent version recorded.
- [ ] Diagnosis data + `sync_uuid` visible in web history and admin analytics (cross-platform identity).

### Static checks
- [ ] `php artisan test` passes (all Feature + Unit).
- [ ] `vendor\bin\pint --test` passes (code style).
- [ ] `php -l` on all changed PHP files.

---

## 3. Web Frontend (Vite / Flow B)

### Build & boot
- [ ] `npm install` succeeds.
- [ ] `npm run build` succeeds without errors.
- [ ] `npm run dev -- --host 127.0.0.1 --port 4173` serves the app; health API reachable.
- [ ] CORS: browser origin present in `WEB_FRONTEND_ORIGINS` so API calls succeed.

### Public experience
- [ ] Public landing loads; "Log in" / "Sign up" open the correct modals.
- [ ] Public scan works without auth (using `inferenceService` simulated adapter); saving requires login (opens auth flow).

### Authentication
- [ ] Login/register call the API, store the token (localStorage on remember, sessionStorage otherwise), and route to the role home.
- [ ] Invalid credentials show a friendly error.
- [ ] Profile load on refresh restores the session from the stored token.
- [ ] **401 auto-logout:** an expired/invalid token returns the user to the public page and clears stored tokens (event `dahonmd:auth-expired` → sign-out).
- [ ] Logout clears the token and returns to the public page.

### Role workspaces
- [ ] Farmer: dashboard, scan (save), history, disease guide, profile.
- [ ] Farmer: request review on a diagnosis updates state; withdraw research consent works.
- [ ] Expert: dashboard, review queue, reviewed cases, disease guide, sources, dataset candidates, profile.
- [ ] Admin: dashboard, accounts/farmers/experts, diagnoses, diseases, sources, analytics, model comparison, system, profile.
- [ ] Client-side route guard redirects to role home for legacy/unknown paths.

### Model comparison (research)
- [ ] `/admin/model-comparison` and `/research/model-comparison` run baseline then proposed on one image, show agreement/confidence/latency deltas, and don't persist to farmer history.
- [ ] Comparison service reachable at `AI_COMPARISON_URL` (or failure handled gracefully).

### UX & accessibility
- [ ] Error boundary catches render errors and shows a fallback.
- [ ] Loading/empty/error states present for data-driven views.
- [ ] Keyboard-accessible interactive elements; modal focus handling; sensible `aria-label`s.
- [ ] Responsive layout at common viewport sizes (mobile/tablet/desktop).

---

## 4. Mobile (Expo React Native — Thesis / Flow A) — **Production path**

### Build & preparation gates
- [ ] `npm install` succeeds and `npm run typecheck` (`tsc --noEmit`) passes.
- [ ] `npm test` (jest) passes (`thesisInference`, `preprocessing` suites).
- [ ] `npm run release:status` reports **ready** (all release gates).
- [ ] Final validated INT8 model present at `assets/models/ca_mobilenetv3_small_int8.tflite` (not a simulated placeholder).
- [ ] `npx expo prebuild --platform android` succeeds.
- [ ] `npx expo run:android` builds and launches on a device/emulator.

### Offline classification (core thesis behavior)
- [ ] App launches with no Internet, backend, account, API URL, or DB dependency (stateless).
- [ ] Camera and gallery image selection both work.
- [ ] Image is prepared to 224 × 224 RGB before inference (preprocessing validated by unit tests).
- [ ] Model loads from the bundled `.tflite` and runs locally (native TFLite runtime — NOT Expo Go).
- [ ] Returns exactly one of the four classes: Healthy, Sigatoka, Panama disease, Cordana leaf spot.
- [ ] Confidence shown as relative output confidence, not biological probability.
- [ ] No image upload, history save, or server call for the offline flow.
- [ ] Handling of no-model/load-failure shows a friendly message.

### Connected workspace (optional legacy sharing)
- [ ] Offline scan + connected workspace coexist; workspace gated on login.
- [ ] Token stored in `expo-secure-store` (not AsyncStorage/plaintext).
- [ ] Session restore works from SecureStore across app restarts.
- [ ] **401 auto-logout:** an expired token clears SecureStore, signs out, and shows a "Session expired" alert (handler wired in `App.tsx`).
- [ ] Logout calls the API and clears SecureStore even if the API call fails.
- [ ] Privacy policy and web account-deletion links open from the app without authentication.
- [ ] In-app account deletion removes the server account, revokes tokens, removes server image files, and clears account-linked local records/images while retaining unrelated device-only scans.

### Misc
- [ ] Bottom nav (Offline Scan / Workspace) works; auth modal opens from workspace.
- [ ] On-device inference result text returns educational guidance without overclaiming disease certainty.

---

## 5. AI Research Pipeline (Python / TensorFlow)

### Environment & reproducibility
- [ ] `.venv` created and `requirements.txt` installed.
- [ ] `ai/tests` pass: `.venv\Scripts\python.exe -m unittest discover -s ai\tests -v`.
- [ ] Deterministic seed (e.g. `seed42`) yields reproducible runs.
- [ ] Results/checkpoints land under `ai/artifacts/<run>/` with live history + per-epoch checkpoints.

### Data pipeline integrity
- [ ] Dataset is split once into fixed train/validation/test with **no leakage**.
- [ ] Held-out Davao field set is used **only** for final testing, never for training/SSL/tuning/INT8 calibration.
- [ ] Group assignment / image dedup prevents near-duplicate leakage between splits.
- [ ] `ssl_exclusion_manifest` respected; SSL pool = train + ssl_unlabeled only.
- [ ] The final split manifests exist and are frozen before tuning/export.

### Model pipeline
- [ ] Teacher self-supervised training progresses and checkpoints epoch-by-epoch.
- [ ] Student (CA-MobileNetV3-Small) distills from teacher; baseline (MobileNetV3-Small) is the supervised control.
- [ ] Evaluation computes accuracy/precision/recall/F1 per class on the held-out test set.
- [ ] INT8 quantization works and the exported `.tflite` decodes and predicts correctly.
- [ ] The old archived (Black/Yellow Sigatoka, no-Panama) artifacts are rejected/retrained, not shipped.
- [ ] Simulated "web adapter" is never substituted for the real validated INT8 model in the release.

### Comparison & deployment tooling
- [ ] Comparison service (`ai.deployment.comparison_service`) starts on `:8100` and `/health` returns ok.
- [ ] The web model-comparison panel reflects real model outputs.

---

## 6. Dataset & Governance

- [ ] `datasets/` contains only documentation + small review CSVs in git; image content is ignored.
- [ ] Davao field images placed as flat drop under `datasets/davao-field/` (none in `ssl-unlabeled`).
- [ ] `field_registry.json` populated with site/plant/leaf/preliminary labels from expert review.
- [ ] Labels come from expert review / registry, never from folder names.
- [ ] Collection permission noted for field data.
- [ ] Human label-review CSVs are versioned decision evidence.
- [ ] The historical `dead` label is quarantined and excluded from the four-class model.
- [ ] `sigatoka` documented as combined Black+Yellow (model does not distinguish subtypes).
- [ ] Scientific governance rules respected (chemical directions withheld without current PH regulatory support).

---

## 7. Security Checklist

### Backend
- [ ] No secrets in tracked files; `.env` in `.gitignore`.
- [ ] Passwords hashed (bcrypt, `BCRYPT_ROUNDS=12`).
- [ ] Tokens are bearer-only, expire, and are revocable (Sanctum).
- [ ] CORS restricted to `WEB_FRONTEND_ORIGINS` (no wildcard `*`).
- [ ] Rate limiting on auth, public, authenticated, and sync endpoints.
- [ ] Role middleware on all role-scoped routes.
- [ ] Validation on all inputs (mass-assignment protection via validated/request objects).
- [ ] Generic error messages avoid account enumeration.
- [ ] No debug output / `APP_DEBUG=true` in production.
- [ ] `APP_ENV=production` never seeds dev accounts.

### Web
- [ ] Bearer token cleared on logout and on any `401`.
- [ ] No secrets in client bundle; API URL comes from `VITE_WEB_API_URL` env.
- [ ] XSS-resistant rendering (no `dangerouslySetInnerHTML` with untrusted input).
- [ ] No `localStorage` exposure of anything beyond the token.

### Mobile
- [ ] Token in `expo-secure-store` (hardware-backed where available).
- [ ] On-device model is self-contained; no remote code/download at runtime.

### General
- [ ] HTTPS in any real deployment (not plain HTTP).
- [ ] Dependency audit clean/near-clean (`npm audit`, `composer audit`).

---

## 8. Performance & Reliability

- [ ] Web app loads/builds quickly; no runaway bundle size (gzip output reasonable).
- [ ] API responses paginate where large (`/diagnoses?per_page=`).
- [ ] Offline mobile classification is fast (measure inference latency) and doesn't block the UI.
- [ ] API request timeout (15s client) yields a friendly error rather than hanging.
- [ ] Comparison service latency acceptable for the research panel.
- [ ] Model comparison result communicates that one-image confidence doesn't prove higher accuracy.

---

## 9. Deployment & Release Readiness

> The thesis mobile app is the release artifact. Anything else is legacy/demo.

- [ ] Mobile release gates pass (`npm run release:status`, `npm run release:check`).
- [ ] Final model artifact audited and bundled (hash verified / provenance noted).
- [ ] Android production build succeeds (`eas build --platform android --profile production` after `release:check`).
- [ ] No backend/web/API dependency at runtime for the thesis app.
- [ ] Version number / app identity (icon, name) correct in `app.json`.
- [ ] Release notes / README updated with any behavior changes.

---

## Run All Automated Checks

```powershell
# Backend
cd backend
php artisan test
vendor\bin\pint --test

# Web
cd web-frontend
npm run build

# Mobile
cd mobile-frontend
npm test
npm run typecheck
npm run release:status

# AI
.venv\Scripts\python.exe -m unittest discover -s ai\tests -v

# Secrets/artifacts hygiene — should be EMPTY. (UI icons + disease-guide
# images under web-frontend/public and mobile assets are intentional and fine.)
git ls-files | Select-String -Pattern '\.env$|\.env\.[^e]|\.tflite$|^datasets/.*\.(png|jpg|jpeg|webp)$|^ai/.+\.(npz|h5|tflite|onnx|pt)$'
```

---

## Notes / Failures

<!-- Record per-release results here, e.g.:

- [ ] 2026-08-29: token expiry + password policy hardening merged; full backend suite green.

-->
