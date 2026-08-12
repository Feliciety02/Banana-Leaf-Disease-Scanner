# DahonMD Field App

Expo React Native farmer field application for iOS and Android. Login, farmer registration, profile/password management, secure session restoration with Expo SecureStore, camera/gallery preview, plain-language result states, per-farmer SQLite history, connection status, and acknowledged queued synchronization are implemented. A previously authenticated farmer can continue local screening and history offline. Authentication, disease data, and `/api/mobile/sync` all use the authoritative `../web-backend` API.

```powershell
Copy-Item .env.example .env
npm install
npm start
```

The Android emulator default is `EXPO_PUBLIC_API_URL=http://10.0.2.2:8001/api`. For a physical device, use the development computer's LAN address on port `8001`.

Use `npm run android` for Android or `npm run ios` from macOS. Replace `src/services/inference.ts` with the final TFLite bridge before thesis evaluation.
