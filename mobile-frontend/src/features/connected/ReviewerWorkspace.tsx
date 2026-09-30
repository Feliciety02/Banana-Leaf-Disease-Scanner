import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api, authenticatedImageSource } from '../../services/api';
import { ImageViewer } from '../../components/ImageViewer';
import { CLASS_KEYS, CLASS_DISPLAY_NAMES } from '../classification/disease-data';
import { ActionButton, Choice, Field, ModalSheet, Notice, Toggle, formatDate, palette, titleCase, uiStyles } from './ui';

type Review = { review_status: string; verified_label: string | null; image_quality: string; next_steps: string[]; notes?: string; reviewed_at?: string; reviewer?: { name: string } };
type ReviewCase = { id: number; predicted_class: string; confidence: number; diagnosed_at: string; image_url: string | null; farmer_notes: string | null; user?: { name: string }; review?: Review | null };
const outcomes = ['confirmed', 'alternate_class', 'cannot_determine', 'field_or_laboratory_required', 'possible_outside_supported_classes'];
const qualityOptions = ['good', 'blurry', 'poor_lighting', 'disease_area_not_visible', 'insufficient_image'];
const nextStepOptions = ['retake_photo', 'monitor_plant', 'isolate_affected_plant', 'seek_field_inspection', 'other'];

