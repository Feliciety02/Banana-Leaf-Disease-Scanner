# DahonMD hybrid mobile app

The mobile app deliberately separates two modes:

1. **Offline Scan** — camera/gallery input, deterministic 224 × 224 preparation,
   local full-integer INT8 TensorFlow Lite inference, exactly four outputs, and
   no login, upload, server, or Internet requirement. Completed results are
   copied into app-private local history after inference.
2. **Workspace** — optional authenticated access to the existing Laravel API.
   Administrators can view the live dashboard and manage accounts, diagnoses,
   disease knowledge, and research sources. Add/edit forms and destructive
   confirmations use mobile bottom-sheet modals.

The two modes do not silently substitute for one another. Losing connectivity
disables live server work but does not affect local image selection or inference.
All completed scans are stored in Expo SQLite. Signed-in farmer scans receive a
UUID and are queued for automatic metadata sync; signed-out scans remain local
only. Leaf images remain on the device unless explicit research consent is
provided through the separate upload workflow.

Synchronization is bidirectional and incremental. A monotonic server cursor is
stored in SQLite after every applied page, server deletions arrive as
tombstones, failed uploads/deletions remain retryable, and signed-out scans are
never attached to an account without an explicit farmer action. Foreground
reconnects sync immediately; Expo BackgroundTask requests a battery- and
network-aware best-effort sync while the app is inactive.

The UI warns that confidence is not diagnostic certainty, Panama Disease output is not laboratory confirmation of Fusarium/Foc, and inputs outside the validated four-class leaf-image scope may be unreliable.

## Current implementation status

`src/app/App.tsx` exposes the offline scanner as the default tab and calls
`src/features/classification/inference.ts`. The inference service rejects wrong
input/output dtypes, wrong input shape, and wrong class maps. It expects a
native Expo module named `DahonMDTFLite`.

The native `DahonMDTFLite` Android implementation is present, uses the 16 KB page-size compatible LiteRT 1.4 runtime, and validates the production tensor contract at load time: INT8 input and output, `[1, 224, 224, 3]` input, and four outputs. The repository still has no trained final `.tflite` file. On-device inference is therefore **PENDING EXPERIMENTAL VALIDATION** and fails explicitly; no simulated prediction is shown. This Expo SDK 54 native module requires a development/production build rather than Expo Go.

`src/features/connected/` contains the optional connected UI. It calls only
routes defined by the Laravel backend. The bearer token and cached session
identity are stored with Expo SecureStore. Farmer history is local-first;
administrator records remain live-only because offline admin writes need
separate conflict policies and elevated audit controls.

The release-readiness gate scans the classifier service for HTTP and simulated
fallbacks. Persistence and network synchronization run only after a genuine
on-device result has been produced.

## Android and iOS security

Release builds apply mobile-native controls in addition to the backend's authorization rules:

- bearer tokens and the cached identity use Expo SecureStore with Android Keystore/iOS Keychain and a device-only, unlocked accessibility class;
- Android automatic backup and unnecessary broad media/audio permissions are disabled, and the generated manifest rejects cleartext traffic;
- iOS App Transport Security rejects arbitrary insecure loads and `NSFileProtectionComplete` protects app files while the device is locked;
- screenshots and screen recordings are blocked while the app runs, with an additional iOS app-switcher privacy overlay;
- sign-out attempts a final sync, warns before discarding unsynchronized changes, then removes account-linked SQLite rows and private image copies; and
- authenticated remote images carry the bearer header, while local `file://` images never receive authorization headers.

These controls require a new native Android/iOS build; Expo Go does not reproduce every release setting. SQLCipher is intentionally not enabled until the plaintext-to-encrypted database migration can be exercised on physical upgrade devices. The app sandbox, backup restrictions, and iOS file protection remain the current at-rest controls for offline diagnosis data.

## Source Map

| Path | Purpose |
| --- | --- |
| `index.ts` | Expo entry point and application error boundary |
| `src/app/` | Classifier screen and UI state |
| `src/features/classification/` | Four-class data contract, preprocessing, local inference, tests, and benchmark support |
| `src/features/connected/` | Optional sign-in, farmer sync, and mobile administrator workspace |
| `src/features/offline/` | SQLite-backed local history UI |
| `src/storage/localDiagnoses.ts` | SQLite schema, migration, outbox state, and remote upsert logic |
| `src/services/api.ts` | Existing Laravel API client and SecureStore session |
| `src/services/diagnosisSync.ts` | Push/pull synchronization coordinator |
| `src/services/backgroundSync.ts` | SDK 54 background-task registration and secure-session sync |
| `src/services/mobileSecurity.ts` | Android/iOS screen-capture and app-switcher privacy protection |
| `src/shared/` | Reusable application-level components |
| `modules/dahonmd-tflite/` | Native Expo/Kotlin TensorFlow Lite bridge |
| `assets/models/` | Final validated mobile model location; model currently absent |

## Setup

```powershell
cd mobile-frontend
npm install
npm run typecheck
npm test
npm run release:status
```

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`,
`EXPO_PUBLIC_PRIVACY_URL`, and `EXPO_PUBLIC_ACCOUNT_DELETION_URL` when connected
features are needed. For a physical development device, use the development
computer's LAN address rather than `127.0.0.1`. Production URLs must use HTTPS.
The app can be built and used for offline scans without a reachable API.

The release check remains blocked until the validated model is present. After
the model is supplied, create and run the native Android project:

```powershell
npx expo prebuild --platform android
npx expo run:android
```

The native module is not available in Expo Go.

Use the [Google Play release handoff](../docs/deployment/google-play-release.md)
for the production environment, Android App Bundle, device-validation, store
listing, Data safety, app-access, and testing-track steps.

## Validation

```powershell
npm run typecheck
npm test
npm run release:status
```

After the final model/native module is supplied, build and test offline on representative Android hardware. Record device model, SoC, RAM, Android/TensorFlow Lite versions, threads, backend/delegate, warmups, mean and variation in latency, throughput, and peak memory for both FP32 and INT8.
