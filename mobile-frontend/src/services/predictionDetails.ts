import { CLASS_KEYS } from '../features/classification/disease-data';

export type ProbabilityMap = Partial<Record<(typeof CLASS_KEYS)[number], number>>;

export type ServerComparisonEntry = {
  predicted_class: string;
  confidence: number;
  inference_time_ms: number | null;
  model: string | null;
  probabilities: ProbabilityMap | null;
};

export type PredictionDetails = {
  class_probabilities: ProbabilityMap | null;
  model_comparison: { baseline?: ServerComparisonEntry; enhanced?: ServerComparisonEntry } | null;
};

const KNOWN = new Set<string>(CLASS_KEYS);

function parse(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Converts stored [{ classKey, probability }] records to { class: probability } (0..1, known classes only). */
export function toProbabilityMap(value: unknown): ProbabilityMap | null {
  if (!Array.isArray(value)) return null;
  const map: ProbabilityMap = {};
  for (const record of value) {
    const classKey = record?.classKey;
    const probability = Number(record?.probability);
    if (typeof classKey === 'string' && KNOWN.has(classKey) && Number.isFinite(probability) && probability >= 0 && probability <= 1) {
      map[classKey as keyof ProbabilityMap] = probability;
    }
  }
  return Object.keys(map).length ? map : null;
}

function toComparisonEntry(value: unknown): ServerComparisonEntry | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Record<string, unknown>;
  const confidence = Number(entry.confidence);
  if (typeof entry.predictedClass !== 'string' || !KNOWN.has(entry.predictedClass) || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return undefined;
  }
  const time = Number(entry.inferenceTimeMs);
  return {
    predicted_class: entry.predictedClass,
    confidence,
    inference_time_ms: Number.isFinite(time) && time >= 0 ? time : null,
    model: typeof entry.model === 'string' ? entry.model.slice(0, 100) : null,
    probabilities: toProbabilityMap(entry.probabilities),
  };
}

/** Builds the optional prediction-detail fields sent with a synced diagnosis. */
export function predictionDetails(item: { probabilities_json: string | null; baseline_json: string | null; enhanced_json: string | null }): PredictionDetails {
  const baseline = toComparisonEntry(parse(item.baseline_json));
  const enhanced = toComparisonEntry(parse(item.enhanced_json));
  return {
    class_probabilities: toProbabilityMap(parse(item.probabilities_json)),
    model_comparison: baseline || enhanced ? { ...(baseline ? { baseline } : {}), ...(enhanced ? { enhanced } : {}) } : null,
  };
}
