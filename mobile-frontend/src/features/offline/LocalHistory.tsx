import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { CLASS_DISPLAY_NAMES } from '../classification/disease-data';
import type { ClassKey } from '../classification/types';
import {
  claimLocalOnlyDiagnoses,
  listLocalDiagnoses,
  parseDiagnosisReview,
  requestLocalDiagnosisDeletion,
  retryLocalDiagnosis,
  subscribeToLocalDiagnosisChanges,
  type LocalDiagnosis,
  type LocalSyncStatus,
} from '../../storage/localDiagnoses';
import { synchronizeDiagnoses } from '../../services/diagnosisSync';
import { hasLocalScanImage, requestAgriculturalReview, shareScanForResearch, uploadReviewImage, withdrawScanResearchConsent } from '../../services/diagnosisReview';
import { ImageViewer } from '../../components/ImageViewer';
import { ActionButton, ConfirmSheet, formatDate, palette, titleCase } from '../connected/ui';
import { ProbabilityRow } from '../scan/ProbabilityRow';
import { authenticatedImageSource } from '../../services/api';
import type { PredictionResult } from '../../types/prediction';

const statusCopy: Record<LocalSyncStatus, { label: string; color: string }> = {
  local_only: { label: 'Only on this device', color: palette.muted },
  pending: { label: 'Waiting to sync', color: '#856617' },
  syncing: { label: 'Syncing', color: palette.green },
  synced: { label: 'Synced', color: palette.green },
  failed: { label: 'Needs retry', color: '#a13a2f' },
  pending_delete: { label: 'Waiting to delete', color: '#856617' },
  delete_failed: { label: 'Delete needs retry', color: '#a13a2f' },
};
const clampPercent = (value: number) => `${Math.min(99.99, Math.max(0, value)).toFixed(2)}%`;
const LOW_CONFIDENCE = 70;
// The CSV carries the baseline-vs-enhanced research comparison, so it is only
// offered in development builds, not to farmers.
const SHOW_RESEARCH_EXPORT = __DEV__;

