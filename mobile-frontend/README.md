# DahonMD Field App

Expo React Native farmer field application for iOS and Android. Login, farmer registration, profile/password management, secure session restoration with Expo SecureStore, camera/gallery preview, plain-language result states, per-farmer SQLite history, connection status, and acknowledged queued synchronization are implemented. A previously authenticated farmer can continue local screening and history offline. Authentication, disease data, and `/api/mobile/sync` all use the authoritative `../backend` API.

```powershell
Copy-Item .env.example .env
npm install
npm start
```

The Android emulator default is `EXPO_PUBLIC_API_URL=http://10.0.2.2:8001/api`. For a physical device, use the development computer's LAN address on port `8001`.

Use `npm run android` for Android or `npm run ios` from macOS. Replace `src/services/inference.ts` with the final TFLite bridge before thesis evaluation.

## Android Preview and Play Store Preparation

Work that does not depend on the trained dataset is prepared now:

- `npm run typecheck` validates the TypeScript application.
- `npm run release:status` reports the remaining production blockers without failing.
- `npm run build:android:preview` creates an installable internal-testing APK through EAS.
- `npm run build:android:production` checks release safety, then creates the Play Store AAB. It will remain blocked while simulated inference or local-only services are configured.

The preview build still needs a reachable HTTPS deployment of the single `../backend` API. Local development can continue through Expo Go with the emulator or LAN API URL.

See [PLAY_STORE_RELEASE.md](./PLAY_STORE_RELEASE.md) for initial EAS setup, Google Play preparation, test tracks, listing copy, and the dataset-dependent release gates.

## Camera Images and Model Input

PNG, JPG/JPEG, and WEBP field images are suitable client formats. The model does not classify the file extension; it classifies the decoded pixels. A PNG captured by a farmer can therefore be evaluated by a model whose training files were WEBP, but real-world accuracy must be measured because phone processing, compression, orientation, lighting, blur, background, distance, and disease stage may differ from the training distribution.

Saved history photos are stored separately from the picker cache. The permanent history copy is capped at a 1600-pixel longest edge and encoded as JPEG at 82% quality to limit device storage. Analysis continues to use the original selected image, so history compression does not change model input.

The final native TFLite bridge must reproduce the training contract exactly:

1. Apply the image's physical/EXIF orientation consistently.
2. Decode to three-channel RGB.
3. Resize to `224 x 224` using the documented interpolation policy.
4. Represent the pre-quantized input in `[0, 1]`.
5. Quantize using the deployed TFLite input tensor's actual scale and zero point.
6. Dequantize output logits when required, apply softmax once, and map indices using the model's paired `label_map.json`.

Do not hard-code a different class order in TypeScript. Bundle the validated INT8 student and matching label map together, record their version/checksums, and reject startup if either artifact is missing or inconsistent.

Before thesis evaluation, test genuine captures from supported target phones. Report cold-start and warmed inference latency, model size, memory use, and accuracy by class; where sample counts allow, also examine device, format, lighting, and image-quality subgroups. Offline results must retain the same model version and simulation flag when later synchronized.

The current `src/services/inference.ts` is still a safe simulated placeholder. Camera/gallery preview does not mean real model inference is active.
