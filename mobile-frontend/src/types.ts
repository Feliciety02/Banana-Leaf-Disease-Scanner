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
};

export type User = { id: number; name: string; email: string; role: 'user' | 'admin' };
export type Session = { user: User; token: string; apiUrl: string };

export type Disease = {
  id: DiseaseId;
  name: string;
  scientific: string;
  status: 'healthy' | 'warning' | 'critical';
  summary: string;
  symptoms: string[];
  management: string;
};
