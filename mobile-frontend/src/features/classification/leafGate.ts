import { checkLeafPhoto } from '../../../modules/dahonmd-tflite';

/**
 * Minimum gate score for an image to count as a real banana leaf photo.
 * 0.7 is the strictest cut-off that kept validation acceptance of real banana
 * leaves at its maximum; see ai/gate/README.md for the measured test rates.
 */
export const LEAF_GATE_THRESHOLD = 0.7;

/**
 * When false the gate runs in shadow mode: it still scores every photo (the
 * score is logged) but never blocks a scan. The first gate model rejected
 * real field photos of banana leaves, so blocking stays off until a retrained
 * model is validated on more varied banana photos.
 */
export const LEAF_GATE_BLOCKING = false;

export type LeafGateDecision = { accepted: boolean; score: number; latencyMs: number; wouldReject: boolean };

export function decideLeafGate(score: number, threshold = LEAF_GATE_THRESHOLD): boolean {
  return Number.isFinite(score) && score >= threshold;
}

/** Runs the gate on the prepared 224x224 image. Fails closed if the score is invalid. */
export async function checkBananaLeafPhoto(preparedUri: string, blocking = LEAF_GATE_BLOCKING): Promise<LeafGateDecision> {
  const result = await checkLeafPhoto(preparedUri);
  const passes = decideLeafGate(result.score);
  return { accepted: passes || !blocking, wouldReject: !passes, score: result.score, latencyMs: result.latencyMs };
}
