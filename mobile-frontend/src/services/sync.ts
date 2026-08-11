import { Diagnosis } from '../types';
import { API_URL } from './apiConfig';
import { restoreSession } from './auth';

export async function syncDiagnoses(diagnoses: Diagnosis[]): Promise<string[]> {
  if (!diagnoses.length) return [];
  const session = await restoreSession();
  if (!session) return [];
  const response = await fetch(`${API_URL}/mobile/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${session.token}` },
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
