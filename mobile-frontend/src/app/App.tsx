import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, AppState, Image, Linking, Platform, Pressable, SafeAreaView, ScrollView, StatusBar as NativeStatusBar, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';

import { LoadingScreen } from '../components/LoadingScreen';
import { FadeIn } from '../components/motion';
import { ChatAssistant, type ScanTopic } from '../features/chat/ChatAssistant';
import { AdminWorkspace } from '../features/connected/AdminWorkspace';
import { AgriculturistWorkspace } from '../features/connected/AgriculturistWorkspace';
import { AgriculturistContentWorkspace } from '../features/connected/AgriculturistContentWorkspace';
import { RoleHome } from '../features/connected/RoleHome';
import { landingTab, navigationForRole, TabKey, validTab } from './navigation';
import { useTabBadges } from './useTabBadges';
import { loadLanguage, useT, type StringKey } from '../i18n';
import type { ClassKey } from '../features/classification/types';
import { ConnectedWorkspace } from '../features/connected/ConnectedWorkspace';
import { HeaderLanguagePicker } from '../features/connected/AccountUI';
import { AuthModal, AuthMode } from '../features/connected/AuthModal';
import { ServerAddress } from '../features/connected/ServerAddress';
import { ConnectionQrScanner } from '../features/connected/ConnectionQrScanner';
import { ActionButton, ModalCard, palette } from '../features/connected/ui';
import { FarmerHome } from '../features/farmer/FarmerHome';
import { GuideScreen } from '../features/guide/GuideScreen';
import { refreshLibrary } from '../services/articleLibrary';
import { LocalHistory } from '../features/offline/LocalHistory';
import { ScanScreen } from '../features/scan/ScanScreen';
import { useModelStatus } from '../features/status/modelStatus';
import { synchronizeDiagnoses } from '../services/diagnosisSync';
import { configureBackgroundSync } from '../services/backgroundSync';
import { checkConnection, subscribeConnection, currentServerUrl, loadServerUrl, restoreSession, serverUrlFromLink, setServerUrl, setSessionExpiredHandler, SessionUser } from '../services/api';
import { useMobilePrivacyProtection } from '../services/mobileSecurity';
import { initializeLocalDatabase } from '../storage/localDiagnoses';

const colors = { background: '#ffffff', green: '#236b4b', ink: '#1d2d24', muted: '#7b857f', border: '#e5eae7', activeTab: '#f0f6f2' };

