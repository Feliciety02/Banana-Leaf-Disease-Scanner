import { Diagnosis } from '../types';
import { API_URL } from './apiConfig';
import { fetchWithTimeout } from './http';

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
  if (!response.ok) throw new Error('Sync request failed');
  const payload = await response.json();
  return payload.data.results.filter((item: { status: string }) => ['created', 'already_synchronized'].includes(item.status)).map((item: { sync_uuid: string }) => item.sync_uuid);
}
