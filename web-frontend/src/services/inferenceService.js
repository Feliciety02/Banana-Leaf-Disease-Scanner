const DEMO_OUTPUT = {
  diseaseId: 'black-sigatoka',
  confidence: 94.2,
  latency: 84,
  model: 'EMV3-INT8 demo',
  probabilities: [
    { label: 'Black Sigatoka', value: 94.2 },
    { label: 'Yellow Sigatoka', value: 3.1 },
    { label: 'Healthy', value: 1.4 },
    { label: 'Fusarium Wilt', value: 0.8 },
    { label: 'Bunchy Top', value: 0.5 },
  ],
};

/**
 * Replace this demo adapter with a POST to the Laravel/Python inference endpoint.
 * Keeping inference outside the view layer also allows a TFLite adapter on mobile.
 */
const API_URL = import.meta.env.VITE_WEB_API_URL ?? 'http://127.0.0.1:8001/api';

export async function analyzeLeaf(imageUrl) {
  try {
    const imageResponse = await fetch(imageUrl);
    const image = await imageResponse.blob();
    const body = new FormData();
    body.append('image', image, 'banana-leaf.jpg');
    const response = await fetch(`${API_URL}/inference`, { method: 'POST', body });
    if (!response.ok) throw new Error('Inference API unavailable');
    const payload = await response.json();
    return payload.data;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1450));
    return DEMO_OUTPUT;
  }
}
