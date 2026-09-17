import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { palette } from '../connected/ui';
import { describeIssues, type ImageQualityIssue } from './scanQuality';

export function ImageQualityNotice({ issues }: { issues: ImageQualityIssue[] }) {
  if (issues.length === 0) {
    return (
      <View accessibilityLabel="Photo looks good" style={[styles.card, styles.okCard]}>
        <Ionicons name="checkmark-circle" size={22} color={palette.success} />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: palette.success }]}>Photo looks good</Text>
          <Text style={styles.subtitle}>Clear leaf with even lighting.</Text>
        </View>
      </View>
    );
  }
  return (
    <View accessibilityLabel="Photo may be unclear" style={[styles.card, styles.warnCard]}>
      <Ionicons name="warning" size={22} color={palette.warning} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: palette.warning }]}>Photo may be unclear</Text>
        <Text style={styles.subtitle}>{describeIssues(issues)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: 1, padding: 13 },
  okCard: { backgroundColor: '#e6f4ed', borderColor: '#bddfce' },
  warnCard: { backgroundColor: '#fff6d9', borderColor: '#ead596' },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 18 },
});