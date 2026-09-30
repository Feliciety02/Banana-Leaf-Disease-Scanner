import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, SafeAreaView, ScrollView, StatusBar as NativeStatusBar, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import NetInfo from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';

import { ChatAssistant } from '../features/chat/ChatAssistant';
import { AdminWorkspace } from '../features/connected/AdminWorkspace';
import { ReviewerWorkspace } from '../features/connected/ReviewerWorkspace';
import { ReviewerContentWorkspace } from '../features/connected/ReviewerContentWorkspace';
import { landingTab, navigationForRole, TabKey, validTab } from './navigation';
import { ConnectedWorkspace } from '../features/connected/ConnectedWorkspace';
import { AuthModal, AuthMode } from '../features/connected/AuthModal';
import { ServerAddress } from '../features/connected/ServerAddress';
import { ActionButton, ModalCard, palette } from '../features/connected/ui';
import { FarmerHome } from '../features/farmer/FarmerHome';
import { GuideScreen } from '../features/guide/GuideScreen';
import { LocalHistory } from '../features/offline/LocalHistory';
import { ScanScreen } from '../features/scan/ScanScreen';
import { useModelStatus } from '../features/status/modelStatus';
import { synchronizeDiagnoses } from '../services/diagnosisSync';
import { configureBackgroundSync } from '../services/backgroundSync';
import { checkConnection, subscribeConnection, currentServerUrl, loadServerUrl, restoreSession, serverUrlFromLink, setServerUrl, setSessionExpiredHandler, SessionUser } from '../services/api';
import { useMobilePrivacyProtection } from '../services/mobileSecurity';
import { claimLocalOnlyDiagnoses, countLocalOnlyDiagnoses, guestScanChoice, initializeLocalDatabase } from '../storage/localDiagnoses';

const colors = { background: '#ffffff', green: '#236b4b', ink: '#1d2d24', muted: '#7b857f', border: '#e5eae7', activeTab: '#f0f6f2' };

