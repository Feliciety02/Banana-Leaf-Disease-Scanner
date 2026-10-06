import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { ActionButton, palette } from '../connected/ui';
import { analyzeLeaf, analyzeBaselineLeaf, type InferenceResult } from '../classification/inference';
import { prepareImageForInference } from '../classification/preprocessing';
import { checkBananaLeafPhoto, LEAF_GATE_BLOCKING } from '../classification/leafGate';
import { shortSteps } from '../../i18n/content';
import { useT } from '../../i18n';
import type { ClassKey } from '../classification/types';
import { claimLocalOnlyDiagnoses, getLocalDiagnosis, saveLocalDiagnosis, type ModelComparisonEntry } from '../../storage/localDiagnoses';
import { synchronizeDiagnoses } from '../../services/diagnosisSync';
import { requestAgriculturalReview } from '../../services/diagnosisReview';
import { askToNotifyAboutReviews } from '../../services/reviewNotifications';
import type { SessionUser } from '../../services/api';
import type { PredictionResult } from '../../types/prediction';
import type { ModelStatusState } from '../status/modelStatus';
import { ImageViewer } from '../../components/ImageViewer';
import { ScanLocationControl } from '../../components/ScanLocationControl';
import { ViewableImage } from '../../components/ViewableImage';
import { SelectedImagePreview } from './SelectedImagePreview';
import { ImageSelector } from './ImageSelector';
import { CameraCapture } from './CameraCapture';
import { ImageQualityNotice } from './ImageQualityNotice';
import { ScanResult } from './ScanResult';
import { evaluateImageQuality, type ImageQualityIssue } from './scanQuality';

function toPredictionResult(result: InferenceResult): PredictionResult {
  return {
    predictedClass: result.classKey,
    confidence: result.confidence,
    probabilities: result.probabilities,
    inferenceTimeMs: result.latencyMs,
    model: result.modelVersion,
  };
}

function toComparisonEntry(result: InferenceResult): ModelComparisonEntry {
  return {
    predictedClass: result.classKey,
    confidence: result.confidence,
    probabilities: result.probabilities,
    inferenceTimeMs: result.latencyMs,
    model: result.modelVersion,
    modelSizeBytes: 0,
  };
}

