import { api } from './api';
import { getHighestClass, normalizeClassProbabilities } from './classificationResults';

const SAFE_DEVELOPMENT_RESULT = {
  diseaseId: 'development-unconfigured',
  confidence: 0,
  latency: 0,
  model: 'SIMULATED / DEVELOPMENT — trained model pending',
  probabilities: [],
  is_simulated: true,
  is_uncertain: true,
  content_status: 'DISEASE CONTENT PENDING — a validated trained-model label map is not yet available.',
  service_status: 'unavailable',
  service_message: 'The normal screening service is not connected right now.',
};

export async function analyzeLeaf(imageUrl) {
  try {
    const imageResponse = await fetch(imageUrl);
    const image = await imageResponse.blob();
    const body = new FormData();
    body.append('image', image, 'banana-leaf.jpg');
    const payload = await api('/inference', { method: 'POST', body });
    if (!payload?.data || payload.data.diseaseId === 'development-unconfigured') {
      return { ...SAFE_DEVELOPMENT_RESULT, ...payload?.data, service_status: 'unavailable' };
    }
    const probabilities = normalizeClassProbabilities(payload.data);
    const highest = getHighestClass(probabilities);
    return highest ? {
      ...payload.data,
      diseaseId: highest.classKey,
      confidence: highest.probability * 100,
      probabilities,
    } : payload.data;
  } catch {
    return SAFE_DEVELOPMENT_RESULT;
  }
}
