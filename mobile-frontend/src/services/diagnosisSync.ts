import { api, currentServerUrl, resolveServerUrl } from './api';
import { predictionDetails } from './predictionDetails';
import { uploadSyncedScanImage } from './diagnosisReview';
import { notifyNewReviews } from './reviewNotifications';
import {
  applyRemoteDeletion,
  clearQueuedReviewSeen,
  completeLocalDeletion,
  getPendingDeletions,
  getPendingDiagnoses,
  queuedReviewSeen,
  getSyncCursor,
  markBatchFailed,
  markDeletionFailed,
  markDiagnosesSyncing,
  markDiagnosisFailed,
  markDiagnosisSynced,
  restoreRefusedDeletion,
  saveRemoteImageUrl,
  serverDiagnosisIdsMissingPhoto,
  setSyncCursor,
  syncedDiagnosesWithLocalPhoto,
  type RemoteDiagnosis,
  upsertRemoteDiagnosis,
} from '../storage/localDiagnoses';

type SyncResult = {
  sync_uuid: string | null;
  status: 'created' | 'already_synchronized' | 'rejected';
  diagnosis_id?: number | null;
  errors?: Record<string, string[]>;
};

type DeletionResult = {
  server_id: number | null;
  sync_uuid?: string | null;
  status: 'deleted' | 'already_deleted' | 'rejected';
  errors?: Record<string, string[]>;
};

type PullChange =
  | { type: 'upsert'; diagnosis: RemoteDiagnosis }
  | { type: 'delete'; server_id: number; sync_uuid?: string | null; deleted_at?: string | null };

type PullPage = {
  changes: PullChange[];
  next_cursor: string | null;
  has_more: boolean;
};

export type SyncSummary = {
  pushed: number;
  rejected: number;
  pulled: number;
  deleted: number;
};

const activeSyncs = new Map<number, Promise<SyncSummary>>();
const reconciledPhotos = new Set<string>();

export function synchronizeDiagnoses(ownerUserId: number) {
  const current = activeSyncs.get(ownerUserId);
  if (current) return current;
  const next = runSync(ownerUserId).finally(() => { activeSyncs.delete(ownerUserId); });
  activeSyncs.set(ownerUserId, next);
  return next;
}

async function runSync(ownerUserId: number): Promise<SyncSummary> {
  const pending = await getPendingDiagnoses(ownerUserId);
  const deletions = await getPendingDeletions(ownerUserId);
  let pushed = 0;
  let rejected = 0;
  let deleted = 0;

  if (pending.length || deletions.length) {
    await markDiagnosesSyncing(pending.map((item) => item.local_id));
    try {
      const response = await api<{ results: SyncResult[]; deletion_results: DeletionResult[] }>('/sync', {
        method: 'POST',
        body: JSON.stringify({
          diagnoses: pending.map((item) => ({
            sync_uuid: item.sync_uuid,
            predicted_class: item.predicted_class,
            confidence: item.confidence,
            model_version: item.model_version,
            inference_time_ms: item.inference_time_ms,
            farmer_notes: item.farmer_notes,
            diagnosed_at: item.diagnosed_at,
            source: 'mobile',
            ...(item.latitude != null && item.longitude != null ? { latitude: item.latitude, longitude: item.longitude } : {}),
            ...predictionDetails(item),
          })),
          deletions: deletions.map((item) => ({ server_id: item.server_id, sync_uuid: item.sync_uuid })),
        }),
      });

      const processed = new Set<string>();
      const pendingByUuid = new Map(pending.map((item) => [item.sync_uuid, item]));
      for (const result of response.data.results) {
        if (!result.sync_uuid) continue;
        processed.add(result.sync_uuid);
        if (result.status === 'created' || result.status === 'already_synchronized') {
          const record = pendingByUuid.get(result.sync_uuid);
          try {
            if (record) await uploadSyncedScanImage(record);
          } catch (uploadError) {
            // Retried on the next sync: the push returns already_synchronized and the upload runs again.
            await markDiagnosisFailed(result.sync_uuid, `The scan photo could not be uploaded: ${messageOf(uploadError)}`);
            rejected += 1;
            continue;
          }
          await markDiagnosisSynced(result.sync_uuid, result.diagnosis_id);
          pushed += 1;
        } else {
          await markDiagnosisFailed(result.sync_uuid, firstError(result.errors));
          rejected += 1;
        }
      }
      const deletionItems = new Map(deletions.map((item) => [deletionKey(item.server_id, item.sync_uuid), item]));
      const processedDeletions = new Set<string>();
      for (const result of response.data.deletion_results) {
        const key = deletionKey(result.server_id, result.sync_uuid);
        const item = deletionItems.get(key);
        processedDeletions.add(key);
        if (result.status === 'deleted' || result.status === 'already_deleted') {
          await completeLocalDeletion(result.server_id, result.sync_uuid);
          deleted += 1;
        } else if (item) {
          // A rejection is the server's final answer; retrying cannot succeed.
          await restoreRefusedDeletion(item.local_id, firstError(result.errors));
          rejected += 1;
        }
      }
      for (const item of pending) {
        if (item.sync_uuid && !processed.has(item.sync_uuid)) {
          await markDiagnosisFailed(item.sync_uuid, 'The server did not acknowledge this record. It will be retried.');
          rejected += 1;
        }
      }
      for (const item of deletions) {
        if (!processedDeletions.has(deletionKey(item.server_id, item.sync_uuid))) {
          await markDeletionFailed(item.local_id, 'The server did not acknowledge this deletion. It will be retried.');
          rejected += 1;
        }
      }
    } catch (error) {
      await markBatchFailed(pending.map((item) => item.local_id), messageOf(error));
      for (const item of deletions) {
        await markDeletionFailed(item.local_id, messageOf(error));
      }
      throw error;
    }
  }

  for (const item of await queuedReviewSeen(ownerUserId)) {
    if (item.pending_seen_version == null || item.server_id == null) continue;
    try {
      await api(`/diagnoses/${item.server_id}/review-seen`, { method: 'POST', body: JSON.stringify({ expected_review_version: item.pending_seen_version }) });
      await clearQueuedReviewSeen(item.local_id, item.pending_seen_version);
    } catch {
      // Keep the acknowledgement for the next sync. A newer verdict clears stale ones on pull.
    }
  }
  const pulled = await pullServerChanges(ownerUserId);
  await reconcileMissingPhotos(ownerUserId);
  // Also runs in the background task, so an answer can reach a farmer who is not in the app.
  await notifyNewReviews(ownerUserId).catch(() => 0);
  return { pushed, rejected, pulled, deleted };
}

