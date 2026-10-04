import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { palette } from '../connected/ui';
import { CLASS_KEYS } from '../classification/disease-data';
import type { PredictionResult } from '../../types/prediction';
import { className } from '../../i18n/content';
import { useT, type StringKey } from '../../i18n';
import { ProbabilityRow } from './ProbabilityRow';

const LOW_CONFIDENCE = 0.7;
const HIGH_CONFIDENCE = 0.85;

/** How sure the result is, in words a farmer can act on; the exact numbers stay under "More info". */
export function certaintyLevel(confidence: number): { key: StringKey; tone: 'sure' | 'likely' | 'unsure'; bars: number } {
  if (confidence >= HIGH_CONFIDENCE) return { key: 'result.sure', tone: 'sure', bars: 3 };
  if (confidence >= LOW_CONFIDENCE) return { key: 'result.likely', tone: 'likely', bars: 2 };
  return { key: 'result.unsure', tone: 'unsure', bars: 1 };
}

export function ScanResult({ result }: { result: PredictionResult }) {
  const [showDetails, setShowDetails] = useState(false);
  const { t, language } = useT();
  const level = certaintyLevel(result.confidence);
  const unsure = level.tone === 'unsure';
  const color = unsure ? '#8a5a00' : '#1e6b47';

  return (
    <View style={styles.container}>
      <View style={styles.result}>
        <Text style={styles.prediction}>{className(result.predictedClass, language)}</Text>
        <View style={styles.certainty} accessibilityLabel={t(level.key)}>
          <View style={styles.bars}>
            {[1, 2, 3].map((bar) => <View key={bar} style={[styles.bar, { height: 6 + bar * 5 }, bar <= level.bars && { backgroundColor: color }]} />)}
          </View>
          <Text style={[styles.certaintyText, { color }]}>{t(level.key)}</Text>
        </View>
      </View>

      {unsure && (
        <View style={styles.uncertainNotice}>
          <Ionicons name="camera-outline" size={18} color="#76591e" />
          <Text style={styles.uncertainText}>{t('result.unsureNotice')}</Text>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showDetails }}
        onPress={() => setShowDetails((current) => !current)}
        style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}
      >
        <Text style={styles.detailsButtonText}>{showDetails ? t('result.hideInfo') : t('result.moreInfo')}</Text>
        <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={18} color="#325e47" />
      </Pressable>

      {showDetails && (
        <View style={styles.detailsPanel}>
          {CLASS_KEYS.map((classKey) => (
            <ProbabilityRow
              key={classKey}
              label={className(classKey, language)}
              probability={result.probabilities.find((item) => item.classKey === classKey)?.probability ?? 0}
              selected={classKey === result.predictedClass}
            />
          ))}
          <Text style={styles.note}>{t('result.calibrated')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  result: { gap: 10, backgroundColor: '#fff', borderColor: palette.border, borderRadius: 14, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 18 },
  prediction: { color: '#1d3327', fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  certainty: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 7, borderRadius: 2, backgroundColor: '#dde5e0' },
  certaintyText: { fontSize: 17, fontWeight: '800' },
  uncertainNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fff6e5', borderColor: '#e6d09e', borderRadius: 10, borderWidth: 1, padding: 12 },
  uncertainText: { flex: 1, color: '#76591e', fontSize: 14, lineHeight: 20 },
  detailsButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 46, paddingHorizontal: 4 },
  detailsButtonText: { color: '#325e47', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.6 },
  detailsPanel: { backgroundColor: '#f6f8f7', borderRadius: 10, gap: 12, padding: 14 },
  note: { color: '#6a746e', fontSize: 11, lineHeight: 16 },
});
