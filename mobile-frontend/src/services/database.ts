import * as SQLite from 'expo-sqlite';
import { Diagnosis, Disease } from '../types';

const dbPromise = SQLite.openDatabaseAsync('dahonmd-field.db');

export async function initializeDatabase() {
  const db = await dbPromise;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS diagnoses (
      id TEXT PRIMARY KEY NOT NULL,
      owner_id INTEGER,
      disease_id TEXT NOT NULL,
      confidence REAL NOT NULL,
      latency INTEGER NOT NULL,
      image_uri TEXT,
      model_version TEXT NOT NULL,
      diagnosed_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      sync_error TEXT,
      is_simulated INTEGER NOT NULL DEFAULT 1,
      research_consent INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS disease_catalog (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(diagnoses)');
  if (!columns.some((column) => column.name === 'owner_id')) await db.execAsync('ALTER TABLE diagnoses ADD COLUMN owner_id INTEGER;');
  if (!columns.some((column) => column.name === 'is_simulated')) await db.execAsync('ALTER TABLE diagnoses ADD COLUMN is_simulated INTEGER NOT NULL DEFAULT 1;');
  if (!columns.some((column) => column.name === 'sync_attempts')) await db.execAsync('ALTER TABLE diagnoses ADD COLUMN sync_attempts INTEGER NOT NULL DEFAULT 0;');
  if (!columns.some((column) => column.name === 'sync_error')) await db.execAsync('ALTER TABLE diagnoses ADD COLUMN sync_error TEXT;');
  if (!columns.some((column) => column.name === 'research_consent')) await db.execAsync('ALTER TABLE diagnoses ADD COLUMN research_consent INTEGER NOT NULL DEFAULT 0;');
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS diagnoses_owner_date_idx
      ON diagnoses (owner_id, diagnosed_at DESC);
    CREATE INDEX IF NOT EXISTS diagnoses_owner_sync_idx
      ON diagnoses (owner_id, synced);
  `);
}

export async function cacheDiseaseCatalog(diseases: Disease[]) {
  const db = await dbPromise;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM disease_catalog');
    for (const disease of diseases) {
      await db.runAsync(
        'INSERT OR REPLACE INTO disease_catalog (id, payload, updated_at) VALUES (?, ?, ?)',
        disease.id,
        JSON.stringify(disease),
        new Date().toISOString(),
      );
    }
  });
}

export async function listCachedDiseases(): Promise<Disease[]> {
  const db = await dbPromise;
  const rows = await db.getAllAsync<{ payload: string }>('SELECT payload FROM disease_catalog ORDER BY id');
  return rows
    .map((row) => JSON.parse(row.payload) as Disease)
    .map((disease) => ({ ...disease, sources: disease.sources ?? [] }))
    .filter((disease) => disease.isVerified === true);
}

function mapDiagnosisRow(row: {
  id: string; owner_id: number; disease_id: Diagnosis['diseaseId']; confidence: number; latency: number;
  image_uri: string | null; model_version: string; diagnosed_at: string; synced: number; sync_attempts: number; sync_error: string | null; is_simulated: number; research_consent: number;
}): Diagnosis {
  return {
    id: row.id, ownerId: row.owner_id, diseaseId: row.disease_id, confidence: row.confidence, latency: row.latency,
    imageUri: row.image_uri, modelVersion: row.model_version, diagnosedAt: row.diagnosed_at, synced: row.synced === 1, syncAttempts: row.sync_attempts, syncError: row.sync_error, isSimulated: row.is_simulated === 1, researchConsent: row.research_consent === 1,
  };
}

export async function listDiagnoses(ownerId: number, limit = 100): Promise<Diagnosis[]> {
  const db = await dbPromise;
  const rows = await db.getAllAsync<{
    id: string; owner_id: number; disease_id: Diagnosis['diseaseId']; confidence: number; latency: number;
    image_uri: string | null; model_version: string; diagnosed_at: string; synced: number; sync_attempts: number; sync_error: string | null; is_simulated: number; research_consent: number;
  }>('SELECT * FROM diagnoses WHERE owner_id = ? ORDER BY diagnosed_at DESC LIMIT ?', ownerId, limit);
  return rows.map(mapDiagnosisRow);
}

export async function listPendingDiagnoses(ownerId: number, limit = 100): Promise<Diagnosis[]> {
  const db = await dbPromise;
  const rows = await db.getAllAsync<{
    id: string; owner_id: number; disease_id: Diagnosis['diseaseId']; confidence: number; latency: number;
    image_uri: string | null; model_version: string; diagnosed_at: string; synced: number; sync_attempts: number; sync_error: string | null; is_simulated: number; research_consent: number;
  }>('SELECT * FROM diagnoses WHERE owner_id = ? AND synced = 0 ORDER BY diagnosed_at ASC LIMIT ?', ownerId, limit);
  return rows.map(mapDiagnosisRow);
}

export async function countDiagnoses(ownerId: number, synced?: boolean): Promise<number> {
  const db = await dbPromise;
  const row = synced === undefined
    ? await db.getFirstAsync<{ total: number }>('SELECT COUNT(*) AS total FROM diagnoses WHERE owner_id = ?', ownerId)
    : await db.getFirstAsync<{ total: number }>('SELECT COUNT(*) AS total FROM diagnoses WHERE owner_id = ? AND synced = ?', ownerId, synced ? 1 : 0);
  return row?.total ?? 0;
}

export async function listDiagnosisImageUris(): Promise<string[]> {
  const db = await dbPromise;
  const rows = await db.getAllAsync<{ image_uri: string }>('SELECT image_uri FROM diagnoses WHERE image_uri IS NOT NULL');
  return rows.map((row) => row.image_uri);
}

export async function saveDiagnosis(diagnosis: Diagnosis) {
  const db = await dbPromise;
  await db.runAsync(
    `INSERT OR REPLACE INTO diagnoses
      (id, owner_id, disease_id, confidence, latency, image_uri, model_version, diagnosed_at, synced, sync_attempts, sync_error, is_simulated, research_consent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    diagnosis.id, diagnosis.ownerId, diagnosis.diseaseId, diagnosis.confidence, diagnosis.latency, diagnosis.imageUri,
    diagnosis.modelVersion, diagnosis.diagnosedAt, diagnosis.synced ? 1 : 0, diagnosis.syncAttempts ?? 0, diagnosis.syncError ?? null, diagnosis.isSimulated ? 1 : 0, diagnosis.researchConsent ? 1 : 0,
  );
}

export async function markSynced(ids: string[]) {
  if (!ids.length) return;
  const db = await dbPromise;
  await db.withTransactionAsync(async () => {
    for (const id of ids) await db.runAsync('UPDATE diagnoses SET synced = 1, sync_error = NULL WHERE id = ?', id);
  });
}

export async function recordSyncFailure(ids: string[], message: string) {
  if (!ids.length) return;
  const db = await dbPromise;
  await db.withTransactionAsync(async () => {
    for (const id of ids) {
      await db.runAsync('UPDATE diagnoses SET sync_attempts = sync_attempts + 1, sync_error = ? WHERE id = ?', message.slice(0, 500), id);
    }
  });
}

export async function deleteDiagnosis(id: string) {
  const db = await dbPromise;
  await db.runAsync('DELETE FROM diagnoses WHERE id = ?', id);
}

export async function deleteDiagnosesForOwner(ownerId: number): Promise<(string | null)[]> {
  const db = await dbPromise;
  const rows = await db.getAllAsync<{ image_uri: string | null }>(
    'SELECT image_uri FROM diagnoses WHERE owner_id = ?',
    ownerId,
  );
  await db.runAsync('DELETE FROM diagnoses WHERE owner_id = ?', ownerId);
  return rows.map((row) => row.image_uri);
}
