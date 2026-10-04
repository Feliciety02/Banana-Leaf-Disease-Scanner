import { farmerReviewOutcome, reviewStage } from '../reviewOutcome';
import type { DiagnosticReview } from '../../../storage/localDiagnoses';

const review = (overrides: Partial<DiagnosticReview>): DiagnosticReview => ({
  id: 1, review_status: 'confirmed', verified_label: null, image_quality: 'good', next_steps: [],
  requires_field_inspection: false, requested_at: null, reviewed_at: null, reviewer: null, farmer_follow_up: null,
  ...overrides,
});

describe('farmerReviewOutcome', () => {
  it('names the disease when the expert agrees', () => {
    const outcome = farmerReviewOutcome(review({ verified_label: 'sigatoka', next_steps: ['monitor_plant'] }), 'sigatoka');
    expect(outcome.title).toBe('Expert says: Black Sigatoka');
    expect(outcome.message).toBe('The expert agrees with your scan.');
    expect(outcome.steps).toEqual(['Check the plant again over the next few days.']);
  });

  it('explains a corrected disease against the scan result', () => {
    const outcome = farmerReviewOutcome(review({ review_status: 'alternate_class', verified_label: 'cordana-leaf-spot' }), 'sigatoka');
    expect(outcome.message).toBe('The expert thinks this is Cordana, not Black Sigatoka.');
  });

  it('describes a healthy assessment without a disease name', () => {
    expect(farmerReviewOutcome(review({ review_status: 'alternate_class', verified_label: 'healthy' }), 'sigatoka').title).toBe('Expert says: no disease seen');
  });

  it('turns step keys into plain instructions and drops unknown ones', () => {
    const outcome = farmerReviewOutcome(review({ review_status: 'cannot_determine', next_steps: ['retake_photo', 'seek_field_inspection', 'other'] }), 'healthy');
    expect(outcome.title).toBe('The expert could not tell from this photo');
    expect(outcome.steps).toHaveLength(2);
  });
});

describe('reviewStage', () => {
  const now = Date.parse('2026-10-04T10:00:00Z');

  it('is waiting until a reviewer holds the case, then in progress while the hold lasts', () => {
    expect(reviewStage(review({ review_status: 'pending' }), now)).toBe('waiting');
    expect(reviewStage(review({ review_status: 'pending', in_progress_until: '2026-10-04T10:20:00Z' }), now)).toBe('in_progress');
    // An expired hold means nobody is working on it any more.
    expect(reviewStage(review({ review_status: 'pending', in_progress_until: '2026-10-04T09:59:00Z' }), now)).toBe('waiting');
  });

  it('is reviewed once an assessment exists, and empty without a request', () => {
    expect(reviewStage(review({ review_status: 'cannot_determine' }), now)).toBe('reviewed');
    expect(reviewStage(null, now)).toBeNull();
  });
});
