import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import NetInfo from '@react-native-community/netinfo';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';

import { CLASS_DISPLAY_NAMES, getDisease } from '../features/classification/disease-data';
import { analyzeLeaf, InferenceResult } from '../features/classification/inference';
import { ChatAssistant } from '../features/chat/ChatAssistant';
import { ConnectedWorkspace } from '../features/connected/ConnectedWorkspace';
import { AuthModal, AuthMode } from '../features/connected/AuthModal';
import { LocalHistory } from '../features/offline/LocalHistory';
import { synchronizeDiagnoses } from '../services/diagnosisSync';
import { configureBackgroundSync } from '../services/backgroundSync';
import { restoreSession, setSessionExpiredHandler, SessionUser } from '../services/api';
import { useMobilePrivacyProtection } from '../services/mobileSecurity';
import { deleteLocalAccountData, initializeLocalDatabase, saveLocalDiagnosis } from '../storage/localDiagnoses';

const colors = { background: '#f4f7f2', card: '#fff', green: '#174d3a', lime: '#d8ef78', ink: '#17231f', muted: '#5e6d67', border: '#dce5df', warning: '#785b17' };

type TabKey = 'home' | 'scan' | 'history' | 'guide' | 'profile';

export default function App() {
  useMobilePrivacyProtection();
  const [tab, setTab] = useState<TabKey>('home');
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
      setTab('home');
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
  const firstName = sessionUser?.name ? sessionUser.name.trim().split(/\s+/)[0] : null;
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <View style={styles.topHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.headerLogo}><Ionicons name="leaf" size={17} color={colors.green} /></View>
            <Text style={styles.headerAppName}>DahonMD</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => setTab('profile')} style={styles.avatarButton}>
            {firstName ? <Text style={styles.avatarInitial}>{firstName.charAt(0).toUpperCase()}</Text> : <Ionicons name="person-outline" size={20} color={colors.green} />}
          </Pressable>
        </View>
        <ScrollView style={styles.pageScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
          {tab === 'home' && <HomeScreen firstName={firstName} onNavigate={setTab} />}
          {tab === 'scan' && <OfflineScanner user={sessionUser ?? null} onStored={stored} />}
          {tab === 'history' && <LocalHistory ownerUserId={sessionUser?.role === 'farmer' ? sessionUser.id : null} refreshKey={historyRefresh} onChanged={stored} />}
          {tab === 'guide' && <GuideScreen />}
          {tab === 'profile' && <ConnectedWorkspace user={sessionUser ?? null} restoring={sessionUser === undefined} onUser={setSessionUser} onOpenAuth={setAuthMode} onDataChanged={() => setHistoryRefresh((value) => value + 1)} />}
        </ScrollView>
        <View style={styles.bottomNav}>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'home' }} onPress={() => setTab('home')} style={styles.navButton}>
            <View style={styles.navIconWrap}><Ionicons name={tab === 'home' ? 'home' : 'home-outline'} size={22} color={tab === 'home' ? colors.green : '#88968f'} />{tab === 'home' && <View style={styles.navIndicator} />}</View>
            <Text style={[styles.navLabel, tab === 'home' && styles.navLabelActive]}>Home</Text>
          </Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'scan' }} onPress={() => setTab('scan')} style={styles.navButton}>
            <View style={styles.navIconWrap}><Ionicons name={tab === 'scan' ? 'scan' : 'scan-outline'} size={22} color={tab === 'scan' ? colors.green : '#88968f'} />{tab === 'scan' && <View style={styles.navIndicator} />}</View>
            <Text style={[styles.navLabel, tab === 'scan' && styles.navLabelActive]}>Scan</Text>
          </Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'history' }} onPress={() => setTab('history')} style={styles.navButton}>
            <View style={styles.navIconWrap}><Ionicons name={tab === 'history' ? 'time' : 'time-outline'} size={22} color={tab === 'history' ? colors.green : '#88968f'} />{tab === 'history' && <View style={styles.navIndicator} />}</View>
            <Text style={[styles.navLabel, tab === 'history' && styles.navLabelActive]}>History</Text>
          </Pressable>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'guide' }} onPress={() => setTab('guide')} style={styles.navButton}>
            <View style={styles.navIconWrap}><Ionicons name={tab === 'guide' ? 'book' : 'book-outline'} size={22} color={tab === 'guide' ? colors.green : '#88968f'} />{tab === 'guide' && <View style={styles.navIndicator} />}</View>
            <Text style={[styles.navLabel, tab === 'guide' && styles.navLabelActive]}>Guide</Text>
          </Pressable>
        </View>
        <ChatAssistant user={sessionUser} onSignIn={() => setAuthMode('login')} />
        <AuthModal mode={authMode} onClose={() => setAuthMode(null)} onMode={setAuthMode} onAuthenticated={(user) => { setSessionUser(user); setAuthMode(null); setTab('profile'); }} />
      </View>
    </SafeAreaView>
  );
}

