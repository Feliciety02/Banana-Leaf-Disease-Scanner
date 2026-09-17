export const CLASS_ORDER = ['healthy', 'sigatoka', 'panama-disease', 'cordana-leaf-spot'];

export const CLASS_NAMES = {
  healthy: 'Healthy',
  sigatoka: 'Sigatoka',
  'panama-disease': 'Panama Disease',
  'cordana-leaf-spot': 'Cordana Leaf Spot',
};

export function normalizeClassProbabilities(result) {
  const source = result?.probabilities ?? result?.scores;
  let values;

  if (Array.isArray(source) && source.every((item) => typeof item === 'number')) {
    if (source.length !== CLASS_ORDER.length) return [];
    values = Object.fromEntries(CLASS_ORDER.map((classKey, index) => [classKey, source[index]]));
  } else if (Array.isArray(source)) {
    if (source.length !== CLASS_ORDER.length) return [];
    values = Object.fromEntries(source.map((item) => [item.classKey ?? item.class_name, item.probability]));
  } else if (source && typeof source === 'object') {
    values = source;
  } else {
    return [];
  }

  const probabilities = CLASS_ORDER.map((classKey) => ({ classKey, probability: Number(values[classKey]) }));
  if (probabilities.some(({ probability }) => !Number.isFinite(probability) || probability < 0 || probability > 1)) return [];
  if (Math.abs(probabilities.reduce((sum, item) => sum + item.probability, 0) - 1) > 0.001) return [];
  return probabilities;
}

export function getHighestClass(probabilities) {
  if (probabilities.length !== CLASS_ORDER.length) return null;
  return probabilities.reduce((highest, current) => current.probability > highest.probability ? current : highest);
}
