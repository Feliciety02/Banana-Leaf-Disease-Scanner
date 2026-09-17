import { classifyImage as nativeClassify, classifyImageBaseline as nativeBaselineClassify, type ClassifyResult } from '../../../modules/dahonmd-tflite';
import { CLASS_KEYS } from './disease-data';
import { ClassKey } from './types';
import { MODEL_INPUT, prepareImageForInference } from './preprocessing';

export type ClassProbability = { classKey: ClassKey; probability: number };
export type InferenceResult = {
  classKey: ClassKey;
  confidence: number;
  probabilities: ClassProbability[];
  latencyMs: number;
  modelVersion: string;
};
export type NativeResult = ClassifyResult;

/**
 * Softmax temperature that calibrates the enhanced model's raw confidences.
 * The enhanced student model tends to be overconfident (near-100% every scan).
 * Dividing logits by a temperature > 1 keeps the exact same prediction order
 * while producing honest, farmer-friendly percentage spreads.
 */
export const CALIBRATION_TEMPERATURE = 2.6;

export function validateNativeResult(result: NativeResult): void {
  if (JSON.stringify(result.inputShape) !== JSON.stringify([1, 224, 224, 3])) throw new Error(`Model input must be [1,224,224,3], received ${JSON.stringify(result.inputShape)}.`);
  if (result.inputDtype !== 'float32' || result.outputDtype !== 'float32') throw new Error('The bundled model is not the validated float32 model.');
  if (JSON.stringify(result.labels) !== JSON.stringify(CLASS_KEYS) || result.scores.length !== CLASS_KEYS.length) throw new Error('The bundled model label map is not the fixed four-class thesis contract.');
  if (!result.scores.every(Number.isFinite)) throw new Error('The model returned invalid confidence scores.');
}

export function validateBaselineNativeResult(result: NativeResult): void {
  if (JSON.stringify(result.inputShape) !== JSON.stringify([1, 224, 224, 3])) throw new Error(`Baseline model input must be [1,224,224,3], received ${JSON.stringify(result.inputShape)}.`);
  if (result.inputDtype !== 'int8' || result.outputDtype !== 'int8') throw new Error('The baseline model is not the validated int8 quantized TF-Lite model.');
  if (JSON.stringify(result.labels) !== JSON.stringify(CLASS_KEYS) || result.scores.length !== CLASS_KEYS.length) throw new Error('The baseline model label map is not the fixed four-class thesis contract.');
  if (!result.scores.every(Number.isFinite)) throw new Error('The baseline model returned invalid confidence scores.');
}

export async function analyzeLeaf(imageUri: string): Promise<InferenceResult> {
  const nativeResult = await nativeClassify(await prepareImageForInference(imageUri));
  validateNativeResult(nativeResult);
  const probabilities = softmax(nativeResult.scores, CALIBRATION_TEMPERATURE);
  const predictedIndex = probabilities.reduce((best, value, index) => value > probabilities[best] ? index : best, 0);
  return {
    classKey: CLASS_KEYS[predictedIndex],
    confidence: probabilities[predictedIndex],
    probabilities: CLASS_KEYS.map((classKey, index) => ({ classKey, probability: probabilities[index] })),
    latencyMs: nativeResult.latencyMs,
    modelVersion: nativeResult.modelVersion,
  };
}

export async function analyzeBaselineLeaf(imageUri: string): Promise<InferenceResult> {
  const nativeResult = await nativeBaselineClassify(await prepareImageForInference(imageUri));
  validateBaselineNativeResult(nativeResult);
  const probabilities = softmax(nativeResult.scores);
  const predictedIndex = probabilities.reduce((best, value, index) => value > probabilities[best] ? index : best, 0);
  return {
    classKey: CLASS_KEYS[predictedIndex],
    confidence: probabilities[predictedIndex],
    probabilities: CLASS_KEYS.map((classKey, index) => ({ classKey, probability: probabilities[index] })),
    latencyMs: nativeResult.latencyMs,
    modelVersion: nativeResult.modelVersion,
  };
}

function softmax(values: number[], temperature = 1): number[] {
  const scaled = values.map((value) => value / temperature);
  const maximum = Math.max(...scaled);
  const exponentials = scaled.map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
}
export { MODEL_INPUT };
