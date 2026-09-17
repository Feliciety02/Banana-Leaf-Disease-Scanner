import { StyleSheet, Text, View } from 'react-native';

import { palette } from '../connected/ui';

export function ProbabilityRow({ label, probability, selected }: { label: string; probability: number; selected?: boolean }) {
  const percent = Math.min(99.99, Math.max(0, probability * 100));
  const width = `${Math.min(100, percent)}%` as `${number}%`;
  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, selected && styles.labelActive]}>{label}</Text>
        <Text style={[styles.value, selected && styles.labelActive]}>{percent.toFixed(2)}%</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, selected && styles.fillActive, { width }]} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 5 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  label: { flex: 1, color: palette.muted, fontSize: 13, fontWeight: '600' },
  labelActive: { color: palette.green, fontWeight: '900' },
  value: { color: palette.muted, fontSize: 13, fontWeight: '700' },
  track: { height: 7, overflow: 'hidden', borderRadius: 99, backgroundColor: '#dfe8e2' },
  fill: { height: '100%', borderRadius: 99, backgroundColor: '#8eaaa0' },
  fillActive: { backgroundColor: palette.green },
});