function HomeScreen({ firstName, onNavigate }: { firstName: string | null; onNavigate: (tab: TabKey) => void }) {
  return (
    <View style={styles.homeScreen}>
      <Text style={styles.greeting}>{firstName ? `Hello, ${firstName}.` : 'Hello there.'}</Text>
      <Text style={styles.subtitle}>Point your camera at one banana leaf to get an on-device disease analysis in seconds.</Text>

      <View style={styles.heroCard}>
        <View style={styles.heroArtwork} pointerEvents="none">
          <View style={[styles.leaf, styles.leafOne]} />
          <View style={[styles.leaf, styles.leafTwo]} />
          <View style={[styles.leaf, styles.leafThree]} />
          <View style={styles.leafVein} />
        </View>
        <View style={styles.cameraBadge}><Ionicons name="camera" size={30} color={colors.green} /></View>
        <Text style={styles.heroTitle}>Scan a leaf</Text>
        <Text style={styles.heroText}>Runs entirely on this device. No upload, no waiting.</Text>
        <Pressable accessibilityRole="button" onPress={() => onNavigate('scan')} style={styles.startButton}>
          <Text style={styles.startButtonText}>Start scanning</Text>
          <Ionicons name="arrow-forward" size={19} color={colors.green} />
        </Pressable>
      </View>

      <View style={styles.linksCard}>
        <Text style={styles.sectionTitle}>Quick access</Text>
        <Pressable accessibilityRole="button" onPress={() => onNavigate('scan')} style={styles.linkRow}>
          <View style={styles.linkIconWrap}><Ionicons name="scan-outline" size={21} color={colors.green} /></View>
          <View style={styles.linkCopy}><Text style={styles.linkTitle}>Scan a leaf</Text><Text style={styles.linkSummary}>Open the camera and classify in seconds.</Text></View>
          <Ionicons name="chevron-forward" size={17} color={colors.muted} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => onNavigate('history')} style={styles.linkRow}>
          <View style={styles.linkIconWrap}><Ionicons name="time-outline" size={21} color={colors.green} /></View>
          <View style={styles.linkCopy}><Text style={styles.linkTitle}>Scan history</Text><Text style={styles.linkSummary}>Review past results and sync status.</Text></View>
          <Ionicons name="chevron-forward" size={17} color={colors.muted} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => onNavigate('guide')} style={styles.linkRow}>
          <View style={styles.linkIconWrap}><Ionicons name="book-outline" size={21} color={colors.green} /></View>
          <View style={styles.linkCopy}><Text style={styles.linkTitle}>Disease guide</Text><Text style={styles.linkSummary}>Learn about the supported banana leaf conditions.</Text></View>
          <Ionicons name="chevron-forward" size={17} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

const guideEntries = [
  { icon: 'leaf-outline' as const, name: 'Healthy', summary: 'The leaf shows no visible disease patterns. Keep plants spaced, watered, and free of damaged or older leaves.' },
  { icon: 'ellipse-outline' as const, name: 'Sigatoka', summary: 'A fungal leaf spot disease. Look for dark streaks or round spots with pale centers that yellow the leaf as they grow.' },
  { icon: 'warning-outline' as const, name: 'Panama Disease', summary: 'A soil-borne fungal wilt. Leaf patterns resembling Panama Disease require laboratory confirmation before any treatment decision.' },
  { icon: 'sparkles-outline' as const, name: 'Cordana Leaf Spot', summary: 'A fungal leaf spot with oval to round brown lesions. Remove affected leaves and improve air flow to slow spread.' },
];

