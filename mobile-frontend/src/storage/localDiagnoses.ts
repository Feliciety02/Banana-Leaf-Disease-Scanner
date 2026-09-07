import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import type { ClassKey } from '../features/classification/types';

export type LocalSyncStatus = 'local_only' | 'pending' | 'syncing' | 'synced' | 'failed' | 'pending_delete' | 'delete_failed';

export type LocalDiagnosis = {
  local_id: string;
  sync_uuid: string | null;
  server_id: number | null;
  owner_user_id: number | null;
  predicted_class: ClassKey;
  confidence: number;
  model_version: string | null;
  inference_time_ms: number | null;
  image_uri: string | null;
  farmer_notes: string | null;
  research_consent: number;
  source: 'mobile' | 'web';
  sync_status: LocalSyncStatus;
  last_error: string | null;
  diagnosed_at: string;
  created_at: string;
  updated_at: string;
};

export type RemoteDiagnosis = {
  id: number;
  predicted_class: ClassKey;
  confidence: number;
  model_version?: string | null;
  inference_time_ms?: number | null;
  image_url?: string | null;
  farmer_notes?: string | null;
  research_consent?: boolean;
  source?: 'mobile' | 'web';
  sync_uuid?: string | null;
  diagnosed_at: string;
  created_at?: string;
};

const DATABASE_NAME = 'dahonmd-offline.db';
const SCHEMA_VERSION = 2;
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function initializeLocalDatabase() {
  await database();
}

async function database() {
  if (!databasePromise) databasePromise = openAndMigrate();
  return databasePromise;
}