export default function App() {
  useMobilePrivacyProtection();
  const [requestedTab, setTab] = useState<TabKey>('scan');
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
  const badges = useTabBadges(sessionUser);
  const { t } = useT();
  const tabLabel = (key: TabKey, fallback: string) => (['home', 'scan', 'history', 'guide', 'account'].includes(key) ? t(`nav.${key}` as StringKey) : fallback);
  const tab = validTab(requestedTab, sessionUser?.role);
  const pageScroll = useRef<ScrollView>(null);
  useEffect(() => { pageScroll.current?.scrollTo({ y: 0, animated: false }); dirtyScreen.current = false; }, [tab, sessionUser?.id]);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [online, setOnline] = useState(true);
  const [info, setInfo] = useState<{ title: string; message: string } | null>(null);
  const modelStatus = useModelStatus();
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionNoticeOpen, setConnectionNoticeOpen] = useState(false);
  const connectionNoticeOpacity = useRef(new Animated.Value(0)).current;
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [connectionScannerOpen, setConnectionScannerOpen] = useState(false);
  const [resumeTab, setResumeTab] = useState<TabKey | null>(null);
  const [historyTarget, setHistoryTarget] = useState<string | null>(null);
  const [chatResume, setChatResume] = useState(0);
  const [chatScan, setChatScan] = useState<ScanTopic | null>(null);
  const [resumeChat, setResumeChat] = useState(false);
  const openAuth = (mode: AuthMode) => { setResumeTab(tab === 'account' ? null : tab); setAuthMode(mode); };
  const openHistory = (id?: string) => { setHistoryTarget(id ?? null); setTab('history'); };
  const [guideTarget, setGuideTarget] = useState<{ key: number; classKey: ClassKey } | null>(null);
  const openGuide = (classKey: ClassKey) => { setGuideTarget((current) => ({ key: (current?.key ?? 0) + 1, classKey })); setTab('guide'); };
  const retryConnection = async () => {
    if (checkingConnection) return;
    if (!online) {
      setInfo({ title: t('connection.offlineTitle'), message: t('connection.turnOnInternet') });
      return;
    }
    setCheckingConnection(true);
    try {
      await checkConnection();
      stored();
    } catch {
      setConnectionNoticeOpen(false);
      setConnectionScannerOpen(true);
    }
    finally { setCheckingConnection(false); }
  };
  useEffect(() => subscribeConnection(setServerUnavailable), []);
  useEffect(() => { setConnectionNoticeOpen(serverUnavailable); }, [serverUnavailable]);
  const showConnectionNotice = serverUnavailable && connectionNoticeOpen && !authMode && !connectionOpen && !connectionScannerOpen;
  useEffect(() => {
    if (!showConnectionNotice) return;
    Animated.timing(connectionNoticeOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (checkingConnection) return () => connectionNoticeOpacity.stopAnimation();
    const timer = setTimeout(() => {
      Animated.timing(connectionNoticeOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setConnectionNoticeOpen(false);
      });
    }, 7000);
    return () => { clearTimeout(timer); connectionNoticeOpacity.stopAnimation(); };
  }, [showConnectionNotice, checkingConnection, connectionNoticeOpacity]);
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
  };

  useEffect(() => { void loadLanguage(); }, []);
  // Tapping an "expert answer ready" notification opens that scan in History.
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const localId = response?.notification.request.content.data?.localId;
      if (typeof localId === 'string') openHistory(localId);
      else if (response) setTab('history');
    };
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);
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
        if (active) { setSessionUser(user); if (user) setTab(landingTab(user.role)); }
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
  // Guest scans remain on the device until the farmer chooses Add device scans
  // or requests an expert review of that particular scan.
  const syncAccountDiagnoses = (userId: number) => synchronizeDiagnoses(userId);
  // Farmers never sync by hand: scans sync when the connection returns, when
  // the app comes back to the foreground, and every minute while it is open.
  useEffect(() => {
    if (sessionUser?.role !== 'farmer') return;
    let active = true;
    let connected = false;
    const attempt = () => {
      if (!connected || AppState.currentState !== 'active') return;
      syncAccountDiagnoses(sessionUser.id).then(() => { if (active) setHistoryRefresh((value) => value + 1); }).catch(() => undefined);
    };
    const onNetwork = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      const wasConnected = connected;
      connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (connected && !wasConnected) attempt();
    };
    const unsubscribe = NetInfo.addEventListener(onNetwork);
    NetInfo.fetch().then(onNetwork).catch(() => undefined);
    const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') attempt(); });
    const timer = setInterval(attempt, 60000);
    return () => { active = false; unsubscribe(); foreground.remove(); clearInterval(timer); };
  }, [sessionUser?.id, sessionUser?.role]);
  // Keep the article library on the phone up to date for offline reading,
  // for every visitor, whenever a connection appears (at most once an hour).
  useEffect(() => {
    let lastRefresh = 0;
    const onNetwork = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      if (!state.isConnected || state.isInternetReachable === false || Date.now() - lastRefresh < 3600000) return;
      lastRefresh = Date.now();
      refreshLibrary().catch(() => undefined);
    };
    const unsubscribe = NetInfo.addEventListener(onNetwork);
    return unsubscribe;
  }, []);
  const stored = () => {
    setHistoryRefresh((value) => value + 1);
    if (sessionUser?.role === 'farmer') syncAccountDiagnoses(sessionUser.id).then(() => setHistoryRefresh((value) => value + 1)).catch(() => undefined);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <View style={styles.topHeader}>
          <View style={styles.brand}>
            <Image source={require('../../assets/dahonmd-logo-green.webp')} style={styles.logo} resizeMode="contain" accessibilityLabel="DahonMD logo" />
            <Text style={styles.appName}>DahonMD</Text>
          </View>
          <View style={styles.headerActions}>
          {serverUnavailable && <Pressable accessibilityRole="button" accessibilityLabel={t('connection.offlineTitle')} accessibilityState={{ expanded: showConnectionNotice }} onPress={() => setConnectionNoticeOpen(true)} style={styles.connectionIcon}>
            <Ionicons name="cloud-offline-outline" size={22} color="#8b5d13" />
          </Pressable>}
          {tab === 'account' && <HeaderLanguagePicker onOpen={() => setConnectionNoticeOpen(false)} />}
          </View>
          {showConnectionNotice && <Animated.View style={[styles.connectionNotice, { opacity: connectionNoticeOpacity }]}>
            <View style={styles.connectionNoticeHeading}>
              <Ionicons name="cloud-offline-outline" size={20} color="#8b5d13" />
              <Text style={styles.connectionNoticeTitle}>{t('connection.offlineTitle')}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss connection notice" onPress={() => setConnectionNoticeOpen(false)} style={styles.connectionNoticeClose}>
                <Ionicons name="close" size={20} color="#705a32" />
              </Pressable>
            </View>
            <Text style={styles.connectionNoticeText}>{t('connection.offlineText')}</Text>
            <View style={styles.connectionNoticeActions}>
              <Pressable accessibilityRole="button" disabled={checkingConnection} onPress={retryConnection} style={styles.connectionNoticeAction}><Text style={styles.connectionNoticeActionText}>{checkingConnection ? '…' : t('connection.retry')}</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setConnectionNoticeOpen(false); setConnectionOpen(true); }} style={styles.connectionNoticeAction}><Text style={styles.connectionNoticeActionText}>{t('connection.settings')}</Text></Pressable>
            </View>
          </Animated.View>}
        </View>
        <ScrollView ref={pageScroll} style={styles.pageScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
          <FadeIn trigger={tab}>
          {tab === 'home' && sessionUser?.role === 'farmer' && <FarmerHome user={sessionUser} ownerUserId={sessionUser.id} online={online} refreshKey={historyRefresh} onNavigate={navigate} />}
          {tab === 'home' && sessionUser && (sessionUser.role === 'admin' || sessionUser.role === 'agricultural_expert') && <RoleHome user={sessionUser} role={sessionUser.role} onNavigate={navigate} />}
          {tab === 'scan' && <ScanScreen onDirtyChange={onDirtyChange} onSignIn={() => openAuth('login')} onOpenGuide={openGuide} user={sessionUser ?? null} onStored={stored} modelStatus={modelStatus} />}
          {tab === 'history' && <LocalHistory onDirtyChange={onDirtyChange} focusId={historyTarget} onSignIn={!sessionUser ? () => openAuth('login') : undefined} ownerUserId={sessionUser?.role === 'farmer' ? sessionUser.id : null} refreshKey={historyRefresh} onChanged={stored} onOpenGuide={openGuide} onAskAssistant={sessionUser?.role === 'farmer' ? (diagnosisId, label) => setChatScan((current) => ({ key: (current?.key ?? 0) + 1, diagnosisId, label })) : undefined} />}
          {tab === 'guide' && <GuideScreen key={guideTarget?.key ?? 0} initialClass={guideTarget?.classKey ?? null} onScrollTop={() => pageScroll.current?.scrollTo({ y: 0, animated: false })} />}
          {sessionUser?.role === 'agricultural_expert' && tab === 'reviewed' && <AgriculturistWorkspace scope="reviewed" />}
          {sessionUser?.role === 'agricultural_expert' && tab === 'content' && <AgriculturistContentWorkspace />}
          {sessionUser?.role === 'admin' && (tab === 'accounts' || tab === 'diagnoses' || tab === 'knowledge') && <AdminWorkspace key={tab} section={tab} />}
          {tab === 'account' && <ConnectedWorkspace user={sessionUser ?? null} restoring={sessionUser === undefined} onUser={(user) => { setSessionUser(user); if (!user) setTab('scan'); }} onOpenAuth={openAuth} onDataChanged={() => setHistoryRefresh((value) => value + 1)} onInfo={(title, message) => { setTab('scan'); setInfo({ title, message }); }} />}
          </FadeIn>
        </ScrollView>
        <View accessibilityRole="tablist" style={styles.bottomNav}>
          {navItems.map((item) => {
            const active = tab === item.key;
            const badge = badges[item.key] ?? 0;
            return (
              <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={badge ? `${tabLabel(item.key, item.label)}, ${badge} new` : tabLabel(item.key, item.label)} accessibilityState={{ selected: active }} onPress={() => navigate(item.key)} style={({ pressed }) => [styles.navButton, active && styles.navButtonActive, pressed && styles.navPressed]}>
                <View>
                  <Ionicons name={active ? item.active : item.inactive} size={23} color={active ? colors.green : colors.muted} />
                  {badge > 0 && <View style={styles.navBadge}><Text style={styles.navBadgeText}>{badge > 9 ? '9+' : badge}</Text></View>}
                </View>
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{tabLabel(item.key, item.label)}</Text>
              </Pressable>
            );
          })}
        </View>
        {(!sessionUser || sessionUser.role === 'farmer') && <ChatAssistant resumeKey={chatResume} scanTopic={chatScan} user={sessionUser} onSignIn={() => { setResumeChat(true); openAuth('login'); }} />}
        <AuthModal mode={authMode} onClose={() => { setAuthMode(null); setResumeChat(false); }} onMode={setAuthMode} onConnection={() => setConnectionOpen(true)} onAuthenticated={authenticated} />
        <ConnectionQrScanner visible={connectionScannerOpen} onClose={() => setConnectionScannerOpen(false)} onSettings={() => { setConnectionScannerOpen(false); setConnectionOpen(true); }} onConnect={async (server) => {
          const changed = currentServerUrl() !== server;
          await setServerUrl(server);
          const user = await restoreSession();
          setSessionUser(user);
          setConnectionScannerOpen(false);
          setInfo({ title: t('connection.connectedTitle'), message: t(changed ? 'connection.connectedNew' : 'connection.connectedAgain') });
          setHistoryRefresh((value) => value + 1);
          if (user?.role === 'farmer') void synchronizeDiagnoses(user.id).then(() => setHistoryRefresh((value) => value + 1)).catch(() => undefined);
        }} />
        <ModalCard visible={connectionOpen} title="Connection settings" onClose={() => setConnectionOpen(false)}>
          <ServerAddress onChanged={() => { void restoreSession().then(setSessionUser); setConnectionOpen(false); }} />
        </ModalCard>
        <ModalCard visible={Boolean(info)} title={info?.title || 'Notice'} onClose={() => setInfo(null)}>
          <View style={styles.infoBody}><Ionicons name="information-circle-outline" size={30} color={palette.green} /><Text style={styles.infoText}>{info?.message}</Text><ActionButton onPress={() => setInfo(null)}>Close</ActionButton></View>
        </ModalCard>
      </View>
      <LoadingScreen ready={sessionUser !== undefined} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  app: { flex: 1 },
  pageScroll: { flex: 1 },
  page: { alignSelf: 'center', width: '100%', maxWidth: 600, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 96, gap: 14 },
  topHeader: { minHeight: 60, paddingTop: (Platform.OS === 'android' ? NativeStatusBar.currentHeight ?? 24 : 0) + 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 10, elevation: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 34, height: 34 },
  appName: { color: '#173c2a', fontSize: 18, fontWeight: '800' },
  bottomNav: { flexDirection: 'row', minHeight: 64, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, gap: 4, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#dde5e0' },
  navButton: { flex: 1, minHeight: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navButtonActive: { backgroundColor: colors.activeTab },
  navPressed: { opacity: 0.7 },
  navBadge: { position: 'absolute', top: -5, right: -10, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: '#c2410c', alignItems: 'center', justifyContent: 'center' },
  navBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  navLabel: { color: colors.muted, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  navLabelActive: { color: colors.green, fontWeight: '800' },
  connectionIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#fff6e5' },
  connectionNotice: { position: 'absolute', top: '100%', right: 12, width: '85%', maxWidth: 340, padding: 14, gap: 8, backgroundColor: '#fffaf0', borderColor: '#ead7ad', borderWidth: 1, borderRadius: 14, elevation: 12, shadowColor: '#30240e', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  connectionNoticeHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectionNoticeTitle: { flex: 1, color: '#684b14', fontSize: 15, fontWeight: '800' },
  connectionNoticeClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  connectionNoticeText: { color: '#624f2a', fontSize: 13, lineHeight: 18 },
  connectionNoticeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  connectionNoticeAction: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#dbc795', borderRadius: 8, backgroundColor: '#fff' },
  connectionNoticeActionText: { color: '#684b14', fontSize: 12, fontWeight: '700' },
  infoBody: { gap: 14 },
  infoText: { color: colors.ink, fontSize: 15, lineHeight: 23 },
});
