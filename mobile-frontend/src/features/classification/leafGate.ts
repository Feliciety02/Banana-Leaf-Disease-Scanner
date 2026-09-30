import { checkLeafPhoto } from '../../../modules/dahonmd-tflite';

/**
 * Minimum gate score for an image to count as a real plant photo. At 0.5 the
 * v3 gate accepted 98.7% of banana field photos from a source it never saw
 * while blocking most paintings, drawings and objects; see ai/gate/README.md.
 */
export const LEAF_GATE_THRESHOLD = 0.5;

/**
 * When false the gate runs in shadow mode: it still scores every photo (the
 * score is logged) but never blocks a scan. The gate answers "is this a real
 * photo of a plant?" - it blocks paintings, drawings, cartoons and non-plant
 * objects, not other plants (banana-only gates rejected real banana photos
 * from unseen sources; see ai/gate/README.md).
 */
export const LEAF_GATE_BLOCKING = true;

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
