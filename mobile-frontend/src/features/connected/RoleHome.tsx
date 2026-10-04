import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { TabKey } from '../../app/navigation';
import type { SessionUser } from '../../services/api';
import { AdminWorkspace } from './AdminWorkspace';
import { ReviewerWorkspace } from './ReviewerWorkspace';
import { palette } from './ui';

type Role = 'admin' | 'agricultural_expert';
type Shortcut = { tab: TabKey; title: string; detail: string; icon: keyof typeof Ionicons.glyphMap };

const shortcuts: Record<Role, Shortcut[]> = {
  admin: [
    { tab: 'accounts', title: 'Users', detail: 'Manage farmer and reviewer accounts', icon: 'people-outline' },
    { tab: 'diagnoses', title: 'Scans', detail: 'Inspect saved diagnoses', icon: 'images-outline' },
    { tab: 'knowledge', title: 'Knowledge', detail: 'Maintain disease records and sources', icon: 'library-outline' },
  ],
  agricultural_expert: [
    { tab: 'reviewed', title: 'Reviewed scans', detail: 'Revisit completed assessments', icon: 'checkmark-done-circle-outline' },
    { tab: 'content', title: 'Content review', detail: 'Verify disease and dataset content', icon: 'library-outline' },
    { tab: 'guide', title: 'Disease guide', detail: 'Check visible signs and guidance', icon: 'book-outline' },
  ],
};

export function RoleHome({ user, role, onNavigate }: { user: SessionUser; role: Role; onNavigate: (tab: TabKey) => void }) {
  const admin = role === 'admin';
  const firstName = user.name.trim().split(/\s+/)[0];
  return <View style={styles.screen}>
    <View style={styles.hero}>
      <View style={styles.heroIcon}><Ionicons name={admin ? 'grid-outline' : 'shield-checkmark-outline'} size={25} color="#d9f4a5" /></View>
      <Text style={styles.eyebrow}>{admin ? 'ADMIN WORKSPACE' : 'AGRICULTURAL REVIEW WORKSPACE'}</Text>
      <Text style={styles.title}>{firstName ? `Welcome, ${firstName}.` : 'Welcome back.'}</Text>
      <Text style={styles.description}>{admin ? 'Monitor the system and manage the people, scans, and knowledge behind DahonMD.' : 'Start with scans waiting for your assessment, then continue with completed reviews and content checks.'}</Text>
    </View>
    {admin ? <AdminWorkspace section="overview" /> : <ReviewerWorkspace scope="pending" />}
    <View style={styles.shortcuts}>
      {shortcuts[role].map((item) => <Pressable key={item.tab} accessibilityRole="button" onPress={() => onNavigate(item.tab)} style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}>
        <View style={styles.shortcutIcon}><Ionicons name={item.icon} size={20} color={palette.green} /></View>
        <View style={styles.shortcutCopy}><Text style={styles.shortcutTitle}>{item.title}</Text><Text style={styles.shortcutDetail}>{item.detail}</Text></View>
        <Ionicons name="chevron-forward" size={18} color={palette.muted} />
      </Pressable>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { gap: 18, paddingTop: 14, paddingBottom: 30 },
  hero: { gap: 8, padding: 22, borderRadius: 24, backgroundColor: '#174c36' },
  heroIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: 'rgba(217,244,165,0.13)', marginBottom: 4 },
  eyebrow: { color: '#d9f4a5', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 27, lineHeight: 33, fontWeight: '800' },
  description: { color: '#dceee2', fontSize: 14, lineHeight: 21 },
  shortcuts: { gap: 9 },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 70, padding: 12, borderWidth: 1, borderColor: palette.border, borderRadius: 16, backgroundColor: '#fff' },
  shortcutIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.greenSoft },
  shortcutCopy: { flex: 1, gap: 3 },
  shortcutTitle: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  shortcutDetail: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.7 },
});
