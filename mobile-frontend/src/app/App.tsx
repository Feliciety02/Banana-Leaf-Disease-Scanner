import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';

import { CLASS_DISPLAY_NAMES, getDisease } from '../features/classification/disease-data';
import { analyzeLeaf, InferenceResult } from '../features/classification/inference';
import { ConnectedWorkspace } from '../features/connected/ConnectedWorkspace';
import { AuthModal, AuthMode } from '../features/connected/AuthModal';
import { LocalHistory } from '../features/offline/LocalHistory';
import { synchronizeDiagnoses } from '../services/diagnosisSync';
import { configureBackgroundSync } from '../services/backgroundSync';
import { restoreSession, setSessionExpiredHandler, SessionUser } from '../services/api';
import { useMobilePrivacyProtection } from '../services/mobileSecurity';
import { deleteLocalAccountData, initializeLocalDatabase, saveLocalDiagnosis } from '../storage/localDiagnoses';

const colors = { background: '#f4f7f2', card: '#fff', green: '#174d3a', lime: '#d8ef78', ink: '#17231f', muted: '#5e6d67', border: '#dce5df', warning: '#785b17' };

export default function App() {
  useMobilePrivacyProtection();
  const [tab, setTab] = useState<'scan' | 'history' | 'workspace'>('scan');
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null | undefined>(undefined);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  useEffect(() => { initializeLocalDatabase().catch((error) => Alert.alert('Offline storage unavailable', error instanceof Error ? error.message : 'The local database could not be opened.')); }, []);
  useEffect(() => { restoreSession().then(setSessionUser).catch(() => setSessionUser(null)); }, []);
  useEffect(() => {
    if (sessionUser === undefined) return;
    configureBackgroundSync(sessionUser?.role === 'farmer').catch(() => undefined);
  }, [sessionUser?.role]);
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (sessionUser?.role === 'farmer') deleteLocalAccountData(sessionUser.id).catch(() => undefined);
      setSessionUser(null);
      setAuthMode(null);
      setTab('scan');
      Alert.alert('Session expired', 'Your login has expired. Please sign in again to continue using connected features.');
    });
    return () => setSessionExpiredHandler(null);
  }, [sessionUser?.id, sessionUser?.role]);
  useEffect(() => {
    if (sessionUser?.role !== 'farmer') return;
    let active = true;
    const attempt = (connected = true) => {
      if (!connected) return;
      synchronizeDiagnoses(sessionUser.id).then(() => { if (active) setHistoryRefresh((value) => value + 1); }).catch(() => undefined);
    };
    const unsubscribe = NetInfo.addEventListener((state) => attempt(Boolean(state.isConnected && state.isInternetReachable !== false)));
    NetInfo.fetch().then((state) => attempt(Boolean(state.isConnected && state.isInternetReachable !== false))).catch(() => undefined);
    return () => { active = false; unsubscribe(); };
  }, [sessionUser?.id, sessionUser?.role]);
  const stored = () => {
    setHistoryRefresh((value) => value + 1);
    if (sessionUser?.role === 'farmer') synchronizeDiagnoses(sessionUser.id).then(() => setHistoryRefresh((value) => value + 1)).catch(() => undefined);
  };
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
          <View style={styles.header}><View style={styles.logo}><Ionicons name="leaf" size={24} color={colors.green} /></View><View style={styles.brandCopy}><Text style={styles.brand}>DahonMD</Text><Text style={styles.kicker}>BANANA LEAF SUPPORT</Text></View>{sessionUser ? <Pressable accessibilityRole="button" onPress={() => setTab('workspace')} style={styles.headerWorkspace}><Ionicons name="person-circle-outline" size={18} color={colors.green} /><Text style={styles.headerWorkspaceText}>Workspace</Text></Pressable> : null}</View>
          {!sessionUser && <View style={styles.authActions}><Pressable accessibilityRole="button" onPress={() => setAuthMode('login')} style={styles.loginButton}><Text style={styles.loginButtonText}>Log in</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setAuthMode('register')} style={styles.signupButton}><Text style={styles.signupButtonText}>Sign up</Text></Pressable></View>}
          {tab === 'scan' && <OfflineScanner user={sessionUser ?? null} onStored={stored} />}
          {tab === 'history' && <LocalHistory ownerUserId={sessionUser?.role === 'farmer' ? sessionUser.id : null} refreshKey={historyRefresh} onChanged={stored} />}
          {tab === 'workspace' && <ConnectedWorkspace user={sessionUser ?? null} restoring={sessionUser === undefined} onUser={setSessionUser} onOpenAuth={setAuthMode} onDataChanged={() => setHistoryRefresh((value) => value + 1)} />}
        </ScrollView>
        <View style={styles.bottomNav}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'scan' }} onPress={() => setTab('scan')} style={[styles.navButton, tab === 'scan' && styles.navButtonActive]}><Ionicons name="scan" size={21} color={tab === 'scan' ? '#fff' : colors.green} /><Text style={[styles.navLabel, tab === 'scan' && styles.navLabelActive]}>Offline Scan</Text></Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'history' }} onPress={() => setTab('history')} style={[styles.navButton, tab === 'history' && styles.navButtonActive]}><Ionicons name="time-outline" size={21} color={tab === 'history' ? '#fff' : colors.green} /><Text style={[styles.navLabel, tab === 'history' && styles.navLabelActive]}>History</Text></Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'workspace' }} onPress={() => setTab('workspace')} style={[styles.navButton, tab === 'workspace' && styles.navButtonActive]}><Ionicons name="cloud-outline" size={21} color={tab === 'workspace' ? '#fff' : colors.green} /><Text style={[styles.navLabel, tab === 'workspace' && styles.navLabelActive]}>Workspace</Text></Pressable>
        </View>
        <AuthModal mode={authMode} onClose={() => setAuthMode(null)} onMode={setAuthMode} onAuthenticated={(user) => { setSessionUser(user); setAuthMode(null); setTab('workspace'); }} />
      </View>
    </SafeAreaView>
  );
}

