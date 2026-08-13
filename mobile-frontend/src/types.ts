export type DiseaseId = string;

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
  isSimulated: boolean;
};

export type User = { id: number; name: string; email: string; role: 'farmer' | 'admin' };
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
  isVerified: boolean;
};
