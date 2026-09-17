import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';

import { ModelStatus, ModelStatusState } from './modelStatus';

const tones: Record<ModelStatus, { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; color: string; soft: string; border: string }> = {
  loading: { icon: 'cloud-outline', title: 'Checking models', subtitle: 'Warming up the on-device classifier', color: '#5e6d67', soft: '#f0f3f1', border: '#dbe3de' },
  real: { icon: 'checkmark-circle', title: 'Real models ready', subtitle: '', color: '#1f6a4d', soft: '#e6f4ed', border: '#bddfce' },
  prototype: { icon: 'flask', title: 'Prototype mode', subtitle: 'Sample data — no model was run', color: '#8a5a00', soft: '#fff6d9', border: '#ead596' },
  unavailable: { icon: 'close-circle', title: 'Models unavailable', subtitle: 'The on-device model could not be loaded', color: '#8e3028', soft: '#ffeeec', border: '#efc2bd' },
};

function verifiedSubtitle(state: ModelStatusState): string {
  if (state.status !== 'real' || !state.fingerprints) return '';
  const today = new Date().toLocaleDateString('en-US');
  return `Models verified ${today} • Baseline ${state.fingerprints.baseline || '—'} • Enhanced ${state.fingerprints.enhanced || '—'}`;
}

export function ModelStatusBanner({ state }: { state: ModelStatusState }) {
  const tone = tones[state.status];
  const subtitle = state.status === 'real' ? verifiedSubtitle(state) : tone.subtitle;
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <View accessibilityLabel={tone.title} style={[styles.banner, { backgroundColor: tone.soft, borderColor: tone.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: tone.color }]}><Ionicons name={tone.icon} size={16} color="#fff" /></View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: tone.color }]}>{tone.title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.version}>App v{appVersion}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8 },
  iconWrap: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 1 },
  title: { fontSize: 13, fontWeight: '800' },
  subtitle: { color: '#5e6d67', fontSize: 11, fontWeight: '600' },
  version: { color: '#5e6d67', fontSize: 11, fontWeight: '700' },
});