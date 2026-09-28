import { StyleSheet, Text, View } from 'react-native';

export function ProbabilityRow({ label, probability, selected }: { label: string; probability: number; selected?: boolean }) {
  const percent = Math.min(99.9, Math.max(0, probability * 100));
  const width = `${Math.min(100, percent)}%` as `${number}%`;
  return (
    <View style={styles.row}>
      <Text style={[styles.label, selected && styles.labelActive]}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, selected && styles.fillActive, { width }]} />
        <Text style={[styles.value, selected && percent >= 50 && styles.valueOnFill]}>{percent.toFixed(1)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  label: { color: '#36433b', fontSize: 13, fontWeight: '600' },
  labelActive: { color: '#1e6b47', fontWeight: '800' },
  track: { height: 24, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderRadius: 5, backgroundColor: '#e3eae6' },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: '#9cb8aa' },
  fillActive: { backgroundColor: '#4b8a6f' },
  value: { color: '#245f43', fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '800' },
  valueOnFill: { color: '#fff' },
});
