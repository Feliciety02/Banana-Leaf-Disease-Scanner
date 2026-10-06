import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { subscribeConnection, checkConnection, hasConnectedConfiguration, login, register, requestPasswordReset, SessionUser } from '../../services/api';
import { ActionButton, Field, ModalCard, Notice, palette } from './ui';
import { useT } from '../../i18n';

const TEST_PROFILES = [
  { label: 'Farmer', email: 'maria.santos@dahonmd.test', icon: 'leaf-outline' },
  { label: 'Agriculturist', email: 'agriculturist@dahonmd.test', icon: 'shield-checkmark-outline' },
  { label: 'Admin', email: 'admin@dahonmd.test', icon: 'settings-outline' },
] as const;
const testProfilesEnabled = process.env.EXPO_PUBLIC_TEST_PROFILES === 'true';

export type AuthMode = 'login' | 'register';

function messageOf(error: unknown) { return error instanceof Error ? error.message : 'Authentication could not be completed.'; }

export function AuthModal({ mode, onClose, onMode, onAuthenticated, onConnection }: { onConnection: () => void; mode: AuthMode | null; onClose: () => void; onMode: (mode: AuthMode) => void; onAuthenticated: (user: SessionUser) => void }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const signup = mode === 'register';
  const { t } = useT();
  const [connectionFailed, setConnectionFailed] = useState(false);
  useEffect(() => subscribeConnection(setConnectionFailed), []);
  useEffect(() => {
    setShowPassword(false); setError(''); setNotice('');
    if (!mode) { setName(''); setEmail(''); setPassword(''); setConfirmation(''); }
  }, [mode]);
  const requestClose = () => {
    if (busy) return;
    if (name.trim() || email.trim() || password || confirmation) {
      Alert.alert('Discard entered details?', 'Your form has not been submitted.', [
        { text: 'Keep editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: onClose },
      ]);
    } else onClose();
  };
  const retryConnection = async () => {
    setBusy(true);
    try { await checkConnection(); setError(''); setNotice(t('auth.connected')); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  };
  const submit = async () => {
    if (!email.trim() || !password || (signup && (!name.trim() || !confirmation))) { setError(t('auth.required')); return; }
    setBusy(true); setError(''); setNotice('');
    try { const user = signup ? await register(name, email, password, confirmation) : await login(email, password); onAuthenticated(user); }
    catch (authError) { setError(messageOf(authError)); }
    finally { setBusy(false); }
  };
  const loginProfile = async (profile: typeof TEST_PROFILES[number]) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice(''); setEmail(profile.email);
    try { onAuthenticated(await login(profile.email, 'DahonMD@2026')); }
    catch (authError) { setError(messageOf(authError)); }
    finally { setBusy(false); }
  };
  const forgot = async () => {
    if (!email.trim()) { setError(t('auth.emailFirst')); return; }
    setBusy(true); setError(''); setNotice('');
    try { setNotice(await requestPasswordReset(email)); } catch (resetError) { setError(messageOf(resetError)); } finally { setBusy(false); }
  };
  return <ModalCard visible={Boolean(mode)} title={signup ? t('auth.signup') : t('auth.login')} description={signup ? t('auth.signupText') : undefined} onClose={requestClose} dismissDisabled={busy} auth>
    <View style={styles.modeTabs} accessibilityRole="tablist">
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: !signup }} disabled={busy} onPress={() => onMode('login')} style={[styles.modeTab, !signup && styles.modeTabActive]}><Text style={[styles.modeTabText, !signup && styles.modeTabTextActive]}>{t('auth.login')}</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: signup }} disabled={busy} onPress={() => onMode('register')} style={[styles.modeTab, signup && styles.modeTabActive]}><Text style={[styles.modeTabText, signup && styles.modeTabTextActive]}>{t('auth.signup')}</Text></Pressable>
    </View>
    {!signup && testProfilesEnabled && <View style={styles.profiles}>
      {TEST_PROFILES.map((profile) => <Pressable key={profile.email} accessibilityRole="button" accessibilityLabel={t('auth.testLogin', { role: profile.label, email: profile.email })} disabled={busy || !hasConnectedConfiguration()} onPress={() => loginProfile(profile)} style={({ pressed }) => [styles.profile, (pressed || busy) && { opacity: 0.5 }]}>
        <Ionicons name={profile.icon} size={23} color={palette.green} /><Text style={styles.profileLabel}>{profile.label}</Text><Text style={styles.profileEmail} numberOfLines={2}>{profile.email}</Text>
      </Pressable>)}
    </View>}
    {!hasConnectedConfiguration() && <Notice tone="warning">{t('auth.noServer')}</Notice>}
    {signup && <Field label={t('auth.fullName')} placeholder={t('auth.fullNamePlaceholder')} value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" style={styles.input} />}
    <Field label={t('auth.email')} placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={styles.input} />
    <View style={styles.passwordField}><Field label={t('auth.password')} placeholder={t('auth.passwordPlaceholder')} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete={signup ? 'new-password' : 'current-password'} returnKeyType={signup ? 'next' : 'done'} onSubmitEditing={() => { if (!signup) submit(); }} style={[styles.input, styles.passwordInput]} /><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')} onPress={() => setShowPassword((current) => !current)} style={styles.eye}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={palette.muted} /></Pressable></View>
    {signup && <Field label={t('auth.confirmPassword')} placeholder={t('auth.confirmPlaceholder')} value={confirmation} onChangeText={setConfirmation} secureTextEntry={!showPassword} autoComplete="new-password" returnKeyType="done" onSubmitEditing={submit} style={styles.input} />}
    {!signup && <Pressable accessibilityRole="button" disabled={busy} onPress={forgot} style={styles.forgot}><Text style={styles.link}>{t('auth.forgot')}</Text></Pressable>}
    {error && <Notice>{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {(connectionFailed || !hasConnectedConfiguration()) && <View style={styles.profiles}><ActionButton variant="secondary" disabled={busy} onPress={retryConnection}>{t('connection.retry')}</ActionButton><ActionButton variant="secondary" disabled={busy} onPress={onConnection}>{t('connection.settings')}</ActionButton></View>}
    <ActionButton icon={signup ? 'person-add-outline' : 'log-in-outline'} disabled={busy || !hasConnectedConfiguration()} onPress={submit}>{busy ? t('auth.wait') : signup ? t('auth.create') : t('auth.login')}</ActionButton>
  </ModalCard>;
}

const styles = StyleSheet.create({
  profiles: { flexDirection: 'row', gap: 8 },
  profile: { flex: 1, minHeight: 78, gap: 8, padding: 10, borderRadius: 16, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  profileLabel: { color: palette.green, fontSize: 13, fontWeight: '700' },
  profileEmail: { color: palette.muted, fontSize: 10, textAlign: 'center' },
  modeTabs: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: '#eef3ef', borderRadius: 14 },
  modeTab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  modeTabActive: { backgroundColor: '#fff', shadowColor: '#173d2c', shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  modeTabText: { color: palette.muted, fontSize: 14, fontWeight: '700' },
  modeTabTextActive: { color: palette.green, fontWeight: '800' },
  input: { minHeight: 52, backgroundColor: '#f8faf8', borderColor: '#d9e4db' },
  passwordField: { position: 'relative' }, passwordInput: { paddingRight: 54 }, eye: { position: 'absolute', right: 3, bottom: 2, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  forgot: { alignSelf: 'flex-end', minHeight: 48, justifyContent: 'center' }, link: { color: palette.green, fontSize: 14, fontWeight: '800' },
});
