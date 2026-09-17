# DahonMDTFLite — On-device TFLite inference for Expo

Production Android native module that loads the CA-MobileNetV3-Small student
model and performs float32 inference entirely on-device. (The `benchmarkModel`
API additionally supports the int8 export for FP32-versus-INT8 comparison.)

## Architecture

```
Camera/Gallery
  → expo-image-picker
  → expo-image-manipulator (224x224 JPEG)
  → DahonMDTFLite.classifyImage(uri)
      → BitmapFactory.decodeFileDescriptor
      → Pixel extraction → uint8 [0,255] → float [0,1]
      → Interpreter.run(inputBuffer, outputBuffer)
      → float32 logits
  → JS softmax → argmax → ClassKey + confidence
```

## Model Contract

| Property     | Value                                  |
|-------------|----------------------------------------|
| Input shape | `[1, 224, 224, 3]`                    |
| Input dtype | `float32` (normalized from uint8 [0,255]) |
| Output shape| `[1, 4]`                              |
| Output dtype| `float32` logits                       |
| Classes     | healthy, sigatoka, panama-disease, cordana-leaf-spot |
| Production format | FP32 (full-integer INT8 degrades locked-test accuracy 0.96644 → 0.84433, so it is benchmark-only) |

## Prerequisites

1. **Trained model**: Place `ca_mobilenetv3_small_fp32.tflite` in `assets/models/`
2. **Expo prebuild**: `npx expo prebuild --platform android --clean`
3. **Development or production build**: `npx expo run:android` or `eas build`

## Build Steps

```powershell
# From mobile-frontend/

# 1. Generate native project (integrates module + TFLite config plugin)
npx expo prebuild --platform android --clean

# 2a. Run on connected device
npx expo run:android

# 2b. Or build APK via EAS
eas build --platform android --profile preview

# 3. Run JS unit tests
npm test

# 4. Run Android instrumentation tests (requires device/emulator)
cd android && ./gradlew connectedAndroidTest
```

## How the Config Plugin Works

The plugin at `modules/dahonmd-tflite/plugin` modifies the generated Android project during `expo prebuild`:

1. Adds the 16 KB page-size compatible LiteRT `1.4.0` runtime and classic Interpreter API to the app-level `build.gradle` dependencies
2. Configures NDK ABI filters for ARM and x86 targets

This happens automatically — no manual Gradle editing is required.

## Module API

```typescript
import { classifyImage, type ClassifyResult } from './modules/dahonmd-tflite';

const result: ClassifyResult = await classifyImage(imageUri);
// result.scores     — 4 raw float32 logits
// result.latencyMs  — inference wall time in milliseconds
// result.modelVersion — model filename identifier
// result.inputShape  — [1, 224, 224, 3]
// result.inputDtype  — "float32"
// result.outputDtype — "float32"
// result.labels      — ["healthy", "sigatoka", "panama-disease", "cordana-leaf-spot"]
```

## Input Handling

The production model is float32. JPEG uint8 pixels are normalized to `[0, 1]`
and written directly to the input buffer; the four output values are read as raw
float32 logits and softmaxed in JavaScript.

The load path fails closed: the model is rejected unless its input and output
tensors are `FLOAT32` with shapes `[1, 224, 224, 3]` and `[1, 4]`.

The `benchmarkModel(uri, variant, ...)` API still supports `'int8'` for the
on-device FP32-versus-INT8 benchmark. That path reads the model's own
quantization parameters (`scale`, `zeroPoint`) at runtime for input
quantization and output dequantization; no constants are hardcoded.

## Memory Safety

- Interpreter is closed in `OnDestroy`
- Bitmap is recycled after pixel extraction
- Input/output ByteBuffers are allocated once and reused
- Model initialization uses double-check locking (thread-safe)
- Inference is serialized via a Mutex (one inference at a time)

## Error Conditions

| Condition | Behavior |
|-----------|----------|
| Model file missing from assets | Descriptive IllegalStateException |
| Blank URI | IllegalArgumentException |
| Corrupt/unreadable image | IllegalArgumentException |
| Concurrent inference calls | Queued (serialized via Mutex) |
| Module not linked | `requireNativeModule` throws at import time |
