import { NativeModules } from 'react-native';
import { CLASS_KEYS } from '../data';
import { ClassKey } from '../types';
import { MODEL_INPUT, prepareImageForInference } from './preprocessing';

export type InferenceResult = { classKey: ClassKey; confidence: number; latencyMs: number; modelVersion: string };
export type NativeResult = { scores: number[]; latencyMs: number; modelVersion: string; inputShape: number[]; inputDtype: string; outputDtype: string; labels: string[] };
type NativeTFLiteModule = { classifyImage(uri: string): Promise<NativeResult> };
const nativeTFLite = NativeModules.DahonMDTFLite as NativeTFLiteModule | undefined;

export function validateNativeResult(result: NativeResult): void {
  if (JSON.stringify(result.inputShape) !== JSON.stringify([1, 224, 224, 3])) throw new Error(`Model input must be [1,224,224,3], received ${JSON.stringify(result.inputShape)}.`);
  if (result.inputDtype !== 'int8' || result.outputDtype !== 'int8') throw new Error('The bundled model is not the required full-integer INT8 model.');
  if (JSON.stringify(result.labels) !== JSON.stringify(CLASS_KEYS) || result.scores.length !== CLASS_KEYS.length) throw new Error('The bundled model label map is not the fixed four-class thesis contract.');
  if (!result.scores.every(Number.isFinite)) throw new Error('The model returned invalid confidence scores.');
}

export async function analyzeLeaf(imageUri: string): Promise<InferenceResult> {
  if (!nativeTFLite) throw new Error('PENDING EXPERIMENTAL VALIDATION: bundle the validated four-class INT8 TFLite model and DahonMDTFLite native module in an Expo development/production build.');
  const nativeResult = await nativeTFLite.classifyImage(await prepareImageForInference(imageUri));
  validateNativeResult(nativeResult);
  const probabilities = softmax(nativeResult.scores);
  const predictedIndex = probabilities.reduce((best, value, index) => value > probabilities[best] ? index : best, 0);
  return { classKey: CLASS_KEYS[predictedIndex], confidence: probabilities[predictedIndex], latencyMs: nativeResult.latencyMs, modelVersion: nativeResult.modelVersion };
}

function softmax(values: number[]): number[] { const maximum = Math.max(...values); const exponentials = values.map((value) => Math.exp(value - maximum)); const total = exponentials.reduce((sum, value) => sum + value, 0); return exponentials.map((value) => value / total); }
export { MODEL_INPUT };
