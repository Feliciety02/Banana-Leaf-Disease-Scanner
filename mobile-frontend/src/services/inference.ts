import { DiseaseId } from '../types';

export type InferenceResult = {
  diseaseId: DiseaseId;
  confidence: number;
  latency: number;
  modelVersion: string;
  isSimulated: boolean;
  isUncertain: boolean;
};

// This safe placeholder is replaced only when the validated INT8 TFLite artifact
// and its exact five-class label map are supplied together.
export async function analyzeLeaf(_imageUri: string): Promise<InferenceResult> {
  return {
    diseaseId: 'development-unconfigured',
    confidence: 0,
    latency: 0,
    modelVersion: 'SIMULATED / DEVELOPMENT — labels pending',
    isSimulated: true,
    isUncertain: true,
  };
}
