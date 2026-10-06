import { api, hasConnectedConfiguration } from './api';
import { CLASS_KEYS } from '../features/classification/disease-data';
import type { ClassKey } from '../features/classification/types';

/** The farmer-facing fields of a verified disease record from `GET /diseases`. */
export type VerifiedDisease = {
  model_class_key: ClassKey;
  name: string;
  description: string | null;
  symptoms: string[];
  management: string | null;
  prevention: string | null;
  professional_referral: string | null;
  image_only_limitations: string | null;
  verified_at: string | null;
  sources?: { id: number; title: string; authors: string; year: number | null }[];
};

let cached: Partial<Record<ClassKey, VerifiedDisease>> | null = null;

/**
 * Loads the agriculturist-verified knowledge records, the same content the website
 * shows. Returns null when no server is configured or it cannot be reached, so
 * callers fall back to the guidance bundled with the app.
 */
export async function loadVerifiedDiseases(): Promise<Partial<Record<ClassKey, VerifiedDisease>> | null> {
  if (!hasConnectedConfiguration()) return cached;
  try {
    const payload = await api<VerifiedDisease[]>('/diseases');
    const records: Partial<Record<ClassKey, VerifiedDisease>> = {};
    for (const item of payload.data) {
      if ((CLASS_KEYS as readonly string[]).includes(item.model_class_key)) records[item.model_class_key] = item;
    }
    cached = records;
  } catch {
    // Keep the last loaded content (if any); the bundled guide covers the rest.
  }
  return cached;
}
