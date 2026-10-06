import { api, uploadFile } from './api';
import {
  getLocalDiagnosis,
  queueReviewSeen,
  clearQueuedReviewSeen,
  isNewReview,
  parseDiagnosisReview,
  replaceLocalDiagnosisImage,
  saveDiagnosisReview,
  saveLocalResearchConsent,
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

export async function requestAgriculturalReview(localId: string, farmerNotes?: string): Promise<ReviewRequestResult> {
  const record = await getLocalDiagnosis(localId);
  if (!record) throw new Error('This saved scan could not be found.');
  if (!record.sync_uuid || !record.server_id) {
    throw new Error('This scan must first be synchronized to your account before a review can be requested.');
  }
  if (record.sync_status !== 'synced') {
    throw new Error('This scan is still waiting to synchronize. It uploads automatically when you are online; try again in a moment.');
  }
  const existing = parseDiagnosisReview(record.review_json);
  if (existing && existing.review_status !== 'pending') {
    throw new Error('This scan already has an agriculturist assessment.');
  }

  // The agriculturist checks the leaf from its photo, so the photo is saved on
  // the server before the request; the server ignores a photo it already has.
  const image = localImageFile(record);
  if (image) {
    try {
      await uploadImage(record.sync_uuid, image, 'review');
    } catch (error) {
      throw new Error(`The scan photo could not be uploaded, so no review was requested: ${messageOf(error)} Try again when the connection is better.`);
    }
  }

  const notes = (farmerNotes ?? record.farmer_notes ?? '').trim();
  const payload = await api<ReviewRequestResponse>(`/diagnoses/${record.server_id}/review-request`, {
    method: 'POST',
    body: JSON.stringify({ farmer_notes: notes || null }),
  });
  const review = payload.data.review;
  if (!review) throw new Error('The server did not return the review request.');
  await saveDiagnosisReview(localId, review);
  return { review, imageUploaded: true };
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

  await uploadImage(record.sync_uuid, image, 'review');
}

/**
 * Answers a completed review: sends the farmer's reply and, optionally, a new
 * photo. The case goes back to the agriculturists as a pending request.
 */
export async function sendReviewFollowUp(localId: string, reply: string, photoUri?: string | null): Promise<DiagnosticReview> {
  const record = await getLocalDiagnosis(localId);
  if (!record?.server_id) throw new Error('This scan must be synchronized before you can reply.');
  const text = reply.trim();
  if (!text) throw new Error('Write a short reply for the agriculturist.');
  const path = `/diagnoses/${record.server_id}/follow-up`;
  const payload = photoUri
    ? await uploadFile<{ review: DiagnosticReview | null }>(path, photoUri, { fieldName: 'image', mimeType: imageType(photoUri), parameters: { farmer_reply: text } })
    : await api<{ review: DiagnosticReview | null }>(path, { method: 'POST', body: JSON.stringify({ farmer_reply: text }) });
  const review = payload.data.review;
  if (!review) throw new Error('The server did not return the reopened review.');
  await saveDiagnosisReview(localId, review);
  if (photoUri) await replaceLocalDiagnosisImage(localId, photoUri);
  return review;
}

function imageType(uri: string) {
  const extension = uri.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
  return extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
}

/**
 * Marks a completed review as read on this device straight away, then on the
 * server so the farmer's other devices stop showing it as new.
 */
export async function markReviewSeen(localId: string): Promise<void> {
  const record = await getLocalDiagnosis(localId);
  const review = parseDiagnosisReview(record?.review_json ?? null);
  if (!record?.server_id || !isNewReview(review) || !review) return;
  const version = review.version ?? 0;
  await saveDiagnosisReview(localId, { ...review, farmer_seen_at: new Date().toISOString() });
  await queueReviewSeen(localId, version);
  try {
    const payload = await api<{ review: DiagnosticReview | null }>(`/diagnoses/${record.server_id}/review-seen`, { method: 'POST', body: JSON.stringify({ expected_review_version: version }) });
    if (payload.data.review) await saveDiagnosisReview(localId, payload.data.review);
    await clearQueuedReviewSeen(localId, version);
  } catch {
    // The sync loop retries this acknowledgement before pulling server changes.
  }
}

export async function withdrawScanResearchConsent(localId: string): Promise<void> {
  const record = await syncedRecord(localId);
  await api(`/diagnoses/${record.server_id}/research-consent`, { method: 'DELETE' });
  await saveLocalResearchConsent(localId, false);
}

/**
 * Uploads the device photo of a synchronized scan so the farmer's other
 * devices, the web app and agriculturists see it. Research use still needs consent.
 */
export async function uploadSyncedScanImage(record: LocalDiagnosis): Promise<void> {
  const image = localImageFile(record);
  if (!record.sync_uuid || !image) return;
  await uploadImage(record.sync_uuid, image, 'sync');
}

async function syncedRecord(localId: string) {
  const record = await getLocalDiagnosis(localId);
  if (!record) throw new Error('This saved scan could not be found.');
  if (!record.sync_uuid || !record.server_id || record.sync_status !== 'synced') {
    throw new Error('Synchronize this scan with your account first.');
  }
  return record;
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

async function uploadImage(syncUuid: string, image: { uri: string; type: string; name: string }, purpose: 'review' | 'sync') {
  await uploadFile(`/sync/${syncUuid}/image`, image.uri, { fieldName: 'image', mimeType: image.type, parameters: { purpose } });
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'The server could not be reached.';
}
