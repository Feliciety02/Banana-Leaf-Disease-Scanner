# DahonMD stateless mobile classifier

The active entry point implements the thesis mobile scope only:

- camera or gallery input;
- deterministic 224 × 224 image preparation;
- local full-integer INT8 TensorFlow Lite contract;
- exactly four class outputs;
- predicted class and relative model confidence;
- no login, user roles, backend, Internet, database, persistent history, uploads, synchronization, or mobile Grad-CAM.

The UI warns that confidence is not diagnostic certainty, Panama Disease output is not laboratory confirmation of Fusarium/Foc, and inputs outside the validated four-class leaf-image scope may be unreliable.

## Current implementation status

`src/app/App.tsx` uses the camera/gallery flow and calls
`src/features/classification/inference.ts`. The service rejects wrong
input/output dtypes, wrong input shape, and wrong class maps. It expects a
native Expo module named `DahonMDTFLite`.

The native `DahonMDTFLite` Android implementation is present and validates the production tensor contract at load time: INT8 input and output, `[1, 224, 224, 3]` input, and four outputs. The repository still has no trained final `.tflite` file. On-device inference is therefore **PENDING EXPERIMENTAL VALIDATION** and fails explicitly; no simulated prediction is shown. This Expo SDK 54 native module requires a development/production build rather than Expo Go.

Obsolete account, SQLite, history, API, comparison, and synchronization source
has been removed from the active application tree. Git history retains those
files. The release-readiness gate scans the complete production source set for
legacy API/database imports and network calls.

## Source Map

| Path | Purpose |
| --- | --- |
| `index.ts` | Expo entry point and application error boundary |
| `src/app/` | Classifier screen and UI state |
| `src/features/classification/` | Four-class data contract, preprocessing, local inference, tests, and benchmark support |
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

The release check remains blocked until the validated model is present. After
the model is supplied, create and run the native Android project:

```powershell
npx expo prebuild --platform android
npx expo run:android
```

The native module is not available in Expo Go.

## Validation

```powershell
npm run typecheck
npm test
npm run release:status
```

After the final model/native module is supplied, build and test offline on representative Android hardware. Record device model, SoC, RAM, Android/TensorFlow Lite versions, threads, backend/delegate, warmups, mean and variation in latency, throughput, and peak memory for both FP32 and INT8.
