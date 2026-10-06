import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../../services/api';
import { ImageViewer } from '../../components/ImageViewer';
import { ScanImage } from '../../components/ScanImage';
import { ViewableImage, ViewableScanImage } from '../../components/ViewableImage';
import { UserAvatar } from '../../components/UserAvatar';
import { CLASS_KEYS, CLASS_DISPLAY_NAMES } from '../classification/disease-data';
import type { ClassKey } from '../classification/types';
import { getTreatmentGuide } from '../classification/treatment-data';
import { ActionButton, Field, ModalSheet, Notice, formatDate, palette, titleCase, uiStyles } from './ui';

type Revision = { review_status: string; verified_label: string | null; farmer_message?: string | null; farmer_reply?: string | null; reviewed_at?: string | null; reviewer?: { name: string } | null };
type Review = { version: number; review_status: string; verified_label: string | null; image_quality: string; next_steps: string[]; notes?: string; farmer_message?: string | null; farmer_reply?: string | null; reviewed_at?: string; reviewer?: { name: string }; revisions?: Revision[] };
type ReviewCase = { id: number; predicted_class: string; confidence: number; diagnosed_at: string; image_url: string | null; farmer_notes: string | null; research_consent?: boolean; review_claim?: { user?: { id: number; name: string } | null; expires_at: string } | null; user?: { name: string; avatar_url?: string | null }; review?: Review | null };
type ReviewChoice = ClassKey | 'cannot_determine' | 'possible_outside_supported_classes';
const choices: { value: ReviewChoice; label: string }[] = [
  { value: 'sigatoka', label: CLASS_DISPLAY_NAMES.sigatoka },
  { value: 'panama-disease', label: CLASS_DISPLAY_NAMES['panama-disease'] },
  { value: 'cordana-leaf-spot', label: CLASS_DISPLAY_NAMES['cordana-leaf-spot'] },
  { value: 'healthy', label: 'No supported disease visible' },
  { value: 'cannot_determine', label: 'Cannot determine from this photo' },
  { value: 'possible_outside_supported_classes', label: 'Looks like another condition' },
];
function choiceFor(item: ReviewCase): ReviewChoice | '' {
  const review = item.review;
  if (!review || review.review_status === 'pending') return '';
  if (review.review_status === 'confirmed' || review.review_status === 'alternate_class') {
    const value = review.verified_label || item.predicted_class;
    return CLASS_KEYS.includes(value as ClassKey) ? value as ClassKey : '';
  }
  if (review.review_status === 'cannot_determine' || review.review_status === 'possible_outside_supported_classes') return review.review_status;
  return '';
}

