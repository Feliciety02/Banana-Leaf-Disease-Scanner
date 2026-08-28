# Backend Consolidation Record

> Historical legacy/demo architecture only. The thesis mobile production path
> is stateless on-device inference and does not depend on this backend.

## Decision

`backend/` is the authoritative Laravel application. It contains every mobile and web requirement plus Form Requests, API Resources, diagnosis policies, role middleware, user/disease/diagnosis administration, analytics, secure uploads, and the central `diagnoses.sync_uuid` constraint. The former standalone mobile API was removed after consolidation because it duplicated authentication, profiles, diseases, diagnoses, and synchronization.

## Development data preflight

Before consolidation, both applications used SQLite and both pending authentication migrations were inspected. Record counts were:

| Database | Users | Diseases | Diagnoses |
| --- | ---: | ---: | ---: |
| `backend/database/database.sqlite` | 0 | 0 | 0 |
| Former standalone mobile database | 0 | 0 | 0 |

There was no meaningful development data to import. The two pending central migrations were therefore applied normally with `php artisan migrate --force`; no reset or destructive data merge was required. The duplicate backend was later removed from the repository.

## Conflict-safe import procedure for an older populated copy

If a populated pre-consolidation mobile database is discovered later, do not attach or merge it directly into production. Work on backups and produce a conflict report first:

1. Export users keyed by normalized lowercase email. Insert emails absent from the central database while preserving the existing password hash. If the same email has different hashes, names, or roles, stop and require an explicit account-owner/admin decision; never overwrite automatically.
2. Export diseases keyed by slug. Insert absent slugs. For matching slugs, compare every descriptive field and report differences instead of choosing one silently.
3. Map each `mobile_diagnoses.user_id` through the resolved user email and each disease through its slug. Import into central `diagnoses` with `source = mobile`, `client_id` mapped to `sync_uuid`, and `sync_status = synced`.
4. Skip only records whose `sync_uuid` is already present. Report UUID collisions whose prediction payload differs.
5. Reconcile counts per user, source, and UUID before switching clients. Keep both database backups until users and administrators verify history.

## Historical runtime rule

The former synchronized Expo client used `EXPO_PUBLIC_API_URL`, and React used
`VITE_WEB_API_URL`. This rule is retained only as migration history. The active
thesis mobile application no longer uses a backend URL, account, synchronization,
or database; only the legacy React application uses the Laravel service.
