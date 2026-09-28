import { useEffect, useState } from 'react';
import { Alert, Image, Platform, Pressable, SafeAreaView, ScrollView, StatusBar as NativeStatusBar, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import NetInfo from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';

import { ChatAssistant } from '../features/chat/ChatAssistant';
import { ConnectedWorkspace } from '../features/connected/ConnectedWorkspace';
import { AuthModal, AuthMode } from '../features/connected/AuthModal';
import { ModalCard } from '../features/connected/ui';
import { FarmerHome } from '../features/farmer/FarmerHome';
import { GuideScreen } from '../features/guide/GuideScreen';
import { LocalHistory } from '../features/offline/LocalHistory';
import { ScanScreen } from '../features/scan/ScanScreen';
import { useModelStatus } from '../features/status/modelStatus';
import { synchronizeDiagnoses } from '../services/diagnosisSync';
import { configureBackgroundSync } from '../services/backgroundSync';
import { restoreSession, setSessionExpiredHandler, SessionUser } from '../services/api';
import { useMobilePrivacyProtection } from '../services/mobileSecurity';
import { deleteLocalAccountData, initializeLocalDatabase } from '../storage/localDiagnoses';

const colors = { background: '#ffffff', green: '#236b4b', ink: '#1d2d24', muted: '#7b857f', border: '#e5eae7', activeTab: '#f0f6f2' };

type TabKey = 'home' | 'scan' | 'history' | 'guide';

const NAV_ITEMS: { key: TabKey; label: string; active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'home', label: 'Home', active: 'home', inactive: 'home-outline' },
  { key: 'scan', label: 'Scan', active: 'scan', inactive: 'scan-outline' },
  { key: 'history', label: 'History', active: 'time', inactive: 'time-outline' },
  { key: 'guide', label: 'Guide', active: 'book', inactive: 'book-outline' },
];

export default function App() {
  useMobilePrivacyProtection();
  const [tab, setTab] = useState<TabKey>('home');
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null | undefined>(undefined);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [online, setOnline] = useState(true);
  const modelStatus = useModelStatus();

  useEffect(() => { initializeLocalDatabase().catch((error) => Alert.alert('Offline storage unavailable', error instanceof Error ? error.message : 'The local database could not be opened.')); }, []);
  useEffect(() => { restoreSession().then(setSessionUser).catch(() => setSessionUser(null)); }, []);
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
      if (sessionUser?.role === 'farmer') deleteLocalAccountData(sessionUser.id).catch(() => undefined);
      setSessionUser(null);
      setAuthMode(null);
      setProfileOpen(false);
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
  const initials = (() => {
    const name = sessionUser?.name?.trim();
    if (!name) return null;
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  })();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.app}>
        <View style={styles.topHeader}>
          <View style={styles.brand}>
            <Image source={require('../../assets/icon.png')} style={styles.logo} accessibilityLabel="DahonMD logo" />
            <Text style={styles.appName}>DahonMD</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open your profile" onPress={() => setProfileOpen(true)} style={styles.avatarButton}>
            {initials ? <Text style={styles.avatarInitials}>{initials}</Text> : <Ionicons name="person-outline" size={19} color={colors.green} />}
          </Pressable>
        </View>
        <ScrollView style={styles.pageScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
          {tab === 'home' && <FarmerHome user={sessionUser ?? null} ownerUserId={sessionUser?.role === 'farmer' ? sessionUser.id : null} online={online} refreshKey={historyRefresh} onNavigate={setTab} onSynced={() => setHistoryRefresh((value) => value + 1)} />}
          {tab === 'scan' && <ScanScreen user={sessionUser ?? null} onStored={stored} modelStatus={modelStatus} />}
          {tab === 'history' && <LocalHistory ownerUserId={sessionUser?.role === 'farmer' ? sessionUser.id : null} refreshKey={historyRefresh} onChanged={stored} />}
          {tab === 'guide' && <GuideScreen />}
        </ScrollView>
        <View accessibilityRole="tablist" style={styles.bottomNav}>
          {NAV_ITEMS.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(item.key)} style={({ pressed }) => [styles.navButton, active && styles.navButtonActive, pressed && styles.navPressed]}>
                <Ionicons name={active ? item.active : item.inactive} size={23} color={active ? colors.green : colors.muted} />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <ChatAssistant user={sessionUser} onSignIn={() => setAuthMode('login')} />
        <AuthModal mode={authMode} onClose={() => setAuthMode(null)} onMode={setAuthMode} onAuthenticated={(user) => { setSessionUser(user); setAuthMode(null); setProfileOpen(true); }} />
        <ModalCard visible={profileOpen} title="Account" onClose={() => setProfileOpen(false)}>
          <ConnectedWorkspace user={sessionUser ?? null} restoring={sessionUser === undefined} onUser={setSessionUser} onOpenAuth={(mode) => { setProfileOpen(false); setAuthMode(mode); }} onDataChanged={() => setHistoryRefresh((value) => value + 1)} />
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
  logo: { width: 34, height: 34, borderRadius: 9 },
  appName: { color: '#173c2a', fontSize: 18, fontWeight: '800' },
  avatarButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#dde5e0', backgroundColor: colors.activeTab, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: colors.green, fontSize: 14, fontWeight: '800' },
  bottomNav: { flexDirection: 'row', minHeight: 64, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 6, gap: 4, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#dde5e0' },
  navButton: { flex: 1, minHeight: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navButtonActive: { backgroundColor: colors.activeTab },
  navPressed: { opacity: 0.7 },
  navLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  navLabelActive: { color: colors.green, fontWeight: '800' },
});
