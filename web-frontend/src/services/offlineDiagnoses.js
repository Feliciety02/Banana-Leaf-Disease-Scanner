import { api } from './api';

const DATABASE_NAME = 'dahonmd-web-offline';
const DATABASE_VERSION = 2;
const HISTORY_STORE = 'history';
const OUTBOX_STORE = 'diagnosis_outbox';
const DELETION_STORE = 'diagnosis_deletions';
const META_STORE = 'sync_metadata';

let databasePromise;

function database() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support offline storage.'));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(HISTORY_STORE)) db.createObjectStore(HISTORY_STORE, { keyPath: 'user_id' });
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          const store = db.createObjectStore(OUTBOX_STORE, { keyPath: 'sync_uuid' });
          store.createIndex('user_id', 'user_id');
        }
        if (!db.objectStoreNames.contains(DELETION_STORE)) {
          const store = db.createObjectStore(DELETION_STORE, { keyPath: 'key' });
          store.createIndex('user_id', 'user_id');
        }
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Offline storage could not be opened.'));
    });
  }
  return databasePromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Offline storage request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Offline storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Offline storage transaction was cancelled.'));
  });
}

async function store(mode, name) {
  const db = await database();
  return db.transaction(name, mode).objectStore(name);
}

export async function cacheHistory(userId, records) {
  const target = await store('readwrite', HISTORY_STORE);
  await requestResult(target.put({ user_id: userId, records, updated_at: new Date().toISOString() }));
}

export async function readCachedHistory(userId) {
  const target = await store('readonly', HISTORY_STORE);
  return (await requestResult(target.get(userId)))?.records || [];
}

async function readCursor(userId) {
  const target = await store('readonly', META_STORE);
  return (await requestResult(target.get(`diagnoses:${userId}`)))?.cursor || null;
}

async function writeCursor(userId, cursor) {
  if (!cursor) return;
  const target = await store('readwrite', META_STORE);
  await requestResult(target.put({ key: `diagnoses:${userId}`, cursor, updated_at: new Date().toISOString() }));
}

export async function queueWebDiagnosis(userId, record, imageFile, requestReview) {
  const target = await store('readwrite', OUTBOX_STORE);
  const syncUuid = crypto.randomUUID();
  const item = {
    sync_uuid: syncUuid,
    user_id: userId,
    record,
    image_file: record.researchConsent || requestReview ? imageFile || null : null,
    request_review: requestReview,
    last_error: null,
    created_at: new Date().toISOString(),
  };
  await requestResult(target.put(item));
  return pendingRecord(item);
}

export async function listPendingWebDiagnoses(userId) {
  const target = await store('readonly', OUTBOX_STORE);
  const items = await requestResult(target.index('user_id').getAll(userId));
  return items.map(pendingRecord);
}

export async function flushWebDiagnosisOutbox(userId) {
  const target = await store('readonly', OUTBOX_STORE);
  const items = await requestResult(target.index('user_id').getAll(userId));
  let synchronized = 0;

  for (let offset = 0; offset < items.length; offset += 100) {
    const batch = items.slice(offset, offset + 100);
    let results;
    try {
      const response = await api('/sync', {
        method: 'POST',
        body: JSON.stringify({ diagnoses: batch.map((item) => ({
          sync_uuid: item.sync_uuid,
          predicted_class: item.record.diseaseId,
          confidence: item.record.confidence,
          inference_time_ms: item.record.latency,
          model_version: item.record.model || 'simulated-web-adapter',
          farmer_notes: item.record.farmerNotes || null,
          research_consent: Boolean(item.record.researchConsent),
          source: 'web',
          diagnosed_at: item.record.date,
        })) }),
      });
      results = new Map(response.data.results.map((result) => [result.sync_uuid, result]));
    } catch (error) {
      await Promise.all(batch.map((item) => updateFailure(item, error instanceof Error ? error.message : 'Synchronization failed.')));
      throw error;
    }

    for (const item of batch) {
      const result = results.get(item.sync_uuid);
      if (!result) {
        await updateFailure(item, 'The server did not acknowledge this queued result.');
        continue;
      }
      if (!['created', 'already_synchronized'].includes(result.status)) {
        await updateFailure(item, Object.values(result.errors || {}).flat()[0] || 'The server rejected this queued result.');
        continue;
      }
      try {
        if (item.request_review && result.diagnosis_id) {
          await api(`/diagnoses/${result.diagnosis_id}/review-request`, {
            method: 'POST',
            body: JSON.stringify({ farmer_notes: item.record.farmerNotes || null }),
          });
        }
        if ((item.record.researchConsent || item.request_review) && item.image_file) {
          const body = new FormData();
          body.append('image', item.image_file);
          body.append('purpose', item.record.researchConsent ? 'research' : 'review');
          await api(`/sync/${item.sync_uuid}/image`, { method: 'POST', body });
        }
        const writeStore = await store('readwrite', OUTBOX_STORE);
        await requestResult(writeStore.delete(item.sync_uuid));
        synchronized += 1;
      } catch (error) {
        await updateFailure(item, error instanceof Error ? error.message : 'Synchronization follow-up failed.');
      }
    }
  }
  const deleted = await flushDeletionOutbox(userId);
  return { synchronized, deleted };
}