export function ReviewerWorkspace({ scope = 'pending' }: { scope?: 'pending' | 'reviewed' }) {
  const [items, setItems] = useState<ReviewCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<ReviewCase | null>(null);
  const [status, setStatus] = useState('');
  const [label, setLabel] = useState('');
  const [quality, setQuality] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems((await api<ReviewCase[]>(`/expert/diagnosis-reviews?scope=${scope}`)).data); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the review queue.'); }
    finally { setLoading(false); }
  }, [scope]);
  useEffect(() => { void load(); }, [load]);
  const inspect = async (item: ReviewCase) => {
    setError(''); setBusy(true);
    try {
      const detail = (await api<ReviewCase>(`/expert/diagnosis-reviews/${item.id}`)).data;
      setSelected(detail); setStatus(detail.review?.review_status === 'pending' ? '' : detail.review?.review_status ?? '');
      setLabel(detail.review?.verified_label ?? ''); setQuality(detail.review?.image_quality ?? '');
      setSteps(detail.review?.next_steps ?? []); setNotes(detail.review?.notes ?? ''); setDirty(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open this scan.'); }
    finally { setBusy(false); }
  };
  const close = () => {
    if (busy) return;
    if (dirty) Alert.alert('Discard assessment?', 'Your assessment has not been submitted.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => setSelected(null) }]);
    else setSelected(null);
  };
  const submit = async () => {
    if (!selected || busy || !status || !quality || !steps.length || (status === 'alternate_class' && !label)) return;
    setBusy(true); setError('');
    try {
      await api(`/expert/diagnosis-reviews/${selected.id}`, { method: 'PUT', body: JSON.stringify({ review_status: status, verified_label: status === 'alternate_class' ? label : null, image_quality: quality, next_steps: steps, notes: notes.trim() || null }) });
      setSelected(null); setDirty(false); setNotice('Assessment submitted. The farmer can see the outcome and next steps after syncing.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Assessment was not saved. Please retry.'); }
    finally { setBusy(false); }
  };
  const completed = selected?.review && selected.review.review_status !== 'pending';
  return <View style={uiStyles.stack}>
    <Text style={styles.title}>{scope === 'pending' ? 'Review requests' : 'Reviewed scans'}</Text>
    <Text style={uiStyles.cardMeta}>{scope === 'pending' ? 'Check farmer appeals and uncertain AI results. Your assessment is recorded separately from the original prediction.' : 'Completed assessments and the advice sent back to farmers.'}</Text>
    <ActionButton variant="secondary" icon="refresh" disabled={loading || busy} onPress={load}>{loading ? 'Loading...' : 'Refresh requests'}</ActionButton>
    {error && !selected && <Notice>{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {!loading && !items.length && !error && <Text style={uiStyles.cardMeta}>{scope === 'pending' ? 'No scans awaiting review.' : 'No completed reviews yet.'}</Text>}
    {items.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Review scan ${item.id} from ${item.user?.name ?? 'farmer'}`} disabled={busy} onPress={() => inspect(item)} style={styles.caseCard}>
      {item.image_url ? <Image source={authenticatedImageSource(item.image_url)} style={styles.thumb} /> : <View style={styles.thumb}><Ionicons name="image-outline" size={28} color={palette.muted} /></View>}
      <View style={uiStyles.flex}><Text style={uiStyles.cardTitle}>{item.user?.name ?? 'Farmer'} - scan #{item.id}</Text><Text style={uiStyles.cardMeta}>{titleCase(item.predicted_class)} / {Number(item.confidence).toFixed(1)}%</Text><Text style={styles.status}>{item.review?.review_status === 'pending' ? 'Farmer appeal' : item.review ? titleCase(item.review.review_status) : 'Uncertain result'}</Text><Text style={uiStyles.cardMeta}>{formatDate(item.diagnosed_at)}</Text></View>
      <Ionicons name="chevron-forward" size={20} color={palette.green} />
    </Pressable>)}
    <ModalSheet visible={Boolean(selected)} title={completed ? 'Completed assessment' : 'Review this scan'} onClose={close}>
      {selected && <>
        <Text style={uiStyles.cardTitle}>{selected.user?.name ?? 'Farmer'} / scan #{selected.id}</Text>
        <Text style={uiStyles.cardMeta}>Original AI result: {titleCase(selected.predicted_class)} ({Number(selected.confidence).toFixed(1)}%)</Text>
        {selected.image_url ? <Pressable accessibilityRole="button" accessibilityLabel="Open scan photo" onPress={() => setViewer(selected.image_url)}><Image source={authenticatedImageSource(selected.image_url)} style={styles.photo} resizeMode="contain" /></Pressable> : <Notice tone="warning">The photo has not been uploaded. Do not infer a corrected disease from the AI label alone; request a clearer photo or field inspection.</Notice>}
        <Text style={uiStyles.cardTitle}>Farmer's reason</Text><Text style={uiStyles.cardMeta}>{selected.farmer_notes || 'No additional notes supplied.'}</Text>
        {error && <Notice>{error}</Notice>}
        {completed ? <View style={uiStyles.stack}>
          <Text style={uiStyles.cardTitle}>{titleCase(selected.review!.review_status)}</Text>
          {selected.review?.verified_label && <Text style={uiStyles.cardMeta}>Assessment: {titleCase(selected.review.verified_label)}</Text>}
          <Text style={uiStyles.cardMeta}>Next steps: {selected.review?.next_steps.map(titleCase).join(', ')}</Text>
          <Text style={uiStyles.cardMeta}>Internal reviewer notes: {selected.review?.notes || 'None'}</Text>
          <Text style={uiStyles.cardMeta}>{selected.review?.reviewer?.name} / {formatDate(selected.review?.reviewed_at)}</Text>
        </View> : <View pointerEvents={busy ? 'none' : 'auto'} style={uiStyles.stack}>
          <Choice label="Assessment" value={status} options={outcomes} onChange={(value) => { setStatus(value); setDirty(true); }} />
          {status === 'alternate_class' && <Choice label="Corrected class" value={label} options={CLASS_KEYS} onChange={(value) => { setLabel(value); setDirty(true); }} />}
          <Choice label="Photo quality" value={quality} options={qualityOptions} onChange={(value) => { setQuality(value); setDirty(true); }} />
          <Text style={uiStyles.cardTitle}>Next steps for the farmer</Text>
          {nextStepOptions.map((step) => <Toggle key={step} label={titleCase(step)} value={steps.includes(step)} onChange={(value) => { setSteps((current) => value ? [...current, step] : current.filter((item) => item !== step)); setDirty(true); }} />)}
          <Field label="Internal reviewer notes" multiline maxLength={5000} value={notes} onChangeText={(value) => { setNotes(value); setDirty(true); }} />
          <Text style={uiStyles.cardMeta}>Farmers receive the assessment and selected next steps. Internal notes remain visible to reviewers and admins.</Text>
          <ActionButton disabled={busy || !status || !quality || !steps.length || (status === 'alternate_class' && !label)} onPress={submit}>{busy ? 'Submitting...' : 'Submit assessment'}</ActionButton>
        </View>}
      </>}
    </ModalSheet>
    <ImageViewer visible={Boolean(viewer)} uri={viewer} onClose={() => setViewer(null)} />
  </View>;
}
const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: palette.ink },
  caseCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff' },
  thumb: { width: 66, height: 78, borderRadius: 12, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: 240, borderRadius: 16, backgroundColor: palette.greenSoft },
  status: { color: palette.green, fontWeight: '700', fontSize: 13, marginTop: 6 },
});
