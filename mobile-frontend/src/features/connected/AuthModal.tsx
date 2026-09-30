import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { subscribeConnection, checkConnection, hasConnectedConfiguration, login, register, requestPasswordReset, SessionUser } from '../../services/api';
import { ActionButton, Field, ModalCard, Notice, palette } from './ui';

const TEST_PROFILES = [
  { label: 'Farmer', email: 'maria.santos@dahonmd.test', icon: 'leaf-outline' },
  { label: 'Reviewer', email: 'reviewer@dahonmd.test', icon: 'shield-checkmark-outline' },
  { label: 'Admin', email: 'admin@dahonmd.test', icon: 'settings-outline' },
] as const;
const testProfilesEnabled = process.env.EXPO_PUBLIC_TEST_PROFILES === 'true';

export type AuthMode = 'login' | 'register';

function messageOf(error: unknown) { return error instanceof Error ? error.message : 'Authentication could not be completed.'; }

export function AuthModal({ mode, onClose, onMode, onAuthenticated, onConnection }: { onConnection: () => void; mode: AuthMode | null; onClose: () => void; onMode: (mode: AuthMode) => void; onAuthenticated: (user: SessionUser) => void }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const signup = mode === 'register';
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
    try { await checkConnection(); setError(''); setNotice('Connected. You can try signing in again.'); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  };
  const submit = async () => {
    if (!email.trim() || !password || (signup && (!name.trim() || !confirmation))) { setError('Complete all required fields.'); return; }
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
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    setBusy(true); setError(''); setNotice('');
    try { setNotice(await requestPasswordReset(email)); } catch (resetError) { setError(messageOf(resetError)); } finally { setBusy(false); }
  };
  return <ModalCard visible={Boolean(mode)} title={signup ? 'Sign up' : 'Log in'} description={signup ? 'Save scans and keep them in sync across devices.' : undefined} onClose={requestClose} dismissDisabled={busy} auth>
    <View style={styles.modeTabs} accessibilityRole="tablist">
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: !signup }} disabled={busy} onPress={() => onMode('login')} style={[styles.modeTab, !signup && styles.modeTabActive]}><Text style={[styles.modeTabText, !signup && styles.modeTabTextActive]}>Log in</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: signup }} disabled={busy} onPress={() => onMode('register')} style={[styles.modeTab, signup && styles.modeTabActive]}><Text style={[styles.modeTabText, signup && styles.modeTabTextActive]}>Sign up</Text></Pressable>
    </View>
    {!signup && testProfilesEnabled && <View style={styles.profiles}>
      {TEST_PROFILES.map((profile) => <Pressable key={profile.email} accessibilityRole="button" accessibilityLabel={`Log in as test ${profile.label}`} disabled={busy || !hasConnectedConfiguration()} onPress={() => loginProfile(profile)} style={({ pressed }) => [styles.profile, (pressed || busy) && { opacity: 0.5 }]}>
        <Ionicons name={profile.icon} size={23} color={palette.green} /><Text style={styles.profileLabel}>{profile.label}</Text>
      </Pressable>)}
    </View>}
    {!hasConnectedConfiguration() && <Notice tone="warning">Open Account and set a secure server address before signing in.</Notice>}
    {signup && <Field label="Full name" placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" style={styles.input} />}
    <Field label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={styles.input} />
    <View style={styles.passwordField}><Field label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete={signup ? 'new-password' : 'current-password'} returnKeyType={signup ? 'next' : 'done'} onSubmitEditing={() => { if (!signup) submit(); }} style={[styles.input, styles.passwordInput]} /><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((current) => !current)} style={styles.eye}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={palette.muted} /></Pressable></View>
    {signup && <Field label="Confirm password" placeholder="Repeat your password" value={confirmation} onChangeText={setConfirmation} secureTextEntry={!showPassword} autoComplete="new-password" returnKeyType="done" onSubmitEditing={submit} style={styles.input} />}
    {!signup && <Pressable accessibilityRole="button" disabled={busy} onPress={forgot} style={styles.forgot}><Text style={styles.link}>Forgot password?</Text></Pressable>}
    {error && <Notice>{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {(connectionFailed || !hasConnectedConfiguration()) && <View style={styles.profiles}><ActionButton variant="secondary" disabled={busy} onPress={retryConnection}>Retry connection</ActionButton><ActionButton variant="secondary" disabled={busy} onPress={onConnection}>Update connection</ActionButton></View>}
    <ActionButton icon={signup ? 'person-add-outline' : 'log-in-outline'} disabled={busy || !hasConnectedConfiguration()} onPress={submit}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}</ActionButton>
  </ModalCard>;
}

const styles = StyleSheet.create({
  profiles: { flexDirection: 'row', gap: 8 },
  profile: { flex: 1, minHeight: 78, gap: 8, padding: 10, borderRadius: 16, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  profileLabel: { color: palette.green, fontSize: 13, fontWeight: '700' },
  modeTabs: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: '#eef3ef', borderRadius: 14 },
  modeTab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  modeTabActive: { backgroundColor: '#fff', shadowColor: '#173d2c', shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  modeTabText: { color: palette.muted, fontSize: 14, fontWeight: '700' },
  modeTabTextActive: { color: palette.green, fontWeight: '800' },
  input: { minHeight: 52, backgroundColor: '#f8faf8', borderColor: '#d9e4db' },
  passwordField: { position: 'relative' }, passwordInput: { paddingRight: 54 }, eye: { position: 'absolute', right: 3, bottom: 2, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  forgot: { alignSelf: 'flex-end', minHeight: 48, justifyContent: 'center' }, link: { color: palette.green, fontSize: 14, fontWeight: '800' },
});