function OfflineScanner({ user, onStored }: { user: SessionUser | null; onStored: () => void }) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const chooseImage = async (camera: boolean) => {
    setResult(null);
    setSaveStatus('');
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission required', 'Allow camera access to photograph a banana leaf.');
        return;
      }
    }
    const picker = camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const selection = await picker({ mediaTypes: ['images'], allowsEditing: false, quality: 1, cameraType: ImagePicker.CameraType.back });
    if (!selection.canceled) setImageUri(selection.assets[0].uri);
  };

  const classify = async () => {
    if (!imageUri || loading) return;
    setLoading(true);
    try {
      const next = await analyzeLeaf(imageUri);
      setResult(next);
      try {
        await saveLocalDiagnosis({
          predictedClass: next.classKey,
          confidence: next.confidence * 100,
          modelVersion: next.modelVersion,
          inferenceTimeMs: next.latencyMs,
          imageUri,
          ownerUserId: user?.role === 'farmer' ? user.id : null,
        });
        setSaveStatus(user?.role === 'farmer' ? 'Saved locally and queued for account sync.' : 'Saved privately on this device. Sign in before a future scan to sync it.');
        onStored();
      } catch (storageError) {
        Alert.alert('Result not saved', storageError instanceof Error ? storageError.message : 'The local database could not save this result.');
      }
    } catch (error) {
      Alert.alert('On-device model unavailable', error instanceof Error ? error.message : 'The validated INT8 model could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const disease = result ? getDisease(result.classKey) : null;
  return <View style={styles.scanStack}>
    <View style={styles.hero}><View style={styles.offlineBadge}><Ionicons name="cloud-offline-outline" size={14} color={colors.green} /><Text style={styles.offlineBadgeText}>Works without Internet</Text></View><Text style={styles.heroTitle}>Check visible leaf patterns</Text><Text style={styles.heroText}>Classification runs locally on this device. No account, upload, or server is required.</Text></View>
    <View style={styles.card}>
      {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" /> : <View style={styles.placeholder}><Ionicons name="image-outline" size={48} color={colors.green} /><Text style={styles.placeholderTitle}>One banana leaf per image</Text><Text style={styles.placeholderText}>Use good lighting and keep spots, streaks, or discoloration visible.</Text></View>}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => chooseImage(true)}><Ionicons name="camera" size={19} color="#fff" /><Text style={styles.primaryText}>Take photo</Text></Pressable>
        <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => chooseImage(false)}><Ionicons name="images-outline" size={19} color={colors.green} /><Text style={styles.secondaryText}>Choose image</Text></Pressable>
      </View>
      {imageUri && <Pressable accessibilityRole="button" style={[styles.analyzeButton, loading && styles.disabled]} disabled={loading} onPress={classify}>{loading ? <ActivityIndicator color={colors.ink} /> : <Ionicons name="scan" size={20} color={colors.ink} />}<Text style={styles.analyzeText}>{loading ? 'Classifying…' : 'Classify on device'}</Text></Pressable>}
    </View>
    {result && disease && <View style={styles.resultCard}><Text style={styles.kicker}>MODEL OUTPUT</Text><Text style={styles.resultClass}>{CLASS_DISPLAY_NAMES[result.classKey]}</Text><Text style={styles.confidence}>Model confidence: {(result.confidence * 100).toFixed(1)}%</Text>{saveStatus && <View style={styles.savedBadge}><Ionicons name="save-outline" size={16} color={colors.green} /><Text style={styles.savedText}>{saveStatus}</Text></View>}<Text style={styles.note}>This is relative output confidence, not guaranteed disease probability or diagnostic certainty.</Text><View style={styles.divider} /><Text style={styles.body}>{disease.summary}</Text>{result.classKey === 'panama-disease' && <Text style={styles.warning}>This output means visible leaf-image patterns associated with Panama Disease. It is not laboratory confirmation of Fusarium or confirmed Foc infection.</Text>}</View>}
    <View style={styles.scopeCard}><Text style={styles.scopeTitle}>Validated scope</Text><Text style={styles.body}>Healthy · Sigatoka · Panama Disease · Cordana Leaf Spot</Text><Text style={styles.note}>Results may be unreliable for non-leaf images, other crops, unknown diseases, Moko disease, severe blur, or obscured leaves. No “unknown” model class is implied.</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background }, app: { flex: 1 }, page: { padding: 20, paddingBottom: 112, gap: 18 }, scanStack: { gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, logo: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }, brandCopy: { flex: 1 }, brand: { color: colors.ink, fontSize: 23, fontWeight: '800' }, kicker: { color: colors.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, headerWorkspace: { minHeight: 40, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff' }, headerWorkspaceText: { color: colors.green, fontSize: 12, fontWeight: '800' }, authActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }, loginButton: { minHeight: 42, paddingHorizontal: 18, borderRadius: 13, borderWidth: 1, borderColor: colors.green, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }, loginButtonText: { color: colors.green, fontSize: 13, fontWeight: '900' }, signupButton: { minHeight: 42, paddingHorizontal: 18, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.green }, signupButtonText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  hero: { backgroundColor: colors.green, borderRadius: 24, padding: 22, gap: 9 }, offlineBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.lime, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }, offlineBadgeText: { color: colors.green, fontSize: 11, fontWeight: '900' }, heroTitle: { color: '#fff', fontSize: 28, lineHeight: 34, fontWeight: '800' }, heroText: { color: '#dce9e3', fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: colors.card, borderRadius: 24, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 14 }, preview: { width: '100%', aspectRatio: 1, borderRadius: 17, backgroundColor: '#e6ece8' }, placeholder: { aspectRatio: 1, borderRadius: 17, backgroundColor: '#eef3ef', alignItems: 'center', justifyContent: 'center', padding: 30, gap: 10 }, placeholderTitle: { color: colors.ink, fontSize: 18, fontWeight: '700', textAlign: 'center' }, placeholderText: { color: colors.muted, lineHeight: 21, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10 }, primaryButton: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryButton: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryText: { color: '#fff', fontWeight: '700' }, secondaryText: { color: colors.green, fontWeight: '700' }, analyzeButton: { minHeight: 52, borderRadius: 14, backgroundColor: colors.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, analyzeText: { color: colors.ink, fontWeight: '800' }, disabled: { opacity: 0.65 },
  resultCard: { backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 9 }, resultClass: { color: colors.ink, fontSize: 29, fontWeight: '800' }, confidence: { color: colors.green, fontSize: 17, fontWeight: '700' }, savedBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 12, backgroundColor: '#edf5ee' }, savedText: { flex: 1, color: colors.green, fontSize: 12, lineHeight: 17, fontWeight: '700' }, divider: { height: 1, backgroundColor: colors.border, marginVertical: 5 }, body: { color: colors.ink, fontSize: 15, lineHeight: 22 }, note: { color: colors.muted, fontSize: 13, lineHeight: 19 }, warning: { color: colors.warning, backgroundColor: '#fff6d9', borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 19 }, scopeCard: { borderRadius: 18, padding: 17, backgroundColor: '#e8efe9', gap: 7 }, scopeTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  bottomNav: { position: 'absolute', left: 14, right: 14, bottom: 12, flexDirection: 'row', gap: 8, padding: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, shadowColor: '#10251d', shadowOpacity: 0.13, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 7 }, navButton: { flex: 1, minHeight: 52, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, navButtonActive: { backgroundColor: colors.green }, navLabel: { color: colors.green, fontSize: 13, fontWeight: '800' }, navLabelActive: { color: '#fff' },
});
