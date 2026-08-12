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
      is_simulated INTEGER NOT NULL DEFAULT 1
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
  return rows.map((row) => JSON.parse(row.payload) as Disease).filter((disease) => disease.isVerified === true);
}

export async function listDiagnoses(ownerId: number): Promise<Diagnosis[]> {
  const db = await dbPromise;
  const rows = await db.getAllAsync<{
    id: string; owner_id: number; disease_id: Diagnosis['diseaseId']; confidence: number; latency: number;
    image_uri: string | null; model_version: string; diagnosed_at: string; synced: number; is_simulated: number;
  }>('SELECT * FROM diagnoses WHERE owner_id = ? ORDER BY diagnosed_at DESC LIMIT 100', ownerId);
  return rows.map((row) => ({
    id: row.id, ownerId: row.owner_id, diseaseId: row.disease_id, confidence: row.confidence, latency: row.latency,
    imageUri: row.image_uri, modelVersion: row.model_version, diagnosedAt: row.diagnosed_at, synced: row.synced === 1, isSimulated: row.is_simulated === 1,
  }));
}

export async function saveDiagnosis(diagnosis: Diagnosis) {
  const db = await dbPromise;
  await db.runAsync(
    `INSERT OR REPLACE INTO diagnoses
      (id, owner_id, disease_id, confidence, latency, image_uri, model_version, diagnosed_at, synced, is_simulated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    diagnosis.id, diagnosis.ownerId, diagnosis.diseaseId, diagnosis.confidence, diagnosis.latency, diagnosis.imageUri,
    diagnosis.modelVersion, diagnosis.diagnosedAt, diagnosis.synced ? 1 : 0, diagnosis.isSimulated ? 1 : 0,
  );
}

export async function markSynced(ids: string[]) {
  if (!ids.length) return;
  const db = await dbPromise;
  for (const id of ids) await db.runAsync('UPDATE diagnoses SET synced = 1 WHERE id = ?', id);
}

export async function deleteDiagnosis(id: string) {
  const db = await dbPromise;
  await db.runAsync('DELETE FROM diagnoses WHERE id = ?', id);
}
