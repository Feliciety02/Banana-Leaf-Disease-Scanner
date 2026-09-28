import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { palette } from '../connected/ui';
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

export function ScanScreen({ user, onStored, modelStatus }: { user: SessionUser | null; onStored: () => void; modelStatus: ModelStatusState }) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [photoIssues, setPhotoIssues] = useState<ImageQualityIssue[] | null>(null);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [phase, setPhase] = useState<'scan' | 'ready' | 'checking' | 'result' | 'rejected'>('scan');
  const [saveError, setSaveError] = useState('');
  const [modelError, setModelError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const savedIdRef = useRef<string | null>(null);
  const scanIdRef = useRef(0);

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
    savedIdRef.current = null;
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
      setPhase('result');
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
      const saved = await saveLocalDiagnosis({
        predictedClass: next.classKey,
        confidence: next.confidence * 100,
        modelVersion: next.modelVersion,
        inferenceTimeMs: next.latencyMs,
        imageUri,
        ownerUserId: user?.role === 'farmer' ? user.id : null,
        probabilities: next.probabilities,
        baseline: baselineResult ? toComparisonEntry(baselineResult) : null,
        enhanced: toComparisonEntry(next),
      });
      if (isCurrent()) savedIdRef.current = saved?.local_id ?? null;
      onStored();
    } catch (storageError) {
      if (isCurrent()) setSaveError(storageError instanceof Error ? storageError.message : 'The local database could not save this result.');
    }
    console.info(`[scan-timing] baseline=${savedStarted - baselineStarted}ms save=${Date.now() - savedStarted}ms total=${Date.now() - started}ms`);
  };

  const resultPrediction: InferenceResult | null = result;
  const enhanced: PredictionResult | null = resultPrediction ? toPredictionResult(resultPrediction) : null;

  if (phase === 'result' && result && enhanced) {
    return (
      <View style={styles.screen}>
        <Text style={styles.heading}>Result</Text>

        {imageUri && (
          <Pressable accessibilityRole="button" accessibilityLabel="View full size image" onPress={() => setViewerVisible(true)}>
            <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />
          </Pressable>
        )}

        {photoIssues && <ImageQualityNotice issues={photoIssues} />}

        <ScanResult result={enhanced} />

        <TreatmentGuide classKey={result.classKey} />

        {saveError && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={18} color="#8e3028" />
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        )}

        <Pressable accessibilityRole="button" onPress={reset} style={styles.againButton}>
          <Ionicons name="camera-outline" size={18} color={palette.green} />
          <Text style={styles.againText}>Scan another leaf</Text>
        </Pressable>

        <Text style={styles.footer}>For research use only</Text>

        <ImageViewer uri={imageUri} visible={viewerVisible} onClose={() => setViewerVisible(false)} />
      </View>
    );
  }

  if (phase === 'rejected' && imageUri) {
    return (
      <View style={styles.screen}>
        <Text style={styles.heading}>Not a banana leaf</Text>
        <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" accessibilityLabel="Photo that was not accepted" />
        <View style={styles.rejectCard}>
          <Ionicons name="close-circle" size={22} color="#8e3028" />
          <View style={styles.rejectCopy}>
            <Text style={styles.rejectTitle}>This doesn't look like a real banana leaf photo</Text>
            <Text style={styles.rejectText}>DahonMD only checks real photos of banana leaves. Paintings, drawings, screenshots, other plants and other objects can't be diagnosed.</Text>
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
              <Text style={styles.checkText}>{phase === 'checking' ? 'Checking…' : 'Check leaf'}</Text>
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
  againButton: { minHeight: 50, borderRadius: 11, borderWidth: 1, borderColor: '#aac1b4', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  againText: { color: '#245f43', fontSize: 15, fontWeight: '700' },
  footer: { color: '#89918c', fontSize: 11, textAlign: 'center', fontWeight: '600', marginTop: 4 },
});