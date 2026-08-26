# DahonMDTFLite — On-device INT8 TFLite inference for Expo

Production Android native module that loads the quantized CA-MobileNetV3-Small
student model and performs full-integer INT8 inference entirely on-device.

## Architecture

```
Camera/Gallery
  → expo-image-picker
  → expo-image-manipulator (224x224 JPEG)
  → DahonMDTFLite.classifyImage(uri)
      → BitmapFactory.decodeFileDescriptor
      → Pixel extraction → uint8 [0,255] → float [0,1]
      → Quantize: round(float / scale + zeroPoint) → int8
      → Interpreter.run(inputBuffer, outputBuffer)
      → Dequantize: (raw - zeroPoint) * scale → float32 logits
  → JS softmax → argmax → ClassKey + confidence
```

## Model Contract

| Property     | Value                                  |
|-------------|----------------------------------------|
| Input shape | `[1, 224, 224, 3]`                    |
| Input dtype | `int8` (quantized from float32 [0,1]) |
| Output shape| `[1, 4]`                              |
| Output dtype| `int8` (dequantized to float32 logits)|
| Classes     | healthy, sigatoka, panama-disease, cordana-leaf-spot |
| Quantization| Full-integer post-training (calibration from training data only) |

## Prerequisites

1. **Trained model**: Place `ca_mobilenetv3_small_int8.tflite` in `assets/models/`
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

1. Adds `org.tensorflow:tensorflow-lite:2.16.1` to the app-level `build.gradle` dependencies
2. Configures NDK ABI filters for ARM and x86 targets

This happens automatically — no manual Gradle editing is required.

## Module API

```typescript
import { classifyImage, type ClassifyResult } from './modules/dahonmd-tflite';

const result: ClassifyResult = await classifyImage(imageUri);
// result.scores     — 4 dequantized float32 logits
// result.latencyMs  — inference wall time in milliseconds
// result.modelVersion — model filename identifier
// result.inputShape  — [1, 224, 224, 3]
// result.inputDtype  — "int8"
// result.outputDtype — "int8"
// result.labels      — ["healthy", "sigatoka", "panama-disease", "cordana-leaf-spot"]
```

## Quantization Handling

The module reads the model's own quantization parameters at load time:

- **Input quantization**: `inputScale` and `inputZeroPoint` from the TFLite model's
  input tensor quantization parameters. JPEG uint8 pixels are normalized to [0,1]
  then quantized: `int8 = round(float / scale + zeroPoint)`.

- **Output quantization**: `outputScale` and `outputZeroPoint` from the output tensor.
  Raw int8 values are dequantized: `float = (raw - zeroPoint) * scale`.

No quantization constants are hardcoded. Different calibration runs or model
replacements will use their own parameters automatically.

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
