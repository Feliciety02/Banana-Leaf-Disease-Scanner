# BananaCare Monorepo

BananaCare uses one authoritative Laravel REST API and database for both clients. The mobile application additionally keeps an on-device SQLite database for offline diagnosis history and pending synchronization.

| Folder | Runtime responsibility |
| --- | --- |
| `web-backend/` | Authoritative Laravel API, Sanctum identities, central diseases/diagnoses, synchronization, and analytics |
| `web/` | React/Vite web client using the central API |
| `mobile/` | Expo client using the central API plus offline device SQLite |
| `mobile-backend/` | Deprecated pre-consolidation reference; not used at runtime |
| `ai/` | Unchanged ResNet-101 teacher and Coordinate Attention MobileNetV3-Small student pipeline |

## Run the system

Start the central backend:

```powershell
cd web-backend
php artisan migrate
php artisan serve --host=0.0.0.0 --port=8001
```

Start the web client in a second terminal:

```powershell
cd web
npm run dev -- --host 127.0.0.1 --port 4173
```

Start Expo in a third terminal:

```powershell
cd mobile
npm start
```

The Android emulator uses `EXPO_PUBLIC_API_URL=http://10.0.2.2:8001/api`. A physical phone must use the development computer's LAN address on port `8001`. `mobile-backend` must not be started for normal development.

## Shared runtime flow

```text
React web ───────────────────────────────┐
                                        ├─> web-backend ─> central database
Expo mobile -> local SQLite -> UUID sync┘
```

The same email/password account works on both clients. Web-created and synchronized mobile diagnoses enter the same `diagnoses` table and appear in the same user history and administrator analytics. Mobile records are marked synced locally only after `/api/mobile/sync` returns `created` or `already_synchronized`.

See [the architecture document](docs/architecture.md) and [the consolidation record](docs/backend-consolidation.md) for the API boundary, development-data preflight, and conflict-safe import strategy.
