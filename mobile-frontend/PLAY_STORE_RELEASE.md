# Android and Google Play Release Guide

The Android app can be prepared and distributed to internal testers before the trained dataset is available. It must not be promoted to production while its classifier is simulated.

## Already prepared in the repository

- Android application ID: `com.dahonmd.field`
- Android version code: `1`
- Expo/EAS internal preview profile: installable APK
- Expo/EAS production profile: Play Store AAB with remote auto-incrementing version codes
- Runtime protection against localhost, emulator, LAN, or non-HTTPS APIs in release builds
- A production readiness check that detects the simulated classifier and missing release configuration
- Camera and photo-library permission descriptions with microphone access disabled
- Public `/privacy` and credential-confirmed `/account-deletion` pages served by the backend
- In-app account deletion, password recovery, email verification, and removal of non-functional social sign-in controls
- Mobile unit/component tests, an application error boundary, bounded image storage, orphan cleanup, searchable history, and batched sync

Expo SDK 54 targets Android API 36, which satisfies Google Play's announced target API requirement for new apps from August 31, 2026.

## Setup that can be done before the dataset arrives

From `mobile-frontend`, install and connect the EAS command-line tool:

```powershell
npm install --global eas-cli
eas login
eas init
```

`eas init` links the app to an Expo project and writes `expo.extra.eas.projectId` into `app.json`. That account-owned value is intentionally not fabricated in this repository.

Create public HTTPS deployments and configure the preview and production EAS environments. Never use `10.0.2.2`, `localhost`, or a private LAN IP in a distributed APK/AAB.

```powershell
eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://staging-api.example.com/api --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://api.example.com/api --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_CONFIDENCE_THRESHOLD --value 70 --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_CONFIDENCE_THRESHOLD --value 70 --visibility plaintext
```

Configure the production backend mail transport, `APP_URL`, and `PRIVACY_CONTACT_EMAIL`. Password reset and email-verification links use the public backend host. Use the deployed `/privacy` and `/account-deletion` URLs for the corresponding Play Console fields.

For the local production check, copy `.env.production.example` to the ignored `.env.production` file and replace every example URL. The checker loads this local file automatically. `npm run release:status` can be used at any time and does not fail.

An internal APK can be requested with:

```powershell
npm run build:android:preview
```

This preview is for camera, authentication, CRUD, synchronization, offline history, permissions, performance, and device-layout testing. Every simulated prediction must continue to appear as unconfigured/simulated.

## Google Play Console work

The following work is independent of the training dataset:

1. Create the Play Console app using the package name `com.dahonmd.field`.
2. Complete developer identity and contact verification.
3. Prepare the app icon, phone screenshots, feature graphic, support email, and website.
4. Publish a public privacy policy that accurately describes account, image, diagnostic, device, and synchronization data handling.
5. Because users can create accounts, provide both an in-app account-deletion flow and a public web page where deletion can be requested.
6. Complete Data safety, App access, Ads, Content rating, Target audience, and any relevant health/data declarations truthfully from the final app behavior.
7. Upload the first signed AAB to Internal testing in Play Console and invite testers.
8. If the developer account is a new personal account, plan for Google's required closed test with at least 12 opted-in testers for 14 continuous days before requesting production access.

Do not claim proven accuracy, diagnosis, treatment outcomes, or offline AI inference in the store listing until they are supported by the validated model and application behavior.

## Store listing draft

**App name**  
DahonMD Field

**Short description**  
Screen banana leaves and keep field observations organized.

**Full description**  
DahonMD Field helps banana growers and field teams capture clear leaf photos, review screening results, keep per-farmer records, and synchronize observations with their organization. The app supports camera and gallery input, local history, connection status, and queued synchronization for field workflows.

Screening results are decision-support information and are not a substitute for laboratory confirmation or advice from a qualified agricultural professional. Availability and accuracy depend on the released model version and image quality.

Revise the copy after validation so it names only features and performance supported by the release candidate.

## Dataset-dependent production gates

Before `npm run build:android:production` is allowed to pass:

- Replace `src/services/inference.ts` with the validated native TFLite integration.
- Bundle the exact model and paired class label map; verify their versions and checksums.
- Confirm image orientation, RGB decoding, resize, normalization/quantization, output dequantization, and class ordering match training.
- Establish the confidence threshold from validation rather than convenience.
- Test genuine camera captures across supported phones, lighting, distance, blur, backgrounds, and disease stages.
- Verify that uncertain/low-confidence images never appear as confident disease results.
- Retest offline storage and later synchronization with the final model version recorded.
- Replace the example policy URLs and configure the public production API.
- Confirm the scheduled `dahonmd:backup --keep=7` job runs and copy backups to separately protected storage; a backup on the same server is not disaster recovery.

Run the readable report at any point:

```powershell
npm run release:status
```

The strict production command is:

```powershell
npm run build:android:production
```

Official references: [Expo EAS build configuration](https://docs.expo.dev/build/eas-json/), [Expo app version management](https://docs.expo.dev/build-reference/app-versions/), [Google Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk), [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111), and [Google Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465).
