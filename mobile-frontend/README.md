# DahonMD Field App

Expo React Native farmer field application for iOS and Android. Login, farmer registration, profile/password management, secure session restoration with Expo SecureStore, camera/gallery preview, plain-language result states, per-farmer SQLite history, connection status, and acknowledged queued synchronization are implemented. A previously authenticated farmer can continue local screening and history offline. Authentication, disease data, and `/api/mobile/sync` all use the authoritative `../web-backend` API.

```powershell
Copy-Item .env.example .env
npm install
npm start
```

The Android emulator default is `EXPO_PUBLIC_API_URL=http://10.0.2.2:8001/api`. For a physical device, use the development computer's LAN address on port `8001`.

Use `npm run android` for Android or `npm run ios` from macOS. Replace `src/services/inference.ts` with the final TFLite bridge before thesis evaluation.

## Camera Images and Model Input

PNG, JPG/JPEG, and WEBP field images are suitable client formats. The model does not classify the file extension; it classifies the decoded pixels. A PNG captured by a farmer can therefore be evaluated by a model whose training files were WEBP, but real-world accuracy must be measured because phone processing, compression, orientation, lighting, blur, background, distance, and disease stage may differ from the training distribution.

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
