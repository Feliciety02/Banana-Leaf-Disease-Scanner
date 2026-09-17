jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      resize: jest.fn().mockReturnThis(),
      renderAsync: jest.fn().mockResolvedValue({
        saveAsync: jest.fn().mockResolvedValue({ uri: 'file:///tmp/prepared.jpg' }),
      }),
    })),
  },
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('../../../../modules/dahonmd-tflite', () => {
  let callCount = 0;
  return {
    classifyImage: jest.fn(async () => {
      callCount += 1;
      return {
        scores: [0.1, 0.7, 0.15, 0.05],
        latencyMs: 12.5,
        modelVersion: 'ca_mobilenetv3_small_fp32',
        inputShape: [1, 224, 224, 3],
        inputDtype: 'float32',
        outputDtype: 'float32',
        labels: ['healthy', 'sigatoka', 'panama-disease', 'cordana-leaf-spot'],
      };
    }),
    classifyImageBaseline: jest.fn(async () => ({
      scores: [0.2, 0.6, 0.12, 0.08],
      latencyMs: 9.0,
      modelVersion: 'ca_mobilenetv3_small_int8',
      inputShape: [1, 224, 224, 3],
      inputDtype: 'int8',
      outputDtype: 'int8',
      labels: ['healthy', 'sigatoka', 'panama-disease', 'cordana-leaf-spot'],
    })),
    isNativeAvailable: jest.fn(() => true),
  };
});

import { CLASS_KEYS } from '../disease-data';
import { analyzeLeaf, analyzeBaselineLeaf, validateNativeResult, validateBaselineNativeResult, CALIBRATION_TEMPERATURE, MODEL_INPUT, type NativeResult } from '../inference';

const { classifyImage, classifyImageBaseline } = require('../../../../modules/dahonmd-tflite');

beforeEach(() => {
  jest.clearAllMocks();
  classifyImage.mockClear();
  classifyImageBaseline.mockClear();
});

describe('camera and gallery preprocessing', () => {
  it('uses exact 224x224 RGB preprocessing dimensions', () => {
    expect(MODEL_INPUT).toEqual({ width: 224, height: 224, channels: 3 });
  });

  it('maps to the fixed four-class thesis contract', () => {
    expect(CLASS_KEYS).toEqual(['healthy', 'sigatoka', 'panama-disease', 'cordana-leaf-spot']);
  });
});

describe('analyzeLeaf end-to-end workflow', () => {
  it('classifies a camera-captured image', async () => {
    const result = await analyzeLeaf('file:///camera/photo.jpg');
    expect(result.classKey).toBe('sigatoka');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.probabilities.map(({ classKey }) => classKey)).toEqual(CLASS_KEYS);
    expect(result.probabilities).toHaveLength(4);
    expect(result.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1, 10);
    expect(result.confidence).toBe(result.probabilities.find((item) => item.classKey === result.classKey)?.probability);
    expect(result.latencyMs).toBe(12.5);
    expect(result.modelVersion).toBe('ca_mobilenetv3_small_fp32');
    expect(classifyImage).toHaveBeenCalledTimes(1);
    expect(classifyImage).toHaveBeenCalledWith('file:///tmp/prepared.jpg');
  });

  it('classifies a gallery-selected image', async () => {
    const result = await analyzeLeaf('content://media/external/images/123');
    expect(result.classKey).toBe('sigatoka');
    expect(result.confidence).toBeGreaterThan(0);
    expect(classifyImage).toHaveBeenCalledTimes(1);
  });

  it('returns the class with highest softmax probability', async () => {
    classifyImage.mockResolvedValueOnce({
      scores: [0.9, 0.05, 0.03, 0.02],
      latencyMs: 8.0,
      modelVersion: 'ca_mobilenetv3_small_fp32',
      inputShape: [1, 224, 224, 3],
      inputDtype: 'float32',
      outputDtype: 'float32',
      labels: [...CLASS_KEYS],
    });
    const result = await analyzeLeaf('file:///test.jpg');
    expect(result.classKey).toBe('healthy');
    const scaled = [0.9, 0.05, 0.03, 0.02].map((value) => value / CALIBRATION_TEMPERATURE);
    const maximum = Math.max(...scaled);
    const exponents = scaled.map((value) => Math.exp(value - maximum));
    const expected = exponents[0] / exponents.reduce((a, b) => a + b, 0);
    expect(result.confidence).toBeCloseTo(expected, 10);
  });

  it('applies softmax before argmax (not raw scores)', async () => {
    classifyImage.mockResolvedValueOnce({
      scores: [10.0, 5.0, 3.0, 1.0],
      latencyMs: 8.0,
      modelVersion: 'ca_mobilenetv3_small_fp32',
      inputShape: [1, 224, 224, 3],
      inputDtype: 'float32',
      outputDtype: 'float32',
      labels: [...CLASS_KEYS],
    });
    const result = await analyzeLeaf('file:///test.jpg');
    expect(result.classKey).toBe('healthy');
    const scaled = [10.0, 5.0, 3.0, 1.0].map((value) => value / CALIBRATION_TEMPERATURE);
    const maximum = Math.max(...scaled);
    const exponents = scaled.map((value) => Math.exp(value - maximum));
    const expected = exponents[0] / exponents.reduce((a, b) => a + b, 0);
    expect(result.confidence).toBeCloseTo(expected, 5);
  });

  it('supports repeated inference without state leakage', async () => {
    classifyImage.mockResolvedValueOnce({
      scores: [0.8, 0.1, 0.05, 0.05],
      latencyMs: 10.0,
      modelVersion: 'ca_mobilenetv3_small_fp32',
      inputShape: [1, 224, 224, 3],
      inputDtype: 'float32',
      outputDtype: 'float32',
      labels: [...CLASS_KEYS],
    });
    classifyImage.mockResolvedValueOnce({
      scores: [0.05, 0.05, 0.8, 0.1],
      latencyMs: 11.0,
      modelVersion: 'ca_mobilenetv3_small_fp32',
      inputShape: [1, 224, 224, 3],
      inputDtype: 'float32',
      outputDtype: 'float32',
      labels: [...CLASS_KEYS],
    });

    const first = await analyzeLeaf('file:///a.jpg');
    const second = await analyzeLeaf('file:///b.jpg');
    expect(first.classKey).toBe('healthy');
    expect(second.classKey).toBe('panama-disease');
    expect(first.classKey).not.toBe(second.classKey);
    expect(classifyImage).toHaveBeenCalledTimes(2);
  });
});