export function AgriculturistWorkspace({ scope = 'pending' }: { scope?: 'pending' | 'reviewed' }) {
  const [items, setItems] = useState<ReviewCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<ReviewCase | null>(null);
  const [choice, setChoice] = useState<ReviewChoice | ''>('');
  const [notes, setNotes] = useState('');
  const [farmerMessage, setFarmerMessage] = useState('');
  const [photoFailed, setPhotoFailed] = useState(false);
  const [reference, setReference] = useState<ClassKey | null>(null);
  const [showReferences, setShowReferences] = useState(false);
  const [showInternalNote, setShowInternalNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [claimNote, setClaimNote] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems((await api<ReviewCase[]>(`/expert/diagnosis-reviews?scope=${scope}`)).data); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the review queue.'); }
    finally { setLoading(false); }
  }, [scope]);
  useEffect(() => { void load(); }, [load]);
  // Opening a waiting case marks it as yours so other agriculturists do not assess it
  // at the same time; the claim is renewed while open and released on leaving.
  const selectedId = selected?.id;
  const selectedPending = !selected?.review || selected.review.review_status === 'pending';
  useEffect(() => {
    setClaimNote('');
    if (!selectedId || scope !== 'pending' || !selectedPending) return undefined;
    let active = true;
    const claim = () => api(`/expert/diagnosis-reviews/${selectedId}/claim`, { method: 'POST' })
      .then(() => { if (active) setClaimNote(''); })
      .catch((e) => { if (active) setClaimNote(e instanceof Error ? e.message : 'Another agriculturist is working on this case.'); });
    void claim();
    const timer = setInterval(() => { void claim(); }, 10 * 60000);
    return () => {
      active = false;
      clearInterval(timer);
      void api(`/expert/diagnosis-reviews/${selectedId}/claim`, { method: 'DELETE' }).catch(() => undefined);
    };
  }, [selectedId, selectedPending, scope]);
  const inspect = async (item: ReviewCase) => {
    setError(''); setBusy(true);
    try {
      const detail = (await api<ReviewCase>(`/expert/diagnosis-reviews/${item.id}`)).data;
      setSelected(detail); setChoice(choiceFor(detail)); setPhotoFailed(false);
      setShowReferences(false); setShowInternalNote(Boolean(detail.review?.notes));
      setNotes(detail.review?.notes ?? ''); setFarmerMessage(detail.review?.farmer_message ?? ''); setDirty(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open this scan.'); }
    finally { setBusy(false); }
  };
  const close = () => {
    if (busy) return;
    if (dirty) Alert.alert('Discard assessment?', 'Your assessment has not been submitted.', [{ text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => setSelected(null) }]);
    else setSelected(null);
  };
  const submit = async () => {
    if (!selected || busy || !choice || ((!selected.image_url || photoFailed) && choice !== 'cannot_determine')) return;
    setBusy(true); setError('');
    try {
      const isClass = CLASS_KEYS.includes(choice as ClassKey);
      const reviewStatus = isClass ? choice === selected.predicted_class ? 'confirmed' : 'alternate_class' : choice;
      await api(`/expert/diagnosis-reviews/${selected.id}`, { method: 'PUT', body: JSON.stringify({
        expected_review_version: selected.review?.version ?? 0,
        review_status: reviewStatus,
        verified_label: reviewStatus === 'alternate_class' ? choice : null,
        image_quality: choice === 'cannot_determine' ? 'insufficient_image' : 'good',
        next_steps: choice === 'cannot_determine' ? ['retake_photo', 'seek_field_inspection']
          : choice === 'possible_outside_supported_classes' || choice === 'panama-disease' ? ['seek_field_inspection'] : ['monitor_plant'],
        notes: notes.trim() || null,
        farmer_message: farmerMessage.trim() || null,
      }) });
      setSelected(null); setDirty(false); setNotice('Assessment submitted. The farmer can see the outcome and next steps after syncing.'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Assessment was not saved. Please retry.'); }
    finally { setBusy(false); }
  };
  const nominate = async () => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try {
      await api(`/expert/dataset-candidates/from-diagnosis/${selected.id}`, { method: 'POST' });
      setSelected(null); setNotice('Image nominated for dataset review. Another agriculturist or an administrator records the decision.');
    } catch (e) { setError(e instanceof Error ? e.message : 'The image could not be nominated.'); }
    finally { setBusy(false); }
  };
  const completed = selected?.review && selected.review.review_status !== 'pending';
  const photoAvailable = Boolean(selected?.image_url && !photoFailed);
  return <View style={uiStyles.stack}>
    <Text style={styles.title}>{scope === 'pending' ? 'Review requests' : 'Reviewed scans'}</Text>
    <Text style={uiStyles.cardMeta}>{scope === 'pending' ? 'Open the leaf photo, choose one assessment, and add a note if needed.' : 'Completed assessments and the advice sent back to farmers.'}</Text>
    <ActionButton variant="secondary" icon="refresh" disabled={loading || busy} onPress={load}>{loading ? 'Loading...' : 'Refresh requests'}</ActionButton>
    {error && !selected && <Notice>{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {!loading && !items.length && !error && <Text style={uiStyles.cardMeta}>{scope === 'pending' ? 'No scans awaiting review.' : 'No completed reviews yet.'}</Text>}
    {items.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Review scan ${item.id} from ${item.user?.name ?? 'farmer'}`} disabled={busy} onPress={() => inspect(item)} style={styles.caseCard}>
      <ViewableScanImage uri={item.image_url} title={`Scan #${item.id}`} style={styles.thumb} compact missingText="Photo not uploaded yet" />
      <View style={uiStyles.flex}><Text style={uiStyles.cardTitle}>{item.user?.name ?? 'Farmer'} - scan #{item.id}</Text><Text style={uiStyles.cardMeta}>{titleCase(item.predicted_class)} / {Number(item.confidence).toFixed(1)}%</Text><Text style={styles.status}>{item.review?.review_status === 'pending' ? 'Farmer appeal' : item.review ? titleCase(item.review.review_status) : 'Uncertain result'}</Text>{item.review_claim?.user ? <Text style={styles.claimed}>Being reviewed by {item.review_claim.user.name}</Text> : null}<Text style={uiStyles.cardMeta}>{formatDate(item.diagnosed_at)}</Text></View>
      <Ionicons name="chevron-forward" size={20} color={palette.green} />
    </Pressable>)}
    <ModalSheet visible={Boolean(selected)} title={reference ? `${CLASS_DISPLAY_NAMES[reference]} reference` : completed ? 'Completed assessment' : 'Review this scan'} onClose={() => reference ? setReference(null) : close()}>
      {reference ? <View style={uiStyles.stack}><ViewableImage source={getTreatmentGuide(reference).leafImage!} title={`${CLASS_DISPLAY_NAMES[reference]} reference`} style={styles.referenceLarge} resizeMode="contain" /><Text style={uiStyles.cardMeta}>Educational example; compare it with the submitted scan photo.</Text><ActionButton variant="secondary" onPress={() => setReference(null)}>Back to scan</ActionButton></View> : selected && <>
        <View style={styles.farmerRow}><UserAvatar name={selected.user?.name ?? 'Farmer'} uri={selected.user?.avatar_url} size={34} /><View style={uiStyles.flex}><Text style={styles.farmerName}>{selected.user?.name ?? 'Farmer'}</Text><Text style={uiStyles.cardMeta}>Scan #{selected.id} · {formatDate(selected.diagnosed_at)}</Text></View></View>
        <View style={styles.aiResult}>
          <Text style={styles.aiEyebrow}>ORIGINAL AI RESULT</Text>
          <Text style={styles.aiDisease}>{CLASS_DISPLAY_NAMES[selected.predicted_class as ClassKey] ?? titleCase(selected.predicted_class)}</Text>
          <Text style={styles.aiConfidence}>{Number(selected.confidence).toFixed(1)}% model confidence</Text>
        </View>
        <Text style={styles.sectionTitle}>Submitted leaf photo</Text>
        {selected.image_url && !photoFailed ? <Pressable accessibilityRole="button" accessibilityLabel="Enlarge submitted leaf photo" onPress={() => setViewer(selected.image_url)}><ScanImage uri={selected.image_url} style={styles.photo} resizeMode="contain" onLoadError={() => setPhotoFailed(true)} /><Text style={styles.photoHint}>Tap photo to enlarge</Text></Pressable> : <Notice tone="warning">Photo unavailable. Choose "Cannot determine" until the farmer's photo syncs.</Notice>}
        {selected.farmer_notes ? <View style={styles.contextCard}><Text style={styles.contextLabel}>FARMER'S NOTE</Text><Text style={styles.contextText}>{selected.farmer_notes}</Text></View> : null}
        {selected.review?.review_status === 'pending' && selected.review.revisions?.length ? (() => {
          // Revisions arrive newest first.
          const last = selected.review.revisions[0];
          return <Notice tone="warning">{`Farmer reopened this scan. Previous assessment: ${titleCase(last.verified_label || last.review_status)}.`}</Notice>;
        })() : null}
        {selected.review?.farmer_reply ? <View style={styles.contextCard}><Text style={styles.contextLabel}>FARMER'S REPLY</Text><Text style={styles.contextText}>{selected.review.farmer_reply}</Text></View> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showReferences }} onPress={() => setShowReferences(!showReferences)} style={styles.expandButton}><Ionicons name="images-outline" size={18} color={palette.green} /><Text style={styles.expandText}>Compare reference photos</Text><Ionicons name={showReferences ? 'chevron-up' : 'chevron-down'} size={18} color={palette.green} /></Pressable>
        {showReferences ? <View style={styles.referenceSection}><Text style={uiStyles.cardMeta}>Examples for comparison; they do not establish a diagnosis.</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.references}>
          {CLASS_KEYS.map((classKey) => { const leaf = getTreatmentGuide(classKey).leafImage; return leaf ? <Pressable key={classKey} accessibilityRole="button" accessibilityLabel={`View ${CLASS_DISPLAY_NAMES[classKey]} reference photo`} onPress={() => setReference(classKey)} style={styles.referenceCard}><Image source={leaf} style={styles.referenceImage} /><Text style={styles.referenceLabel}>{classKey === 'healthy' ? 'Healthy' : CLASS_DISPLAY_NAMES[classKey]}</Text></Pressable> : null; })}
        </ScrollView></View> : null}
        {error && <Notice>{error}</Notice>}
        {completed ? <View style={uiStyles.stack}>
          <Text style={styles.sectionTitle}>Agriculturist assessment</Text>
          <Text style={styles.assessmentResult}>{choices.find((option) => option.value === choiceFor(selected))?.label || titleCase(selected.review!.review_status)}</Text>
          {selected.review?.next_steps?.length ? <Text style={styles.detailText}>Next step: {selected.review.next_steps.map(titleCase).join(', ')}</Text> : null}
          {selected.review?.farmer_message ? <View style={styles.contextCard}><Text style={styles.contextLabel}>MESSAGE TO FARMER</Text><Text style={styles.contextText}>{selected.review.farmer_message}</Text></View> : null}
          {selected.review?.notes ? <Text style={styles.detailText}>Internal note: {selected.review.notes}</Text> : null}
          <Text style={uiStyles.cardMeta}>{selected.review?.reviewer?.name ? `Reviewed by ${selected.review.reviewer.name}` : 'Reviewed'} · {formatDate(selected.review?.reviewed_at)}</Text>
          {selected.image_url && selected.research_consent ? <ActionButton variant="secondary" icon="albums-outline" disabled={busy} onPress={nominate}>{busy ? 'Nominating...' : 'Nominate for dataset review'}</ActionButton> : null}
        </View> : <View pointerEvents={busy ? 'none' : 'auto'} style={uiStyles.stack}>
          {claimNote ? <Notice tone="warning">{claimNote}</Notice> : null}
          <Text style={styles.sectionTitle}>Your assessment</Text>
          <Text style={uiStyles.cardMeta}>Choose what you can see in the submitted photo.</Text>
          {choices.filter((option) => photoAvailable || option.value === 'cannot_determine').map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: choice === option.value }} onPress={() => { setChoice(option.value); setDirty(true); }} style={[styles.choice, choice === option.value && styles.choiceSelected]}><Ionicons name={choice === option.value ? 'radio-button-on' : 'radio-button-off'} size={21} color={palette.green} /><Text style={styles.choiceText}>{option.label}</Text></Pressable>)}
          <Field label="Message to farmer (optional)" multiline maxLength={2000} value={farmerMessage} onChangeText={(value) => { setFarmerMessage(value); setDirty(true); }} placeholder="What should the farmer check or do next?" />
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showInternalNote }} onPress={() => setShowInternalNote(!showInternalNote)} style={styles.expandButton}><Ionicons name="create-outline" size={18} color={palette.green} /><Text style={styles.expandText}>Internal note (optional)</Text><Ionicons name={showInternalNote ? 'chevron-up' : 'chevron-down'} size={18} color={palette.green} /></Pressable>
          {showInternalNote ? <Field label="Only agriculturists and admins can see this" multiline maxLength={5000} value={notes} onChangeText={(value) => { setNotes(value); setDirty(true); }} /> : null}
          <ActionButton disabled={busy || Boolean(claimNote) || !choice || (!photoAvailable && choice !== 'cannot_determine')} onPress={submit}>{busy ? 'Saving...' : 'Save assessment'}</ActionButton>
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
  farmerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  farmerName: { color: palette.ink, fontSize: 15, fontWeight: '700' },
  aiResult: { backgroundColor: palette.greenSoft, borderColor: '#c8decf', borderWidth: 1, borderRadius: 18, padding: 18, gap: 7 },
  aiEyebrow: { color: palette.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  aiDisease: { color: palette.ink, fontSize: 25, lineHeight: 31, fontWeight: '800' },
  aiConfidence: { color: palette.green, fontSize: 14, fontWeight: '700' },
  sectionTitle: { color: palette.ink, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  assessmentResult: { color: palette.green, fontSize: 21, lineHeight: 27, fontWeight: '800' },
  detailText: { color: palette.ink, fontSize: 14, lineHeight: 21 },
  contextCard: { backgroundColor: '#f7f9f7', borderRadius: 14, padding: 14, gap: 5 },
  contextLabel: { color: palette.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  contextText: { color: palette.ink, fontSize: 15, lineHeight: 22 },
  expandButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff' },
  expandText: { flex: 1, color: palette.green, fontSize: 14, fontWeight: '700' },
  referenceSection: { gap: 8 },
  photoHint: { color: palette.green, fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 4 },
  references: { gap: 9, paddingVertical: 4 },
  referenceCard: { width: 108, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff' },
  referenceImage: { width: 108, height: 80 },
  referenceLabel: { color: palette.ink, fontSize: 11, fontWeight: '700', padding: 7 },
  referenceLarge: { width: '100%', height: 380, backgroundColor: palette.greenSoft, borderRadius: 12 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: '#fff' },
  choiceSelected: { borderColor: palette.green, backgroundColor: palette.greenSoft },
  choiceText: { flex: 1, color: palette.ink, fontSize: 14, fontWeight: '600' },
  claimed: { color: '#b45a09', fontSize: 12, fontWeight: '700', marginTop: 2 },
  status: { color: palette.green, fontWeight: '700', fontSize: 13, marginTop: 6 },
});
