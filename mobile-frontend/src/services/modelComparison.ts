import { API_URL } from './apiConfig';
import { fetchWithTimeout } from './http';

export type ModelComparisonResult = {
  baseline: ModelResult;
  enhanced: ModelResult;
  comparison: {
    prediction_agreement: boolean;
    summary: string;
    interpretation_note: string;
  };
  study?: {
    baseline: { accuracy: number; macro_f1: number };
    enhanced: { accuracy: number; macro_f1: number };
    decision_note: string;
  };
};

type ModelResult = {
  predicted_class: string;
  confidence: number;
  inference_time_ms: number;
  model_size_bytes: number;
};

const mimeFor = (uri: string) => {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
};

export async function compareModels(imageUri: string, token: string): Promise<ModelComparisonResult> {
  const form = new FormData();
  form.append('image', {
    uri: imageUri,
    name: `banana-leaf.${mimeFor(imageUri).split('/')[1]}`,
    type: mimeFor(imageUri),
  } as unknown as Blob);

  const response = await fetchWithTimeout(`${API_URL}/research/model-comparison`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: form,
  }, 60_000);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? 'The thesis comparison is unavailable.');
  if (!payload?.data?.baseline || !payload?.data?.enhanced || !payload?.data?.comparison) {
    throw new Error('The thesis comparison returned an unexpected response.');
  }
  return payload.data as ModelComparisonResult;
}
