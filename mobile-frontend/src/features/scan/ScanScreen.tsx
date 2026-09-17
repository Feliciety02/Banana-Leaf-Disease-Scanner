import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { palette } from '../connected/ui';
import { analyzeLeaf, analyzeBaselineLeaf, type InferenceResult } from '../classification/inference';
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
import { ModelComparison } from './ModelComparison';
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
  const [baseline, setBaseline] = useState<InferenceResult | null>(null);
  const [phase, setPhase] = useState<'scan' | 'ready' | 'checking' | 'result'>('scan');
  const [saveError, setSaveError] = useState('');
  const [modelError, setModelError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const savedIdRef = useRef<string | null>(null);

  const modelReady = modelStatus.status === 'real' || modelStatus.status === 'prototype';
  const prototype = modelStatus.status === 'prototype';

  const reset = () => {
    setImageUri(null);
    setPhotoIssues(null);
    setResult(null);
    setBaseline(null);
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
    setPhase('checking');
    setSaveError('');
    setModelError('');
    try {
      const quality = await evaluateImageQuality(imageUri);
      setPhotoIssues(quality.issues);
      const next = await analyzeLeaf(imageUri);
      setResult(next);
      let baselineResult: InferenceResult | null = null;
      try {
        baselineResult = await analyzeBaselineLeaf(imageUri);
        setBaseline(baselineResult);
      } catch {
        setBaseline(null);
      }
      let savedLocalId: string | null = null;
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
        if (saved?.local_id) savedLocalId = saved.local_id;
        savedIdRef.current = savedLocalId;
        onStored();
      } catch (storageError) {
        setSaveError(storageError instanceof Error ? storageError.message : 'The local database could not save this result.');
      }
      setPhase('result');
    } catch (error) {
      setModelError(error instanceof Error ? error.message : 'The on-device model could not analyze this leaf.');
      setPhase('ready');
    }
  };

  const resultPrediction: InferenceResult | null = result;
  const enhanced: PredictionResult | null = resultPrediction ? toPredictionResult(resultPrediction) : null;
  const baselinePrediction: PredictionResult | null = baseline ? toPredictionResult(baseline) : null;

  if (phase === 'result' && result && enhanced) {
    return (
      <View style={styles.screen}>
        <Text style={styles.heading}>{prototype ? 'Prototype result' : 'Result'}</Text>

        {imageUri && (
          <View style={styles.photoCard}>
            <Pressable accessibilityRole="button" accessibilityLabel="View full size image" onPress={() => setViewerVisible(true)}>
              <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" />
            </Pressable>
            <Text style={styles.caption}>Same photo used for both</Text>
          </View>
        )}

        {photoIssues && <ImageQualityNotice issues={photoIssues} />}

        <ModelComparison result={enhanced} baseline={baselinePrediction} prototype={prototype} />

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
          {!modelReady ? (
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
  heading: { color: palette.ink, fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: '#6c7d77', fontSize: 16, lineHeight: 23, fontWeight: '500', marginTop: -8 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 },
  tipText: { flex: 1, color: palette.muted, fontSize: 13, lineHeight: 19 },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 4 },
  readyText: { color: palette.green, fontSize: 15, fontWeight: '700' },
  checkButton: { minHeight: 56, borderRadius: 16, backgroundColor: palette.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  checkText: { color: '#fff', fontSize: 17, fontWeight: '900' },
  dim: { opacity: 0.65 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, backgroundColor: '#e6f4ed', borderWidth: 1, borderColor: '#bddfce', padding: 14 },
  statusText: { color: palette.green, fontSize: 14, fontWeight: '700' },
  errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 13, backgroundColor: '#ffeeec', borderWidth: 1, borderColor: '#efc2bd', padding: 12 },
  errorText: { flex: 1, color: '#8e3028', fontSize: 13, lineHeight: 18 },
  photoCard: { gap: 6 },
  photo: { width: '100%', height: 240, borderRadius: 16, backgroundColor: '#0b3328' },
  caption: { color: palette.muted, fontSize: 12, textAlign: 'center', fontWeight: '600' },
  againButton: { minHeight: 54, borderRadius: 16, borderWidth: 1.5, borderColor: palette.green, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  againText: { color: palette.green, fontSize: 16, fontWeight: '800' },
  footer: { color: '#8a9892', fontSize: 12, textAlign: 'center', fontWeight: '600', marginTop: 4 },
});