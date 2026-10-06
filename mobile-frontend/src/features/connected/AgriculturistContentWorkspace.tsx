import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../../services/api';
import { ImageViewer } from '../../components/ImageViewer';
import { ScanImage } from '../../components/ScanImage';
import { ActionButton, Field, ModalSheet, Notice, formatDate, palette, titleCase, uiStyles } from './ui';

type DiseaseRecord = { id: number; name: string; model_class_key: string; verification_status: string; evidence_level: string; sources_count?: number; last_reviewed_at?: string | null };
type DiseaseDetail = {
  disease: DiseaseRecord & { description?: string | null; symptoms?: string[]; management?: string | null; prevention?: string | null; causal_agent?: string | null };
  regulatory_recheck_required: boolean;
};
type Candidate = {
  id: number; status: string; review_notes: string | null; reviewed_at: string | null;
  diagnosis?: { id: number; predicted_class: string; confidence: number; image_url: string | null; review?: { review_status: string; verified_label: string | null } | null };
  proposer?: { id: number; name: string } | null;
};

function messageOf(error: unknown) { return error instanceof Error ? error.message : 'The request could not be completed.'; }

/** Agriculturist tools beyond the case queue: disease-content verification and dataset-candidate decisions. */
export function AgriculturistContentWorkspace() {
  const [tab, setTab] = useState<'diseases' | 'dataset'>('diseases');
  return <View style={uiStyles.stack}>
    <Text style={styles.title}>Content review</Text>
    <View accessibilityRole="tablist" style={styles.segment}>
      {(['diseases', 'dataset'] as const).map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[styles.segmentItem, tab === item && styles.segmentActive]}><Text style={[styles.segmentText, tab === item && styles.segmentTextActive]}>{item === 'diseases' ? 'Disease records' : 'Dataset candidates'}</Text></Pressable>)}
    </View>
    {tab === 'diseases' ? <DiseaseVerification /> : <DatasetCandidates />}
  </View>;
}

