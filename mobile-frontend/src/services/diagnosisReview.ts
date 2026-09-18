import { api } from './api';
import {
  getLocalDiagnosis,
  parseDiagnosisReview,
  saveDiagnosisReview,
  type DiagnosticReview,
  type LocalDiagnosis,
} from '../storage/localDiagnoses';

type ReviewRequestResponse = {
  review: DiagnosticReview | null;
};

type ReviewRequestResult = {
  review: DiagnosticReview;
  imageUploaded: boolean;
};

export async function requestAgriculturalReview(localId: string): Promise<ReviewRequestResult> {
  const record = await getLocalDiagnosis(localId);
  if (!record) throw new Error('This saved scan could not be found.');
  if (!record.sync_uuid || !record.server_id) {
    throw new Error('This scan must first be synchronized to your account before a review can be requested.');
  }
  if (record.sync_status !== 'synced') {
    throw new Error('This scan is still waiting to synchronize. Choose Sync now and try again.');
  }
  const existing = parseDiagnosisReview(record.review_json);
  if (existing && existing.review_status !== 'pending') {
    throw new Error('This scan already has an agricultural reviewer assessment.');
  }

  const notes = (record.farmer_notes ?? '').trim();
  const payload = await api<ReviewRequestResponse>(`/diagnoses/${record.server_id}/review-request`, {
    method: 'POST',
    body: JSON.stringify({ farmer_notes: notes || null }),
  });
  const review = payload.data.review;
  if (!review) throw new Error('The server did not return the review request.');
  await saveDiagnosisReview(localId, review);

  const image = localImageFile(record);
  if (!image) return { review, imageUploaded: true };

  try {
    await uploadImage(record.sync_uuid, image);
    return { review, imageUploaded: true };
  } catch (error) {
    throw new Error(`Review requested, but the scan image could not be uploaded: ${messageOf(error)} Retry sending the image from the scan details.`);
  }
}

export async function uploadReviewImage(localId: string): Promise<void> {
  const record = await getLocalDiagnosis(localId);
  if (!record) throw new Error('This saved scan could not be found.');
  if (!record.sync_uuid || !record.server_id) {
    throw new Error('This scan must be synchronized before its image can be sent.');
  }
  const review = parseDiagnosisReview(record.review_json);
  if (!review || review.review_status !== 'pending') {
    throw new Error('Only a pending review request can receive the scan image.');
  }
  const image = localImageFile(record);
  if (!image) throw new Error('There is no local scan image left to send.');

  await uploadImage(record.sync_uuid, image);
}

export function hasLocalScanImage(item: LocalDiagnosis) {
  if (!item.image_uri) return false;
  return !/^https?:\/\//i.test(item.image_uri);
}

function localImageFile(record: LocalDiagnosis): { uri: string; type: string; name: string } | null {
  if (!hasLocalScanImage(record)) return null;
  const uri = record.image_uri as string;
  const extension = uri.split('.').pop()?.toLowerCase();
  const type = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  const fileExtension = extension === 'png' ? 'png' : extension === 'webp' ? 'webp' : 'jpg';
  return { uri, type, name: `scan-${record.sync_uuid ?? record.local_id}.${fileExtension}` };
}

async function uploadImage(syncUuid: string, image: { uri: string; type: string; name: string }) {
  const body = new FormData();
  body.append('image', { uri: image.uri, name: image.name, type: image.type } as unknown as Blob);
  body.append('purpose', 'review');
  await api(`/sync/${syncUuid}/image`, { method: 'POST', body, timeoutMs: 60_000 });
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'The server could not be reached.';
}