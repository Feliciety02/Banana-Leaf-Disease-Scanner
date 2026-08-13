import { Diagnosis } from '../types';
import { API_URL } from './apiConfig';
import { fetchWithTimeout } from './http';
import { isRetryableHttpStatus } from './syncPolicy';

export class SyncRequestError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = 'SyncRequestError';
  }
}

export async function syncDiagnoses(diagnoses: Diagnosis[], token: string): Promise<string[]> {
  if (!diagnoses.length) return [];
  const response = await fetchWithTimeout(`${API_URL}/mobile/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ diagnoses: diagnoses.map((diagnosis) => ({
      sync_uuid: diagnosis.id,
      predicted_class: diagnosis.diseaseId,
      confidence: diagnosis.confidence,
      model_version: diagnosis.modelVersion,
      inference_time_ms: diagnosis.latency,
      diagnosed_at: diagnosis.diagnosedAt,
    })) }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const retryable = isRetryableHttpStatus(response.status);
    throw new SyncRequestError(payload?.message ?? 'The saved scans could not be synchronized.', retryable);
  }
  if (!Array.isArray(payload?.data?.results)) {
    throw new SyncRequestError('The synchronization service returned an unexpected response.', false);
  }
  return payload.data.results.filter((item: { status: string }) => ['created', 'already_synchronized'].includes(item.status)).map((item: { sync_uuid: string }) => item.sync_uuid);
}