export function ScanScreen({ user, onStored, modelStatus, onSignIn, onOpenGuide, onDirtyChange }: { onDirtyChange: (dirty: boolean) => void; onSignIn: () => void; onOpenGuide: (classKey: ClassKey) => void; user: SessionUser | null; onStored: () => void; modelStatus: ModelStatusState }) {
  const { t, language } = useT();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [photoIssues, setPhotoIssues] = useState<ImageQualityIssue[] | null>(null);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [phase, setPhase] = useState<'scan' | 'ready' | 'checking' | 'result' | 'rejected'>('scan');
  const [saveError, setSaveError] = useState('');
  const [modelError, setModelError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const savedIdRef = useRef<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewOpinion, setReviewOpinion] = useState('');
  const [requestingReview, setRequestingReview] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const saveInput = useRef<Parameters<typeof saveLocalDiagnosis>[0] | null>(null);
  const retrySave = async () => {
    if (!saveInput.current || saving || savedIdRef.current) return;
    setSaving(true); setSaveError('');
    try {
      const saved = await saveLocalDiagnosis(saveInput.current);
      if (!saved) throw new Error('Saved scan could not be read.');
      savedIdRef.current = saved.local_id; setSavedId(saved.local_id); onStored();
    } catch { setSaveError('Could not save the scan. Try again before leaving this screen.'); }
    finally { setSaving(false); }
  };
  const scanIdRef = useRef(0);
  useEffect(() => { onDirtyChange(Boolean(imageUri && !savedId || reviewOpinion.trim() && !reviewRequested)); return () => onDirtyChange(false); }, [imageUri, savedId, reviewOpinion, reviewRequested, onDirtyChange]);

  // 'prototype' only means no server is configured; the on-device model still runs.
  const modelReady = modelStatus.status === 'real' || modelStatus.status === 'prototype';
  const modelUnavailable = modelStatus.status === 'unavailable';

  const reset = () => {
    scanIdRef.current += 1;
    setImageUri(null);
    setPhotoIssues(null);
    setResult(null);
    setPhase('scan');
    setSaveError('');
    setModelError('');
    setReviewOpinion(''); setReviewRequested(false); setReviewError(''); setRequestingReview(false);
    savedIdRef.current = null; setSavedId(null); setSaving(false); saveInput.current = null;
  };

  const chooseImage = async () => {
    const selection = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9 });
    if (selection.canceled) return;
    setCameraOpen(false);
    reset();
    setImageUri(selection.assets[0].uri);
    setPhase('ready');
  };

  const handleCapture = (uri: string) => {
    setCameraOpen(false);
    reset();
    setImageUri(uri);
    setPhase('ready');
  };

  const checkLeaf = async () => {
    if (!imageUri || phase === 'checking') return;
    const scanId = ++scanIdRef.current;
    const isCurrent = () => scanIdRef.current === scanId;
    setPhase('checking');
    setSaveError('');
    setModelError('');
    const started = Date.now();
    let next: InferenceResult;
    let prepared: string;
    try {
      // Resize once and reuse the 224x224 image for both models; the quality
      // check runs alongside it.
      const [quality, preparedUri] = await Promise.all([evaluateImageQuality(imageUri), prepareImageForInference(imageUri)]);
      prepared = preparedUri;
      const preparedAt = Date.now();
      // Only real photos of banana leaves are diagnosed. Anything else
      // (other plants, objects, paintings, drawings) is blocked and not saved.
      const gate = await checkBananaLeafPhoto(prepared).catch((gateError: unknown) => {
        // In shadow mode a gate failure must not stop the scan.
        if (LEAF_GATE_BLOCKING) throw gateError;
        return null;
      });
      if (gate) console.info(`[scan-timing] leaf-gate score=${gate.score.toFixed(3)} wouldReject=${gate.wouldReject} blocking=${LEAF_GATE_BLOCKING} (${gate.latencyMs.toFixed(1)}ms)`);
      if (!isCurrent()) return;
      if (gate && !gate.accepted) {
        setPhase('rejected');
        return;
      }
      next = await analyzeLeaf(imageUri, prepared);
      if (!isCurrent()) return;
      setPhotoIssues(quality.issues);
      setResult(next);
      setPhase('result'); setSaving(true);
      console.info(`[scan-timing] prepare+quality=${preparedAt - started}ms enhanced=${Date.now() - preparedAt}ms (model ${next.latencyMs.toFixed(1)}ms) result-shown=${Date.now() - started}ms`);
    } catch (error) {
      if (!isCurrent()) return;
      // Technical details go to the log; farmers get a plain message.
      console.warn('[scan] analysis failed', error);
      setModelError(t('scan.error'));
      setPhase('ready');
      return;
    }

    // The enhanced result is already on screen. The baseline still runs in the
    // background so saved records and CSV exports keep the thesis comparison;
    // it is not shown to the user.
    const baselineStarted = Date.now();
    let baselineResult: InferenceResult | null = null;
    try {
      baselineResult = await analyzeBaselineLeaf(imageUri, prepared);
    } catch {
      baselineResult = null;
    }
    const savedStarted = Date.now();
    try {
      const input: Parameters<typeof saveLocalDiagnosis>[0] = {
        predictedClass: next.classKey,
        confidence: next.confidence * 100,
        modelVersion: next.modelVersion,
        inferenceTimeMs: next.latencyMs,
        imageUri,
        ownerUserId: user?.role === 'farmer' ? user.id : null,
        probabilities: next.probabilities,
        baseline: baselineResult ? toComparisonEntry(baselineResult) : null,
        enhanced: toComparisonEntry(next),
      };
      if (isCurrent()) saveInput.current = input;
      const saved = await saveLocalDiagnosis(input);
      if (isCurrent()) { savedIdRef.current = saved?.local_id ?? null; setSavedId(saved?.local_id ?? null); }
      onStored();
    } catch (storageError) {
      if (isCurrent()) setSaveError(storageError instanceof Error ? storageError.message : 'The local database could not save this result.');
    }
    if (isCurrent()) setSaving(false);
    console.info(`[scan-timing] baseline=${savedStarted - baselineStarted}ms save=${Date.now() - savedStarted}ms total=${Date.now() - started}ms`);
  };

  const resultPrediction: InferenceResult | null = result;
  const enhanced: PredictionResult | null = resultPrediction ? toPredictionResult(resultPrediction) : null;

  const askExpert = async () => {
    if (!savedId || user?.role !== 'farmer' || requestingReview || reviewRequested) return;
    setRequestingReview(true);
    setReviewError('');
    try {
      // A guest can sign in from this result without visiting History.
      await claimLocalOnlyDiagnoses(user.id, savedId);
      await synchronizeDiagnoses(user.id);
      // A background sync may have started before this scan was saved.
      if ((await getLocalDiagnosis(savedId))?.sync_status !== 'synced') await synchronizeDiagnoses(user.id);
      await requestAgriculturalReview(savedId, reviewOpinion);
      setReviewRequested(true);
      void askToNotifyAboutReviews();
      onStored();
    } catch (error) {
      setReviewError(`${t('result.askFailed')}${error instanceof Error ? ` ${error.message}` : ''}`);
    } finally {
      setRequestingReview(false);
    }
  };

  if (phase === 'result' && result && enhanced) {
    const retake = result.confidence < 0.7 || (photoIssues?.length ?? 0) > 0;
    const healthy = result.classKey === 'healthy';
    const steps = shortSteps(result.classKey, language);
    const farmer = user?.role === 'farmer';
    return (
      <View style={styles.screen}>
        {imageUri && (
          <Pressable accessibilityRole="button" accessibilityLabel="View full size image" onPress={() => setViewerVisible(true)}>
            <Image source={{ uri: imageUri }} style={styles.resultPhoto} resizeMode="cover" />
          </Pressable>
        )}

        <ScanResult result={enhanced} />

        {/* One clear next step: retake when unsure, otherwise what to do for this result. */}
        <View style={styles.nextCard}>
          <Ionicons name={retake ? 'camera-outline' : healthy ? 'checkmark-circle-outline' : 'medkit-outline'} size={22} color={palette.green} />
          <View style={styles.nextCopy}>
            <Text style={styles.nextTitle}>{retake ? t('result.clearerTitle') : t('result.next')}</Text>
            {retake
              ? <Text style={styles.nextText}>{t('result.clearerText')}</Text>
              : steps.map((step, index) => <Text key={step} style={styles.nextText}>{index + 1}. {step}</Text>)}
            {!retake && <Pressable accessibilityRole="button" onPress={() => onOpenGuide(result.classKey)} style={styles.guideLink}>
              <Text style={styles.guideLinkText}>{healthy ? t('result.keepHealthy') : t('result.fullTreatment')}</Text>
              <Ionicons name="arrow-forward" size={15} color={palette.green} />
            </Pressable>}
          </View>
        </View>
        {retake && photoIssues?.length ? <ImageQualityNotice issues={photoIssues} /> : null}
        {retake && <View style={styles.actions}>
          <ActionButton icon="camera-outline" disabled={saving} onPress={() => { reset(); setCameraOpen(true); }}>{t('result.retake')}</ActionButton>
        </View>}

        {saveError ? (
          <View style={styles.actions}>
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={18} color="#8e3028" />
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
            <ActionButton variant="secondary" disabled={saving} onPress={retrySave}>{t('result.retrySave')}</ActionButton>
          </View>
        ) : null}

        {(farmer || !user) && <View style={styles.reviewRequest}>
          <Text style={styles.reviewTitle}>{reviewRequested ? t('result.requestSent') : t('result.askExpert')}</Text>
          {reviewRequested ? <>
            <Text style={styles.reviewHelp}>{t('result.requestSentText')}</Text>
          </> : <>
            <Text style={styles.reviewHelp}>{t('result.opinionPrompt')}</Text>
            <TextInput accessibilityLabel={t('result.opinionPrompt')} style={styles.reviewInput} multiline textAlignVertical="top" maxLength={1000} placeholder={t('history.explainPlaceholder')} placeholderTextColor="#788a7e" value={reviewOpinion} onChangeText={setReviewOpinion} />
            {!farmer ? <Text style={styles.reviewHelp}>{t('result.signInToAsk')}</Text> : null}
            {reviewError ? <Text style={styles.errorText}>{reviewError}</Text> : null}
            <ActionButton icon="person-outline" disabled={saving || requestingReview || !savedId} onPress={() => { if (farmer) void askExpert(); else onSignIn(); }}>{requestingReview ? t('history.sending') : saveError ? t('result.saveFirst') : saving || !savedId ? t('result.saving') : t('result.askExpert')}</ActionButton>
          </>}
        </View>}

        {savedId && <View style={styles.reviewRequest}>
          <Text style={styles.reviewTitle}>{t('result.locationTitle')}</Text>
          <ScanLocationControl key={savedId} localId={savedId} onChanged={onStored} />
        </View>}

        {!retake && <View style={styles.actions}>
          <ActionButton icon="camera-outline" variant="secondary" disabled={saving} onPress={() => { reset(); setCameraOpen(true); }}>{t('result.another')}</ActionButton>
        </View>}

        <ImageViewer uri={imageUri} visible={viewerVisible} onClose={() => setViewerVisible(false)} />
      </View>
    );
  }

  if (phase === 'rejected' && imageUri) {
    return (
      <View style={styles.screen}>
        <Text style={styles.heading}>{t('rejected.heading')}</Text>
        <ViewableImage source={{ uri: imageUri }} title="Photo that was not accepted" style={styles.photo} />
        <View style={styles.rejectCard}>
          <Ionicons name="close-circle" size={22} color="#8e3028" />
          <View style={styles.rejectCopy}>
            <Text style={styles.rejectTitle}>{t('rejected.title')}</Text>
            <Text style={styles.rejectText}>{t('rejected.text')}</Text>
          </View>
        </View>
        <Text style={styles.tipText}>{t('rejected.tip')}</Text>
        <Pressable accessibilityRole="button" onPress={reset} style={({ pressed }) => [styles.checkButton, pressed && styles.dim]}>
          <Ionicons name="camera-outline" size={20} color="#fff" />
          <Text style={styles.checkText}>{t('rejected.again')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>{t('scan.heading')}</Text>
      <Text style={styles.subtitle}>{t('scan.subtitle')}</Text>

      <SelectedImagePreview uri={imageUri} />

      {!imageUri ? (
        <>
          <ImageSelector onSelectCamera={() => setCameraOpen(true)} onSelectGallery={chooseImage} />
          <View style={styles.tipRow}>
            <Ionicons name="bulb-outline" size={17} color={palette.muted} />
            <Text style={styles.tipText}>{t('scan.tip')}</Text>
          </View>
        </>
      ) : (
        <>
          {modelUnavailable ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={18} color="#8e3028" />
              <Text style={styles.errorText}>{t('scan.unavailable')}</Text>
            </View>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel={t('scan.check')} disabled={phase === 'checking' || !modelReady} onPress={checkLeaf} style={[styles.checkButton, (phase === 'checking' || !modelReady) && styles.dim]}>
              {phase === 'checking' || !modelReady ? <ActivityIndicator color="#fff" /> : <Ionicons name="scan-outline" size={22} color="#fff" />}
              <Text style={styles.checkText}>{phase === 'checking' ? t('scan.checking') : !modelReady ? t('scan.preparing') : t('scan.check')}</Text>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={reset} disabled={phase === 'checking'} style={styles.changeLink}>
            <Ionicons name="refresh" size={16} color={palette.green} />
            <Text style={styles.changeText}>{t('scan.changePhoto')}</Text>
          </Pressable>
        </>
      )}

      {modelError && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={18} color="#8e3028" />
          <Text style={styles.errorText}>{modelError}</Text>
        </View>
      )}

      <CameraCapture visible={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={handleCapture} onChooseGallery={chooseImage} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 14, paddingTop: 16, paddingBottom: 24 },
  heading: { color: palette.ink, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: -10 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 },
  tipText: { flex: 1, color: '#737d77', fontSize: 12, lineHeight: 18 },
  checkButton: { minHeight: 60, borderRadius: 14, backgroundColor: palette.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  checkText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  changeLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  changeText: { color: palette.green, fontSize: 15, fontWeight: '700' },
  resultPhoto: { width: '100%', height: 190, borderRadius: 16, backgroundColor: '#edf1ee' },
  guideLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, marginTop: 2 },
  guideLinkText: { color: palette.green, fontSize: 15, fontWeight: '800' },
  actions: { gap: 10 },
  dim: { opacity: 0.65 },
  errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 10, backgroundColor: '#fff0ee', padding: 12 },
  rejectCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, backgroundColor: '#fff0ee', borderWidth: 1, borderColor: '#efc2bd', padding: 14 },
  rejectCopy: { flex: 1, gap: 4 },
  rejectTitle: { color: '#8e3028', fontSize: 15, fontWeight: '800' },
  rejectText: { color: '#80534f', fontSize: 13, lineHeight: 19 },
  errorText: { flex: 1, color: '#8e3028', fontSize: 13, lineHeight: 18 },
  photo: { width: '100%', height: 240, borderRadius: 16, backgroundColor: '#edf1ee' },
  nextCard: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 16, backgroundColor: '#eaf4e9' },
  nextCopy: { flex: 1, gap: 5 },
  nextTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  nextText: { color: '#405e4a', fontSize: 14, lineHeight: 21 },
  reviewRequest: { gap: 10, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#cfe0d6', backgroundColor: '#f3f8f4' },
  reviewTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' },
  reviewHelp: { color: '#405e4a', fontSize: 14, lineHeight: 20 },
  reviewInput: { minHeight: 94, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#bad0c2', backgroundColor: '#fff', color: palette.ink, fontSize: 15, lineHeight: 21 },
});