describe('native result validation contract', () => {
  const validResult: NativeResult = {
    scores: [1, 2, 3, 4],
    latencyMs: 8,
    modelVersion: 'test',
    inputShape: [1, 224, 224, 3],
    inputDtype: 'float32',
    outputDtype: 'float32',
    labels: [...CLASS_KEYS],
  };

  it('accepts a valid four-output FP32 model result', () => {
    expect(() => validateNativeResult(validResult)).not.toThrow();
  });

  it('rejects wrong input shape', () => {
    expect(() => validateNativeResult({
      ...validResult, inputShape: [1, 128, 128, 3],
    })).toThrow();
  });

  it('rejects wrong output count', () => {
    expect(() => validateNativeResult({
      ...validResult, scores: [1, 2, 3, 4, 5],
      labels: [...CLASS_KEYS, 'moko'],
    })).toThrow();
  });

  it('rejects int8 dtype', () => {
    expect(() => validateNativeResult({
      ...validResult, inputDtype: 'int8', outputDtype: 'int8',
    })).toThrow();
  });

  it('rejects mismatched labels', () => {
    expect(() => validateNativeResult({
      ...validResult,
      labels: ['healthy', 'sigatoka', 'cordana-leaf-spot', 'panama-disease'],
    })).toThrow();
  });

  it('rejects non-finite scores', () => {
    expect(() => validateNativeResult({
      ...validResult, scores: [NaN, 1, 2, 3],
    })).toThrow();
    expect(() => validateNativeResult({
      ...validResult, scores: [Infinity, 1, 2, 3],
    })).toThrow();
  });
});

describe('native inference failure handling', () => {
  it('propagates native module rejection', async () => {
    classifyImage.mockRejectedValueOnce(new Error('Model not found'));
    await expect(analyzeLeaf('file:///test.jpg')).rejects.toThrow('Model not found');
  });

  it('propagates preprocessing failure', async () => {
    const { ImageManipulator } = require('expo-image-manipulator');
    ImageManipulator.manipulate.mockReturnValueOnce({
      resize: jest.fn().mockReturnThis(),
      renderAsync: jest.fn().mockRejectedValue(new Error('Corrupt image')),
    });
    await expect(analyzeLeaf('file:///corrupt.jpg')).rejects.toThrow();
  });
});

