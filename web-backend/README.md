# DahonMD Web API

Authoritative Laravel 12 + Sanctum API for both the React web and Expo mobile clients. It provides shared identities, public disease reading, authenticated profile and diagnosis operations, server-enforced farmer/admin roles, admin farmer/disease/diagnosis management, idempotent `/api/mobile/sync`, protected database analytics, and validated image storage.

The `2026_08_12_000005_rename_user_role_to_farmer` migration converts existing legacy `user` role values to `farmer` without deleting accounts, tokens, or diagnoses. Its rollback restores the former value.

```powershell
php artisan migrate:fresh --seed
php artisan serve --host=0.0.0.0 --port=8001
```

Set `DEV_ADMIN_EMAIL`, `DEV_ADMIN_PASSWORD`, and optionally `DEV_ADMIN_NAME` before seeding to create the first development administrator. No administrator password is stored in source. Run tests with `php artisan test`. The authenticated `/api/inference` response remains a documented placeholder for the future Python model service.
