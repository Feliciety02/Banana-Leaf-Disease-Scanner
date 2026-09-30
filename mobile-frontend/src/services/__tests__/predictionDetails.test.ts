import { predictionDetails, toProbabilityMap } from '../predictionDetails';

const probabilities = [
  { classKey: 'healthy', probability: 0.05 },
  { classKey: 'sigatoka', probability: 0.88 },
  { classKey: 'panama-disease', probability: 0.02 },
  { classKey: 'cordana-leaf-spot', probability: 0.05 },
];

describe('prediction details sent with a synced scan', () => {
  it('converts stored probability records into a class-keyed map', () => {
    expect(toProbabilityMap(probabilities)).toEqual({ healthy: 0.05, sigatoka: 0.88, 'panama-disease': 0.02, 'cordana-leaf-spot': 0.05 });
  });

  it('drops unknown classes and out-of-range values instead of failing the sync', () => {
    expect(toProbabilityMap([{ classKey: 'black-sigatoka', probability: 0.4 }, { classKey: 'healthy', probability: 1.4 }, { classKey: 'sigatoka', probability: 0.6 }])).toEqual({ sigatoka: 0.6 });
    expect(toProbabilityMap('not an array')).toBeNull();
  });

  it('builds the baseline/enhanced comparison from stored entries', () => {
    const enhanced = { predictedClass: 'sigatoka', confidence: 0.88, probabilities, inferenceTimeMs: 7.2, model: 'ca_mobilenetv3_small_fp32', modelSizeBytes: 0 };
    const baseline = { ...enhanced, confidence: 0.7, inferenceTimeMs: 3.1, model: 'ca_mobilenetv3_small_int8' };

    const details = predictionDetails({
      probabilities_json: JSON.stringify(probabilities),
      baseline_json: JSON.stringify(baseline),
      enhanced_json: JSON.stringify(enhanced),
    });

    expect(details.class_probabilities?.sigatoka).toBe(0.88);
    expect(details.model_comparison?.baseline).toMatchObject({ predicted_class: 'sigatoka', confidence: 0.7, inference_time_ms: 3.1, model: 'ca_mobilenetv3_small_int8' });
    expect(details.model_comparison?.enhanced?.probabilities?.healthy).toBe(0.05);
  });

  it('sends nulls for scans saved before these fields existed', () => {
    expect(predictionDetails({ probabilities_json: null, baseline_json: null, enhanced_json: 'not json' })).toEqual({ class_probabilities: null, model_comparison: null });
  });
});