async function openAndMigrate() {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = version?.user_version ?? 0;
  if (currentVersion < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS local_diagnoses (
        local_id TEXT PRIMARY KEY NOT NULL,
        sync_uuid TEXT UNIQUE,
        server_id INTEGER UNIQUE,
        owner_user_id INTEGER,
        predicted_class TEXT NOT NULL,
        confidence REAL NOT NULL,
        model_version TEXT,
        inference_time_ms INTEGER,
        image_uri TEXT,
        farmer_notes TEXT,
        research_consent INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'mobile',
        sync_status TEXT NOT NULL DEFAULT 'local_only',
        last_error TEXT,
        diagnosed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS local_diagnoses_owner_date
        ON local_diagnoses(owner_user_id, diagnosed_at DESC);
      CREATE INDEX IF NOT EXISTS local_diagnoses_outbox
        ON local_diagnoses(owner_user_id, sync_status, diagnosed_at);
      PRAGMA user_version = 1;
    `);
  }
  if (currentVersion < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_state (
        state_key TEXT PRIMARY KEY NOT NULL,
        state_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }
  return db;
}

export async function saveLocalDiagnosis(input: {
  predictedClass: ClassKey;
  confidence: number;
  modelVersion: string;
  inferenceTimeMs: number;
  imageUri: string;
  ownerUserId: number | null;
}) {
  const db = await database();
  const localId = Crypto.randomUUID();
  const syncUuid = input.ownerUserId ? Crypto.randomUUID() : null;
  const now = new Date().toISOString();
  const storedImageUri = persistImage(input.imageUri, localId);
  const syncStatus: LocalSyncStatus = input.ownerUserId ? 'pending' : 'local_only';

  await db.runAsync(
    `INSERT INTO local_diagnoses (
      local_id, sync_uuid, owner_user_id, predicted_class, confidence,
      model_version, inference_time_ms, image_uri, source, sync_status,
      diagnosed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'mobile', ?, ?, ?, ?)`,
    localId,
    syncUuid,
    input.ownerUserId,
    input.predictedClass,
    input.confidence,
    input.modelVersion,
    Math.max(0, Math.round(input.inferenceTimeMs)),
    storedImageUri,
    syncStatus,
    now,
    now,
    now,
  );

  return db.getFirstAsync<LocalDiagnosis>('SELECT * FROM local_diagnoses WHERE local_id = ?', localId);
}

function persistImage(sourceUri: string, localId: string) {
  const images = new Directory(Paths.document, 'diagnosis-images');
  if (!images.exists) images.create({ intermediates: true, idempotent: true });
  const cleanUri = sourceUri.split(/[?#]/)[0];
  const candidate = cleanUri.split('.').pop()?.toLowerCase();
  const extension = candidate && ['jpg', 'jpeg', 'png', 'webp'].includes(candidate) ? candidate : 'jpg';
  const destination = new File(images, `${localId}.${extension}`);
  new File(sourceUri).copy(destination);
  return destination.uri;
}

export async function listLocalDiagnoses(ownerUserId: number | null, limit = 100) {
  const db = await database();
  if (ownerUserId) {
    return db.getAllAsync<LocalDiagnosis>(
      `SELECT * FROM local_diagnoses
       WHERE owner_user_id = ? OR owner_user_id IS NULL
       ORDER BY diagnosed_at DESC LIMIT ?`,
      ownerUserId,
      limit,
    );
  }
  return db.getAllAsync<LocalDiagnosis>(
    'SELECT * FROM local_diagnoses WHERE owner_user_id IS NULL ORDER BY diagnosed_at DESC LIMIT ?',
    limit,
  );
}

export async function getPendingDiagnoses(ownerUserId: number, limit = 100) {
  const db = await database();
  return db.getAllAsync<LocalDiagnosis>(
    `SELECT * FROM local_diagnoses
     WHERE owner_user_id = ? AND sync_uuid IS NOT NULL AND sync_status IN ('pending', 'failed')
     ORDER BY diagnosed_at ASC LIMIT ?`,
    ownerUserId,
    limit,
  );
}

export async function getPendingDeletions(ownerUserId: number, limit = 100) {
  const db = await database();
  return db.getAllAsync<LocalDiagnosis>(
    `SELECT * FROM local_diagnoses
     WHERE owner_user_id = ? AND (server_id IS NOT NULL OR sync_uuid IS NOT NULL)
       AND sync_status IN ('pending_delete', 'delete_failed')
     ORDER BY updated_at ASC LIMIT ?`,
    ownerUserId,
    limit,
  );
}

export async function countPendingDiagnoses(ownerUserId: number) {
  const db = await database();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM local_diagnoses
     WHERE owner_user_id = ? AND sync_status IN ('pending', 'syncing', 'failed', 'pending_delete', 'delete_failed')`,
    ownerUserId,
  );
  return row?.total ?? 0;
}

export async function markDiagnosesSyncing(localIds: string[]) {
  await updateMany(localIds, 'syncing', null);
}

export async function markDiagnosisSynced(syncUuid: string, serverId?: number | null) {
  const db = await database();
  await db.runAsync(
    `UPDATE local_diagnoses
     SET sync_status = 'synced', server_id = COALESCE(?, server_id), last_error = NULL, updated_at = ?
     WHERE sync_uuid = ?`,
    serverId ?? null,
    new Date().toISOString(),
    syncUuid,
  );
}

export async function markDiagnosisFailed(syncUuid: string, message: string) {
  const db = await database();
  await db.runAsync(
    `UPDATE local_diagnoses SET sync_status = 'failed', last_error = ?, updated_at = ? WHERE sync_uuid = ?`,
    message.slice(0, 1000),
    new Date().toISOString(),
    syncUuid,
  );
}

export async function markDeletionFailed(localId: string, message: string) {
  const db = await database();
  await db.runAsync(
    `UPDATE local_diagnoses SET sync_status = 'delete_failed', last_error = ?, updated_at = ? WHERE local_id = ?`,
    message.slice(0, 1000),
    new Date().toISOString(),
    localId,
  );
}

export async function markBatchFailed(localIds: string[], message: string) {
  await updateMany(localIds, 'failed', message.slice(0, 1000));
}

async function updateMany(localIds: string[], status: LocalSyncStatus, error: string | null) {
  if (!localIds.length) return;
  const db = await database();
  const placeholders = localIds.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE local_diagnoses SET sync_status = ?, last_error = ?, updated_at = ? WHERE local_id IN (${placeholders})`,
    status,
    error,
    new Date().toISOString(),
    ...localIds,
  );
}

export async function upsertRemoteDiagnosis(item: RemoteDiagnosis, ownerUserId: number) {
  const db = await database();
  const now = new Date().toISOString();
  if (item.sync_uuid) {
    const updated = await db.runAsync(
      `UPDATE local_diagnoses SET
        server_id = ?, owner_user_id = ?, predicted_class = ?, confidence = ?, model_version = ?,
        inference_time_ms = ?, image_uri = COALESCE(image_uri, ?), farmer_notes = ?, research_consent = ?,
        source = ?,
        sync_status = CASE WHEN sync_status IN ('pending_delete', 'delete_failed') THEN sync_status ELSE 'synced' END,
        last_error = CASE WHEN sync_status IN ('pending_delete', 'delete_failed') THEN last_error ELSE NULL END,
        diagnosed_at = ?, updated_at = ?
       WHERE sync_uuid = ?`,
      item.id,
      ownerUserId,
      item.predicted_class,
      item.confidence,
      item.model_version ?? null,
      item.inference_time_ms ?? null,
      item.image_url ?? null,
      item.farmer_notes ?? null,
      item.research_consent ? 1 : 0,
      item.source ?? 'mobile',
      item.diagnosed_at,
      now,
      item.sync_uuid,
    );
    if (updated.changes > 0) return;
  }

  await db.runAsync(
    `INSERT INTO local_diagnoses (
      local_id, sync_uuid, server_id, owner_user_id, predicted_class, confidence, model_version,
      inference_time_ms, image_uri, farmer_notes, research_consent, source, sync_status,
      diagnosed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?)
    ON CONFLICT(server_id) DO UPDATE SET
      owner_user_id = excluded.owner_user_id,
      predicted_class = excluded.predicted_class,
      confidence = excluded.confidence,
      model_version = excluded.model_version,
      inference_time_ms = excluded.inference_time_ms,
      image_uri = COALESCE(local_diagnoses.image_uri, excluded.image_uri),
      farmer_notes = excluded.farmer_notes,
      research_consent = excluded.research_consent,
      source = excluded.source,
      sync_status = CASE WHEN local_diagnoses.sync_status IN ('pending_delete', 'delete_failed') THEN local_diagnoses.sync_status ELSE 'synced' END,
      last_error = CASE WHEN local_diagnoses.sync_status IN ('pending_delete', 'delete_failed') THEN local_diagnoses.last_error ELSE NULL END,
      diagnosed_at = excluded.diagnosed_at,
      updated_at = excluded.updated_at`,
    `server:${item.id}`,
    item.sync_uuid ?? null,
    item.id,
    ownerUserId,
    item.predicted_class,
    item.confidence,
    item.model_version ?? null,
    item.inference_time_ms ?? null,
    item.image_url ?? null,
    item.farmer_notes ?? null,
    item.research_consent ? 1 : 0,
    item.source ?? 'web',
    item.diagnosed_at,
    item.created_at ?? now,
    now,
  );
}

export async function getSyncCursor(ownerUserId: number) {
  const db = await database();
  const row = await db.getFirstAsync<{ state_value: string }>(
    'SELECT state_value FROM sync_state WHERE state_key = ?',
    `diagnoses:${ownerUserId}`,
  );
  return row?.state_value ?? null;
}

export async function setSyncCursor(ownerUserId: number, cursor: string) {
  const db = await database();
  await db.runAsync(
    `INSERT INTO sync_state (state_key, state_value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(state_key) DO UPDATE SET state_value = excluded.state_value, updated_at = excluded.updated_at`,
    `diagnoses:${ownerUserId}`,
    cursor,
    new Date().toISOString(),
  );
}

export async function claimLocalOnlyDiagnoses(ownerUserId: number) {
  const db = await database();
  const records = await db.getAllAsync<Pick<LocalDiagnosis, 'local_id'>>(
    `SELECT local_id FROM local_diagnoses WHERE owner_user_id IS NULL AND sync_status = 'local_only'`,
  );
  if (!records.length) return 0;

  await db.withTransactionAsync(async () => {
    const now = new Date().toISOString();
    for (const record of records) {
      await db.runAsync(
        `UPDATE local_diagnoses
         SET owner_user_id = ?, sync_uuid = ?, sync_status = 'pending', last_error = NULL, updated_at = ?
         WHERE local_id = ? AND owner_user_id IS NULL`,
        ownerUserId,
        Crypto.randomUUID(),
        now,
        record.local_id,
      );
    }
  });
  return records.length;
}

export async function countLocalOnlyDiagnoses() {
  const db = await database();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM local_diagnoses WHERE owner_user_id IS NULL AND sync_status = 'local_only'`,
  );
  return row?.total ?? 0;
}

export async function deleteLocalAccountData(ownerUserId: number) {
  const db = await database();
  const records = await db.getAllAsync<Pick<LocalDiagnosis, 'image_uri'>>(
    'SELECT image_uri FROM local_diagnoses WHERE owner_user_id = ?',
    ownerUserId,
  );

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM local_diagnoses WHERE owner_user_id = ?', ownerUserId);
    await db.runAsync('DELETE FROM sync_state WHERE state_key = ?', `diagnoses:${ownerUserId}`);
  });

  for (const record of records) removeStoredImage(record.image_uri);
  return records.length;
}

