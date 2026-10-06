import { CLASS_DISPLAY_NAMES } from '../classification/disease-data';
import type { ClassKey } from '../classification/types';
import type { DiagnosticReview } from '../../storage/localDiagnoses';
import { translate, type Language, type StringKey } from '../../i18n';
import { className } from '../../i18n/content';

export type FarmerReviewOutcome = { title: string; message: string; steps: string[] };

/** Where a requested review stands, in the words the farmer sees. */
export function reviewStage(review: DiagnosticReview | null, now = Date.now()): 'waiting' | 'in_progress' | 'reviewed' | null {
  if (!review) return null;
  if (review.review_status !== 'pending') return 'reviewed';
  return review.in_progress_until && Date.parse(review.in_progress_until) > now ? 'in_progress' : 'waiting';
}

/** A follow-up photo is offered only when the expert requested one or found a photo-quality problem. */
export function needsClearerReviewPhoto(review: DiagnosticReview) {
  return review.next_steps.includes('retake_photo') || ['blurry', 'poor_lighting', 'disease_area_not_visible', 'insufficient_image'].includes(review.image_quality ?? '');
}

// Plain-language wording for farmers. The server keeps the original status
// codes and next-step keys; only how they are shown changes here.
const STEP_KEYS = ['retake_photo', 'monitor_plant', 'isolate_affected_plant', 'seek_field_inspection'] as const;

export function farmerReviewOutcome(review: DiagnosticReview, predictedClass: string, language: Language = 'en'): FarmerReviewOutcome {
  const t = (key: StringKey, vars?: Record<string, string>) => translate(language, key, vars);
  const diseaseName = (value: string | null | undefined) => (value && value in CLASS_DISPLAY_NAMES ? className(value as ClassKey, language) : null);
  const steps = review.next_steps
    .filter((step): step is typeof STEP_KEYS[number] => (STEP_KEYS as readonly string[]).includes(step))
    .map((step) => t(`outcome.step.${step}` as StringKey));
  const label = review.review_status === 'confirmed' ? review.verified_label || predictedClass : review.verified_label;

  if ((review.review_status === 'confirmed' || review.review_status === 'alternate_class') && label === 'healthy') {
    return { title: t('outcome.healthyTitle'), message: t('outcome.healthyText'), steps };
  }
  if (review.review_status === 'confirmed' || review.review_status === 'alternate_class') {
    const name = diseaseName(label) ?? t('outcome.differentResult');
    const scanName = diseaseName(predictedClass);
    return {
      title: t('outcome.title', { name }),
      message: review.review_status === 'confirmed' || !scanName ? t('outcome.agrees') : t('outcome.differs', { name, scan: scanName }),
      steps,
    };
  }
  if (review.review_status === 'cannot_determine') {
    return { title: t('outcome.cannotTitle'), message: t('outcome.cannotText'), steps };
  }
  if (review.review_status === 'possible_outside_supported_classes') {
    return { title: t('outcome.outsideTitle'), message: t('outcome.outsideText'), steps };
  }
  return { title: t('outcome.inPersonTitle'), message: t('outcome.inPersonText'), steps: steps.length ? steps : [t('outcome.step.seek_field_inspection')] };
}
