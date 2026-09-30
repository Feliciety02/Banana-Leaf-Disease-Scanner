import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { ActionButton, palette } from '../connected/ui';
import { analyzeLeaf, analyzeBaselineLeaf, type InferenceResult } from '../classification/inference';
import { prepareImageForInference } from '../classification/preprocessing';
import { checkBananaLeafPhoto, LEAF_GATE_BLOCKING } from '../classification/leafGate';
import { TreatmentGuide } from '../classification/TreatmentGuide';
import { saveLocalDiagnosis, type ModelComparisonEntry } from '../../storage/localDiagnoses';
import type { SessionUser } from '../../services/api';
import type { PredictionResult } from '../../types/prediction';
import type { ModelStatusState } from '../status/modelStatus';
import { ImageViewer } from '../../components/ImageViewer';
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

export function ScanScreen({ user, onStored, modelStatus, onOpenHistory, onDirtyChange }: { onDirtyChange: (dirty: boolean) => void; onOpenHistory: (id?: string) => void; user: SessionUser | null; onStored: () => void; modelStatus: ModelStatusState }) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [photoIssues, setPhotoIssues] = useState<ImageQualityIssue[] | null>(null);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [phase, setPhase] = useState<'scan' | 'ready' | 'checking' | 'result' | 'rejected'>('scan');
  const [saveError, setSaveError] = useState('');
  const [modelError, setModelError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [showCare, setShowCare] = useState(false);
  const savedIdRef = useRef<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
  useEffect(() => { onDirtyChange(Boolean(imageUri && !savedId)); return () => onDirtyChange(false); }, [imageUri, savedId, onDirtyChange]);

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
    setShowCare(false);
    savedIdRef.current = null; setSavedId(null); setSaving(false); saveInput.current = null;
  };

  const chooseImage = async () => {
    const selection = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.9 });
    if (selection.canceled) return;
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
      setModelError('This photo could not be checked. Please try again or choose another photo.');
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

  if (phase === 'result' && result && enhanced) {
    return (
      <View style={styles.screen}>
        <Text style={styles.heading}>Result</Text>

        <ScanResult result={enhanced} />
        <Text style={styles.nextText}>{saving ? 'Saving scan on this phone...' : savedId ? 'Saved on this phone. Open the scan to follow its sync and review progress.' : 'This result has not been saved yet.'}</Text>
        {savedId && <ActionButton icon="time-outline" onPress={() => onOpenHistory(savedId)}>View saved scan / appeal result</ActionButton>}
        {saveError && <ActionButton disabled={saving} onPress={retrySave}>Retry saving scan</ActionButton>}

        <View style={styles.nextCard}>
          <Ionicons name={result.confidence < 0.7 || (photoIssues?.length ?? 0) > 0 ? 'camera-outline' : 'leaf-outline'} size={22} color={palette.green} />
          <View style={styles.nextCopy}>
            <Text style={styles.nextTitle}>What to do next</Text>
            <Text style={styles.nextText}>{result.confidence < 0.7 || (photoIssues?.length ?? 0) > 0 ? 'Take another clear photo in even light. Keep the whole leaf and affected area in focus.' : result.classKey === 'healthy' ? 'Keep monitoring this plant. Scan again if the leaf changes.' : 'Compare the visible signs and read the care guidance below. Ask a local expert if symptoms spread.'}</Text>
          </View>
        </View>

        <Pressable accessibilityRole="button" disabled={saving || Boolean(saveError)} onPress={() => { reset(); setCameraOpen(true); }} style={styles.againButton}>
          <Ionicons name="camera-outline" size={18} color={palette.green} />
          <Text style={styles.againText}>{result.confidence < 0.7 || (photoIssues?.length ?? 0) > 0 ? 'Retake photo' : 'Scan another leaf'}</Text>
        </Pressable>

        {photoIssues?.length ? <ImageQualityNotice issues={photoIssues} /> : null}

        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showCare }} onPress={() => setShowCare((value) => !value)} style={styles.careToggle}>
          <Ionicons name="book-outline" size={19} color={palette.green} />
          <Text style={styles.careToggleText}>{showCare ? 'Hide care guidance' : 'Read care guidance'}</Text>
          <Ionicons name={showCare ? 'chevron-up' : 'chevron-down'} size={19} color={palette.green} />
        </Pressable>
        {showCare && <TreatmentGuide classKey={result.classKey} />}

        {imageUri && (
          <Pressable accessibilityRole="button" accessibilityLabel="View full size image" onPress={() => setViewerVisible(true)}>
            <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />
          </Pressable>
        )}

        {saveError && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={18} color="#8e3028" />
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        )}

        <Text style={styles.footer}>For research use only</Text>

        <ImageViewer uri={imageUri} visible={viewerVisible} onClose={() => setViewerVisible(false)} />
      </View>
    );
  }

  if (phase === 'rejected' && imageUri) {
    return (
      <View style={styles.screen}>
        <Text style={styles.heading}>Not a real leaf photo</Text>
        <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" accessibilityLabel="Photo that was not accepted" />
        <View style={styles.rejectCard}>
          <Ionicons name="close-circle" size={22} color="#8e3028" />
          <View style={styles.rejectCopy}>
            <Text style={styles.rejectTitle}>This doesn't look like a real photo of a leaf</Text>
            <Text style={styles.rejectText}>DahonMD only checks real photos of banana leaves. Paintings, drawings, cartoons and photos of other objects can't be diagnosed.</Text>
          </View>
        </View>
        <Text style={styles.tipText}>Take a clear photo of one banana leaf in good light, with the leaf filling most of the picture.</Text>
        <Pressable accessibilityRole="button" onPress={reset} style={({ pressed }) => [styles.checkButton, pressed && styles.dim]}>
          <Ionicons name="camera-outline" size={20} color="#fff" />
          <Text style={styles.checkText}>Take another photo</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Scan a leaf</Text>
      <Text style={styles.subtitle}>Take or choose a clear banana leaf photo.</Text>

      <SelectedImagePreview uri={imageUri} />

      {!imageUri ? (
        <>
          <ImageSelector onSelectCamera={() => setCameraOpen(true)} onSelectGallery={chooseImage} />
          <View style={styles.tipRow}>
            <Ionicons name="bulb-outline" size={17} color={palette.muted} />
            <Text style={styles.tipText}>Keep the whole leaf visible and avoid shadows.</Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.previewActions}>
            <Pressable accessibilityRole="button" onPress={reset} disabled={phase === 'checking'} style={styles.retakeButton}>
              <Ionicons name="camera-outline" size={18} color={palette.green} />
              <Text style={styles.retakeText}>Retake</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={chooseImage} disabled={phase === 'checking'} style={styles.retakeButton}>
              <Ionicons name="images-outline" size={18} color={palette.green} />
              <Text style={styles.retakeText}>Choose another</Text>
            </Pressable>
          </View>
          <Text style={styles.previewHint}>Check that the leaf fills the photo and the affected area is sharp.</Text>
          {modelUnavailable ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={18} color="#8e3028" />
              <Text style={styles.errorText}>The leaf checker could not start on this phone. Close and reopen DahonMD, then try again.</Text>
            </View>
          ) : !modelReady ? (
            <View style={styles.readyRow}><ActivityIndicator color={palette.green} /><Text style={styles.readyText}>Getting ready…</Text></View>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Check leaf" disabled={phase === 'checking'} onPress={checkLeaf} style={[styles.checkButton, phase === 'checking' && styles.dim]}>
              <Ionicons name="scan-outline" size={20} color="#fff" />
              <Text style={styles.checkText}>{phase === 'checking' ? 'Checking…' : 'Use photo and check leaf'}</Text>
            </Pressable>
          )}
          {phase === 'checking' && (
            <View style={styles.statusCard}>
              <ActivityIndicator color={palette.green} />
              <Text style={styles.statusText}>Checking the leaf…</Text>
            </View>
          )}
        </>
      )}

      {modelError && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={18} color="#8e3028" />
          <Text style={styles.errorText}>{modelError}</Text>
        </View>
      )}

      <CameraCapture visible={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={handleCapture} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 14, paddingTop: 16, paddingBottom: 24 },
  heading: { color: palette.ink, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: -10 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 },
  tipText: { flex: 1, color: '#737d77', fontSize: 12, lineHeight: 18 },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 4 },
  readyText: { color: palette.green, fontSize: 15, fontWeight: '700' },
  checkButton: { minHeight: 52, borderRadius: 12, backgroundColor: palette.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  checkText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dim: { opacity: 0.65 },
  statusCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52, borderRadius: 10, backgroundColor: '#eef5f1' },
  statusText: { color: palette.green, fontSize: 14, fontWeight: '700' },
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
  careToggle: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff' },
  careToggleText: { flex: 1, color: palette.green, fontSize: 15, fontWeight: '800' },
  previewActions: { flexDirection: 'row', gap: 9 },
  retakeButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: '#b9cbc1', backgroundColor: '#fff' },
  retakeText: { color: palette.green, fontSize: 14, fontWeight: '800' },
  previewHint: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  againButton: { minHeight: 50, borderRadius: 11, borderWidth: 1, borderColor: '#aac1b4', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  againText: { color: '#245f43', fontSize: 15, fontWeight: '700' },
  footer: { color: '#89918c', fontSize: 11, textAlign: 'center', fontWeight: '600', marginTop: 4 },
});
