import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { accountDeletionUrl, clearSession, hasConnectedConfiguration, logout, privacyPolicyUrl, refreshSession, SessionUser } from '../../services/api';
import { AdminWorkspace } from './AdminWorkspace';
import { AuthMode } from './AuthModal';
import { FarmerWorkspace } from './FarmerWorkspace';
import { ActionButton, Notice, palette, SectionHeader, titleCase, uiStyles } from './ui';

export function ConnectedWorkspace({ user, restoring, onUser, onOpenAuth, onDataChanged }: { user: SessionUser | null; restoring: boolean; onUser: (user: SessionUser | null) => void; onOpenAuth: (mode: AuthMode) => void; onDataChanged: () => void }) {
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    refreshSession().then((fresh) => { if (mounted) onUser(fresh); }).catch(async (requestError) => {
      if (!mounted) return;
      if (requestError instanceof Error && 'status' in requestError && requestError.status === 401) { await clearSession(); onUser(null); }
      else setError('Using the saved identity. Live workspace data requires a connection.');
    });
    return () => { mounted = false; };
  }, [user?.id]);
  const signOut = async () => {
    setError('');
    try { await logout(); } catch { await clearSession(); }
    onUser(null);
  };
  const openPage = async (url: string | null, label: string) => {
    if (!url) { setError(`${label} is not configured for this build.`); return; }
    try { await Linking.openURL(url); } catch { setError(`${label} could not be opened.`); }
  };

  if (restoring) return <View style={styles.center}><ActivityIndicator color={palette.green} /><Text style={styles.muted}>Restoring secure session…</Text></View>;
  if (user?.role === 'admin') return <AdminWorkspace user={user} onSignOut={signOut} />;
  if (user?.role === 'farmer') return <FarmerWorkspace user={user} onSignOut={signOut} onAccountDeleted={() => onUser(null)} onChanged={onDataChanged} />;
  if (user) return <View style={uiStyles.stack}><SectionHeader eyebrow="CONNECTED ACCOUNT" title={`Hello, ${user.name}`} text={`Signed in as ${titleCase(user.role)}. Offline Scan remains available without the server.`} />{error && <Notice tone="warning">{error}</Notice>}<View style={uiStyles.card}><Ionicons name="shield-checkmark-outline" size={32} color={palette.green} /><Text style={uiStyles.cardTitle}>Role-based workspace</Text><Text style={uiStyles.cardMeta}>The server returned the {titleCase(user.role)} role. This mobile build currently exposes administrator management tools only and does not infer elevated permissions.</Text><ActionButton variant="secondary" icon="log-out-outline" onPress={signOut}>Sign out</ActionButton></View></View>;

  return <View style={uiStyles.stack}><SectionHeader eyebrow="OPTIONAL ONLINE WORKSPACE" title="Connect your account" text="Log in or create a farmer account when you want server-backed features. The offline scanner does not require either." />
    {!hasConnectedConfiguration() && <Notice tone="warning">Connected features need EXPO_PUBLIC_API_URL. Offline Scan remains available.</Notice>}{error && <Notice>{error}</Notice>}
    <View style={styles.authActions}><ActionButton icon="log-in-outline" onPress={() => onOpenAuth('login')}>Log in</ActionButton><ActionButton variant="secondary" icon="person-add-outline" onPress={() => onOpenAuth('register')}>Sign up</ActionButton></View>
    <View style={styles.boundary}><Ionicons name="cloud-offline-outline" size={22} color={palette.green} /><View style={uiStyles.flex}><Text style={styles.boundaryTitle}>Offline boundary</Text><Text style={styles.muted}>Camera/gallery classification stays local. Connected records require a reachable server and are never replaced with invented cached data.</Text></View></View>
    <View style={styles.authActions}><ActionButton variant="ghost" icon="document-text-outline" onPress={() => openPage(privacyPolicyUrl(), 'The privacy policy')}>Privacy policy</ActionButton><ActionButton variant="ghost" icon="open-outline" onPress={() => openPage(accountDeletionUrl(), 'The account deletion page')}>Delete an account</ActionButton></View>
  </View>;
}

const styles = StyleSheet.create({
  center: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: palette.muted, fontSize: 14, lineHeight: 20 }, authActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, boundary: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderRadius: 17, backgroundColor: palette.greenSoft, padding: 15 }, boundaryTitle: { color: palette.ink, fontSize: 15, fontWeight: '800', marginBottom: 3 },
});
