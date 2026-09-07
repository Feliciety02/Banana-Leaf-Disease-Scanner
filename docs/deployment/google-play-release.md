# DahonMD Google Play release handoff

This checklist separates repository readiness from model validation and work
that can only be completed in the Google Play Console. It is not a substitute
for reviewing the current Play policies when the release is submitted.

## Repository status while the final model is pending

The following release blockers are handled in the repository:

- Expo SDK 54 supplies the Android 16 / API 36 build baseline.
- The native classifier uses LiteRT 1.4.0 runtime and Interpreter API artifacts
  that support 16 KB Android memory pages; the older TensorFlow Lite 2.16.1
  artifact and the optional LiteRT support library are not bundled.
- Production connected features reject a non-HTTPS API URL.
- Auth tokens are stored in Expo SecureStore.
- Signed-in farmers can permanently delete their account in the app. Account
  deletion removes server records, tokens, stored server images, and the
  account-linked local history and image copies.
- The app links to public privacy and web account-deletion pages from both the
  signed-out and signed-in workspace.
- The readiness script checks these controls and refuses to build without the
  final validated INT8 model.

Run the current gate with:

```powershell
cd mobile-frontend
npm run release:status
```

Until the final model exists, the expected and only reported problem is:

```text
PENDING EXPERIMENTAL VALIDATION: final INT8 TFLite model is not bundled.
```

## Production services that can be prepared now

1. Deploy the Laravel service on an HTTPS origin and set production values for
   `APP_URL`, `APP_KEY`, `APP_ENV=production`, `APP_DEBUG=false`, the database,
   mail delivery, and `PRIVACY_CONTACT_EMAIL`.
2. Confirm these pages work without authentication and remain at stable URLs:
   `/privacy` and `/account-deletion`.
3. In the EAS production environment, define HTTPS values for:
   `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_PRIVACY_URL`, and
   `EXPO_PUBLIC_ACCOUNT_DELETION_URL`.
4. Exercise registration, login, password reset/email delivery, sync, logout,
   in-app deletion, and web deletion against the production service. Confirm
   deleted image objects are no longer present in storage.
5. Back up the production database and uploaded-file storage, document restore
   ownership, and configure uptime/error monitoring without logging passwords,
   bearer tokens, or uploaded image bodies.

## Work after the final ML artifact arrives

1. Audit the model and copy it to
   `mobile-frontend/assets/models/ca_mobilenetv3_small_int8.tflite`. Do not use a
   placeholder or simulated model.
2. Run `npm run typecheck`, `npm test`, and `npm run release:check`.
3. Generate a clean native project and test a release build on physical Android
   devices, including at least one Android 15+ 16 KB-page device or emulator.
4. Verify the exact tensor contract, all four labels, invalid-image handling,
   process restart, airplane-mode classification, camera/gallery permissions,
   local history, and reconnect synchronization.
5. Record latency, memory, model size, accuracy, and FP32-versus-INT8 benchmark
   evidence using the protocol in the mobile README and thesis documents.
6. Build the signed production AAB with
   `npm run build:android:production`. Retain the mapping/native debug-symbol
   outputs when the generated release build produces them.
7. Upload the AAB to an internal test track first. Confirm Play Console reports
   the expected package name (`com.dahonmd.field`), target API, permissions,
   native-library 16 KB compatibility, version code, and signing certificate.

## Play Console and store-owner work

- Create the app record and protect the Play App Signing/upload-key access.
- Supply the public privacy-policy URL and the public account-deletion URL.
- Complete Data safety from the production behavior, not from planned behavior.
  At minimum, review account name/email, leaf photos uploaded only through an
  explicit contribution/review flow, classification/history data, security
  logs, retention, deletion, encryption in transit, and whether any processor
  receives that data. Keep the answers synchronized with the privacy page.
- Complete App access. If reviewers need to inspect authenticated screens,
  provide durable review credentials and precise navigation instructions.
- Complete Ads, Content rating, Target audience, News, and any other declarations
  shown for the selected app category. Do not describe the classifier as a
  laboratory diagnosis or guaranteed disease determination.
- Prepare the store listing: app name, short/full descriptions, support email,
  app icon, 1024 x 500 feature graphic, phone screenshots from the final release
  build, and any required tablet screenshots. Screenshots must not show simulated
  classifications as real model output.
- Run internal and closed testing required for the developer account, address the
  pre-launch report, accessibility findings, crashes/ANRs, and policy warnings,
  then use a staged production rollout with rollback ownership assigned.

## Release sign-off evidence

Keep the following together for the submitted version code:

- Git commit and EAS build ID
- SHA-256 hash of the bundled `.tflite` model and its label-map/version record
- passing test and `release:check` output
- signed AAB and Play upload result
- physical-device/offline test matrix and benchmark record
- screenshots of completed Play declarations and stable legal-page URLs
- approver names for ML validity, agricultural wording, privacy, and release
