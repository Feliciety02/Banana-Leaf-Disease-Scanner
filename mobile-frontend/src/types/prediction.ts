import type { ClassKey } from '../features/classification/types';

export type ClassProbability = { classKey: ClassKey; probability: number };

export type PredictionResult = {
  predictedClass: ClassKey;
  confidence: number;
  probabilities: ClassProbability[];
  inferenceTimeMs: number;
  model: string;
};

export type PredictionComparison = {
  predictionsAgree: boolean;
  confidenceDifference: number;
  higherConfidenceModel: 'baseline' | 'enhanced';
  latencyDifferenceMs: number;
  lowerLatencyModel: 'baseline' | 'enhanced';
};