import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { CLASS_DISPLAY_NAMES } from '../classification/disease-data';
import type { ClassKey } from '../classification/types';
import {
  claimLocalOnlyDiagnoses,
  isNewReview,
  listLocalDiagnoses,
  parseDiagnosisReview,
  requestLocalDiagnosisDeletion,
  retryLocalDiagnosis,
  subscribeToLocalDiagnosisChanges,
  type LocalDiagnosis,
} from '../../storage/localDiagnoses';
import { synchronizeDiagnoses } from '../../services/diagnosisSync';
import { hasLocalScanImage, markReviewSeen, sendReviewFollowUp, requestAgriculturalReview, shareScanForResearch, uploadReviewImage, withdrawScanResearchConsent } from '../../services/diagnosisReview';
import { ImageViewer } from '../../components/ImageViewer';
import { ScanLocationControl } from '../../components/ScanLocationControl';
import { askToNotifyAboutReviews } from '../../services/reviewNotifications';
import { ViewableScanImage } from '../../components/ViewableImage';
import { smoothLayout } from '../../components/motion';
import { ActionButton, ConfirmSheet, formatDate, palette } from '../connected/ui';
import { farmerReviewOutcome, reviewStage } from './reviewOutcome';
import { useT, type StringKey } from '../../i18n';
import { className } from '../../i18n/content';
import { certaintyLevel } from '../scan/ScanResult';
import type { PredictionResult } from '../../types/prediction';

const wholePercent = (value: number) => `${Math.round(Math.min(99, Math.max(0, value)))}%`;
const LOW_CONFIDENCE = 70;
const amber = '#b45a09';
const amberSoft = '#fdf0dc';
/** How sure the app is, in words and theme colours, from a 0-100 confidence (same words as the scan result). */
function confidenceLevel(value: number) {
  const level = certaintyLevel(value / 100);
  if (level.tone === 'sure') return { key: level.key, icon: 'leaf' as const, color: palette.success, background: palette.successSoft };
  if (level.tone === 'likely') return { key: level.key, icon: 'leaf' as const, color: palette.green, background: palette.greenSoft };
  return { key: level.key, icon: 'alert-circle' as const, color: amber, background: amberSoft };
}
// The CSV carries the baseline-vs-enhanced research comparison, so it is only
// offered in development builds, not to farmers.
const SHOW_RESEARCH_EXPORT = __DEV__;

