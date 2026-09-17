import test from 'node:test';
import assert from 'node:assert/strict';

import { CLASS_ORDER, getHighestClass, normalizeClassProbabilities } from '../src/services/classificationResults.js';

test('normalizes all four classes in the official order and selects the highest score', () => {
  const probabilities = normalizeClassProbabilities({ probabilities: {
    healthy: 0.02,
    sigatoka: 0.9,
    'panama-disease': 0.05,
    'cordana-leaf-spot': 0.03,
  } });

  assert.deepEqual(probabilities.map(({ classKey }) => classKey), CLASS_ORDER);
  assert.equal(getHighestClass(probabilities).classKey, 'sigatoka');
  assert.equal(getHighestClass(probabilities).probability, 0.9);
});

test('accepts the score-array response produced by the inference CLI', () => {
  const probabilities = normalizeClassProbabilities({ scores: [
    { class_name: 'sigatoka', probability: 0.7 },
    { class_name: 'healthy', probability: 0.2 },
    { class_name: 'cordana-leaf-spot', probability: 0.06 },
    { class_name: 'panama-disease', probability: 0.04 },
  ] });

  assert.deepEqual(probabilities.map(({ classKey }) => classKey), CLASS_ORDER);
  assert.equal(getHighestClass(probabilities).classKey, 'sigatoka');
});

test('rejects incomplete or invalid distributions', () => {
  assert.deepEqual(normalizeClassProbabilities({ probabilities: [] }), []);
  assert.deepEqual(normalizeClassProbabilities({ probabilities: { healthy: 0.7, sigatoka: 0.3 } }), []);
  assert.deepEqual(normalizeClassProbabilities({ probabilities: [0.2, 0.2, 0.2, 0.2] }), []);
});
