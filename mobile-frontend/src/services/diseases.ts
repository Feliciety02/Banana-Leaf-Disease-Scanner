import { Disease } from '../types';
import { API_URL } from './apiConfig';
import { cacheDiseaseCatalog, listCachedDiseases } from './database';

type ApiDisease = {
  slug: string;
  name: string;
  scientific_name: string | null;
  description: string;
  symptoms: string[];
  management: string;
};

const mapDisease = (disease: ApiDisease): Disease => ({
  id: disease.slug,
  name: disease.name,
  scientific: disease.scientific_name ?? '',
  status: disease.slug === 'healthy' ? 'healthy' : 'warning',
  summary: disease.description,
  symptoms: disease.symptoms,
  management: disease.management,
});

export async function loadDiseaseCatalog(): Promise<Disease[]> {
  try {
    const response = await fetch(`${API_URL}/diseases`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Disease catalog request failed.');
    const payload = await response.json();
    const catalog = (payload.data as ApiDisease[]).map(mapDisease);
    await cacheDiseaseCatalog(catalog);
    return catalog;
  } catch {
    return listCachedDiseases();
  }
}
