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

`App.tsx` uses the camera/gallery flow and calls `src/services/inference.ts`. The service rejects wrong input/output dtypes, wrong input shape, and wrong class maps. It expects a native Expo module named `DahonMDTFLite`.

The native `DahonMDTFLite` Android implementation is present and validates the production tensor contract at load time: INT8 input and output, `[1, 224, 224, 3]` input, and four outputs. The repository still has no trained final `.tflite` file. On-device inference is therefore **PENDING EXPERIMENTAL VALIDATION** and fails explicitly; no simulated prediction is shown. This Expo SDK 54 native module requires a development/production build rather than Expo Go.

Legacy account, SQLite, history, API, comparison, and synchronization modules remain under `src/` for archival development reference. They are excluded from TypeScript compilation and are not imported by the thesis application entry point. The release-readiness gate scans the complete production source set for legacy API/database imports and network calls.

## Validation

```powershell
npm run typecheck
npm test
npm run release:status
```

After the final model/native module is supplied, build and test offline on representative Android hardware. Record device model, SoC, RAM, Android/TensorFlow Lite versions, threads, backend/delegate, warmups, mean and variation in latency, throughput, and peak memory for both FP32 and INT8.
