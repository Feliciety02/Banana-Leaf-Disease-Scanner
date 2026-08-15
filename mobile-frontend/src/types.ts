export type DiseaseId = string;
export type SyncStatus = 'idle' | 'syncing' | 'error';

export type Diagnosis = {
  id: string;
  ownerId: number;
  diseaseId: DiseaseId;
  confidence: number;
  latency: number;
  imageUri: string | null;
  modelVersion: string;
  diagnosedAt: string;
  synced: boolean;
  syncAttempts?: number;
  syncError?: string | null;
  isSimulated: boolean;
  researchConsent: boolean;
};

export type User = { id: number; name: string; email: string; role: 'farmer' | 'agricultural_expert' | 'admin'; email_verified_at?: string | null };
export type Session = { user: User; token: string; apiUrl: string; isPersistent: boolean };

export type Disease = {
  id: DiseaseId;
  name: string;
  scientific: string;
  status: 'healthy' | 'warning' | 'critical';
  summary: string;
  symptoms: string[];
  management: string;
  prevention: string;
  imageOnlyLimitations: string;
  professionalReferral: string;
  sources: Array<{
    id: number;
    title: string;
    authors: string;
    year: number | null;
    journalOrInstitution: string;
    referenceUrl: string | null;
  }>;
  isVerified: boolean;
};
