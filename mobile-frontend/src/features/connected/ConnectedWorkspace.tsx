import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { currentServerUrl, clearSession, hasConnectedConfiguration, logout, privacyPolicyUrl, refreshSession, SessionUser } from '../../services/api';
import { AuthMode } from './AuthModal';
import { FarmerWorkspace } from './FarmerWorkspace';
import { ServerAddress } from './ServerAddress';
import { EmailVerificationNotice, ListGroup, ListRow, ProfileHeader } from './AccountUI';
import { ProfileEditor } from './ProfileEditor';
import { ProfilePhotoModal } from './ProfilePhotoModal';
import { useT } from '../../i18n';
import { ActionButton, Notice, palette, titleCase, uiStyles } from './ui';

export function ConnectedWorkspace({ user, restoring, onUser, onOpenAuth, onDataChanged, onInfo }: { user: SessionUser | null; restoring: boolean; onUser: (user: SessionUser | null) => void; onOpenAuth: (mode: AuthMode) => void; onDataChanged: () => void; onInfo: (title: string, message: string) => void }) {
  const [error, setError] = useState('');
  const [photoOpen, setPhotoOpen] = useState(false);
  const { t } = useT();
  // Re-renders the screen after the server address changes.
  const [, setServerVersion] = useState(0);
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    refreshSession().then((fresh) => { if (mounted) onUser(fresh); }).catch(async (requestError) => {
      if (!mounted) return;
      if (requestError instanceof Error && 'status' in requestError && requestError.status === 401) { await clearSession(); onUser(null); }
      else setError(t('account.offlineDetails'));
    });
    return () => { mounted = false; };
  }, [user?.id]);
  const signOut = async () => {
    setError('');
    try { await logout(); } catch { await clearSession(); }
    onUser(null);
  };
  const openPage = async (url: string | null, label: string) => {
    if (!url) { setError(t('account.linkUnavailable', { name: label })); return; }
    try { await Linking.openURL(url); } catch { setError(t('account.linkOpenFailed', { name: label })); }
  };

  if (restoring) return <View style={styles.center}><ActivityIndicator color={palette.green} /><Text style={styles.muted}>{t('account.restoring')}</Text></View>;
  if (user?.role === 'farmer') return <FarmerWorkspace user={user} onUser={onUser} onSignOut={signOut} onAccountDeleted={(message) => { onUser(null); onInfo(t('account.deletedTitle'), message); }} onChanged={onDataChanged} />;
  if (user) return <View style={uiStyles.stack}>
    <ProfileHeader name={user.name} email={user.email} role={user.role} avatarUrl={user.avatar_url} onPressAvatar={() => setPhotoOpen(true)} />
    <EmailVerificationNotice user={user} />
    {error && <Notice tone="warning">{error}</Notice>}
    <ListGroup title={t('account.workspace')}>
      <ListRow first icon="globe-outline" title={t('account.openWebsite')} external onPress={() => openPage(currentServerUrl()?.replace(/\/api$/, '') ?? null, t('account.openWebsite'))} />
    </ListGroup>
    <ProfileEditor user={user} onUser={onUser} />
    <ProfilePhotoModal visible={photoOpen} user={user} onUser={onUser} onClose={() => setPhotoOpen(false)} />
    <ServerAddress onChanged={() => { setServerVersion((value) => value + 1); void refreshSession().then(onUser).catch(() => onUser(null)); }} />
    <ListGroup title={t('account.account')}>
      <ListRow first icon="document-text-outline" title={t('account.privacyPolicy')} external onPress={() => openPage(privacyPolicyUrl(), t('account.privacyPolicy'))} />
      <ListRow icon="log-out-outline" title={t('account.signOut')} onPress={signOut} />
    </ListGroup>
  </View>;

  const connected = hasConnectedConfiguration();
  return <View style={uiStyles.stack}>
    <View style={styles.welcome}>
      <Image source={require('../../../assets/dahonmd-logo-green.webp')} style={styles.logo} resizeMode="contain" accessibilityLabel="DahonMD logo" />
      <Text style={styles.welcomeTitle}>{t('guest.title')}</Text>
      <Text style={styles.intro}>{t('guest.intro')}</Text>
      <ActionButton icon="log-in-outline" onPress={() => onOpenAuth('login')}>{t('auth.login')}</ActionButton>
      <View style={styles.signupRow}><Text style={styles.signupPrompt}>{t('guest.newFarmer')}</Text><Pressable accessibilityRole="button" onPress={() => onOpenAuth('register')}><Text style={styles.signupLink}>{t('auth.create')}</Text></Pressable></View>
      {!connected && <Notice tone="warning">{t('guest.notConnected')}</Notice>}
      <Text style={styles.footnote}>{t('guest.noAccountNeeded')}</Text>
    </View>
    {error && <Notice>{error}</Notice>}
    <Pressable accessibilityRole="link" onPress={() => openPage(privacyPolicyUrl(), t('account.privacyPolicy'))} style={styles.privacyLink}><Text style={styles.privacyLinkText}>{t('account.privacyPolicy')}</Text></Pressable>
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
  signupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 6 },
  signupPrompt: { color: '#496353', fontSize: 13 },
  signupLink: { color: palette.green, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  footnote: { color: '#496353', fontSize: 12, textAlign: 'center' },
  privacyLink: { alignSelf: 'center', padding: 12 },
  privacyLinkText: { color: palette.green, fontSize: 13, textDecorationLine: 'underline' },
});
