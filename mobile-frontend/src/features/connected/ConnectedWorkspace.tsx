import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { currentServerUrl, accountDeletionUrl, clearSession, hasConnectedConfiguration, logout, privacyPolicyUrl, refreshSession, SessionUser } from '../../services/api';
import { countLocalOnlyDiagnoses } from '../../storage/localDiagnoses';
import { AuthMode } from './AuthModal';
import { FarmerWorkspace } from './FarmerWorkspace';
import { ServerAddress } from './ServerAddress';
import { Benefit, EmailVerificationNotice, LanguagePicker, ListGroup, ListRow, ProfileHeader } from './AccountUI';
import { ProfileEditor } from './ProfileEditor';
import { ProfilePhotoModal } from './ProfilePhotoModal';
import { useT } from '../../i18n';
import { ActionButton, Notice, palette, titleCase, uiStyles } from './ui';

export function ConnectedWorkspace({ user, restoring, onUser, onOpenAuth, onDataChanged, onInfo, onOpenHistory }: { user: SessionUser | null; restoring: boolean; onOpenHistory: () => void; onUser: (user: SessionUser | null) => void; onOpenAuth: (mode: AuthMode) => void; onDataChanged: () => void; onInfo: (title: string, message: string) => void }) {
  const [error, setError] = useState('');
  const [deviceScans, setDeviceScans] = useState<number | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const { t } = useT();
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
  if (user?.role === 'farmer') return <FarmerWorkspace onOpenHistory={onOpenHistory} user={user} onUser={onUser} onSignOut={signOut} onAccountDeleted={(message) => { onUser(null); onInfo('Account deleted', message); }} onChanged={onDataChanged} />;
  if (user) return <View style={uiStyles.stack}>
    <ProfileHeader name={user.name} email={user.email} role={user.role} avatarUrl={user.avatar_url} onPressAvatar={() => setPhotoOpen(true)} />
    <EmailVerificationNotice user={user} />
    {error && <Notice tone="warning">{error}</Notice>}
    <ListGroup title="Your workspace">
      <ListRow first icon="globe-outline" title="Open website" external onPress={() => openPage(currentServerUrl()?.replace(/\/api$/, '') ?? null, 'The website')} />
    </ListGroup>
    <ProfileEditor user={user} onUser={onUser} />
    <ProfilePhotoModal visible={photoOpen} user={user} onUser={onUser} onClose={() => setPhotoOpen(false)} />
    <ServerAddress onChanged={() => { setServerVersion((value) => value + 1); void refreshSession().then(onUser).catch(() => onUser(null)); }} />
    <LanguagePicker />
    <ListGroup title="Account">
      <ListRow first icon="document-text-outline" title={t('account.privacyPolicy')} external onPress={() => openPage(privacyPolicyUrl(), 'The privacy policy')} />
      <ListRow icon="log-out-outline" title="Sign out" onPress={signOut} />
    </ListGroup>
  </View>;

  const connected = hasConnectedConfiguration();
  return <View style={uiStyles.stack}>
    <View style={styles.welcome}>
      <Image source={require('../../../assets/dahonmd-logo-green.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="DahonMD logo" />
      <Text style={styles.welcomeTitle}>{t('guest.title')}</Text>
      <Text style={styles.intro}>{t('guest.intro')}</Text>
      <View style={styles.welcomeActions}>
        <ActionButton icon="log-in-outline" onPress={() => onOpenAuth('login')}>{t('auth.login')}</ActionButton>
        <ActionButton variant="secondary" onPress={() => onOpenAuth('register')}>{t('auth.create')}</ActionButton>
      </View>
      {!connected && <Notice tone="warning">{t('guest.notConnected')}</Notice>}
      <Text style={styles.footnote}>{t('guest.noAccountNeeded')}</Text>
    </View>
    {error && <Notice>{error}</Notice>}
    <ListGroup title={t('guest.onPhone')}>
      <ListRow first icon="phone-portrait-outline" title={deviceScans === null ? t('account.scanHistory') : t('guest.savedCount', { count: deviceScans })} subtitle={t('guest.onPhoneText')} onPress={onOpenHistory} />
    </ListGroup>
    <View style={styles.benefits}>
      <Text style={styles.sectionTitle}>{t('guest.more')}</Text>
      <Benefit icon="cloud-upload-outline" title={t('guest.historyTitle')} text={t('guest.historyText')} />
      <Benefit icon="shield-checkmark-outline" title={t('guest.secondTitle')} text={t('guest.secondText')} />
    </View>
    <View style={styles.boundary}><Ionicons name="cloud-offline-outline" size={22} color={palette.green} /><Text style={styles.boundaryText}>{t('guest.offline')}</Text></View>
    <ServerAddress onChanged={() => setServerVersion((value) => value + 1)} />
    <LanguagePicker />
    <ListGroup title={t('account.privacy')}>
      <ListRow first icon="document-text-outline" title={t('account.privacyPolicy')} external onPress={() => openPage(privacyPolicyUrl(), 'The privacy policy')} />
      <ListRow icon="globe-outline" title={t('guest.deleteAccount')} subtitle={t('guest.deleteAccountText')} external onPress={() => openPage(accountDeletionUrl(), 'The account deletion page')} />
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