export function LocalHistory({ ownerUserId, refreshKey = 0, onChanged, focusId, onSignIn, onDirtyChange }: { onDirtyChange: (dirty: boolean) => void; focusId?: string | null; onSignIn?: () => void; ownerUserId: number | null; refreshKey?: number; onChanged?: () => void }) {
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
  const [filter, setFilter] = useState<'all' | 'uncertain' | 'retry' | 'review' | 'reviewed'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const records = await listLocalDiagnoses(ownerUserId);
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
      if (item.research_consent) await withdrawScanResearchConsent(item.local_id);
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

  const filterOptions = [
    { key: 'all', label: 'All scans', count: items.length },
    { key: 'uncertain', label: 'Uncertain', count: items.filter((item) => item.confidence < LOW_CONFIDENCE).length },
    { key: 'retry', label: 'Needs retry', count: items.filter((item) => item.sync_status === 'failed' || item.sync_status === 'delete_failed').length },
    { key: 'review', label: 'Review pending', count: items.filter((item) => parseDiagnosisReview(item.review_json)?.review_status === 'pending').length },
    { key: 'reviewed', label: 'Reviewed', count: items.filter((item) => { const review = parseDiagnosisReview(item.review_json); return review && review.review_status !== 'pending'; }).length },
  ] as const;
  const visibleItems = items.filter((item) => filter === 'all' || filter === 'uncertain' && item.confidence < LOW_CONFIDENCE || filter === 'retry' && (item.sync_status === 'failed' || item.sync_status === 'delete_failed') || filter === 'review' && parseDiagnosisReview(item.review_json)?.review_status === 'pending' || filter === 'reviewed' && Boolean(parseDiagnosisReview(item.review_json) && parseDiagnosisReview(item.review_json)?.review_status !== 'pending'));

  return <View style={styles.stack}>
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>History</Text>
        <Text style={styles.count}>{items.length === 1 ? '1 scan' : `${items.length} scans`}</Text>
      </View>
      {SHOW_RESEARCH_EXPORT && (
        <Pressable accessibilityRole="button" accessibilityLabel="Export scan history as CSV" disabled={items.length === 0 || exporting} onPress={exportCsv} style={[styles.exportButton, (items.length === 0 || exporting) && styles.dim]}>
          <Ionicons name="download-outline" size={17} color={palette.green} />
          <Text style={styles.exportText}>{exporting ? 'Exporting…' : 'Export CSV'}</Text>
        </Pressable>
      )}
    </View>
    {ownerUserId && <ActionButton variant="secondary" disabled={busyId !== null} onPress={async () => {
      setBusyId('refresh'); setError('');
      try { await synchronizeDiagnoses(ownerUserId); await load(); onChanged?.(); }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not check for review updates.'); }
      finally { setBusyId(null); }
    }}>{busyId === 'refresh' ? 'Checking...' : 'Check for review updates'}</ActionButton>}
    <View style={styles.filters}>{filterOptions.map((option) => <Pressable key={option.key} accessibilityRole="button" accessibilityState={{ selected: filter === option.key }} onPress={() => setFilter(option.key)} style={[styles.filterButton, filter === option.key && styles.filterActive]}><Text style={[styles.filterText, filter === option.key && styles.filterTextActive]}>{option.label} {option.count}</Text></Pressable>)}</View>
    {error && <Text style={styles.error}>{error}</Text>}
    {loading ? <Text style={styles.muted}>Loading history…</Text> : visibleItems.length ? visibleItems.map((item) => {
      const status = statusCopy[item.sync_status];
      const enhanced = parseComparisonEntry(item.enhanced_json);
      const review = parseDiagnosisReview(item.review_json);
      const canRequestReview = !review && item.server_id != null && item.sync_uuid != null && item.sync_status === 'synced';
      const expanded = expandedId === item.local_id;
      const needsRetry = item.sync_status === 'failed' || item.sync_status === 'delete_failed';
      return <View key={item.local_id} style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Hide scan details' : 'Show scan details'} onPress={() => setExpandedId(expanded ? null : item.local_id)} style={styles.cardRow}>
          {item.image_uri ? <Pressable accessibilityRole="button" accessibilityLabel="View scan image" onPress={() => setViewerImage(item.image_uri)}><Image source={authenticatedImageSource(item.image_uri)} style={styles.thumb} /></Pressable> : <View style={styles.placeholder}><Ionicons name="leaf-outline" size={25} color={palette.green} /></View>}
          <View style={styles.cardCopy}>
            <Text style={styles.cardClass}>{item.confidence < LOW_CONFIDENCE ? 'Uncertain result' : CLASS_DISPLAY_NAMES[item.predicted_class]}</Text>
            <Text style={styles.cardDate}>{formatLocalDate(item.diagnosed_at)}</Text>
            <Text style={[styles.cardStatus, { color: status.color }]}>{review?.review_status === 'pending' ? 'Review pending · ' : ''}{status.label}</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={palette.muted} />
        </Pressable>
        {expanded && (
          <View style={styles.details}>
            <View style={styles.modelBlock}>
              <Text style={styles.modelLine}>{CLASS_DISPLAY_NAMES[item.predicted_class]} · {clampPercent(enhanced ? enhanced.confidence * 100 : item.confidence)}</Text>
              {(enhanced?.probabilities.length ? enhanced.probabilities : parseProbabilities(item)).map(({ classKey, probability }) => <ProbabilityRow key={classKey} label={CLASS_DISPLAY_NAMES[classKey]} probability={probability} selected={classKey === item.predicted_class} />)}
            </View>
            <View style={styles.statusRow}><Ionicons name="cloud-outline" size={14} color={status.color} /><Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text></View>
            {!review && !canRequestReview && item.sync_status !== 'pending_delete' && item.sync_status !== 'delete_failed' && <View style={styles.reviewRequest}>
              <Text style={styles.reviewTitle}>Think this result is inaccurate?</Text>
              <Text style={styles.reviewHint}>{!ownerUserId ? 'Sign in to add this scan to your account, then appeal it for review.' : !item.owner_user_id ? 'Add this scan to your account first. You can appeal after it synchronizes.' : 'Sync this scan before appealing the result.'}</Text>
              {(ownerUserId || onSignIn) && <ActionButton disabled={busyId === item.local_id} onPress={() => !ownerUserId ? onSignIn?.() : !item.owner_user_id ? setClaimCandidate(item) : prepareReview(item)}>{!ownerUserId ? 'Sign in to continue' : !item.owner_user_id ? 'Add this scan to my account' : 'Sync this scan'}</ActionButton>}
            </View>}
            {review && <View style={styles.reviewProgress} accessibilityLabel={review.review_status === 'pending' ? 'Review requested, awaiting review' : 'Review completed'}>
              {['Requested', 'Awaiting review', 'Reviewed'].map((label, index) => <View key={label} style={styles.reviewStep}>
                <Ionicons name={index === 0 || review.review_status !== 'pending' ? 'checkmark-circle' : index === 1 ? 'time-outline' : 'ellipse-outline'} size={20} color={index === 2 && review.review_status === 'pending' ? palette.muted : palette.green} />
                <Text style={styles.reviewHint}>{label}</Text>
              </View>)}
            </View>}
            {canRequestReview && (
              <View style={styles.reviewRequest}>
                <View style={styles.reviewHeading}><Ionicons name="shield-checkmark-outline" size={18} color={palette.green} /><Text style={styles.reviewTitle}>Appeal this scan result</Text></View>
                <Text style={styles.reviewHint}>Tell the reviewer why the AI result seems inaccurate. Submitting the appeal uploads this scan photo and your notes.</Text>
                <TextInput style={styles.reviewInput} placeholder="What looks inaccurate? (optional)" placeholderTextColor="#8a9892" maxLength={1000} value={reviewDraft[item.local_id] ?? item.farmer_notes ?? ''} onChangeText={(text) => setReviewDraft((current) => ({ ...current, [item.local_id]: text }))} />
                <Pressable accessibilityRole="button" disabled={busyId === item.local_id} onPress={() => setAppealCandidate(item)} style={[styles.reviewButton, busyId === item.local_id && styles.dim]}>
                  <Ionicons name="shield-checkmark" size={16} color="#fff" /><Text style={styles.reviewButtonText}>{busyId === item.local_id ? 'Submitting…' : 'Appeal result'}</Text>
                </Pressable>
              </View>
            )}
            {review && review.review_status === 'pending' && (
              <View style={styles.reviewPending}>
                <View style={styles.reviewHeading}><Ionicons name="shield-checkmark" size={18} color={palette.warning} /><Text style={[styles.reviewTitle, { color: palette.warning }]}>Review requested</Text></View>
                <Text style={styles.reviewHint}>{review.farmer_follow_up || 'An agricultural reviewer can assess this saved scan.'}</Text>
                {review.requested_at && <Text style={styles.reviewMeta}>Requested {formatDate(review.requested_at, true)}</Text>}
                {hasLocalScanImage(item) && (
                  <Pressable accessibilityRole="button" disabled={busyId === item.local_id} onPress={() => resendImage(item)} style={styles.reviewRetryButton}>
                    <Ionicons name="cloud-upload-outline" size={15} color={palette.green} /><Text style={styles.reviewRetryText}>{busyId === item.local_id ? 'Sending…' : 'Send the scan image'}</Text>
                  </Pressable>
                )}
              </View>
            )}
            {review && review.review_status !== 'pending' && (
              <View style={styles.reviewResult}>
                <View style={styles.reviewHeading}><Ionicons name="shield-checkmark" size={18} color={palette.green} /><Text style={styles.reviewTitle}>Agricultural review available</Text></View>
                <Text style={styles.reviewResultStatus}>{titleCase(review.review_status)}</Text>
                <Text style={styles.reviewLine}><Text style={styles.reviewLineLabel}>DahonMD scan: </Text>{CLASS_DISPLAY_NAMES[item.predicted_class]} ({clampPercent(item.confidence)})</Text>
                {review.verified_label && <Text style={styles.reviewLine}><Text style={styles.reviewLineLabel}>Reviewer assessment: </Text>{titleCase(review.verified_label)}</Text>}
                {review.farmer_follow_up && <Text style={styles.reviewLine}><Text style={styles.reviewLineLabel}>Recommended follow-up: </Text>{review.farmer_follow_up}</Text>}
                {review.next_steps.length > 0 && <Text style={styles.reviewLine}><Text style={styles.reviewLineLabel}>Next steps: </Text>{review.next_steps.map((step) => titleCase(step)).join(' · ')}</Text>}
                {(review.reviewer || review.reviewed_at) && <Text style={styles.reviewMeta}>Reviewed{review.reviewer ? ` by ${review.reviewer.name}` : ''}{review.reviewed_at ? ` · ${formatDate(review.reviewed_at, true)}` : ''}</Text>}
              </View>
            )}
            {Boolean(ownerUserId && item.server_id && item.sync_status === 'synced' && (item.research_consent || hasLocalScanImage(item))) && (
              <View style={styles.reviewRequest}>
                <View style={styles.reviewHeading}><Ionicons name="flask-outline" size={18} color={palette.green} /><Text style={styles.reviewTitle}>{item.research_consent ? 'Shared for research' : 'Help improve DahonMD'}</Text></View>
                <Text style={styles.reviewHint}>{item.research_consent ? 'Reviewers may nominate this photo for a research dataset. You can withdraw until it is approved.' : 'Allow agricultural reviewers to consider this photo for a research dataset. It is never added to training data without a separate approval.'}</Text>
                <Pressable accessibilityRole="button" disabled={busyId === item.local_id} onPress={() => setResearchCandidate(item)} style={[styles.reviewRetryButton, busyId === item.local_id && styles.dim]}>
                  <Ionicons name={item.research_consent ? 'close-circle-outline' : 'share-outline'} size={15} color={palette.green} /><Text style={styles.reviewRetryText}>{busyId === item.local_id ? 'Saving…' : item.research_consent ? 'Withdraw research consent' : 'Share photo for research'}</Text>
                </Pressable>
              </View>
            )}
            {needsRetry && (
              <Pressable accessibilityRole="button" disabled={busyId === item.local_id} onPress={() => retry(item)} style={styles.retryButton}>
                <Ionicons name="refresh" size={15} color={palette.green} /><Text style={styles.retryText}>Retry</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" disabled={busyId === item.local_id || item.sync_status === 'pending_delete'} onPress={() => remove(item)} style={styles.deleteButton}>
              <Ionicons name="trash-outline" size={16} color={palette.danger} /><Text style={styles.deleteText}>{item.sync_status === 'pending_delete' ? 'Deletion queued' : 'Delete scan'}</Text>
            </Pressable>
          </View>
        )}
      </View>;
    }) : <View style={styles.empty}><Ionicons name="leaf-outline" size={30} color={palette.green} /><Text style={styles.emptyTitle}>{items.length ? 'No scans in this view' : 'No saved scans yet.'}</Text><Text style={styles.muted}>{items.length ? 'Try another filter to see your scans.' : 'Your scan results will appear here.'}</Text></View>}
    <ImageViewer uri={viewerImage} visible={viewerImage !== null} onClose={() => setViewerImage(null)} />
    <ConfirmSheet visible={Boolean(appealCandidate)} title="Send this appeal?" text="The scan photo and your notes will be sent to an agricultural reviewer. The original AI result remains in your history for comparison." confirmLabel="Send appeal" danger={false} busy={Boolean(busyId)} onCancel={() => setAppealCandidate(null)} onConfirm={() => { if (appealCandidate) { const item = appealCandidate; setAppealCandidate(null); void requestReview(item); } }} />
    <ConfirmSheet visible={Boolean(researchCandidate)} title={researchCandidate?.research_consent ? 'Withdraw research consent?' : 'Share this photo for research?'} text={researchCandidate?.research_consent ? 'Reviewers will no longer be able to approve this photo for a research dataset.' : 'The scan photo will be uploaded to your account so agricultural reviewers can consider it for a research dataset. You can withdraw until it is approved.'} confirmLabel={researchCandidate?.research_consent ? 'Withdraw consent' : 'Share photo'} danger={Boolean(researchCandidate?.research_consent)} busy={Boolean(busyId)} onCancel={() => setResearchCandidate(null)} onConfirm={() => { if (researchCandidate) { const item = researchCandidate; setResearchCandidate(null); void changeResearchConsent(item); } }} />
    <ConfirmSheet visible={Boolean(claimCandidate)} title="Add this scan?" text="This scan result will be linked to your account and synchronized. You can appeal it after synchronization finishes." confirmLabel="Add and sync" danger={false} busy={Boolean(busyId)} onCancel={() => setClaimCandidate(null)} onConfirm={() => { if (claimCandidate) void prepareReview(claimCandidate); }} />
    <ConfirmSheet visible={Boolean(deleteCandidate)} title="Delete scan?" text={`The saved result and its device image will be removed.${deleteCandidate?.server_id ? ' It will also be removed from your account when synchronization completes.' : ''}`} confirmLabel="Delete scan" busy={Boolean(busyId)} onCancel={() => setDeleteCandidate(null)} onConfirm={confirmRemove} />
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

function formatLocalDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff' },
  filterActive: { backgroundColor: palette.green, borderColor: palette.green },
  filterText: { color: palette.green, fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  headerCopy: { flex: 1 },
  title: { color: palette.ink, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.4 },
  count: { color: '#748078', fontSize: 13, marginTop: 1 },
  exportButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 11, borderRadius: 9, borderWidth: 1, borderColor: '#bdd0c5', backgroundColor: '#fff' },
  exportText: { color: '#2d684b', fontSize: 12, fontWeight: '700' },
  dim: { opacity: 0.5 },
  error: { color: '#8e3028', fontSize: 13, lineHeight: 18, backgroundColor: '#ffeeec', borderWidth: 1, borderColor: '#efc2bd', borderRadius: 12, padding: 11 },
  muted: { color: palette.muted, fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  thumb: { width: 68, height: 68, borderRadius: 8, backgroundColor: '#eef2ef' },
  placeholder: { width: 68, height: 68, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef2ef' },
  cardCopy: { flex: 1, gap: 3 },
  cardClass: { color: '#21382b', fontSize: 16, fontWeight: '700' },
  cardDate: { color: '#758078', fontSize: 12 },
  cardStatus: { fontSize: 12, fontWeight: '700' },
  details: { gap: 10, borderTopWidth: 1, borderTopColor: '#e1e7e3', padding: 14, backgroundColor: '#f6f9f7' },
  modelBlock: { gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e1e7e3' },
  modelLine: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusText: { fontSize: 12, fontWeight: '700' },
  reviewProgress: { flexDirection: 'row', gap: 8, paddingVertical: 10 },
  reviewStep: { flex: 1, alignItems: 'center', gap: 6 },
  reviewRequest: { gap: 9, padding: 12, borderRadius: 10, backgroundColor: palette.greenSoft, borderWidth: 1, borderColor: '#c7ddce' },
  reviewPending: { gap: 7, padding: 12, borderRadius: 12, backgroundColor: palette.warningSoft, borderWidth: 1, borderColor: '#ead596' },
  reviewResult: { gap: 7, padding: 12, borderRadius: 12, backgroundColor: palette.successSoft, borderWidth: 1, borderColor: '#bddfce' },
  reviewHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewTitle: { color: palette.green, fontSize: 13, fontWeight: '800' },
  reviewHint: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  reviewMeta: { color: palette.muted, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  reviewResultStatus: { color: palette.ink, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  reviewLine: { color: palette.ink, fontSize: 12, lineHeight: 18 },
  reviewLineLabel: { color: palette.muted, fontWeight: '800' },
  reviewInput: { minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: '#cbd7d0', backgroundColor: '#fff', paddingHorizontal: 11, color: palette.ink, fontSize: 14 },
  reviewButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 11, backgroundColor: palette.green },
  reviewButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  reviewRetryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 11, borderWidth: 1, borderColor: palette.green, backgroundColor: '#fff' },
  reviewRetryText: { color: palette.green, fontSize: 13, fontWeight: '800' },
  retryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: palette.green, backgroundColor: '#fff' },
  retryText: { color: palette.green, fontSize: 13, fontWeight: '800' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#e7b3ae', backgroundColor: '#fff' },
  deleteText: { color: palette.danger, fontSize: 13, fontWeight: '800' },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: '800' },
});