export function LocalHistory({ ownerUserId, refreshKey = 0, onChanged, focusId, onSignIn, onDirtyChange, onAskAssistant, onOpenGuide }: { onOpenGuide?: (classKey: ClassKey) => void; onAskAssistant?: (diagnosisId: number, label: string) => void; onDirtyChange: (dirty: boolean) => void; focusId?: string | null; onSignIn?: () => void; ownerUserId: number | null; refreshKey?: number; onChanged?: () => void }) {
  const { t, language } = useT();
  const [items, setItems] = useState<LocalDiagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<LocalDiagnosis | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(focusId ?? null);
  const [claimCandidate, setClaimCandidate] = useState<LocalDiagnosis | null>(null);
  const [appealCandidate, setAppealCandidate] = useState<LocalDiagnosis | null>(null);
  const [researchCandidate, setResearchCandidate] = useState<LocalDiagnosis | null>(null);
  useEffect(() => { if (focusId) { setExpandedId(focusId); setFilter('all'); } }, [focusId]);
  // Opening a scan with a new expert review marks it as read on every device.
  useEffect(() => {
    const opened = items.find((item) => item.local_id === expandedId);
    if (opened && isNewReview(parseDiagnosisReview(opened.review_json))) void markReviewSeen(opened.local_id);
  }, [expandedId, items]);
  const prepareReview = async (item: LocalDiagnosis) => {
    if (!ownerUserId) { onSignIn?.(); return; }
    setBusyId(item.local_id); setError('');
    try {
      if (!item.owner_user_id) await claimLocalOnlyDiagnoses(ownerUserId, item.local_id);
      await synchronizeDiagnoses(ownerUserId); await load(); onChanged?.(); setClaimCandidate(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sync. Your scan is safe on this phone.'); setClaimCandidate(null); }
    finally { setBusyId(null); }
  };
  const [reviewDraft, setReviewDraft] = useState<Record<string, string>>({});
  useEffect(() => { onDirtyChange(Object.values(reviewDraft).some((value) => Boolean(value.trim()))); return () => onDirtyChange(false); }, [reviewDraft, onDirtyChange]);
  const [filter, setFilter] = useState<'all' | 'uncertain' | 'review' | 'retry'>('all');

  const load = useCallback(async () => {
    try {
      const records = await listLocalDiagnoses(ownerUserId);
      smoothLayout();
      setItems(focusId ? records.sort((a, b) => Number(b.local_id === focusId) - Number(a.local_id === focusId)) : records);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Offline history could not be opened.');
    } finally {
      setLoading(false);
    }
  }, [ownerUserId, focusId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let subscription: { remove: () => void } | null = null;
    const scheduleReload = () => {
      if (!active) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { load(); }, 200);
    };
    subscribeToLocalDiagnosisChanges(scheduleReload).then((value) => {
      if (active) subscription = value;
      else value.remove();
    }).catch(() => undefined);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      subscription?.remove();
    };
  }, [load]);

  const remove = (item: LocalDiagnosis) => setDeleteCandidate(item);
  const confirmRemove = async () => {
    if (!deleteCandidate) return;
    setBusyId(deleteCandidate.local_id);
    try {
      await requestLocalDiagnosisDeletion(deleteCandidate.local_id);
      setDeleteCandidate(null);
      await load();
      onChanged?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The scan could not be deleted.');
      setDeleteCandidate(null);
    } finally {
      setBusyId(null);
    }
  };

  const retry = async (item: LocalDiagnosis) => {
    setBusyId(item.local_id);
    try {
      await retryLocalDiagnosis(item.local_id);
      await load();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  const requestReview = async (item: LocalDiagnosis) => {
    setBusyId(item.local_id);
    setError('');
    try {
      await requestAgriculturalReview(item.local_id, reviewDraft[item.local_id]);
      // Now is when a notification for the answer is useful, so ask here rather than at app start.
      void askToNotifyAboutReviews();
      setReviewDraft((current) => { const next = { ...current }; delete next[item.local_id]; return next; });
      setError('');
      onChanged?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The agricultural review could not be requested.');
    } finally {
      setBusyId(null);
    }
  };

  const changeResearchConsent = async (item: LocalDiagnosis) => {
    setBusyId(item.local_id);
    setError('');
    try {
      if (item.research_consent && item.research_consent_current) await withdrawScanResearchConsent(item.local_id);
      else await shareScanForResearch(item.local_id);
      onChanged?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Research sharing could not be updated.');
    } finally {
      setBusyId(null);
    }
  };

  const resendImage = async (item: LocalDiagnosis) => {
    setBusyId(item.local_id);
    setError('');
    try {
      await uploadReviewImage(item.local_id);
      setError('');
      onChanged?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The scan image could not be sent.');
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = [['diagnosed_at', 'predicted_class', 'confidence_pct', 'inference_time_ms', 'baseline_class', 'baseline_confidence_pct', 'baseline_time_ms', 'enhanced_class', 'enhanced_confidence_pct', 'enhanced_time_ms']];
      for (const item of items) {
        const baseline = parseComparisonEntry(item.baseline_json);
        const enhanced = parseComparisonEntry(item.enhanced_json);
        rows.push([
          item.diagnosed_at,
          item.predicted_class,
          Number(item.confidence).toFixed(2),
          String(item.inference_time_ms ?? ''),
          baseline ? baseline.predictedClass : '',
          baseline ? (baseline.confidence * 100).toFixed(2) : '',
          baseline ? baseline.inferenceTimeMs.toFixed(1) : '',
          enhanced ? enhanced.predictedClass : '',
          enhanced ? (enhanced.confidence * 100).toFixed(2) : '',
          enhanced ? enhanced.inferenceTimeMs.toFixed(1) : '',
        ]);
      }
      const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
      const exportDir = new Directory(Paths.cache, 'dahonmd-exports');
      if (!exportDir.exists) exportDir.create({ intermediates: true, idempotent: true });
      const file = new File(exportDir, 'scan-history.csv');
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'The scan history could not be exported.');
    } finally {
      setExporting(false);
    }
  };

  const isFailed = (item: LocalDiagnosis) => item.sync_status === 'failed' || item.sync_status === 'delete_failed';
  const matchesFilter = (item: LocalDiagnosis, key: typeof filter) => key === 'all'
    || key === 'uncertain' && item.confidence < LOW_CONFIDENCE
    || key === 'review' && Boolean(parseDiagnosisReview(item.review_json))
    || key === 'retry' && isFailed(item);
  const filterOptions = [
    { key: 'all', label: t('history.filterAll') },
    { key: 'uncertain', label: t('history.filterUnsure') },
    { key: 'review', label: t('history.filterReview') },
    { key: 'retry', label: t('history.filterFailed') },
  ] as const;
  const visibleItems = items.filter((item) => matchesFilter(item, filter));
  const failedCount = items.filter(isFailed).length;
  const waitingCount = items.filter((item) => item.sync_status === 'pending' || item.sync_status === 'syncing' || item.sync_status === 'pending_delete').length;
  const syncChip = failedCount ? { label: t('history.failedCount', { count: failedCount }), icon: 'alert-circle' as const, color: palette.danger }
      : waitingCount ? { label: t('history.waitingCount', { count: waitingCount }), icon: 'cloud-upload' as const, color: amber }
        : { label: t('history.upToDate'), icon: 'checkmark-circle' as const, color: palette.success };

  // Failed only appears when something needs retrying.
  const shownFilters = filterOptions.filter((option) => option.key !== 'retry' || failedCount > 0 || filter === 'retry');

  return <View style={styles.stack}>
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>{t('history.title')}</Text>
        <Text style={styles.subtitle}>{t('history.subtitle')}</Text>
      </View>
      <View style={styles.headerActions}>
        {ownerUserId && (
          <View accessible accessibilityLabel={syncChip.label} style={styles.syncChip}>
            <Ionicons name={syncChip.icon} size={22} color={syncChip.color} />
            <Text style={styles.syncChipText}>{syncChip.label}</Text>
          </View>
        )}
        {SHOW_RESEARCH_EXPORT && (
          <Pressable accessibilityRole="button" accessibilityLabel="Export scan history as CSV" disabled={items.length === 0 || exporting} onPress={exportCsv} style={[styles.iconButton, (items.length === 0 || exporting) && styles.dim]}>
            <Ionicons name="download-outline" size={18} color={palette.green} />
          </Pressable>
        )}
      </View>
    </View>
    {items.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {shownFilters.map((option) => {
        const active = filter === option.key;
        return <Pressable key={option.key} accessibilityRole="button" accessibilityState={{ selected: active }} hitSlop={6} onPress={() => { smoothLayout(); setFilter(option.key); }} style={[styles.pill, active && styles.pillActive]}>
          <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>{option.label}</Text>
        </Pressable>;
      })}
    </ScrollView>}
    {error && <Text style={styles.error}>{error}</Text>}
    {loading ? <Text style={styles.muted}>{t('history.loading')}</Text> : visibleItems.length ? visibleItems.map((item) => {
      const enhanced = parseComparisonEntry(item.enhanced_json);
      const review = parseDiagnosisReview(item.review_json);
      const canRequestReview = !review && item.server_id != null && item.sync_uuid != null && item.sync_status === 'synced';
      const expanded = expandedId === item.local_id;
      const needsRetry = item.sync_status === 'failed' || item.sync_status === 'delete_failed';
      const confidence = enhanced ? enhanced.confidence * 100 : item.confidence;
      const level = confidenceLevel(confidence);
      const name = className(item.predicted_class, language);
      const reviewedOutcome = review && review.review_status !== 'pending' ? farmerReviewOutcome(review, item.predicted_class, language) : null;
      const syncText = t(`sync.${item.sync_status}` as StringKey);
      const busy = busyId === item.local_id;
      // Review progress matters most; otherwise show where the scan is saved.
      const note = needsRetry ? { text: syncText, icon: 'alert-circle-outline' as const, color: palette.danger }
        : review?.review_status === 'pending' ? (reviewStage(review) === 'in_progress'
          ? { text: t('history.reviewingNow'), icon: 'eye-outline' as const, color: amber }
          : { text: t('history.waitingExpert'), icon: 'time-outline' as const, color: palette.muted })
          : isNewReview(review) ? { text: t('history.newReview'), icon: 'notifications' as const, color: amber }
          : review ? { text: t('history.reviewed'), icon: 'shield-checkmark-outline' as const, color: palette.success }
            : { text: syncText, icon: item.sync_status === 'synced' ? 'cloud-done-outline' as const : 'phone-portrait-outline' as const, color: item.sync_status === 'synced' ? palette.success : palette.muted };
      // A plain synced scan needs no status line on the card, as in the list design.
      const showNote = needsRetry || Boolean(review) || item.sync_status !== 'synced' && Boolean(ownerUserId);
      const quickAsk = canRequestReview && confidence < LOW_CONFIDENCE && !expanded;
      const others = (enhanced?.probabilities.length ? enhanced.probabilities : parseProbabilities(item))
        .filter(({ classKey, probability }) => classKey !== item.predicted_class && probability >= 0.01)
        .sort((left, right) => right.probability - left.probability)
        .slice(0, 2);
      const canShare = Boolean(ownerUserId && item.server_id && item.sync_status === 'synced' && (item.research_consent || item.image_uri));
      const beforeUpload = !review && !canRequestReview && item.sync_status !== 'pending_delete' && item.sync_status !== 'delete_failed' && Boolean(ownerUserId || onSignIn);
      return <View key={item.local_id} style={[styles.card, expanded && styles.cardOpen]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${reviewedOutcome?.title ?? name}, ${reviewedOutcome ? t('history.aiResult', { name }) : t(level.key)}. ${expanded ? t('history.hideDetails') : t('history.showDetails')}`} accessibilityState={{ expanded }} onPress={() => { smoothLayout(); setExpandedId(expanded ? null : item.local_id); }} style={({ pressed }) => [styles.cardRow, pressed && styles.cardPressed]}>
          <ViewableScanImage uri={item.image_uri} title={name} style={styles.thumb} compact />
          <View style={styles.cardCopy}>
            <Text style={styles.cardName} numberOfLines={2}>{reviewedOutcome?.title ?? name}</Text>
            {reviewedOutcome && <Text style={styles.cardMeta} numberOfLines={1}>{t('history.aiResult', { name })}</Text>}
            <Text style={styles.cardMeta} numberOfLines={1}>{formatShortDate(item.diagnosed_at)}</Text>
            {!reviewedOutcome && <View style={[styles.chip, { backgroundColor: level.background }]}>
              <Ionicons name={level.icon} size={18} color={level.color} />
              <Text style={[styles.chipText, { color: level.color }]}>{t(level.key)}</Text>
            </View>}
            {showNote && <View style={styles.cardStatusRow}>
              <Ionicons name={note.icon} size={17} color={note.color} />
              <Text style={[styles.cardStatus, { color: note.color }]} numberOfLines={1}>{note.text}</Text>
            </View>}
          </View>
          <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={22} color={palette.muted} />
        </Pressable>
        {quickAsk && <Pressable accessibilityRole="button" disabled={busy} onPress={() => setAppealCandidate(item)} style={({ pressed }) => [styles.askButton, (pressed || busy) && styles.dim]}>
          <Ionicons name="person" size={18} color={amber} />
          <Text style={styles.askText}>{busy ? t('history.sending') : t('history.askExpert')}</Text>
        </Pressable>}
        {expanded && (
          <View style={styles.details}>
            <View style={styles.panel}>
              <View style={styles.meterHead}>
                <Text style={styles.panelLabel}>{reviewedOutcome ? t('history.modelConfidence') : t('history.howSure')}</Text>
                <Text style={[styles.meterLabel, { color: level.color }]}>{wholePercent(confidence)}</Text>
              </View>
              <View style={styles.meter}><View style={[styles.meterFill, { width: `${Math.min(100, Math.max(0, confidence))}%`, backgroundColor: level.color }]} /></View>
              {others.length > 0 && <DetailRow icon="git-compare-outline" label={t('history.alsoPossible')} value={others.map(({ classKey, probability }) => `${className(classKey, language)} ${wholePercent(probability * 100)}`).join(', ')} />}
              {item.farmer_notes ? <DetailRow icon="create-outline" label={t('history.yourNote')} value={item.farmer_notes} /> : null}
              <DetailRow icon={note.icon} label={t('history.status')} value={note.text} color={note.color} />
              {item.research_consent ? <DetailRow icon="flask-outline" label={t('history.research')} value={t('history.photoShared')} /> : null}
            </View>
            {item.image_uri ? <Pressable accessibilityRole="button" onPress={() => setViewerImage(item.image_uri)} style={({ pressed }) => [styles.photoButton, pressed && styles.dim]}>
              <Ionicons name="image-outline" size={18} color={palette.green} />
              <Text style={styles.photoButtonText}>{t('history.viewPhoto')}</Text>
            </Pressable> : null}

            {item.last_error ? <Text style={styles.error}>{item.last_error}</Text> : null}

            {review && <View style={[styles.note, review.review_status === 'pending' ? styles.noteWaiting : styles.noteDone]}>
              {review.review_status === 'pending'
                ? <>
                  <Text style={styles.noteTitle}>{reviewStage(review) === 'in_progress' ? t('review.reviewingTitle') : t('review.waitingTitle')}</Text>
                  <View style={styles.progress}>
                    {(() => { const current = reviewStage(review) === 'in_progress' ? 1 : 0; return [t('review.stepSent'), t('review.stepReviewing'), t('review.stepReady')].map((label, index) => <View key={label} style={styles.progressStep}>
                      <Ionicons name={index < current ? 'checkmark-circle' : index === current ? 'ellipse' : 'ellipse-outline'} size={18} color={index <= current ? palette.warning : palette.muted} />
                      <Text style={[styles.progressLabel, index === current && styles.progressCurrent]}>{label}</Text>
                    </View>); })()}
                  </View>
                  <Text style={styles.noteText}>{t('review.notify')}</Text>
                  {review.farmer_reply ? <Text style={styles.noteText}>{t('review.yourReply', { text: review.farmer_reply })}</Text> : null}
                  {review.requested_at ? <Text style={styles.noteMeta}>{t('review.sentAt', { date: formatDate(review.requested_at, true) })}</Text> : null}
                </>
                : (() => { const outcome = farmerReviewOutcome(review, item.predicted_class, language); return <>
                  <Text style={styles.noteTitle}>{outcome.title}</Text>
                  <Text style={styles.noteText}>{outcome.message}</Text>
                  {review.farmer_message ? <>
                    <Text style={[styles.noteText, styles.noteHeading]}>{t('review.messageFrom', { name: review.reviewer?.name ?? t('review.theReviewer') })}</Text>
                    <Text style={styles.noteText}>{review.farmer_message}</Text>
                  </> : null}
                  {outcome.steps.length > 0 ? <>
                    <Text style={[styles.noteText, styles.noteHeading]}>{t('review.whatToDo')}</Text>
                    {outcome.steps.map((step, index) => <Text key={step} style={styles.noteText}>{index + 1}. {step}</Text>)}
                  </> : null}
                  {(review.reviewer || review.reviewed_at) ? <Text style={styles.noteMeta}>{review.reviewer ? t('review.checkedBy', { name: review.reviewer.name }) : t('review.checked')}{review.reviewed_at ? ` · ${formatDate(review.reviewed_at, true)}` : ''}</Text> : null}
                  {review.verified_label && onOpenGuide && review.verified_label in CLASS_DISPLAY_NAMES ? <ActionButton variant="secondary" icon="book-outline" onPress={() => onOpenGuide(review.verified_label as ClassKey)}>{t('review.readGuide', { name: className(review.verified_label as ClassKey, language) })}</ActionButton> : null}
                  {item.server_id && item.sync_status === 'synced' ? <ReviewReply localId={item.local_id} onSent={() => { void load(); onChanged?.(); }} /> : null}
                </>; })()}
            </View>}

            {canRequestReview && <>
              <TextInput style={styles.input} placeholder={t('history.explainPlaceholder')} placeholderTextColor="#8a9892" maxLength={1000} value={reviewDraft[item.local_id] ?? item.farmer_notes ?? ''} onChangeText={(text) => setReviewDraft((current) => ({ ...current, [item.local_id]: text }))} />
              <ActionButton icon="shield-checkmark-outline" disabled={busy} onPress={() => setAppealCandidate(item)}>{busy ? t('history.sending') : t('history.askExpert')}</ActionButton>
            </>}
            {beforeUpload && <ActionButton variant="secondary" disabled={busy} onPress={() => !ownerUserId ? onSignIn?.() : !item.owner_user_id ? setClaimCandidate(item) : prepareReview(item)}>{busy ? t('history.pleaseWait') : !ownerUserId ? t('history.signInToAsk') : !item.owner_user_id ? t('history.addToAccount') : t('history.send')}</ActionButton>}

            {ownerUserId && item.owner_user_id ? <ScanLocationControl key={`${item.local_id}-${item.latitude ?? 'none'}`} localId={item.local_id} onChanged={() => { void load(); }} /> : null}

            <View style={styles.links}>
              {onAskAssistant && item.server_id && item.sync_status === 'synced' && <LinkChip icon="chatbubbles-outline" onPress={() => onAskAssistant(item.server_id as number, name)}>{t('history.askDahon')}</LinkChip>}
              {needsRetry && <LinkChip icon="refresh" disabled={busy} onPress={() => retry(item)}>{t('history.tryAgain')}</LinkChip>}
              {review?.review_status === 'pending' && hasLocalScanImage(item) && <LinkChip icon="cloud-upload-outline" disabled={busy} onPress={() => resendImage(item)}>{t('history.resendPhoto')}</LinkChip>}
              {canShare && <LinkChip icon={item.research_consent && item.research_consent_current ? 'close-circle-outline' : 'flask-outline'} disabled={busy} onPress={() => setResearchCandidate(item)}>{item.research_consent && item.research_consent_current ? t('history.stopSharing') : item.research_consent ? t('history.renewSharing') : t('history.shareResearch')}</LinkChip>}
              <LinkChip icon="trash-outline" danger disabled={busy || item.sync_status === 'pending_delete'} onPress={() => remove(item)}>{item.sync_status === 'pending_delete' ? t('history.deleting') : t('history.delete')}</LinkChip>
            </View>
          </View>
        )}
      </View>;
    }) : <View style={styles.empty}><Ionicons name="leaf-outline" size={28} color={palette.green} /><Text style={styles.emptyTitle}>{items.length ? t('history.nothing') : t('history.noScans')}</Text></View>}
    <ImageViewer uri={viewerImage} visible={viewerImage !== null} onClose={() => setViewerImage(null)} />
    <ConfirmSheet visible={Boolean(appealCandidate)} title={t('confirm.askTitle')} text={t('confirm.askText')} confirmLabel={t('history.send')} danger={false} busy={Boolean(busyId)} onCancel={() => setAppealCandidate(null)} onConfirm={() => { if (appealCandidate) { const item = appealCandidate; setAppealCandidate(null); void requestReview(item); } }} />
    <ConfirmSheet visible={Boolean(researchCandidate)} title={researchCandidate?.research_consent && researchCandidate?.research_consent_current ? t('confirm.stopTitle') : t('confirm.shareTitle')} text={researchCandidate?.research_consent && researchCandidate?.research_consent_current ? t('confirm.stopText') : t('confirm.shareText')} confirmLabel={researchCandidate?.research_consent && researchCandidate?.research_consent_current ? t('history.stopSharing') : t('history.shareResearch')} danger={Boolean(researchCandidate?.research_consent && researchCandidate?.research_consent_current)} busy={Boolean(busyId)} onCancel={() => setResearchCandidate(null)} onConfirm={() => { if (researchCandidate) { const item = researchCandidate; setResearchCandidate(null); void changeResearchConsent(item); } }} />
    <ConfirmSheet visible={Boolean(claimCandidate)} title={t('confirm.addTitle')} text={t('confirm.addText')} confirmLabel={t('confirm.add')} danger={false} busy={Boolean(busyId)} onCancel={() => setClaimCandidate(null)} onConfirm={() => { if (claimCandidate) void prepareReview(claimCandidate); }} />
    <ConfirmSheet visible={Boolean(deleteCandidate)} title={t('confirm.deleteTitle')} text={t('confirm.deleteText')} confirmLabel={t('history.delete')} busy={Boolean(busyId)} onCancel={() => setDeleteCandidate(null)} onConfirm={confirmRemove} />
  </View>;
}

type StoredProbability = { classKey: ClassKey; probability: number };

function parseProbabilities(item: LocalDiagnosis): StoredProbability[] {
  if (!item.probabilities_json) return [];
  try {
    const parsed = JSON.parse(item.probabilities_json) as StoredProbability[];
    return Array.isArray(parsed)
      ? parsed.filter((p) => p && typeof p.probability === 'number' && (p.classKey === 'healthy' || p.classKey === 'sigatoka' || p.classKey === 'panama-disease' || p.classKey === 'cordana-leaf-spot'))
      : [];
  } catch {
    return [];
  }
}

type StoredComparisonEntry = PredictionResult;

function parseComparisonEntry(raw: string | null): StoredComparisonEntry | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredComparisonEntry>;
    if (!value.predictedClass || typeof value.confidence !== 'number') return null;
    return {
      predictedClass: value.predictedClass,
      confidence: value.confidence,
      probabilities: Array.isArray(value.probabilities) && value.probabilities.length ? value.probabilities : [],
      inferenceTimeMs: value.inferenceTimeMs ?? 0,
      model: value.model ?? '',
    };
  } catch {
    return null;
  }
}

type IconName = keyof typeof Ionicons.glyphMap;

function DetailRow({ icon, label, value, color = palette.ink }: { icon: IconName; label: string; value: string; color?: string }) {
  return <View style={styles.detailRow}>
    <Ionicons name={icon} size={16} color={palette.muted} style={styles.detailIcon} />
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, { color }]}>{value}</Text>
  </View>;
}

function LinkChip({ icon, children, onPress, disabled, danger }: { icon: IconName; children: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const color = danger ? palette.danger : palette.green;
  return <Pressable accessibilityRole="button" disabled={disabled} hitSlop={4} onPress={onPress} style={({ pressed }) => [styles.linkChip, danger && styles.linkChipDanger, (pressed || disabled) && styles.dim]}>
    <Ionicons name={icon} size={15} color={color} />
    <Text style={[styles.link, { color }]}>{children}</Text>
  </Pressable>;
}

/** "4 Oct 2026 · 3:33 PM", matching the history design. */
function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** Lets the farmer answer a completed review, optionally with a new photo; the case returns to the agriculturists. */
function ReviewReply({ localId, onSent }: { localId: string; onSent: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async (camera: boolean) => {
    setError('');
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { setError(t('reply.cameraDenied')); return; }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 0.9 };
    const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled) setPhoto(result.assets[0].uri);
  };
  const send = async () => {
    setBusy(true); setError('');
    try { await sendReviewFollowUp(localId, text, photo); setOpen(false); setText(''); setPhoto(null); onSent(); }
    catch (e) { setError(e instanceof Error ? e.message : t('reply.error')); }
    finally { setBusy(false); }
  };
  if (!open) return <ActionButton variant="secondary" icon="chatbubble-ellipses-outline" onPress={() => setOpen(true)}>{t('reply.open')}</ActionButton>;
  return <View style={styles.replyBox}>
    <Text style={[styles.noteText, styles.noteHeading]}>{t('reply.title')}</Text>
    <TextInput style={[styles.input, styles.replyInput]} multiline maxLength={1000} placeholder={t('reply.placeholder')} placeholderTextColor="#8a9892" value={text} onChangeText={setText} />
    {photo ? <View style={styles.replyPhotoRow}>
      <Image source={{ uri: photo }} style={styles.replyPhoto} accessibilityLabel={t('reply.takePhoto')} />
      <ActionButton variant="ghost" disabled={busy} onPress={() => setPhoto(null)}>{t('reply.removePhoto')}</ActionButton>
    </View> : <View style={styles.replyPhotoRow}>
      <ActionButton variant="secondary" icon="camera-outline" disabled={busy} onPress={() => { void pick(true); }}>{t('reply.takePhoto')}</ActionButton>
      <ActionButton variant="secondary" icon="images-outline" disabled={busy} onPress={() => { void pick(false); }}>{t('reply.gallery')}</ActionButton>
    </View>}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Text style={styles.noteMeta}>{t('reply.note')}</Text>
    <View style={styles.replyPhotoRow}>
      <ActionButton variant="ghost" disabled={busy} onPress={() => { setOpen(false); setError(''); }}>{t('reply.cancel')}</ActionButton>
      <ActionButton icon="send-outline" disabled={busy || !text.trim()} onPress={() => { void send(); }}>{busy ? t('reply.sending') : t('reply.send')}</ActionButton>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 2 },
  headerCopy: { flex: 1 },
  title: { color: palette.ink, fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: palette.muted, fontSize: 16, lineHeight: 22, fontWeight: '600', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  syncChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingVertical: 4 },
  syncChipText: { color: palette.ink, fontSize: 15, fontWeight: '600' },
  iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.greenSoft },
  filters: { flexGrow: 1, gap: 10, paddingVertical: 2 },
  pill: { flexGrow: 1, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 999, backgroundColor: '#ecf5f0' },
  pillActive: { backgroundColor: palette.green },
  pillText: { color: palette.green, fontSize: 15, fontWeight: '700' },
  pillTextActive: { color: '#fff' },
  dim: { opacity: 0.5 },
  error: { color: palette.danger, fontSize: 13, lineHeight: 18, backgroundColor: palette.dangerSoft, borderRadius: 10, padding: 10 },
  muted: { color: palette.muted, fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e6ece8', overflow: 'hidden', shadowColor: '#0b2a1c', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardOpen: { borderColor: '#cfe0d6' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, paddingRight: 14 },
  cardPressed: { backgroundColor: '#f7faf8' },
  thumb: { width: 92, height: 86, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.greenSoft },
  cardCopy: { flex: 1, gap: 4 },
  cardName: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  cardMeta: { color: palette.muted, fontSize: 14, fontWeight: '500' },
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', gap: 7, paddingVertical: 6, paddingLeft: 10, paddingRight: 14, borderRadius: 999, marginTop: 2 },
  chipText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  cardStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  cardStatus: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  askButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, marginLeft: 116, marginRight: 14, marginBottom: 14, borderRadius: 10, borderWidth: 1.5, borderColor: amber, backgroundColor: '#fff' },
  askText: { color: amber, fontSize: 15, fontWeight: '800' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailIcon: { marginTop: 1 },
  detailLabel: { color: palette.muted, fontSize: 13, fontWeight: '700', width: 96 },
  detailValue: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  noteMeta: { color: palette.muted, fontSize: 12, fontWeight: '600' },
  replyBox: { gap: 10, marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#dbe5df' },
  replyInput: { minHeight: 84, paddingTop: 10, textAlignVertical: 'top' },
  replyPhotoRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  replyPhoto: { width: 72, height: 72, borderRadius: 10 },
  noteHeading: { color: palette.muted, fontWeight: '800' },
  details: { gap: 12, paddingHorizontal: 12, paddingBottom: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eef2ef' },
  panel: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: '#f6f9f7' },
  panelLabel: { color: palette.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  meterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meter: { height: 8, borderRadius: 999, backgroundColor: '#e3eae6', overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 999 },
  meterLabel: { fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  photoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 10, backgroundColor: palette.greenSoft },
  photoButtonText: { color: palette.green, fontSize: 14, fontWeight: '800' },
  note: { gap: 4, padding: 12, borderRadius: 10 },
  noteWaiting: { backgroundColor: palette.warningSoft },
  noteDone: { backgroundColor: palette.successSoft },
  noteTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  noteText: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  progress: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, paddingVertical: 4 },
  progressStep: { flex: 1, alignItems: 'center', gap: 3 },
  progressLabel: { color: palette.muted, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  progressCurrent: { color: palette.ink, fontWeight: '800' },
  input: { minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: '#cbd7d0', backgroundColor: '#fff', paddingHorizontal: 12, color: palette.ink, fontSize: 14 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#d5e3da', backgroundColor: '#fff' },
  linkChipDanger: { borderColor: '#efcfcb' },
  link: { color: palette.green, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: '800' },
});
