# Backend Consolidation Record

## Decision

`web-backend/` is the authoritative Laravel application. It was selected because it already contained every mobile requirement plus Form Requests, API Resources, diagnosis policies, admin middleware, user/disease/diagnosis administration, analytics, secure uploads, and the central `diagnoses.sync_uuid` constraint. The former `mobile-backend/` implemented a smaller duplicate API around a separate `mobile_diagnoses` table.

## Development data preflight

Before consolidation, both applications used SQLite and both pending authentication migrations were inspected. Record counts were:

| Database | Users | Diseases | Diagnoses |
| --- | ---: | ---: | ---: |
| `web-backend/database/database.sqlite` | 0 | 0 | 0 |
| `mobile-backend/database/database.sqlite` | 0 | 0 | 0 |

There was no meaningful development data to import. The two pending central migrations were therefore applied normally with `php artisan migrate --force`; no reset, deletion, or destructive merge was performed. The deprecated mobile database was left untouched.

## Conflict-safe import procedure for an older populated copy

If a populated pre-consolidation mobile database is discovered later, do not attach or merge it directly into production. Work on backups and produce a conflict report first:

1. Export users keyed by normalized lowercase email. Insert emails absent from the central database while preserving the existing password hash. If the same email has different hashes, names, or roles, stop and require an explicit account-owner/admin decision; never overwrite automatically.
2. Export diseases keyed by slug. Insert absent slugs. For matching slugs, compare every descriptive field and report differences instead of choosing one silently.
3. Map each `mobile_diagnoses.user_id` through the resolved user email and each disease through its slug. Import into central `diagnoses` with `source = mobile`, `client_id` mapped to `sync_uuid`, and `sync_status = synced`.
4. Skip only records whose `sync_uuid` is already present. Report UUID collisions whose prediction payload differs.
5. Reconcile counts per user, source, and UUID before switching clients. Keep both database backups until users and administrators verify history.

## Runtime rule

Only `web-backend` should be served. Expo uses `EXPO_PUBLIC_API_URL`; React uses `VITE_WEB_API_URL`. Both URLs must resolve to the same Laravel deployment and database.
