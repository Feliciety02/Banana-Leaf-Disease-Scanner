import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CLASS_DISPLAY_NAMES } from '../classification/disease-data';
import type { ClassKey } from '../classification/types';
import { ScanLocationControl } from '../../components/ScanLocationControl';
import { useT } from '../../i18n';
import { className } from '../../i18n/content';
import type { DiagnosticReview, LocalDiagnosis } from '../../storage/localDiagnoses';
import { formatDate, palette } from '../connected/ui';
import { farmerReviewOutcome, needsClearerReviewPhoto } from './reviewOutcome';

export function FarmerReviewDetails({ item, review, onBack, onOpenPhoto, onOpenGuide, onLocationChanged, reply }: {
  item: LocalDiagnosis;
  review: DiagnosticReview;
  onBack: () => void;
  onOpenPhoto: () => void;
  onOpenGuide?: (classKey: ClassKey) => void;
  onLocationChanged: () => void;
  reply: ReactNode;
}) {
  const { t, language } = useT();
  const outcome = farmerReviewOutcome(review, item.predicted_class, language);
  const verified = review.review_status === 'confirmed' ? review.verified_label || item.predicted_class : review.verified_label;
  const guideClass = verified && verified in CLASS_DISPLAY_NAMES ? verified as ClassKey : null;
  const assessment = guideClass ? className(guideClass, language) : outcome.title;
  const differs = Boolean(guideClass && guideClass !== item.predicted_class);
  const clearerPhoto = needsClearerReviewPhoto(review);
  const steps = clearerPhoto ? outcome.steps.filter((step) => step !== t('outcome.step.retake_photo')) : outcome.steps;
  const reviewerName = review.reviewer?.name ?? t('review.theReviewer');

  return <View style={styles.stack}>
    <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
      <Ionicons name="arrow-back" size={25} color={palette.green} />
      <Text style={styles.backText}>{t('review.detailsTitle')}</Text>
    </Pressable>

    <View style={styles.hero}>
      <View style={styles.completePill}><Ionicons name="checkmark-circle" size={22} color="#fff" /><Text style={styles.completeText}>{t('review.complete')}</Text></View>
      <Text style={styles.eyebrow}>{t('review.assessment')}</Text>
      <View style={styles.assessmentRow}><Text style={styles.assessment}>{assessment}</Text>{guideClass ? <View style={styles.leafArt}><Ionicons name="leaf" size={55} color="#4c9c59" /></View> : null}</View>
      <Text style={styles.assessmentExplanation}>{outcome.message}</Text>
      <View style={styles.reviewer}><Ionicons name="person" size={17} color={palette.green} /><Text style={styles.reviewerText}>{reviewerName}{review.reviewed_at ? `  ·  ${formatDate(review.reviewed_at, true)}` : ''}</Text></View>
      {item.image_uri ? <Pressable accessibilityRole="button" onPress={onOpenPhoto} style={styles.photoLink}><Ionicons name="image-outline" size={23} color={palette.green} /><Text style={styles.photoLinkText}>{t('review.viewSubmittedPhoto')}</Text><Ionicons name="chevron-forward" size={20} color={palette.green} /></Pressable> : null}
    </View>

    {(review.farmer_message || clearerPhoto) ? <View style={styles.messageCard}>
      <View style={styles.rowTop}><Ionicons name="alert-circle" size={25} color="#b45a09" /><Text style={styles.messageTitle}>{t('review.messageFrom', { name: reviewerName })}</Text></View>
      <Text style={styles.messageBody}>{review.farmer_message || t('review.clearerNeeded')}</Text>
      {clearerPhoto ? reply : null}
    </View> : null}

    {steps.length > 0 ? <View style={styles.stepsCard}>
      <Text style={styles.cardTitle}>{t('review.whatToDo')}</Text>
      {steps.map((step, index) => <View key={`${index}-${step}`} style={styles.stepRow}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View><Text style={styles.stepText}>{step}</Text></View>)}
      {guideClass && onOpenGuide ? <Pressable accessibilityRole="button" onPress={() => onOpenGuide(guideClass)} style={styles.outlineButton}><Ionicons name="book-outline" size={21} color={palette.green} /><Text style={styles.outlineText}>{t('review.readGuide', { name: className(guideClass, language) })}</Text></Pressable> : null}
    </View> : null}

    <View style={styles.aiCard}>
      <Text style={styles.aiEyebrow}>{t('review.originalAi')}</Text>
      <View style={styles.aiRow}><Text style={styles.aiName}>{className(item.predicted_class, language)}</Text><Text style={styles.aiBadge}>{t('review.screeningOnly')}</Text></View>
      <Text style={styles.aiScore}>{Math.round(item.confidence)}% {t('review.modelScore')}</Text>
      {differs ? <View style={styles.aiNotice}><Ionicons name="information-circle-outline" size={20} color="#526475" /><Text style={styles.aiNoticeText}>{t('review.aiDiffers')}</Text></View> : null}
    </View>

    {item.owner_user_id ? <View style={styles.locationCard}>
      <View style={styles.rowTop}><Ionicons name="location-outline" size={25} color={palette.green} /><View style={styles.locationCopy}><Text style={styles.cardTitle}>{t('review.locationTitle')}</Text><Text style={styles.locationText}>{t('review.locationHint')}</Text></View></View>
      <ScanLocationControl key={`${item.local_id}-${item.latitude ?? 'none'}`} localId={item.local_id} onChanged={onLocationChanged} />
    </View> : null}

    {!clearerPhoto ? <View style={styles.followUpCard}>{reply}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 16, paddingTop: 8, paddingBottom: 24 },
  back: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backText: { color: palette.ink, fontSize: 21, fontWeight: '800' },
  hero: { gap: 12, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#cfe4d5', backgroundColor: '#f1f8f3' },
  completePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#2b9255' },
  completeText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  eyebrow: { marginTop: 4, color: '#5c6c65', fontSize: 12, letterSpacing: 1, fontWeight: '800', textTransform: 'uppercase' },
  assessmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  assessment: { flex: 1, color: '#063c31', fontSize: 28, lineHeight: 34, fontWeight: '900' },
  assessmentExplanation: { color: '#405e4a', fontSize: 14, lineHeight: 21 },
  leafArt: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', backgroundColor: '#dbeedc' },
  reviewer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewerText: { flex: 1, color: '#344740', fontSize: 14, lineHeight: 21 },
  photoLink: { minHeight: 52, marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#d4e5d9', flexDirection: 'row', alignItems: 'center', gap: 10 },
  photoLinkText: { flex: 1, color: '#075849', fontSize: 15, fontWeight: '800' },
  messageCard: { gap: 12, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: '#f5d494', backgroundColor: '#fff5df' },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  messageTitle: { flex: 1, color: '#953b0d', fontSize: 18, lineHeight: 24, fontWeight: '800' },
  messageBody: { color: palette.ink, fontSize: 16, lineHeight: 24, paddingLeft: 35 },
  stepsCard: { gap: 13, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: '#d6eade', backgroundColor: '#eff8f1' },
  cardTitle: { color: '#063c31', fontSize: 19, lineHeight: 25, fontWeight: '800' },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNumber: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#08715b' },
  stepNumberText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  stepText: { flex: 1, color: palette.ink, fontSize: 16, lineHeight: 24 },
  outlineButton: { minHeight: 52, borderRadius: 13, borderWidth: 1.5, borderColor: '#08715b', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 12 },
  outlineText: { flexShrink: 1, color: '#075849', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  aiCard: { gap: 8, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: '#e1e7e5', backgroundColor: '#f3f6f6' },
  aiEyebrow: { color: '#59666d', fontSize: 14, fontWeight: '800' },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiName: { flex: 1, color: '#0d2629', fontSize: 23, fontWeight: '900' },
  aiBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: '#e3e7e8', color: '#263137', fontSize: 11, fontWeight: '700' },
  aiScore: { color: '#425059', fontSize: 16 },
  aiNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 11, borderRadius: 12, backgroundColor: '#e9eff0' },
  aiNoticeText: { flex: 1, color: '#455e6c', fontSize: 13, lineHeight: 20 },
  locationCard: { gap: 12, padding: 18, borderRadius: 18, borderWidth: 1, borderColor: '#d6eade', backgroundColor: '#eff8f1' },
  locationCopy: { flex: 1, gap: 3 },
  locationText: { color: '#51645a', fontSize: 14, lineHeight: 21 },
  followUpCard: { padding: 4 },
});