async function flushDeletionOutbox(userId) {
  const target = await store('readonly', DELETION_STORE);
  const items = await requestResult(target.index('user_id').getAll(userId));
  if (!items.length) return 0;

  let deleted = 0;
  for (let offset = 0; offset < items.length; offset += 100) {
    const batch = items.slice(offset, offset + 100);
    const response = await api('/sync', {
      method: 'POST',
      body: JSON.stringify({ deletions: batch.map((item) => ({ server_id: item.server_id, sync_uuid: item.sync_uuid })) }),
    });
    for (const result of response.data.deletion_results || []) {
      const item = batch.find((candidate) => (result.sync_uuid && candidate.sync_uuid === result.sync_uuid)
        || (result.server_id && candidate.server_id === result.server_id));
      if (!item) continue;
      if (result.status === 'deleted' || result.status === 'already_deleted') {
        const writeStore = await store('readwrite', DELETION_STORE);
        await requestResult(writeStore.delete(item.key));
        deleted += 1;
      } else {
        const writeStore = await store('readwrite', DELETION_STORE);
        await requestResult(writeStore.put({
          ...item,
          last_error: Object.values(result.errors || {}).flat()[0] || 'The server rejected this deletion.',
          updated_at: new Date().toISOString(),
        }));
      }
    }
  }
  return deleted;
}

export async function queueWebDiagnosisDeletion(userId, record) {
  let serverId = null;
  let syncUuid = record.syncUuid || null;
  const pending = String(record.id).startsWith('pending:');
  if (pending) {
    syncUuid ||= String(record.id).replace('pending:', '');
  } else {
    serverId = Number(record.id);
    if (!Number.isInteger(serverId) || serverId < 1) throw new Error('This saved result does not have a valid server identifier.');
  }
  const db = await database();
  const transaction = db.transaction(pending ? [OUTBOX_STORE, DELETION_STORE] : [DELETION_STORE], 'readwrite');
  if (pending) transaction.objectStore(OUTBOX_STORE).delete(syncUuid);
  transaction.objectStore(DELETION_STORE).put({
    key: `${userId}:${syncUuid || serverId}`,
    user_id: userId,
    server_id: serverId,
    sync_uuid: syncUuid,
    last_error: null,
    created_at: new Date().toISOString(),
  });
  await transactionDone(transaction);
  const history = await readCachedHistory(userId);
  await cacheHistory(userId, history.filter((item) => item.id !== record.id && item.syncUuid !== record.syncUuid));
}

export async function countPendingWebChanges(userId) {
  const [diagnosisStore, deletionStore] = await Promise.all([
    store('readonly', OUTBOX_STORE),
    store('readonly', DELETION_STORE),
  ]);
  const [diagnoses, deletions] = await Promise.all([
    requestResult(diagnosisStore.index('user_id').count(userId)),
    requestResult(deletionStore.index('user_id').count(userId)),
  ]);
  return diagnoses + deletions;
}

export async function clearWebAccountData(userId, includePending = false) {
  const history = await store('readwrite', HISTORY_STORE);
  await requestResult(history.delete(userId));
  const metadata = await store('readwrite', META_STORE);
  await requestResult(metadata.delete(`diagnoses:${userId}`));
  if (!includePending) return;

  for (const storeName of [OUTBOX_STORE, DELETION_STORE]) {
    const reader = await store('readonly', storeName);
    const keys = await requestResult(reader.index('user_id').getAllKeys(userId));
    if (!keys.length) continue;
    const writer = await store('readwrite', storeName);
    await Promise.all(keys.map((key) => requestResult(writer.delete(key))));
  }
}

export async function pullWebDiagnosisChanges(userId, mapDiagnosis) {
  let cursor = await readCursor(userId);
  let hasMore = false;
  let applied = 0;
  let history = await readCachedHistory(userId);

  do {
    const query = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : '?limit=100';
    const response = await api(`/sync${query}`);
    const records = new Map(history.map((item) => [String(item.id), item]));
    for (const change of response.data.changes || []) {
      if (change.type === 'delete') records.delete(String(change.server_id));
      else {
        const mapped = mapDiagnosis(change.diagnosis);
        records.set(String(mapped.id), mapped);
      }
      applied += 1;
    }
    history = [...records.values()].sort((left, right) => new Date(right.date) - new Date(left.date));
    await cacheHistory(userId, history);
    const nextCursor = response.data.next_cursor;
    hasMore = Boolean(response.data.has_more);
    if (nextCursor) {
      if (hasMore && nextCursor === cursor) throw new Error('The server returned a stalled synchronization cursor.');
      await writeCursor(userId, nextCursor);
      cursor = nextCursor;
    } else if (hasMore) throw new Error('The server did not provide the next synchronization cursor.');
  } while (hasMore);

  return applied;
}

async function updateFailure(item, message) {
  const target = await store('readwrite', OUTBOX_STORE);
  await requestResult(target.put({ ...item, last_error: message, updated_at: new Date().toISOString() }));
}

function pendingRecord(item) {
  return {
    id: `pending:${item.sync_uuid}`,
    syncUuid: item.sync_uuid,
    diseaseId: item.record.diseaseId,
    predictedClass: item.record.diseaseId,
    confidence: Number(item.record.confidence),
    date: item.record.date,
    source: 'web',
    synced: false,
    syncStatus: item.last_error ? 'failed' : 'pending',
    image: null,
    farmerNotes: item.record.farmerNotes || '',
    researchConsent: Boolean(item.record.researchConsent),
    latency: item.record.latency || 0,
    model: item.record.model || 'simulated-web-adapter',
  };
}
