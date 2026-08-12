import { api } from './api';

const SAFE_DEVELOPMENT_RESULT = {
  diseaseId: 'development-unconfigured',
  confidence: 0,
  latency: 0,
  model: 'SIMULATED / DEVELOPMENT — trained model pending',
  probabilities: [],
  is_simulated: true,
  is_uncertain: true,
  content_status: 'DISEASE CONTENT PENDING — a validated trained-model label map is not yet available.',
};

export async function analyzeLeaf(imageUrl) {
  try {
    const imageResponse = await fetch(imageUrl);
    const image = await imageResponse.blob();
    const body = new FormData();
    body.append('image', image, 'banana-leaf.jpg');
    const payload = await api('/inference', { method: 'POST', body });
    return payload.data;
  } catch {
    return SAFE_DEVELOPMENT_RESULT;
  }
}
