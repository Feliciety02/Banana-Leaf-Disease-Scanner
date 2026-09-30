import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { currentServerUrl, accountDeletionUrl, clearSession, hasConnectedConfiguration, logout, privacyPolicyUrl, refreshSession, SessionUser } from '../../services/api';
import { countLocalOnlyDiagnoses } from '../../storage/localDiagnoses';
import { AuthMode } from './AuthModal';
import { FarmerWorkspace } from './FarmerWorkspace';
import { ServerAddress } from './ServerAddress';
import { Benefit, EmailVerificationNotice, ListGroup, ListRow, ProfileHeader } from './AccountUI';
import { ActionButton, Notice, palette, titleCase, uiStyles } from './ui';

export function ConnectedWorkspace({ user, restoring, onUser, onOpenAuth, onDataChanged, onInfo, onOpenHistory }: { user: SessionUser | null; restoring: boolean; onOpenHistory: () => void; onUser: (user: SessionUser | null) => void; onOpenAuth: (mode: AuthMode) => void; onDataChanged: () => void; onInfo: (title: string, message: string) => void }) {
  const [error, setError] = useState('');
  const [deviceScans, setDeviceScans] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    countLocalOnlyDiagnoses().then((count) => { if (active) setDeviceScans(count); }).catch(() => undefined);
    return () => { active = false; };
  }, [user?.id]);
  // Re-renders the screen after the server address changes.
  const [, setServerVersion] = useState(0);
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    refreshSession().then((fresh) => { if (mounted) onUser(fresh); }).catch(async (requestError) => {
      if (!mounted) return;
      if (requestError instanceof Error && 'status' in requestError && requestError.status === 401) { await clearSession(); onUser(null); }
      else setError("You're offline. Some account details may be out of date.");
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
  if (user?.role === 'farmer') return <FarmerWorkspace onOpenHistory={onOpenHistory} user={user} onSignOut={signOut} onAccountDeleted={(message) => { onUser(null); onInfo('Account deleted', message); }} onChanged={onDataChanged} />;
  if (user) return <View style={uiStyles.stack}>
    <ProfileHeader name={user.name} email={user.email} role={user.role} />
    <EmailVerificationNotice user={user} />
    {error && <Notice tone="warning">{error}</Notice>}
    <ListGroup title="Your workspace">
      <ListRow first icon={user.role === 'admin' ? 'grid-outline' : 'shield-checkmark-outline'} title={user.role === 'admin' ? 'Manage DahonMD' : 'Agricultural reviews'} subtitle={user.role === 'admin' ? 'Use the tabs below to manage users, inspect scans and maintain disease knowledge.' : 'Open Requests to assess farmer appeals, or Reviewed to revisit completed assessments.'} />
      <ListRow icon="globe-outline" title="Open website" external onPress={() => openPage(currentServerUrl()?.replace(/\/api$/, '') ?? null, 'The website')} />
    </ListGroup>
    <ServerAddress onChanged={() => { setServerVersion((value) => value + 1); void refreshSession().then(onUser).catch(() => onUser(null)); }} />
    <ListGroup title="Account">
      <ListRow first icon="document-text-outline" title="Privacy policy" external onPress={() => openPage(privacyPolicyUrl(), 'The privacy policy')} />
      <ListRow icon="log-out-outline" title="Sign out" onPress={signOut} />
    </ListGroup>
  </View>;

  const connected = hasConnectedConfiguration();
  return <View style={uiStyles.stack}>
    <View style={styles.welcome}>
      <Image source={require('../../../assets/dahonmd-logo-green.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="DahonMD logo" />
      <Text style={styles.welcomeTitle}>Your scans.
Together in one place.</Text>
      <Text style={styles.intro}>Save your leaf checks to an account and keep up with expert reviews.</Text>
      {connected ? <View style={styles.welcomeActions}>
        <ActionButton icon="log-in-outline" onPress={() => onOpenAuth('login')}>Log in</ActionButton>
        <ActionButton variant="secondary" onPress={() => onOpenAuth('register')}>Create account</ActionButton>
      </View> : <Notice tone="warning">Connect to the DahonMD server below to log in or create an account.</Notice>}
      <Text style={styles.footnote}>No account needed to scan a leaf.</Text>
    </View>
    {error && <Notice>{error}</Notice>}
    <ListGroup title="Already on your phone">
      <ListRow first icon="phone-portrait-outline" title={deviceScans === null ? 'Your scan history' : `${deviceScans} saved scan${deviceScans === 1 ? '' : 's'}`} subtitle="Device-only scans stay here. You choose whether to add them to an account after signing in." onPress={onOpenHistory} />
    </ListGroup>
    <View style={styles.benefits}>
      <Text style={styles.sectionTitle}>More with an account</Text>
      <Benefit icon="cloud-upload-outline" title="Take your history with you" text="Sync scan results and view them on the website." />
      <Benefit icon="shield-checkmark-outline" title="Get a second opinion" text="Request an agricultural review from a saved scan and follow the result in your history." />
    </View>
    <View style={styles.boundary}><Ionicons name="cloud-offline-outline" size={22} color={palette.green} /><Text style={styles.boundaryText}>Scanning works offline. Sign-in, syncing and review requests need an internet connection.</Text></View>
    <ServerAddress onChanged={() => setServerVersion((value) => value + 1)} />
    <ListGroup title="Privacy">
      <ListRow first icon="document-text-outline" title="Privacy policy" external onPress={() => openPage(privacyPolicyUrl(), 'The privacy policy')} />
      <ListRow icon="globe-outline" title="Delete an account" subtitle="Remove an account from the website" external onPress={() => openPage(accountDeletionUrl(), 'The account deletion page')} />
    </ListGroup>
  </View>;
}

const styles = StyleSheet.create({
  center: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 10 }, muted: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  welcome: { gap: 14, padding: 24, borderRadius: 28, backgroundColor: '#edf5ef' },
  logo: { width: 52, height: 52, marginBottom: 4 },
  welcomeTitle: { color: palette.ink, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  intro: { color: '#496353', fontSize: 15, lineHeight: 23 },
  benefits: { gap: 20, paddingHorizontal: 6, paddingVertical: 8 },
  sectionTitle: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  welcomeActions: { gap: 10, marginTop: 4 },
  footnote: { color: '#496353', fontSize: 12, textAlign: 'center' },
  boundary: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 18, backgroundColor: '#f5f7f5', padding: 18 },
  boundaryText: { flex: 1, color: palette.muted, fontSize: 13, lineHeight: 20 },
  reviewerTabs: { flexDirection: 'row', gap: 10 },
});
