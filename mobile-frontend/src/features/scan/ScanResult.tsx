import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette } from '../connected/ui';
import { CLASS_DISPLAY_NAMES, CLASS_KEYS } from '../classification/disease-data';
import type { PredictionResult } from '../../types/prediction';
import { ProbabilityRow } from './ProbabilityRow';

const LOW_CONFIDENCE = 0.7;

// Calibrated confidences never reach 100%, so cap the display below it.
const percent = (value: number) => `${Math.min(99.9, Math.max(0, value * 100)).toFixed(1)}%`;

function confidenceWord(value: number) {
  if (value < LOW_CONFIDENCE) return 'Uncertain result';
  return value >= 0.85 ? 'High confidence' : 'Moderate confidence';
}

export function ScanResult({ result }: { result: PredictionResult }) {
  const [showDetails, setShowDetails] = useState(false);
  const uncertain = result.confidence < LOW_CONFIDENCE;

  return (
    <View style={styles.container}>
      <View style={styles.result}>
        <View style={styles.resultCopy}>
          <Text style={styles.prediction}>{CLASS_DISPLAY_NAMES[result.predictedClass]}</Text>
          <Text style={[styles.confidenceWord, uncertain && styles.uncertain]}>{confidenceWord(result.confidence)}</Text>
        </View>
        <View style={styles.confidence}>
          <Text style={[styles.confidenceValue, uncertain && styles.uncertain]}>{percent(result.confidence)}</Text>
          <Text style={styles.confidenceLabel}>confidence</Text>
        </View>
      </View>

      {uncertain && (
        <View style={styles.uncertainNotice}>
          <Text style={styles.uncertainText}>DahonMD is not sure. Retake the photo in good light with the whole leaf in view.</Text>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
        onPress={() => setShowDetails((current) => !current)}
        style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}
      >
        <Text style={styles.detailsButtonText}>{showDetails ? 'Hide info' : 'More info'}</Text>
        <Text style={styles.toggle}>{showDetails ? '−' : '+'}</Text>
      </Pressable>

      {showDetails && (
        <View style={styles.detailsPanel}>
          {CLASS_KEYS.map((classKey) => (
            <ProbabilityRow
              key={classKey}
              label={CLASS_DISPLAY_NAMES[classKey]}
              probability={result.probabilities.find((item) => item.classKey === classKey)?.probability ?? 0}
              selected={classKey === result.predictedClass}
            />
          ))}
          <Text style={styles.note}>Confidence is calibrated, so a scan is never shown as 100% certain.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  result: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: palette.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  resultCopy: { flex: 1, gap: 4 },
  label: { color: '#6c7870', fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  prediction: { color: '#1d3327', fontSize: 20, fontWeight: '800' },
  confidenceWord: { color: palette.muted, fontSize: 13, fontWeight: '600' },
  confidence: { alignItems: 'flex-end', gap: 1 },
  confidenceValue: { color: '#1e6b47', fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  confidenceLabel: { color: '#78837c', fontSize: 11, fontWeight: '600' },
  uncertain: { color: '#8a5a00' },
  uncertainNotice: { backgroundColor: '#fff6e5', borderColor: '#e6d09e', borderRadius: 10, borderWidth: 1, padding: 12 },
  uncertainText: { color: '#76591e', fontSize: 13, lineHeight: 19 },
  detailsButton: {
    alignItems: 'center',
    borderColor: '#d5ddd8',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 16,
  },
  detailsButtonText: { color: '#325e47', fontSize: 15, fontWeight: '700' },
  toggle: { color: '#325e47', fontSize: 20 },
  pressed: { backgroundColor: '#f1f5f2' },
  detailsPanel: { backgroundColor: '#f6f8f7', borderRadius: 10, gap: 12, padding: 14 },
  note: { color: '#6a746e', fontSize: 11, lineHeight: 16 },
});
