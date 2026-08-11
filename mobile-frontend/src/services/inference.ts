import { DiseaseId } from '../types';

export type InferenceResult = {
  diseaseId: DiseaseId;
  confidence: number;
  latency: number;
  modelVersion: string;
};

// Swap this adapter for the final TFLite bridge without changing any screen code.
export async function analyzeLeaf(_imageUri: string): Promise<InferenceResult> {
  await new Promise((resolve) => setTimeout(resolve, 1400));
  return { diseaseId: 'black-sigatoka', confidence: 94.2, latency: 84, modelVersion: 'EMV3-INT8 demo' };
}
