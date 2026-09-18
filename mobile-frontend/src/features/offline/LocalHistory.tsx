import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { CLASS_DISPLAY_NAMES } from '../classification/disease-data';
import type { ClassKey } from '../classification/types';
import {
  listLocalDiagnoses,
  parseDiagnosisReview,
  requestLocalDiagnosisDeletion,
  retryLocalDiagnosis,
  subscribeToLocalDiagnosisChanges,
  type LocalDiagnosis,
  type LocalSyncStatus,
} from '../../storage/localDiagnoses';
import { hasLocalScanImage, requestAgriculturalReview, uploadReviewImage } from '../../services/diagnosisReview';
import { ImageViewer } from '../../components/ImageViewer';
import { formatDate, palette, titleCase } from '../connected/ui';
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

export function LocalHistory({ ownerUserId, refreshKey = 0, onChanged }: { ownerUserId: number | null; refreshKey?: number; onChanged?: () => void }) {
  const [items, setItems] = useState<LocalDiagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listLocalDiagnoses(ownerUserId));
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Offline history could not be opened.');
    } finally {
      setLoading(false);
    }
  }, [ownerUserId]);

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

  const remove = (item: LocalDiagnosis) => {
    const cloudCopy = item.server_id ? ' It will also be removed from your account when synchronization completes.' : '';
    Alert.alert('Delete scan?', `The saved result and its device image will be removed.${cloudCopy}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusyId(item.local_id);
        try {
          await requestLocalDiagnosisDeletion(item.local_id);
          await load();
          onChanged?.();
        } catch (requestError) {
          setError(requestError instanceof Error ? requestError.message : 'The scan could not be deleted.');
        } finally {
          setBusyId(null);
        }
      } },
    ]);
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
      await requestAgriculturalReview(item.local_id);
      setError('');
      onChanged?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The agricultural review could not be requested.');
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

  return <View style={styles.stack}>
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>History</Text>
        <Text style={styles.count}>{items.length === 1 ? '1 scan' : `${items.length} scans`}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Export scan history as CSV" disabled={items.length === 0 || exporting} onPress={exportCsv} style={[styles.exportButton, (items.length === 0 || exporting) && styles.dim]}>
        <Ionicons name="download-outline" size={17} color={palette.green} />
        <Text style={styles.exportText}>{exporting ? 'Exporting…' : 'Export CSV'}</Text>
      </Pressable>
    </View>
    {error && <Text style={styles.error}>{error}</Text>}
    {loading ? <Text style={styles.muted}>Loading history…</Text> : items.length ? items.map((item) => {
      const status = statusCopy[item.sync_status];
      const baseline = parseComparisonEntry(item.baseline_json);
      const enhanced = parseComparisonEntry(item.enhanced_json);
      const review = parseDiagnosisReview(item.review_json);
      const canRequestReview = !review && item.server_id != null && item.sync_uuid != null && item.sync_status === 'synced';
      const expanded = expandedId === item.local_id;
      const needsRetry = item.sync_status === 'failed' || item.sync_status === 'delete_failed';
      return <View key={item.local_id} style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Hide scan details' : 'Show scan details'} onPress={() => setExpandedId(expanded ? null : item.local_id)} style={styles.cardRow}>
          {item.image_uri ? <Pressable accessibilityRole="button" accessibilityLabel="View scan image" onPress={() => setViewerImage(item.image_uri)}><Image source={authenticatedImageSource(item.image_uri)} style={styles.thumb} /></Pressable> : <View style={styles.placeholder}><Ionicons name="leaf-outline" size={25} color={palette.green} /></View>}
          <View style={styles.cardCopy}>
            <Text style={styles.cardClass}>{CLASS_DISPLAY_NAMES[item.predicted_class]}</Text>
            <Text style={styles.cardDate}>{formatLocalDate(item.diagnosed_at)}</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={palette.muted} />
        </Pressable>
        {expanded && (
          <View style={styles.details}>
            {baseline && enhanced && (
              <View style={styles.verdictRow}>
                <Ionicons name={baseline.predictedClass === enhanced.predictedClass ? 'checkmark-circle' : 'swap-horizontal'} size={17} color={baseline.predictedClass === enhanced.predictedClass ? palette.success : palette.warning} />
                <Text style={[styles.verdictText, { color: baseline.predictedClass === enhanced.predictedClass ? palette.success : palette.warning }]}>
                  {baseline.predictedClass === enhanced.predictedClass ? 'Models agree' : 'Different results'}
                </Text>
              </View>
            )}
            <View style={styles.modelBlock}>
              <Text style={styles.modelLine}>Baseline{baseline ? ` · ${clampPercent(baseline.confidence)} · ${baseline.inferenceTimeMs.toFixed(1)}ms` : ' not available'}</Text>
              {baseline?.probabilities && baseline.probabilities.map((item) => <ProbabilityRow key={item.classKey} label={CLASS_DISPLAY_NAMES[item.classKey]} probability={item.probability} selected={item.classKey === baseline.predictedClass} />)}
            </View>
            <View style={styles.modelBlock}>
              <Text style={styles.modelLine}>Enhanced · {clampPercent(enhanced ? enhanced.confidence * 100 : item.confidence)}{enhancedTimeLabel(enhanced, item)}</Text>
              {(enhanced?.probabilities.length ? enhanced.probabilities : parseProbabilities(item)).map(({ classKey, probability }) => <ProbabilityRow key={classKey} label={CLASS_DISPLAY_NAMES[classKey]} probability={probability} selected={classKey === item.predicted_class} />)}
            </View>
            <View style={styles.statusRow}><Ionicons name="cloud-outline" size={14} color={status.color} /><Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text></View>
            {canRequestReview && (
              <View style={styles.reviewRequest}>
                <View style={styles.reviewHeading}><Ionicons name="shield-checkmark-outline" size={18} color={palette.green} /><Text style={styles.reviewTitle}>Agricultural review</Text></View>
                <Text style={styles.reviewHint}>An agricultural reviewer can assess this saved scan. This requires an internet connection.</Text>
                <TextInput style={styles.reviewInput} placeholder="Notes for the reviewer (optional)" placeholderTextColor="#8a9892" maxLength={1000} value={reviewDraft[item.local_id] ?? item.farmer_notes ?? ''} onChangeText={(text) => setReviewDraft((current) => ({ ...current, [item.local_id]: text }))} />
                <Pressable accessibilityRole="button" disabled={busyId === item.local_id} onPress={() => requestReview(item)} style={[styles.reviewButton, busyId === item.local_id && styles.dim]}>
                  <Ionicons name="shield-checkmark" size={16} color="#fff" /><Text style={styles.reviewButtonText}>{busyId === item.local_id ? 'Requesting…' : 'Request Agricultural Review'}</Text>
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
                <Text style={styles.reviewLine}><Text style={styles.reviewLineLabel}>AI screening: </Text>{CLASS_DISPLAY_NAMES[item.predicted_class]} ({clampPercent(item.confidence)})</Text>
                {review.verified_label && <Text style={styles.reviewLine}><Text style={styles.reviewLineLabel}>Reviewer assessment: </Text>{titleCase(review.verified_label)}</Text>}
                {review.farmer_follow_up && <Text style={styles.reviewLine}><Text style={styles.reviewLineLabel}>Recommended follow-up: </Text>{review.farmer_follow_up}</Text>}
                {review.next_steps.length > 0 && <Text style={styles.reviewLine}><Text style={styles.reviewLineLabel}>Next steps: </Text>{review.next_steps.map((step) => titleCase(step)).join(' · ')}</Text>}
                {(review.reviewer || review.reviewed_at) && <Text style={styles.reviewMeta}>Reviewed{review.reviewer ? ` by ${review.reviewer.name}` : ''}{review.reviewed_at ? ` · ${formatDate(review.reviewed_at, true)}` : ''}</Text>}
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
    }) : <View style={styles.empty}><Ionicons name="leaf-outline" size={30} color={palette.green} /><Text style={styles.emptyTitle}>No saved scans.</Text></View>}
    <ImageViewer uri={viewerImage} visible={viewerImage !== null} onClose={() => setViewerImage(null)} />
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

function enhancedTimeLabel(enhanced: StoredComparisonEntry | null, item: LocalDiagnosis) {
  const timeMs = enhanced && enhanced.inferenceTimeMs > 0 ? enhanced.inferenceTimeMs : item.inference_time_ms;
  return timeMs != null && timeMs > 0 ? ` · ${timeMs.toFixed(1)}ms` : '';
}

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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  headerCopy: { flex: 1 },
  title: { color: palette.ink, fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.5 },
  count: { color: palette.muted, fontSize: 14, fontWeight: '600', marginTop: 1 },
  exportButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 42, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, borderColor: palette.green, backgroundColor: '#fff' },
  exportText: { color: palette.green, fontSize: 13, fontWeight: '800' },
  dim: { opacity: 0.5 },
  error: { color: '#8e3028', fontSize: 13, lineHeight: 18, backgroundColor: '#ffeeec', borderWidth: 1, borderColor: '#efc2bd', borderRadius: 12, padding: 11 },
  muted: { color: palette.muted, fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  thumb: { width: 68, height: 68, borderRadius: 14, backgroundColor: palette.greenSoft },
  placeholder: { width: 68, height: 68, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.greenSoft },
  cardCopy: { flex: 1, gap: 3 },
  cardClass: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  cardDate: { color: palette.muted, fontSize: 13, fontWeight: '600' },
  details: { gap: 10, borderTopWidth: 1, borderTopColor: palette.border, padding: 12 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  verdictText: { fontSize: 14, fontWeight: '800' },
  modelBlock: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#f5f8f6' },
  modelLine: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusText: { fontSize: 12, fontWeight: '700' },
  reviewRequest: { gap: 9, padding: 12, borderRadius: 12, backgroundColor: '#e5eee8', borderWidth: 1, borderColor: '#b9d2c4' },
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
  reviewButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, borderRadius: 11, backgroundColor: palette.green },
  reviewButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  reviewRetryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: palette.green, backgroundColor: '#fff' },
  reviewRetryText: { color: palette.green, fontSize: 13, fontWeight: '800' },
  retryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: palette.green, backgroundColor: '#fff' },
  retryText: { color: palette.green, fontSize: 13, fontWeight: '800' },
  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: '#e7b3ae', backgroundColor: '#fff' },
  deleteText: { color: palette.danger, fontSize: 13, fontWeight: '800' },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { color: palette.ink, fontSize: 16, fontWeight: '800' },
});