export default function App() {
  useMobilePrivacyProtection();
  const [requestedTab, setTab] = useState<TabKey>('home');
  const dirtyScreen = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => { dirtyScreen.current = dirty; }, []);
  const navigate = (next: TabKey) => {
    if (next === tab) return;
    if (dirtyScreen.current) Alert.alert('Leave unfinished work?', 'The photo or notes on this screen have not been saved.', [
      { text: 'Keep editing', style: 'cancel' }, { text: 'Leave screen', style: 'destructive', onPress: () => { dirtyScreen.current = false; setTab(next); } },
    ]);
    else setTab(next);
  };
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [sessionUser, setSessionUser] = useState<SessionUser | null | undefined>(undefined);
  const navItems = navigationForRole(sessionUser?.role);
  const tab = validTab(requestedTab, sessionUser?.role);
  const pageScroll = useRef<ScrollView>(null);
  useEffect(() => { pageScroll.current?.scrollTo({ y: 0, animated: false }); dirtyScreen.current = false; }, [tab, sessionUser?.id]);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [online, setOnline] = useState(true);
  const [info, setInfo] = useState<{ title: string; message: string } | null>(null);
  const modelStatus = useModelStatus();
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [resumeTab, setResumeTab] = useState<TabKey | null>(null);
  const [historyTarget, setHistoryTarget] = useState<string | null>(null);
  const [chatResume, setChatResume] = useState(0);
  const [resumeChat, setResumeChat] = useState(false);
  const [guestCount, setGuestCount] = useState(0);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState('');
  const openAuth = (mode: AuthMode) => { setResumeTab(tab === 'account' ? null : tab); setAuthMode(mode); };
  const openHistory = (id?: string) => { setHistoryTarget(id ?? null); setTab('history'); };
  const retryConnection = async () => {
    setCheckingConnection(true);
    try { await checkConnection(); stored(); } catch { /* Banner remains actionable. */ }
    finally { setCheckingConnection(false); }
  };
  useEffect(() => subscribeConnection(setServerUnavailable), []);
  useEffect(() => {
    if (!serverUnavailable || !online) return;
    // Recheck reachability without retrying a submitted form or mutation.
    void checkConnection().catch(() => undefined);
    const timer = setInterval(() => { void checkConnection().catch(() => undefined); }, 30000);
    return () => clearInterval(timer);
  }, [serverUnavailable, online]);
  const authenticated = async (user: SessionUser) => {
    setSessionUser(user); setAuthMode(null);
    setTab(user.role === 'farmer' ? validTab(resumeTab ?? 'home', user.role) : landingTab(user.role));
    if (resumeChat) { setChatResume((value) => value + 1); setResumeChat(false); }
    if (user.role === 'farmer') {
      try {
        if (!await guestScanChoice(user.email.trim().toLowerCase())) setGuestCount(await countLocalOnlyDiagnoses());
      } catch { /* The Account tab still offers manual claiming. */ }
    }
  };
  const chooseGuestScans = async (add: boolean) => {
    if (!sessionUser || claimBusy) return;
    setClaimBusy(true); setClaimError('');
    try {
      if (add) await claimLocalOnlyDiagnoses(sessionUser.id);
      await guestScanChoice(sessionUser.email.trim().toLowerCase(), add ? 'added' : 'kept');
      setGuestCount(0); stored();
    } catch { setClaimError('Your choice could not be saved. Please try again.'); }
    finally { setClaimBusy(false); }
  };

  useEffect(() => { initializeLocalDatabase().catch((error) => setInfo({ title: 'Offline storage unavailable', message: error instanceof Error ? error.message : 'The local database could not be opened.' })); }, []);
  useEffect(() => {
    let active = true;
    let pending = Promise.resolve();
    const connectFromLink = (link: string | null) => {
      const server = serverUrlFromLink(link);
      if (!server) return pending;
      pending = pending.then(async () => {
        await loadServerUrl();
        const changed = currentServerUrl() !== server;
        await setServerUrl(server);
        if (!active) return;
        setSessionUser(await restoreSession());
        setAuthMode(null);
        setTab('account');
        setInfo({ title: 'Server connected', message: changed ? 'The app is connected to the same DahonMD server as the website. Sign in to use your account.' : 'This DahonMD server is already connected.' });
      }).catch((error) => {
        if (active) setInfo({ title: 'Could not connect', message: error instanceof Error ? error.message : 'Check the server link and try again.' });
      });
      return pending;
    };
    const subscription = Linking.addEventListener('url', ({ url }) => { void connectFromLink(url); });
    void (async () => {
      try {
        await loadServerUrl();
        await connectFromLink(await Linking.getInitialURL());
        const user = await restoreSession();
        if (active) { setSessionUser(user); if (user && user.role !== 'farmer') setTab(landingTab(user.role)); }
      } catch {
        if (active) setSessionUser(null);
      }
    })();
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    let active = true;
    const update = (state: { isConnected: boolean | null; isInternetReachable?: boolean | null }) => {
      if (active) setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    };
    const unsubscribe = NetInfo.addEventListener(update);
    NetInfo.fetch().then((state) => update({ isConnected: state.isConnected, isInternetReachable: state.isInternetReachable })).catch(() => undefined);
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (sessionUser === undefined) return;
    configureBackgroundSync(sessionUser?.role === 'farmer').catch(() => undefined);
  }, [sessionUser?.role]);
  useEffect(() => {
    setSessionExpiredHandler(() => {
      // Keep unsynced records attached to their owner until they sign in again.
      setSessionUser(null);
      setResumeTab(tab);
      setAuthMode('login');
      setInfo({ title: 'Session expired', message: 'Your login has expired. Please sign in again to continue using connected features.' });
    });
    return () => setSessionExpiredHandler(null);
  }, [sessionUser?.id, sessionUser?.role, tab]);
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
        <View style={styles.topHeader}>
          <View style={styles.brand}>
            <Image source={require('../../assets/dahonmd-logo-green.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="DahonMD logo" />
            <Text style={styles.appName}>DahonMD</Text>
          </View>
        </View>
        {serverUnavailable && !authMode && <View style={styles.connectionBanner}>
          <Text style={styles.infoText}>Server unavailable. Offline scanning still works.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><ActionButton variant="secondary" disabled={checkingConnection} onPress={retryConnection}>{checkingConnection ? 'Checking...' : 'Retry'}</ActionButton><ActionButton variant="secondary" onPress={() => setConnectionOpen(true)}>Update connection</ActionButton></View>
        </View>}
        <ScrollView ref={pageScroll} style={styles.pageScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
          {tab === 'home' && <FarmerHome user={sessionUser ?? null} ownerUserId={sessionUser?.role === 'farmer' ? sessionUser.id : null} online={online} refreshKey={historyRefresh} onNavigate={navigate} onSynced={() => setHistoryRefresh((value) => value + 1)} />}
          {tab === 'scan' && <ScanScreen onDirtyChange={onDirtyChange} onOpenHistory={openHistory} user={sessionUser ?? null} onStored={stored} modelStatus={modelStatus} />}
          {tab === 'history' && <LocalHistory onDirtyChange={onDirtyChange} focusId={historyTarget} onSignIn={!sessionUser ? () => openAuth('login') : undefined} ownerUserId={sessionUser?.role === 'farmer' ? sessionUser.id : null} refreshKey={historyRefresh} onChanged={stored} />}
          {tab === 'guide' && <GuideScreen />}
          {sessionUser?.role === 'agricultural_expert' && (tab === 'requests' || tab === 'reviewed') && <ReviewerWorkspace key={tab} scope={tab === 'requests' ? 'pending' : 'reviewed'} />}
          {sessionUser?.role === 'agricultural_expert' && tab === 'content' && <ReviewerContentWorkspace />}
          {sessionUser?.role === 'admin' && (tab === 'overview' || tab === 'accounts' || tab === 'diagnoses' || tab === 'knowledge') && <AdminWorkspace key={tab} section={tab} />}
          {tab === 'account' && <ConnectedWorkspace onOpenHistory={() => openHistory()} user={sessionUser ?? null} restoring={sessionUser === undefined} onUser={(user) => { setSessionUser(user); if (!user) setTab('home'); }} onOpenAuth={openAuth} onDataChanged={() => setHistoryRefresh((value) => value + 1)} onInfo={(title, message) => { setTab('home'); setInfo({ title, message }); }} />}
        </ScrollView>
        <View accessibilityRole="tablist" style={styles.bottomNav}>
          {navItems.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => navigate(item.key)} style={({ pressed }) => [styles.navButton, active && styles.navButtonActive, pressed && styles.navPressed]}>
                <Ionicons name={active ? item.active : item.inactive} size={23} color={active ? colors.green : colors.muted} />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {(!sessionUser || sessionUser.role === 'farmer') && <ChatAssistant resumeKey={chatResume} user={sessionUser} onSignIn={() => { setResumeChat(true); openAuth('login'); }} />}
        <AuthModal mode={authMode} onClose={() => { setAuthMode(null); setResumeChat(false); }} onMode={setAuthMode} onConnection={() => setConnectionOpen(true)} onAuthenticated={authenticated} />
        <ModalCard visible={connectionOpen} title="Connection settings" onClose={() => setConnectionOpen(false)}>
          <ServerAddress onChanged={() => { void restoreSession().then(setSessionUser); setConnectionOpen(false); }} />
        </ModalCard>
        <ModalCard visible={guestCount > 0} title="Keep your existing scans?" onClose={() => { if (!claimBusy) void chooseGuestScans(false); }}>
          <Text style={styles.infoText}>{guestCount} scans were saved while signed out. Add their results to this account for syncing, or keep them only on this phone. Photos are shared only for review or research consent.</Text>
          {claimError ? <Text style={styles.infoText}>{claimError}</Text> : null}
          <ActionButton disabled={claimBusy} onPress={() => chooseGuestScans(true)}>Add existing scans</ActionButton>
          <ActionButton disabled={claimBusy} variant="secondary" onPress={() => chooseGuestScans(false)}>Keep on this phone</ActionButton>
        </ModalCard>
        <ModalCard visible={Boolean(info)} title={info?.title || 'Notice'} onClose={() => setInfo(null)}>
          <View style={styles.infoBody}><Ionicons name="information-circle-outline" size={30} color={palette.green} /><Text style={styles.infoText}>{info?.message}</Text><ActionButton onPress={() => setInfo(null)}>Close</ActionButton></View>
        </ModalCard>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  app: { flex: 1 },
  pageScroll: { flex: 1 },
  page: { alignSelf: 'center', width: '100%', maxWidth: 600, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 96, gap: 14 },
  topHeader: { minHeight: 60, paddingTop: (Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 24 : 0) + 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logo: { width: 34, height: 34 },
  appName: { color: '#173c2a', fontSize: 18, fontWeight: '800' },
  bottomNav: { flexDirection: 'row', minHeight: 64, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, gap: 4, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#dde5e0' },
  navButton: { flex: 1, minHeight: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navButtonActive: { backgroundColor: colors.activeTab },
  navPressed: { opacity: 0.7 },
  navLabel: { color: colors.muted, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  navLabelActive: { color: colors.green, fontWeight: '800' },
  connectionBanner: { padding: 12, gap: 8, backgroundColor: '#fff6d9' },
  infoBody: { gap: 14 },
  infoText: { color: colors.ink, fontSize: 15, lineHeight: 23 },
});