function DiseaseVerification() {
  const [items, setItems] = useState<DiseaseRecord[]>([]);
  const [detail, setDetail] = useState<DiseaseDetail | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await api<DiseaseRecord[]>('/expert/diseases')).data); setError(''); }
    catch (e) { setError(messageOf(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const inspect = async (item: DiseaseRecord) => {
    try { setDetail((await api<DiseaseDetail>(`/expert/diseases/${item.id}`)).data); setNotes(''); setError(''); }
    catch (e) { setError(messageOf(e)); }
  };
  const decide = async (status: 'verified' | 'revision_required' | 'rejected') => {
    if (!detail) return;
    setBusy(true); setError('');
    try {
      await api(`/expert/diseases/${detail.disease.id}/verification`, { method: 'POST', body: JSON.stringify({ status, notes: notes.trim() || null }) });
      setNotice(`${detail.disease.name}: ${titleCase(status)} recorded.`); setDetail(null); await load();
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  };
  return <View style={uiStyles.stack}>
    <Text style={uiStyles.cardMeta}>Verify researched disease content before farmers see it. Records that fail the evidence checks cannot be verified.</Text>
    <ActionButton variant="secondary" icon="refresh" disabled={loading} onPress={load}>{loading ? 'Loading...' : 'Refresh records'}</ActionButton>
    {error && !detail && <Notice>{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {items.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Review ${item.name}`} onPress={() => inspect(item)} style={[uiStyles.card, styles.row]}>
      <View style={uiStyles.flex}>
        <Text style={uiStyles.cardTitle}>{item.name}</Text>
        <Text style={uiStyles.cardMeta}>{item.model_class_key} · {item.sources_count ?? 0} sources · {titleCase(item.evidence_level)} evidence</Text>
        <Text style={styles.status}>{titleCase(item.verification_status)}{item.last_reviewed_at ? ` · reviewed ${formatDate(item.last_reviewed_at)}` : ''}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={palette.green} />
    </Pressable>)}
    <ModalSheet visible={Boolean(detail)} title={detail ? `Review ${detail.disease.name}` : 'Review'} onClose={() => { if (!busy) setDetail(null); }}>
      {detail && <View style={uiStyles.stack}>
        <Text style={uiStyles.cardTitle}>Farmer content</Text><Text style={uiStyles.cardMeta}>{detail.disease.description || 'Missing farmer summary.'}</Text>
        <Text style={uiStyles.cardTitle}>Symptoms</Text><Text style={uiStyles.cardMeta}>{detail.disease.symptoms?.join(' · ') || 'No image-visible symptoms documented.'}</Text>
        <Text style={uiStyles.cardTitle}>Management and prevention</Text><Text style={uiStyles.cardMeta}>{[detail.disease.management, detail.disease.prevention].filter(Boolean).join('\n') || 'No management guidance recorded.'}</Text>
        <Text style={uiStyles.cardMeta}>Causal agent: {detail.disease.causal_agent || 'Not recorded'} · Sources: {detail.disease.sources_count ?? 0}</Text>
        {detail.regulatory_recheck_required && <Notice tone="warning">Chemical guidance needs a current Philippine regulatory check before verification.</Notice>}
        {error && <Notice>{error}</Notice>}
        <Field label="Review notes" multiline maxLength={5000} value={notes} onChangeText={setNotes} />
        <ActionButton disabled={busy} onPress={() => decide('verified')}>Verify content</ActionButton>
        <ActionButton variant="secondary" disabled={busy} onPress={() => decide('revision_required')}>Needs revision</ActionButton>
        <ActionButton variant="danger" disabled={busy} onPress={() => decide('rejected')}>Reject</ActionButton>
      </View>}
    </ModalSheet>
  </View>;
}

function DatasetCandidates() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [viewer, setViewer] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await api<Candidate[]>('/expert/dataset-candidates')).data); setError(''); }
    catch (e) { setError(messageOf(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const decide = async (item: Candidate, status: 'approved' | 'uncertain' | 'rejected') => {
    setBusyId(item.id); setError('');
    try {
      await api(`/expert/dataset-candidates/${item.id}`, { method: 'PUT', body: JSON.stringify({ status, review_notes: (notes[item.id] ?? item.review_notes ?? '').trim() || null }) });
      setNotice(`Candidate #${item.id}: ${titleCase(status)} recorded.`); await load();
    } catch (e) { setError(messageOf(e)); }
    finally { setBusyId(null); }
  };
  return <View style={uiStyles.stack}>
    <Text style={uiStyles.cardMeta}>Approval marks research eligibility only. You cannot decide on an image you nominated; another agriculturist or an administrator does.</Text>
    <ActionButton variant="secondary" icon="refresh" disabled={loading} onPress={load}>{loading ? 'Loading...' : 'Refresh candidates'}</ActionButton>
    {error && <Notice>{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {!loading && !items.length && !error && <Text style={uiStyles.cardMeta}>No research candidates yet. Nominate reviewed, consented images from a completed assessment in Reviewed.</Text>}
    {items.map((item) => <View key={item.id} style={uiStyles.card}>
      <View style={styles.row}>
        {item.diagnosis?.image_url ? <Pressable accessibilityRole="button" accessibilityLabel="Open candidate scan photo" onPress={() => setViewer(item.diagnosis?.image_url ?? null)}><ScanImage uri={item.diagnosis.image_url} style={styles.thumb} compact /></Pressable> : <ScanImage uri={null} style={styles.thumb} compact missingText="Photo not uploaded yet" />}
        <View style={uiStyles.flex}>
          <Text style={uiStyles.cardTitle}>{titleCase(item.diagnosis?.predicted_class)} · {Number(item.diagnosis?.confidence ?? 0).toFixed(1)}%</Text>
          <Text style={uiStyles.cardMeta}>Review: {titleCase(item.diagnosis?.review?.review_status ?? 'pending')}{item.diagnosis?.review?.verified_label ? ` · ${titleCase(item.diagnosis.review.verified_label)}` : ''}</Text>
          <Text style={uiStyles.cardMeta}>Nominated by {item.proposer?.name ?? 'a former agriculturist'}</Text>
          <Text style={styles.status}>{titleCase(item.status)}</Text>
        </View>
      </View>
      <Field label="Decision notes" multiline maxLength={5000} value={notes[item.id] ?? item.review_notes ?? ''} onChangeText={(value) => setNotes((current) => ({ ...current, [item.id]: value }))} />
      <View style={styles.actions}>
        <View style={uiStyles.flex}><ActionButton disabled={busyId === item.id} onPress={() => decide(item, 'approved')}>Approve</ActionButton></View>
        <View style={uiStyles.flex}><ActionButton variant="secondary" disabled={busyId === item.id} onPress={() => decide(item, 'uncertain')}>Uncertain</ActionButton></View>
        <View style={uiStyles.flex}><ActionButton variant="danger" disabled={busyId === item.id} onPress={() => decide(item, 'rejected')}>Reject</ActionButton></View>
      </View>
    </View>)}
    <ImageViewer uri={viewer} visible={Boolean(viewer)} onClose={() => setViewer(null)} />
  </View>;
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: palette.ink },
  segment: { flexDirection: 'row', padding: 4, backgroundColor: '#f1f4f2', borderRadius: 12, borderWidth: 1, borderColor: palette.border },
  segmentItem: { flex: 1, minHeight: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { color: palette.muted, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  segmentTextActive: { color: palette.green },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 66, height: 66, borderRadius: 10, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  status: { color: palette.green, fontWeight: '700', fontSize: 13, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8 },
});