function GuideScreen() {
  return (
    <View style={styles.guideScreen}>
      <Text style={styles.guideTitle}>Disease guide</Text>
      <Text style={styles.guideSubtitle}>The on-device model recognizes these four banana leaf conditions. Use this reference alongside a scan result.</Text>
      {guideEntries.map((entry) => (
        <View key={entry.name} style={styles.guideCard}>
          <View style={styles.guideCardHeader}><Ionicons name={entry.icon} size={22} color={colors.green} /><Text style={styles.guideCardName}>{entry.name}</Text></View>
          <Text style={styles.guideCardSummary}>{entry.summary}</Text>
        </View>
      ))}
      <View style={styles.guideDisclaimer}><Ionicons name="information-circle-outline" size={19} color={colors.green} /><Text style={styles.guideDisclaimerText}>Model scores are not a diagnosis. Always confirm serious symptoms with a qualified expert or laboratory.</Text></View>
    </View>
  );
}

function OfflineScanner({ user, onStored }: { user: SessionUser | null; onStored: () => void }) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const chooseImage = async () => {
    setResult(null);
    setSaveStatus('');
    const selection = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    if (!selection.canceled) setImageUri(selection.assets[0].uri);
  };

  const capturePhoto = async () => {
    if (!permission?.granted) {
      const nextPermission = await requestPermission();
      if (!nextPermission.granted) return;
    }
    const photo = await cameraRef.current?.takePictureAsync({ quality: 1 });
    if (photo?.uri) { setResult(null); setSaveStatus(''); setImageUri(photo.uri); }
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
        setSaveStatus(user?.role === 'farmer' ? 'Saved and queued for sync.' : 'Saved on this device.');
        onStored();
      } catch (storageError) {
        Alert.alert('Result not saved', storageError instanceof Error ? storageError.message : 'The local database could not save this result.');
      }
    } catch (error) {
      Alert.alert('On-device model unavailable', error instanceof Error ? error.message : 'The validated on-device model could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (imageUri && !result && !loading) classify();
  }, [imageUri]);

  const disease = result ? getDisease(result.classKey) : null;
  return (
    <View style={styles.scannerScreen}>
      <Text style={styles.scannerTitle}>Scan a leaf</Text>
      <Text style={styles.scannerSubtitle}>Point the camera at one banana leaf and keep the affected area clear and in focus.</Text>

      <View style={styles.cameraPanel}>
        {imageUri ? <Image source={{ uri: imageUri }} style={styles.cameraPreview} resizeMode="cover" /> : permission?.granted ? <CameraView ref={cameraRef} style={styles.cameraPreview} facing="back" /> : <View style={styles.cameraPermission}><Ionicons name="camera-outline" size={42} color="#fff" /><Text style={styles.cameraPermissionText}>Camera access is needed to scan a leaf.</Text><Pressable style={styles.permissionButton} onPress={requestPermission}><Text style={styles.permissionText}>Allow camera</Text></Pressable></View>}
        {!imageUri && <><View style={styles.scanCorners} pointerEvents="none"><View style={[styles.corner, styles.cornerTopLeft]} /><View style={[styles.corner, styles.cornerTopRight]} /><View style={[styles.corner, styles.cornerBottomLeft]} /><View style={[styles.corner, styles.cornerBottomRight]} /></View><View style={styles.focusPill}><Text style={styles.focusText}>Keep the affected area in focus</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Take photo" style={styles.shutterOuter} onPress={capturePhoto}><View style={styles.shutterInner} /></Pressable></>}
        {imageUri && loading && <View style={styles.analysisOverlay}><ActivityIndicator size="large" color="#fff" /><Text style={styles.analysisText}>Analyzing leaf...</Text></View>}
        <View style={styles.cameraActions}><Pressable accessibilityRole="button" style={styles.galleryButton} onPress={chooseImage}><Ionicons name="images-outline" size={22} color={colors.green} /><Text style={styles.galleryText}>Choose from gallery</Text></Pressable><Pressable accessibilityRole="button" style={styles.sampleButton} onPress={() => setImageUri(null)}><Text style={styles.sampleText}>Use development sample</Text></Pressable></View>
      </View>

      {result && disease && <View style={styles.resultCard}><Text style={styles.kicker}>RESULT</Text><Text style={styles.resultClass}>{CLASS_DISPLAY_NAMES[result.classKey]}</Text><Text style={styles.confidence}>Model score: {(result.confidence * 100).toFixed(1)}%</Text><View style={styles.probabilitySection}><Text style={styles.probabilityHeading}>Class scores</Text>{result.probabilities.map(({ classKey, probability }) => { const selected = classKey === result.classKey; const percentage = Math.min(100, Math.max(0, probability * 100)); return <View key={classKey} style={styles.probabilityRow} accessibilityLabel={`${CLASS_DISPLAY_NAMES[classKey]} ${percentage.toFixed(1)} percent${selected ? ', selected result' : ''}`}><View style={styles.probabilityLabelRow}><Text style={[styles.probabilityLabel, selected && styles.probabilityLabelActive]}>{CLASS_DISPLAY_NAMES[classKey]}</Text><Text style={[styles.probabilityValue, selected && styles.probabilityLabelActive]}>{percentage.toFixed(1)}%</Text></View><View style={styles.probabilityTrack}><View style={[styles.probabilityFill, selected && styles.probabilityFillActive, { width: `${percentage}%` as `${number}%` }]} /></View></View>; })}</View>{saveStatus && <View style={styles.savedBadge}><Ionicons name="save-outline" size={16} color={colors.green} /><Text style={styles.savedText}>{saveStatus}</Text></View>}<Text style={styles.note}>Model scores are not a diagnosis.</Text><View style={styles.divider} /><Text style={styles.body}>{disease.summary}</Text>{result.classKey === 'panama-disease' && <Text style={styles.warning}>These leaf patterns may resemble Panama Disease. Laboratory confirmation is required.</Text>}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#edf3ee' },
  app: { flex: 1 },
  pageScroll: { flex: 1 },
  page: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 110 },
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.85)', borderBottomWidth: 1, borderBottomColor: '#e1e8e4', shadowColor: '#10251d', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerLogo: { width: 32, height: 32, borderRadius: 11, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  headerAppName: { color: colors.ink, fontSize: 17, fontWeight: '800', letterSpacing: 0.2 },
  avatarButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.border, backgroundColor: '#f1f5f2', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: colors.green, fontSize: 16, fontWeight: '800' },
  homeScreen: { gap: 18 },
  guideScreen: { gap: 12, paddingTop: 4 },
  guideTitle: { color: colors.ink, fontSize: 45, lineHeight: 52, fontWeight: '900', letterSpacing: -1 },
  guideSubtitle: { color: '#6c7d77', fontSize: 16, lineHeight: 24, fontWeight: '500', marginBottom: 4 },
  guideCard: { backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 8, shadowColor: '#123c2e', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  guideCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  guideCardName: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  guideCardSummary: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  guideDisclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 16, backgroundColor: '#f3f7f4', borderWidth: 1, borderColor: '#dfe8e2', padding: 14 },
  guideDisclaimerText: { flex: 1, color: colors.muted, fontSize: 13, lineHeight: 19 },
  scannerScreen: { gap: 16, paddingTop: 16 },
  scannerTitle: { color: colors.ink, fontSize: 45, lineHeight: 52, fontWeight: '900', letterSpacing: -1 },
  scannerSubtitle: { color: '#6c7d77', fontSize: 18, lineHeight: 27, fontWeight: '500', marginBottom: 10 },
  cameraPanel: { height: 610, overflow: 'hidden', position: 'relative', borderRadius: 30, backgroundColor: '#0b3328', shadowColor: '#14382c', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  cameraPreview: { ...StyleSheet.absoluteFill },
  cameraPermission: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: '#173f32' },
  cameraPermissionText: { color: '#fff', fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 12 },
  permissionButton: { marginTop: 18, borderRadius: 22, backgroundColor: colors.lime, paddingHorizontal: 22, paddingVertical: 12 },
  permissionText: { color: colors.green, fontWeight: '800' },
  scanCorners: { ...StyleSheet.absoluteFill, margin: 28 },
  corner: { position: 'absolute', width: 66, height: 66, borderColor: '#fff' },
  cornerTopLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 26 },
  cornerTopRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 26 },
  cornerBottomLeft: { bottom: 92, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 26 },
  cornerBottomRight: { bottom: 92, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 26 },
  focusPill: { position: 'absolute', left: 0, right: 0, bottom: 218, alignItems: 'center' },
  focusText: { color: '#fff', backgroundColor: 'rgba(22,35,31,.68)', borderRadius: 30, paddingHorizontal: 22, paddingVertical: 12, fontSize: 16, fontWeight: '700' },
  shutterOuter: { position: 'absolute', alignSelf: 'center', bottom: 112, width: 82, height: 82, borderRadius: 50, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 66, height: 66, borderRadius: 40, backgroundColor: '#fff' },
  cameraActions: { position: 'absolute', left: 24, right: 24, bottom: 25, flexDirection: 'row', gap: 12 },
  galleryButton: { flex: 1.2, minHeight: 58, borderRadius: 18, backgroundColor: colors.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  galleryText: { color: colors.green, fontSize: 16, fontWeight: '900' },
  sampleButton: { flex: 1, minHeight: 58, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,.65)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  sampleText: { color: '#fff', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  analysisOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,32,23,.48)' },
  analysisText: { color: '#fff', fontSize: 17, fontWeight: '800', marginTop: 10 },
  statusBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingBottom: 4 },
  timeText: { fontSize: 18, fontWeight: '700', color: colors.ink },
  statusIcons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIconGroup: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  statusBarSegment: { backgroundColor: colors.ink, borderRadius: 2, opacity: 0.85 },
  battery: { width: 26, height: 12, borderWidth: 2, borderColor: colors.ink, borderRadius: 4, paddingRight: 2, justifyContent: 'center' },
  batteryLevel: { alignSelf: 'flex-end', width: 18, height: 8, borderRadius: 2, backgroundColor: colors.ink },
  greeting: { fontSize: 50, lineHeight: 58, fontWeight: '800', color: colors.ink, marginTop: 6 },
  subtitle: { fontSize: 18, lineHeight: 26, color: '#42564f', fontWeight: '500', maxWidth: 560 },
  syncRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f5f9f5', borderWidth: 1, borderColor: '#dfe8e0', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  syncPillText: { color: colors.green, fontSize: 13, fontWeight: '600' },
  heroCard: { position: 'relative', minHeight: 246, backgroundColor: '#0d5a43', borderRadius: 28, padding: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#0a4736', shadowColor: '#123c2e', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  heroArtwork: { position: 'absolute', right: -50, top: -20, bottom: -20, left: 120, opacity: 0.82 },
  leaf: { position: 'absolute', borderRadius: 180, backgroundColor: 'rgba(156, 208, 151, 0.24)', borderWidth: 2, borderColor: 'rgba(201, 237, 184, 0.2)' },
  leafOne: { width: 238, height: 198, right: -30, top: 18, transform: [{ rotate: '-12deg' }] },
  leafTwo: { width: 198, height: 168, right: 82, top: 30, transform: [{ rotate: '18deg' }] },
  leafThree: { width: 176, height: 146, right: 12, bottom: -10, transform: [{ rotate: '26deg' }] },
  leafVein: { position: 'absolute', right: 88, top: 28, width: 3, height: 138, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 3, transform: [{ rotate: '24deg' }] },
  cameraBadge: { width: 68, height: 68, borderRadius: 18, backgroundColor: '#d9ef8d', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#f1f4ee', marginBottom: 12 },
  heroTitle: { color: '#f4f8f5', fontSize: 40, lineHeight: 46, fontWeight: '800', marginTop: 4 },
  heroText: { color: '#d9efea', fontSize: 18, lineHeight: 26, marginTop: 8, maxWidth: 330 },
  startButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 18, width: '100%', backgroundColor: '#d9ef8d', borderRadius: 999, paddingHorizontal: 22, paddingVertical: 16 },
  startButtonText: { color: colors.green, fontSize: 18, fontWeight: '800' },
  linksCard: { backgroundColor: '#f8f9f7', borderRadius: 24, borderWidth: 1, borderColor: '#dfe7df', padding: 16, gap: 4, shadowColor: '#123c2e', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  sectionTitle: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800', marginBottom: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#dfe7df' },
  linkIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef5ef' },
  linkCopy: { flex: 1 },
  linkTitle: { color: colors.ink, fontSize: 20, fontWeight: '700', marginBottom: 2 },
  linkSummary: { color: '#4d635c', fontSize: 14, lineHeight: 20 },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  viewAllButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  viewAllText: { color: colors.green, fontSize: 16, fontWeight: '700' },
  recentCard: { position: 'relative', backgroundColor: '#f8f9f7', borderRadius: 22, borderWidth: 1, borderColor: '#dfe7df', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#123c2e', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  recentThumb: { position: 'relative', width: 72, height: 72, borderRadius: 18, overflow: 'hidden', backgroundColor: '#0b5d3f' },
  thumbLeaf: { position: 'absolute', width: 100, height: 100, borderRadius: 100, backgroundColor: '#1f7b57', right: -20, top: -10, transform: [{ rotate: '18deg' }] },
  thumbLeafAccent: { position: 'absolute', width: 48, height: 48, borderRadius: 100, backgroundColor: '#d7bd53', left: 10, bottom: 10, transform: [{ rotate: '-26deg' }] },
  thumbLeafVein: { position: 'absolute', width: 2, height: 58, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, left: 28, top: 8, transform: [{ rotate: '30deg' }] },
  recentTextWrap: { flex: 1, marginRight: 8 },
  recentTitle: { color: colors.ink, fontSize: 21, lineHeight: 28, fontWeight: '800' },
  recentMeta: { color: '#596f68', fontSize: 15, lineHeight: 22, marginTop: 2 },
  recentDate: { color: '#657a73', fontSize: 13, lineHeight: 18, marginTop: 4 },
  previewPanel: { gap: 12, marginTop: 6 },
  preview: { width: '100%', height: 240, borderRadius: 20, backgroundColor: '#d9e0dd' },
  actions: { flexDirection: 'row', gap: 10 },
  primaryButton: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryButton: { flex: 1, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondaryText: { color: colors.green, fontWeight: '700' },
  analyzeButton: { minHeight: 52, borderRadius: 14, backgroundColor: colors.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  analyzeText: { color: colors.ink, fontWeight: '800' },
  disabled: { opacity: 0.65 },
  resultCard: { backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 9, marginTop: 6 },
  kicker: { color: colors.green, fontSize: 11, letterSpacing: 1.4, fontWeight: '800' },
  resultClass: { color: colors.ink, fontSize: 29, fontWeight: '800' },
  confidence: { color: colors.green, fontSize: 17, fontWeight: '700' },
  probabilitySection: { marginTop: 5, padding: 14, gap: 11, borderRadius: 14, backgroundColor: '#f5f8f6' },
  probabilityHeading: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  probabilityRow: { gap: 5 },
  probabilityLabelRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  probabilityLabel: { flex: 1, color: colors.muted, fontSize: 13, fontWeight: '600' },
  probabilityLabelActive: { color: colors.green, fontWeight: '900' },
  probabilityValue: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  probabilityTrack: { height: 7, overflow: 'hidden', borderRadius: 99, backgroundColor: '#dfe8e2' },
  probabilityFill: { height: '100%', borderRadius: 99, backgroundColor: '#8eaaa0' },
  probabilityFillActive: { backgroundColor: colors.green },
  savedBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 12, backgroundColor: '#edf5ee' },
  savedText: { flex: 1, color: colors.green, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 5 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  warning: { color: colors.warning, backgroundColor: '#fff6d9', borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 19 },
  bottomNav: { position: 'absolute', left: 14, right: 14, bottom: 12, flexDirection: 'row', gap: 8, paddingHorizontal: 8, paddingVertical: 9, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, shadowColor: '#10251d', shadowOpacity: 0.13, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 7 },
  navButton: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  navIconWrap: { height: 26, alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  navIndicator: { width: 18, height: 3, borderRadius: 1.5, backgroundColor: colors.green },
  navLabel: { color: '#88968f', fontSize: 11, fontWeight: '700' },
  navLabelActive: { color: colors.green, fontWeight: '800' },
});
