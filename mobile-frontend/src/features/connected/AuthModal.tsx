import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { hasConnectedConfiguration, login, register, requestPasswordReset, SessionUser } from '../../services/api';
import { ActionButton, Field, ModalSheet, Notice, palette, uiStyles } from './ui';

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
  return <ModalSheet visible={Boolean(mode)} title={signup ? 'Create your account' : 'Welcome back'} description={signup ? 'Save connected scans and access your farmer workspace.' : 'Sign in to open your role-based connected workspace.'} onClose={() => { if (!busy) onClose(); }}>
    {!hasConnectedConfiguration() && <Notice tone="warning">Authentication needs EXPO_PUBLIC_API_URL. Offline scanning remains available.</Notice>}
    {signup && <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" />}
    <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
    <View style={styles.passwordField}><Field label="Password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete={signup ? 'new-password' : 'current-password'} returnKeyType={signup ? 'next' : 'done'} onSubmitEditing={() => { if (!signup) submit(); }} style={styles.passwordInput} /><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((current) => !current)} style={styles.eye}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={palette.green} /></Pressable></View>
    {signup && <Field label="Confirm password" value={confirmation} onChangeText={setConfirmation} secureTextEntry={!showPassword} autoComplete="new-password" returnKeyType="done" onSubmitEditing={submit} />}
    {!signup && <Pressable accessibilityRole="button" disabled={busy} onPress={forgot}><Text style={styles.link}>Forgot password?</Text></Pressable>}
    {error && <Notice>{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    <ActionButton icon={signup ? 'person-add-outline' : 'log-in-outline'} disabled={busy || !hasConnectedConfiguration()} onPress={submit}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}</ActionButton>
    <View style={styles.switchRow}><Text style={styles.switchText}>{signup ? 'Already have an account?' : 'New to DahonMD?'}</Text><Pressable accessibilityRole="button" onPress={() => onMode(signup ? 'login' : 'register')}><Text style={styles.link}>{signup ? 'Log in' : 'Sign up'}</Text></Pressable></View>
  </ModalSheet>;
}

const styles = StyleSheet.create({
  passwordField: { position: 'relative' }, passwordInput: { paddingRight: 48 }, eye: { position: 'absolute', right: 5, bottom: 3, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, link: { color: palette.green, fontSize: 13, fontWeight: '900' }, switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingTop: 4 }, switchText: { color: palette.muted, fontSize: 13 },
});
