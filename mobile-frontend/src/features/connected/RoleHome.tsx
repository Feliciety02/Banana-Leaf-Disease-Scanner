import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { TabKey } from '../../app/navigation';
import type { SessionUser } from '../../services/api';
import { AdminWorkspace } from './AdminWorkspace';
import { AgriculturistWorkspace } from './AgriculturistWorkspace';
import { palette } from './ui';

type Role = 'admin' | 'agricultural_expert';
type Shortcut = { tab: TabKey; title: string; detail: string; icon: keyof typeof Ionicons.glyphMap };

const shortcuts: Record<Role, Shortcut[]> = {
  admin: [
    { tab: 'accounts', title: 'Users', detail: 'Manage farmer and agriculturist accounts', icon: 'people-outline' },
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
  const fullName = user.name.trim().replace(/\s+/g, ' ');
  return <View style={styles.screen}>
    <View style={styles.hero}>
      <Text style={styles.title}>{fullName ? `Welcome, ${fullName}` : 'Welcome'}</Text>
      <Text style={styles.description}>{admin ? 'Accounts, scans and disease records are below.' : 'Scans waiting for your review are below.'}</Text>
    </View>
    {admin ? <AdminWorkspace section="overview" /> : <AgriculturistWorkspace scope="pending" />}
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
