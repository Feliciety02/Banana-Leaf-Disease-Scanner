import { CLASS_KEYS } from '../../data';
import { MODEL_INPUT, validateNativeResult } from '../inference';

describe('thesis mobile inference contract', () => {
  it('uses exact 224x224 RGB preprocessing dimensions and four classes', () => {
    expect(MODEL_INPUT).toEqual({ width: 224, height: 224, channels: 3 });
    expect(CLASS_KEYS).toEqual(['healthy', 'sigatoka', 'panama-disease', 'cordana-leaf-spot']);
  });

  it('accepts only a four-output full-integer model contract', () => {
    expect(() => validateNativeResult({
      scores: [1, 2, 3, 4], latencyMs: 8, modelVersion: 'test',
      inputShape: [1, 224, 224, 3], inputDtype: 'int8', outputDtype: 'int8', labels: [...CLASS_KEYS],
    })).not.toThrow();
    expect(() => validateNativeResult({
      scores: [1, 2, 3, 4, 5], latencyMs: 8, modelVersion: 'obsolete',
      inputShape: [1, 224, 224, 3], inputDtype: 'float32', outputDtype: 'float32', labels: [...CLASS_KEYS, 'moko'],
    })).toThrow();
  });
});