describe('four-class label mapping', () => {
  it('maps index 0 to healthy', async () => {
    classifyImage.mockResolvedValueOnce({
      scores: [0.9, 0.03, 0.04, 0.03],
      latencyMs: 8, modelVersion: 'test',
      inputShape: [1, 224, 224, 3], inputDtype: 'float32', outputDtype: 'float32',
      labels: [...CLASS_KEYS],
    });
    const result = await analyzeLeaf('file:///test.jpg');
    expect(result.classKey).toBe('healthy');
  });

  it('maps index 1 to sigatoka', async () => {
    classifyImage.mockResolvedValueOnce({
      scores: [0.03, 0.9, 0.04, 0.03],
      latencyMs: 8, modelVersion: 'test',
      inputShape: [1, 224, 224, 3], inputDtype: 'float32', outputDtype: 'float32',
      labels: [...CLASS_KEYS],
    });
    const result = await analyzeLeaf('file:///test.jpg');
    expect(result.classKey).toBe('sigatoka');
  });

  it('maps index 2 to panama-disease', async () => {
    classifyImage.mockResolvedValueOnce({
      scores: [0.03, 0.04, 0.9, 0.03],
      latencyMs: 8, modelVersion: 'test',
      inputShape: [1, 224, 224, 3], inputDtype: 'float32', outputDtype: 'float32',
      labels: [...CLASS_KEYS],
    });
    const result = await analyzeLeaf('file:///test.jpg');
    expect(result.classKey).toBe('panama-disease');
  });

  it('maps index 3 to cordana-leaf-spot', async () => {
    classifyImage.mockResolvedValueOnce({
      scores: [0.03, 0.04, 0.03, 0.9],
      latencyMs: 8, modelVersion: 'test',
      inputShape: [1, 224, 224, 3], inputDtype: 'float32', outputDtype: 'float32',
      labels: [...CLASS_KEYS],
    });
    const result = await analyzeLeaf('file:///test.jpg');
    expect(result.classKey).toBe('cordana-leaf-spot');
  });

  it('all four CLASS_KEYS have display names', () => {
    const { CLASS_DISPLAY_NAMES } = require('../disease-data');
    expect(CLASS_DISPLAY_NAMES.healthy).toBe('Healthy');
    expect(CLASS_DISPLAY_NAMES.sigatoka).toBe('Black Sigatoka');
    expect(CLASS_DISPLAY_NAMES['panama-disease']).toBe('Panama Disease');
    expect(CLASS_DISPLAY_NAMES['cordana-leaf-spot']).toBe('Cordana');
  });
});

