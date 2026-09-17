import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChatText } from '../src/utils/chatText.js';

test('normalizes markdown emphasis in assistant replies', () => {
  const input = '**Important** update: *check* the leaf and use [this guide](https://example.com).\n\n- first point\n- second point';
  const output = normalizeChatText(input);

  assert.equal(output, 'Important update: check the leaf and use this guide.\n\n• first point\n• second point');
});

test('keeps plain text intact when there is no markdown', () => {
  const input = 'Healthy leaves look green and firm.';
  assert.equal(normalizeChatText(input), 'Healthy leaves look green and firm.');
});
