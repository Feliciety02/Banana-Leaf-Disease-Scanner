import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { hasConnectedConfiguration, login, register, requestPasswordReset, SessionUser } from '../../services/api';
import { ActionButton, Field, ModalCard, Notice, palette } from './ui';

export type AuthMode = 'login' | 'register';

function messageOf(error: unknown) { return error instanceof Error ? error.message : 'Authentication could not be completed.'; }

export function AuthModal({ mode, onClose, onMode, onAuthenticated }: { mode: AuthMode | null; onClose: () => void; onMode: (mode: AuthMode) => void; onAuthenticated: (user: SessionUser) => void }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const signup = mode === 'register';
  useEffect(() => { setPassword(''); setConfirmation(''); setShowPassword(false); setError(''); setNotice(''); }, [mode]);
  const submit = async () => {
    if (!email.trim() || !password || (signup && (!name.trim() || !confirmation))) { setError('Complete all required fields.'); return; }
    setBusy(true); setError(''); setNotice('');
    try { const user = signup ? await register(name, email, password, confirmation) : await login(email, password); onAuthenticated(user); }
    catch (authError) { setError(messageOf(authError)); }
    finally { setBusy(false); }
  };
  const forgot = async () => {
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    setBusy(true); setError(''); setNotice('');
    try { setNotice(await requestPasswordReset(email)); } catch (resetError) { setError(messageOf(resetError)); } finally { setBusy(false); }
  };
  return <ModalCard visible={Boolean(mode)} title={signup ? 'Sign up' : 'Log in'} description={signup ? 'Save scans and keep them in sync across devices.' : undefined} onClose={() => { if (!busy) onClose(); }} auth>
    <View style={styles.modeTabs} accessibilityRole="tablist">
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: !signup }} disabled={busy} onPress={() => onMode('login')} style={[styles.modeTab, !signup && styles.modeTabActive]}><Text style={[styles.modeTabText, !signup && styles.modeTabTextActive]}>Log in</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: signup }} disabled={busy} onPress={() => onMode('register')} style={[styles.modeTab, signup && styles.modeTabActive]}><Text style={[styles.modeTabText, signup && styles.modeTabTextActive]}>Sign up</Text></Pressable>
    </View>
    {!hasConnectedConfiguration() && <Notice tone="warning">Accounts are not available in this version of the app. You can still scan leaves.</Notice>}
    {signup && <Field label="Full name" placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" style={styles.input} />}
    <Field label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={styles.input} />
    <View style={styles.passwordField}><Field label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete={signup ? 'new-password' : 'current-password'} returnKeyType={signup ? 'next' : 'done'} onSubmitEditing={() => { if (!signup) submit(); }} style={[styles.input, styles.passwordInput]} /><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((current) => !current)} style={styles.eye}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={palette.muted} /></Pressable></View>
    {signup && <Field label="Confirm password" placeholder="Repeat your password" value={confirmation} onChangeText={setConfirmation} secureTextEntry={!showPassword} autoComplete="new-password" returnKeyType="done" onSubmitEditing={submit} style={styles.input} />}
    {!signup && <Pressable accessibilityRole="button" disabled={busy} onPress={forgot} style={styles.forgot}><Text style={styles.link}>Forgot password?</Text></Pressable>}
    {error && <Notice>{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    <ActionButton icon={signup ? 'person-add-outline' : 'log-in-outline'} disabled={busy || !hasConnectedConfiguration()} onPress={submit}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}</ActionButton>
  </ModalCard>;
}

const styles = StyleSheet.create({
  modeTabs: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: '#eef3ef', borderRadius: 14 },
  modeTab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  modeTabActive: { backgroundColor: '#fff', shadowColor: '#173d2c', shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  modeTabText: { color: palette.muted, fontSize: 14, fontWeight: '700' },
  modeTabTextActive: { color: palette.green, fontWeight: '800' },
  input: { minHeight: 52, backgroundColor: '#f8faf8', borderColor: '#d9e4db' },
  passwordField: { position: 'relative' }, passwordInput: { paddingRight: 48 }, eye: { position: 'absolute', right: 5, bottom: 4, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  forgot: { alignSelf: 'flex-end', paddingVertical: 2 }, link: { color: palette.green, fontSize: 13, fontWeight: '800' },
});