describe('confidence display', () => {
  it('confidence is between 0 and 1 inclusive', async () => {
    const result = await analyzeLeaf('file:///test.jpg');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('softmax probabilities sum to 1', async () => {
    classifyImage.mockResolvedValueOnce({
      scores: [1.5, 2.3, 0.7, -0.4],
      latencyMs: 8, modelVersion: 'test',
      inputShape: [1, 224, 224, 3], inputDtype: 'float32', outputDtype: 'float32',
      labels: [...CLASS_KEYS],
    });
    const result = await analyzeLeaf('file:///test.jpg');
    expect(result.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1, 10);
    expect(result.probabilities.every((item) => item.probability > 0 && item.probability < 1)).toBe(true);
  });
});

describe('enhanced model calibration', () => {
  it('uses a softmax temperature above 1 so confidence is never always-perfect', () => {
    expect(CALIBRATION_TEMPERATURE).toBeGreaterThan(1);
  });

  it('calibration keeps the predicted class but lowers the top confidence', async () => {
    const raw = [0.8, 0.1, 0.05, 0.05];
    classifyImage.mockResolvedValueOnce({
      scores: raw,
      latencyMs: 8, modelVersion: 'test',
      inputShape: [1, 224, 224, 3], inputDtype: 'float32', outputDtype: 'float32',
      labels: [...CLASS_KEYS],
    });
    const result = await analyzeLeaf('file:///test.jpg');
    expect(result.classKey).toBe('healthy');
    const rawSoftmax = (() => {
      const maximum = Math.max(...raw);
      const exponentials = raw.map((value) => Math.exp(value - maximum));
      const total = exponentials.reduce((sum, value) => sum + value, 0);
      return exponentials[0] / total;
    })();
    expect(result.confidence).toBeLessThan(rawSoftmax);
    expect(result.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1, 10);
  });

  it('calibration preserves the softmax-before-argmax order', async () => {
    const result = await analyzeLeaf('file:///test.jpg');
    expect(result.classKey).toBe(result.probabilities.reduce((best, item) => item.probability > best.probability ? item : best, result.probabilities[0]).classKey);
  });
});

describe('baseline int8 TF-Lite model', () => {
  const int8Result: NativeResult = {
    scores: [1, 2, 3, 4],
    latencyMs: 8,
    modelVersion: 'test',
    inputShape: [1, 224, 224, 3],
    inputDtype: 'int8',
    outputDtype: 'int8',
    labels: [...CLASS_KEYS],
  };

  it('accepts a valid four-output INT8 model result', () => {
    expect(() => validateBaselineNativeResult(int8Result)).not.toThrow();
  });

  it('rejects an FP32 result on the baseline validator', () => {
    expect(() => validateBaselineNativeResult({ ...int8Result, inputDtype: 'float32', outputDtype: 'float32' })).toThrow();
  });

  it('rejects wrong output count on the baseline validator', () => {
    expect(() => validateBaselineNativeResult({
      ...int8Result, scores: [1, 2, 3, 4, 5], labels: [...CLASS_KEYS, 'moko'],
    })).toThrow();
  });

  it('runs the int8 model on-device and returns the four-class softmax', async () => {
    const result = await analyzeBaselineLeaf('file:///test.jpg');
    expect(result.classKey).toBe('sigatoka');
    expect(result.modelVersion).toBe('ca_mobilenetv3_small_int8');
    expect(result.probabilities).toHaveLength(4);
    expect(result.probabilities.reduce((sum, item) => sum + item.probability, 0)).toBeCloseTo(1, 10);
    expect(classifyImageBaseline).toHaveBeenCalledTimes(1);
    expect(classifyImageBaseline).toHaveBeenCalledWith('file:///tmp/prepared.jpg');
  });

  it('propagates baseline native module rejection', async () => {
    classifyImageBaseline.mockRejectedValueOnce(new Error('Baseline model not found'));
    await expect(analyzeBaselineLeaf('file:///test.jpg')).rejects.toThrow('Baseline model not found');
  });
});

describe('offline operation', () => {
  it('no network imports in inference path', () => {
    const fs = require('fs');
    const path = require('path');
    const inferencePath = path.resolve(__dirname, '../inference.ts');
    const source = fs.readFileSync(inferencePath, 'utf8');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('XMLHttpRequest');
    expect(source).not.toContain('NetInfo');
    expect(source).not.toContain('http://');
    expect(source).not.toContain('https://');
  });

  it('inference module does not import backend services', () => {
    const fs = require('fs');
    const path = require('path');
    const inferencePath = path.resolve(__dirname, '../inference.ts');
    const source = fs.readFileSync(inferencePath, 'utf8');
    expect(source).not.toContain('services/auth');
    expect(source).not.toContain('services/database');
    expect(source).not.toContain('services/sync');
    expect(source).not.toContain('services/apiConfig');
    expect(source).not.toContain('modelComparison');
  });

  it('native model loading fails closed unless the tensor contract is float32', () => {
    const fs = require('fs');
    const path = require('path');
    const nativePath = path.resolve(
      __dirname,
      '../../../../modules/dahonmd-tflite/android/src/main/java/expo/modules/dahonmdtflite/DahonMDTFLiteModule.kt',
    );
    const source = fs.readFileSync(nativePath, 'utf8');
    expect(source).toContain('inputDetails.dataType() == DataType.FLOAT32');
    expect(source).toContain('outputDetails.dataType() == DataType.FLOAT32');
    expect(source).toContain('intArrayOf(1, MODEL_HEIGHT, MODEL_WIDTH, CHANNELS)');
    expect(source).toContain('intArrayOf(1, NUM_CLASSES)');
  });

  it('links the production model into the Android asset root used by the native module', () => {
    const fs = require('fs');
    const path = require('path');
    const appConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../app.json'), 'utf8'));
    const expoAssetPlugin = appConfig.expo.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-asset',
    );
    const modulePluginRegistered = appConfig.expo.plugins.includes(
      './modules/dahonmd-tflite/plugin/src/index.js',
    );
    expect(expoAssetPlugin).toBeUndefined();
    expect(modulePluginRegistered).toBe(true);

    const pluginSource = fs.readFileSync(
      path.resolve(__dirname, '../../../../modules/dahonmd-tflite/plugin/src/index.js'),
      'utf8',
    );
    expect(pluginSource).toContain('.tflite');
    expect(pluginSource).toContain("'app', 'src', 'main', 'assets'");

    const nativePath = path.resolve(
      __dirname,
      '../../../../modules/dahonmd-tflite/android/src/main/java/expo/modules/dahonmdtflite/DahonMDTFLiteModule.kt',
    );
    const source = fs.readFileSync(nativePath, 'utf8');
    expect(source).toContain('FP32_MODEL_ASSET = "ca_mobilenetv3_small_fp32.tflite"');
    expect(source).toContain('loadModel(FP32_MODEL_ASSET, 1)');
    expect(source).not.toContain('models/ca_mobilenetv3_small_fp32.tflite');
  });
});
