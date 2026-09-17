import type { PredictionComparison, PredictionResult } from '../types/prediction';

export function comparePredictions(baseline: PredictionResult, enhanced: PredictionResult): PredictionComparison {
  const predictionsAgree = baseline.predictedClass === enhanced.predictedClass;
  const confidenceDifference = enhanced.confidence - baseline.confidence;
  const higherConfidenceModel: 'baseline' | 'enhanced' = confidenceDifference >= 0 ? 'enhanced' : 'baseline';
  const latencyDifferenceMs = enhanced.inferenceTimeMs - baseline.inferenceTimeMs;
  const lowerLatencyModel: 'baseline' | 'enhanced' = latencyDifferenceMs <= 0 ? 'enhanced' : 'baseline';
  return { predictionsAgree, confidenceDifference, higherConfidenceModel, latencyDifferenceMs, lowerLatencyModel };
}