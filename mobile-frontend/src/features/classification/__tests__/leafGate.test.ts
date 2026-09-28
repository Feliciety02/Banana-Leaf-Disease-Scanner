const mockCheckLeafPhoto = jest.fn();

jest.mock('../../../../modules/dahonmd-tflite', () => ({
  checkLeafPhoto: (...args: unknown[]) => mockCheckLeafPhoto(...args),
}));

import { checkBananaLeafPhoto, decideLeafGate, LEAF_GATE_THRESHOLD } from '../leafGate';

describe('banana leaf photo gate', () => {
  beforeEach(() => mockCheckLeafPhoto.mockReset());

  it('accepts scores at or above the threshold and rejects scores below it', () => {
    expect(decideLeafGate(LEAF_GATE_THRESHOLD)).toBe(true);
    expect(decideLeafGate(0.99)).toBe(true);
    expect(decideLeafGate(LEAF_GATE_THRESHOLD - 0.001)).toBe(false);
    expect(decideLeafGate(0)).toBe(false);
  });

  it('fails closed on invalid scores', () => {
    expect(decideLeafGate(Number.NaN)).toBe(false);
    expect(decideLeafGate(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('blocks a low score when blocking is on', async () => {
    mockCheckLeafPhoto.mockResolvedValue({ score: 0.03, latencyMs: 4.2, modelVersion: 'banana_leaf_gate_fp32' });
    await expect(checkBananaLeafPhoto('file:///prepared.jpg', true)).resolves.toEqual({ accepted: false, wouldReject: true, score: 0.03, latencyMs: 4.2 });
    expect(mockCheckLeafPhoto).toHaveBeenCalledWith('file:///prepared.jpg');
  });

  it('never blocks in shadow mode but still reports what it would reject', async () => {
    mockCheckLeafPhoto.mockResolvedValue({ score: 0.03, latencyMs: 4.2, modelVersion: 'banana_leaf_gate_fp32' });
    await expect(checkBananaLeafPhoto('file:///prepared.jpg', false)).resolves.toEqual({ accepted: true, wouldReject: true, score: 0.03, latencyMs: 4.2 });
  });
});
