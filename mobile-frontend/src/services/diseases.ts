import { Disease } from '../types';
import { API_URL } from './apiConfig';
import { cacheDiseaseCatalog, listCachedDiseases } from './database';
import { fetchWithTimeout } from './http';

type ApiDisease = {
  slug: string;
  name: string;
  scientific_name: string | null;
  description: string;
  symptoms: string[];
  management: string;
  prevention: string | null;
  image_only_limitations: string | null;
  professional_referral: string | null;
  is_verified: boolean;
};

const mapDisease = (disease: ApiDisease): Disease => ({
  id: disease.slug,
  name: disease.name,
  scientific: disease.scientific_name ?? '',
  status: disease.slug === 'healthy' ? 'healthy' : 'warning',
  summary: disease.description,
  symptoms: disease.symptoms,
  management: disease.management,
  prevention: disease.prevention ?? '',
  imageOnlyLimitations: disease.image_only_limitations ?? '',
  professionalReferral: disease.professional_referral ?? '',
  isVerified: disease.is_verified,
});

export async function loadDiseaseCatalog(): Promise<Disease[]> {
  try {
    const response = await fetchWithTimeout(`${API_URL}/diseases`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Disease catalog request failed.');
    const payload = await response.json();
    const catalog = (payload.data as ApiDisease[]).filter((disease) => disease.is_verified).map(mapDisease);
    await cacheDiseaseCatalog(catalog);
    return catalog;
  } catch {
    return listCachedDiseases();
  }
}