/**
 * Fills photo gaps in both directions: shows server photos this device lacks,
 * and uploads device photos of scans that synced before every photo was sent.
 */
/**
 * Uploads every photo on this device that the server does not have yet, even
 * if this session already checked. Returns how many could not be sent, so
 * signing out never silently deletes the only copy of a farmer's photo.
 */
export async function uploadUnsentPhotos(ownerUserId: number): Promise<number> {
  reconciledPhotos.delete(`${currentServerUrl()}|${ownerUserId}`);
  const unsentBefore = (await syncedDiagnosesWithLocalPhoto(ownerUserId)).length;
  if (!unsentBefore) return 0;
  const failed = await reconcileMissingPhotos(ownerUserId);
  return failed === null ? unsentBefore : failed;
}

/** Returns the number of uploads that failed, or null when the server could not be checked. */
async function reconcileMissingPhotos(ownerUserId: number): Promise<number | null> {
  const key = `${currentServerUrl()}|${ownerUserId}`;
  if (reconciledPhotos.has(key)) return 0;
  const missing = new Set(await serverDiagnosisIdsMissingPhoto(ownerUserId));
  const unsent = new Map((await syncedDiagnosesWithLocalPhoto(ownerUserId)).map((record) => [record.server_id as number, record]));
  if (!missing.size && !unsent.size) { reconciledPhotos.add(key); return 0; }

  try {
    let uploadFailures = 0;
    let page = 1;
    let lastPage = 1;
    do {
      const response = await api<{ items: Array<{ id: number; image_url: string | null }>; pagination: { last_page: number } }>(`/diagnoses?per_page=100&page=${page}`);
      for (const item of response.data.items) {
        if (missing.has(item.id) && item.image_url) {
          const url = resolveServerUrl(item.image_url);
          if (url) { await saveRemoteImageUrl(ownerUserId, item.id, url); missing.delete(item.id); }
        }
        const record = unsent.get(item.id);
        if (record) {
          unsent.delete(item.id);
          if (!item.image_url) {
            try { await uploadSyncedScanImage(record); } catch { uploadFailures += 1; }
          }
        }
      }
      lastPage = response.data.pagination.last_page;
      page += 1;
    } while ((missing.size || unsent.size) && page <= lastPage);
    // A failed upload is retried on the next synchronization.
    if (!uploadFailures) reconciledPhotos.add(key);
    return uploadFailures;
  } catch {
    // Image repair is best effort; normal scan synchronization already succeeded.
    return null;
  }
}

function deletionKey(serverId?: number | null, syncUuid?: string | null) {
  return syncUuid ? `uuid:${syncUuid}` : `server:${serverId ?? 'missing'}`;
}

async function pullServerChanges(ownerUserId: number) {
  let cursor = await getSyncCursor(ownerUserId);
  let pulled = 0;
  let hasMore = false;

  do {
    const query = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : '?limit=100';
    const response = await api<PullPage>(`/sync${query}`);
    for (const change of response.data.changes) {
      if (change.type === 'delete') {
        await applyRemoteDeletion(change.server_id, change.sync_uuid);
      } else {
        await upsertRemoteDiagnosis({
          ...change.diagnosis,
          image_url: resolveServerUrl(change.diagnosis.image_url),
        }, ownerUserId);
      }
      pulled += 1;
    }
    const nextCursor = response.data.next_cursor;
    hasMore = response.data.has_more;
    if (nextCursor) {
      if (hasMore && nextCursor === cursor) throw new Error('The server returned a stalled synchronization cursor.');
      await setSyncCursor(ownerUserId, nextCursor);
      cursor = nextCursor;
    } else if (hasMore) {
      throw new Error('The server did not provide the next synchronization cursor.');
    }
  } while (hasMore);

  return pulled;
}

function firstError(errors?: Record<string, string[]>) {
  const message = Object.values(errors ?? {}).flat().find(Boolean);
  return message || 'The server rejected this record. Correct the data and try again.';
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Synchronization failed. It will be retried when a connection is available.';
}
