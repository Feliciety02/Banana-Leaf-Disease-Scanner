import { api, hasConnectedConfiguration } from './api';
import type { ClassKey } from '../features/classification/types';

export type ClassProbabilityRecord = { classKey: ClassKey; probability: number };

export type ModelComparisonEntry = {
  predictedClass: ClassKey;
  confidence: number;
  probabilities: ClassProbabilityRecord[];
  inferenceTimeMs: number;
  model: string;
  modelSizeBytes: number;
};

export type ComparisonSummary = {
  predictionAgreement: boolean;
  summary: string;
  enhancedConfidenceDifferencePp: number;
  enhancedLatencyDifferenceMs: number;
  interpretationNote: string;
};

export type ResearchComparisonResult = {
  baseline: ModelComparisonEntry;
  enhanced: ModelComparisonEntry;
  comparison: ComparisonSummary;
};

export async function compareResearchModel(imageUri: string): Promise<ResearchComparisonResult | null> {
  if (!hasConnectedConfiguration()) return null;

  try {
    const formData = new FormData();
    formData.append('image', {
      uri: imageUri,
      name: 'banana-leaf.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);

    const payload = await api<{
      baseline: {
        predicted_class: ClassKey;
        confidence: number;
        probabilities: Record<string, number>;
        inference_time_ms: number;
        model: string;
        model_size_bytes: number;
      };
      enhanced: {
        predicted_class: ClassKey;
        confidence: number;
        probabilities: Record<string, number>;
        inference_time_ms: number;
        model: string;
        model_size_bytes: number;
      };
      comparison: {
        prediction_agreement: boolean;
        summary: string;
        enhanced_confidence_difference_percentage_points: number;
        enhanced_latency_difference_ms: number;
        interpretation_note: string;
      };
    }>('/research/model-comparison', {
      method: 'POST',
      body: formData,
      timeoutMs: 30_000,
    });

    const data = payload.data;
    if (!data?.baseline || !data?.enhanced) return null;

    const CLASS_KEYS: ClassKey[] = ['healthy', 'sigatoka', 'panama-disease', 'cordana-leaf-spot'];

    const parseEntry = (entry: typeof data.baseline): ModelComparisonEntry => {
      const probs = entry.probabilities;
      return {
        predictedClass: entry.predicted_class,
        confidence: entry.confidence,
        probabilities: CLASS_KEYS.map((key) => ({ classKey: key, probability: probs[key] ?? 0 })),
        inferenceTimeMs: entry.inference_time_ms,
        model: entry.model,
        modelSizeBytes: entry.model_size_bytes,
      };
    };

    return {
      baseline: parseEntry(data.baseline),
      enhanced: parseEntry(data.enhanced),
      comparison: {
        predictionAgreement: data.comparison.prediction_agreement,
        summary: data.comparison.summary,
        enhancedConfidenceDifferencePp: data.comparison.enhanced_confidence_difference_percentage_points,
        enhancedLatencyDifferenceMs: data.comparison.enhanced_latency_difference_ms,
        interpretationNote: data.comparison.interpretation_note,
      },
    };
  } catch {
    return null;
  }
}
