import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { palette } from '../connected/ui';
import { CLASS_DISPLAY_NAMES, CLASS_KEYS } from '../classification/disease-data';
import { comparePredictions } from '../../utils/comparison';
import type { ClassKey } from '../classification/types';
import type { PredictionResult } from '../../types/prediction';

const percent = (value: number) => `${Math.min(99.99, Math.max(0, value * 100)).toFixed(2)}%`;

const PLOT_HEIGHT = 150;
const BAR_GAP = 3;
const MIN_BAR_HEIGHT = 10;
const GUTTER = 8;
const GRID_LEVELS = [0, 25, 50, 75, 100];

const BASE_BAR = '#c3cdc7';
const ENH_BAR = '#245f43';
const AXIS_SHORT_NAMES: Record<ClassKey, string> = {
  healthy: 'Healthy',
  sigatoka: 'Sigatoka',
  'panama-disease': 'Panama',
  'cordana-leaf-spot': 'Cordana',
};

const barLabel = (pct: number) => (pct >= 0.05 ? `${pct.toFixed(1)}%` : '<0.1%');

function ResultCard({ label, name, predictedClass, confidence, variant }: { label: string; name: string; predictedClass: ClassKey; confidence: number; variant: 'baseline' | 'enhanced' }) {
  return (
    <View style={[styles.modelCard, variant === 'baseline' ? styles.modelCardBaseline : styles.modelCardEnhanced]}>
      <Text style={[styles.modelLabel, variant === 'enhanced' && styles.modelLabelEnhanced]}>{label}</Text>
      <Text style={styles.modelName} numberOfLines={2}>{name}</Text>
      <Text style={styles.modelClass}>{CLASS_DISPLAY_NAMES[predictedClass]}</Text>
      <Text style={[styles.modelPct, variant === 'enhanced' && styles.modelPctEnhanced]}>{percent(confidence)}</Text>
    </View>
  );
}

function BarCol({ pct, color, winner, side }: { pct: number; color: string; winner: boolean; side: 'left' | 'right' }) {
  const pixelHeight = Math.max(MIN_BAR_HEIGHT, (pct / 100) * PLOT_HEIGHT);
  return (
    <>
      <Text
        style={[styles.barValue, side === 'left' ? styles.barValueLeft : styles.barValueRight, { bottom: pixelHeight + 3 }, winner && styles.barValueWinner]}
        numberOfLines={1}
        allowFontScaling={false}
        accessibilityLabel={`${barLabel(pct)} chance`}
      >
        {barLabel(pct)}
      </Text>
      <View style={[styles.bar, { height: pixelHeight, backgroundColor: color }]} accessible={false} />
    </>
  );
}