export async function requestLocalDiagnosisDeletion(localId: string) {
  const db = await database();
  const record = await db.getFirstAsync<LocalDiagnosis>('SELECT * FROM local_diagnoses WHERE local_id = ?', localId);
  if (!record) return 'missing' as const;
  if ((record.server_id || record.sync_uuid) && record.owner_user_id) {
    await db.runAsync(
      `UPDATE local_diagnoses SET sync_status = 'pending_delete', last_error = NULL, updated_at = ? WHERE local_id = ?`,
      new Date().toISOString(),
      localId,
    );
    return 'queued' as const;
  }

  await db.runAsync('DELETE FROM local_diagnoses WHERE local_id = ?', localId);
  removeStoredImage(record.image_uri);
  return 'deleted' as const;
}

export async function retryLocalDiagnosis(localId: string) {
  const db = await database();
  await db.runAsync(
    `UPDATE local_diagnoses SET
       sync_status = CASE WHEN sync_status = 'delete_failed' THEN 'pending_delete' ELSE 'pending' END,
       last_error = NULL, updated_at = ?
     WHERE local_id = ? AND sync_status IN ('failed', 'delete_failed')`,
    new Date().toISOString(),
    localId,
  );
}

export async function applyRemoteDeletion(serverId: number | null, syncUuid?: string | null) {
  const db = await database();
  const record = await db.getFirstAsync<LocalDiagnosis>(
    `SELECT * FROM local_diagnoses
     WHERE (? IS NOT NULL AND server_id = ?) OR (? IS NOT NULL AND sync_uuid = ?)`,
    serverId,
    serverId,
    syncUuid ?? null,
    syncUuid ?? null,
  );
  if (!record) return false;
  await db.runAsync('DELETE FROM local_diagnoses WHERE local_id = ?', record.local_id);
  removeStoredImage(record.image_uri);
  return true;
}

export async function completeLocalDeletion(serverId: number | null, syncUuid?: string | null) {
  return applyRemoteDeletion(serverId, syncUuid);
}

function removeStoredImage(uri: string | null) {
  if (!uri || !uri.startsWith(Paths.document.uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // The database deletion remains valid even if the OS already removed the cached file.
  }
}