export function ModelComparison({ result, baseline, prototype }: { result: PredictionResult; baseline: PredictionResult | null; prototype: boolean }) {
  const [details, setDetails] = useState(false);
  const comparison = baseline ? comparePredictions(baseline, result) : null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>MODEL COMPARISON</Text>
        <Text style={styles.title}>Compare both models</Text>
        <Text style={styles.subtitle}>Both models scanned the same photo and ran on this device. Percentages show how confident each one is about every disease.</Text>
      </View>

      {prototype && (
        <View style={styles.demoStrip}>
          <Ionicons name="flask" size={16} color={palette.warning} />
          <Text style={styles.demoText}>Sample data — no model was run.</Text>
        </View>
      )}

      <View style={styles.modelSplit}>
        {baseline ? <ResultCard variant="baseline" label="BASELINE" name="TF-Lite · standard" predictedClass={baseline.predictedClass} confidence={baseline.confidence} /> : null}
        <ResultCard variant="enhanced" label="ENHANCED" name="Optimized · calibrated" predictedClass={result.predictedClass} confidence={result.confidence} />
      </View>

      {comparison && baseline && (
        <View style={styles.verdict}>
          <Ionicons name={comparison.predictionsAgree ? 'checkmark-circle' : 'swap-horizontal'} size={18} color={comparison.predictionsAgree ? palette.success : palette.warning} />
          <Text style={[styles.verdictText, { color: comparison.predictionsAgree ? palette.success : palette.warning }]}>
            {comparison.predictionsAgree
              ? `Both models point to ${CLASS_DISPLAY_NAMES[result.predictedClass]}.`
              : `Baseline picked ${CLASS_DISPLAY_NAMES[baseline.predictedClass]}, enhanced picked ${CLASS_DISPLAY_NAMES[result.predictedClass]}.`}
          </Text>
        </View>
      )}

      <View style={styles.details}>
        <Pressable accessibilityRole="button" accessibilityLabel={details ? 'Hide chance of each disease' : 'Show chance of each disease'} accessibilityState={{ expanded: details }} onPress={() => setDetails((value) => !value)} style={styles.moreButton}>
          <View style={styles.moreCopy}>
            <Text style={styles.moreTitle}>Chance of each disease</Text>
            <Text style={styles.moreHint}>{details ? 'Tap to hide the graph' : 'Tap to see the percentage of every disease'}</Text>
          </View>
          <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={18} color={palette.green} />
        </Pressable>

        {details && (
          <View style={styles.breakdown}>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: BASE_BAR }]} />
                <Text style={styles.legendText}>Baseline</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: ENH_BAR }]} />
                <Text style={styles.legendText}>Enhanced</Text>
              </View>
            </View>

            <View style={styles.plotWrap}>
              <View style={styles.gridLayer}>
                {GRID_LEVELS.map((level) => (
                  <View key={level} style={[styles.gridLine, { bottom: (level / 100) * PLOT_HEIGHT }]} />
                ))}
              </View>

              <View style={styles.plotRow}>
                <View style={styles.gutter} />
                {CLASS_KEYS.map((classKey) => {
                  const base = baseline?.probabilities.find((item) => item.classKey === classKey)?.probability ?? 0;
                  const enh = result.probabilities.find((item) => item.classKey === classKey)?.probability ?? 0;
                  const basePick = baseline?.predictedClass === classKey;
                  const enhPick = result.predictedClass === classKey;
                  return (
                    <View key={classKey} style={styles.group}>
                      {baseline ? <BarCol pct={base * 100} color={BASE_BAR} winner={basePick} side="left" /> : null}
                      <BarCol pct={enh * 100} color={ENH_BAR} winner={enhPick} side="right" />
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.axisRow}>
              <View style={styles.gutterSpacer} />
              {CLASS_KEYS.map((classKey) => (
                <Text key={classKey} style={styles.axisLabel} numberOfLines={2}>
                  {AXIS_SHORT_NAMES[classKey]}
                </Text>
              ))}
            </View>

            <Text style={styles.gaugeCaption}>Out of 100 (%). Higher bar = more likely that disease. Small matches are kept visible so no percentage disappears.</Text>
          </View>
        )}
      </View>

      {details && (
        <Text style={styles.calibrationNote}>Enhanced percentages are calibrated so a scan is never shown as 100% certain. Both models run on this device, even without a connection.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 11, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff' },
  header: { gap: 3, marginTop: 12 },
  eyebrow: { color: palette.green, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: palette.ink, fontSize: 20, fontWeight: '900' },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  demoStrip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fff6d9', borderColor: '#ead596', borderWidth: 1, borderRadius: 11, padding: 10 },
  demoText: { flex: 1, color: palette.warning, fontSize: 12, fontWeight: '700' },
  modelSplit: { flexDirection: 'row', gap: 10 },
  modelCard: { flex: 1, gap: 2, padding: 14, borderRadius: 14, borderWidth: 1 },
  modelCardBaseline: { backgroundColor: '#fbfcfb', borderColor: '#dde5e0' },
  modelCardEnhanced: { backgroundColor: '#f0f6f1', borderColor: '#c3d8cb' },
  modelLabel: { color: '#6c7870', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  modelLabelEnhanced: { color: palette.green },
  modelName: { color: palette.muted, fontSize: 11, fontWeight: '600', minHeight: 26 },
  modelClass: { color: '#1d3327', fontSize: 17, fontWeight: '800', marginTop: 4 },
  modelPct: { color: '#3a4640', fontSize: 26, lineHeight: 30, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 2 },
  modelPctEnhanced: { color: '#245f43' },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f4f7f2', borderRadius: 12, padding: 12 },
  verdictText: { flex: 1, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  details: { gap: 10, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 10 },
  moreButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: '#d5ddd8', borderRadius: 12 },
  moreCopy: { flex: 1, gap: 2 },
  moreTitle: { color: '#22372c', fontSize: 15, fontWeight: '800' },
  moreHint: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  breakdown: { gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#f6f8f7', borderWidth: 1, borderColor: '#e5eae7' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 4 },
  legendText: { color: '#4c5a52', fontSize: 13, fontWeight: '700' },
  plotWrap: { position: 'relative' },
  gridLayer: { position: 'absolute', left: GUTTER, right: 0, bottom: 0, height: PLOT_HEIGHT },
  gridLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderTopColor: '#e2e8e4' },
  plotRow: { flexDirection: 'row', alignItems: 'flex-end' },
  gutter: { width: GUTTER, height: PLOT_HEIGHT + 16 },
  group: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: BAR_GAP, position: 'relative' },
  bar: { width: '42%', borderRadius: 5 },
  barValue: { position: 'absolute', color: '#5e6c64', fontSize: 11, lineHeight: 12, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  barValueLeft: { left: 0, width: '50%', paddingRight: 3, textAlign: 'right' },
  barValueRight: { left: '50%', width: '50%', paddingLeft: 3, textAlign: 'left' },
  barValueWinner: { color: '#1d3327', fontWeight: '900' },
  axisRow: { flexDirection: 'row' },
  gutterSpacer: { width: GUTTER },
  axisLabel: { flex: 1, color: '#4c5a52', fontSize: 12, fontWeight: '700', lineHeight: 15, textAlign: 'center' },
  gaugeCaption: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  calibrationNote: { color: '#75684e', fontSize: 12, lineHeight: 17, fontStyle: 'italic', paddingHorizontal: 4 },
});