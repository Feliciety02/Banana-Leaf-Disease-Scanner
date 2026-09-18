import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
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

const colors = { background: '#edf3ee', green: '#174d3a', ink: '#17231f' };

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
        <View style={styles.bottomNav}>
          {NAV_ITEMS.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(item.key)} style={styles.navButton}>
                {active ? <View style={styles.navIndicator} /> : null}
                <Ionicons name={active ? item.active : item.inactive} size={23} color={active ? colors.green : '#8a9892'} />
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
  page: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 108, gap: 14 },
  topHeader: { height: 88, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e6ece8' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logo: { width: 30, height: 30, borderRadius: 9 },
  appName: { color: colors.green, fontSize: 20, fontWeight: '900', letterSpacing: 0.2 },
  avatarButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#dce5df', backgroundColor: '#f1f5f2', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: colors.green, fontSize: 14, fontWeight: '800' },
  bottomNav: { position: 'absolute', left: 14, right: 14, bottom: 12, flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, borderRadius: 22, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce5df', shadowColor: '#10251d', shadowOpacity: 0.13, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 7 },
  navButton: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 3, paddingBottom: 7 },
  navIndicator: { position: 'absolute', bottom: 5, width: 20, height: 3, borderRadius: 2, backgroundColor: colors.green },
  navLabel: { color: '#8a9892', fontSize: 12, fontWeight: '700' },
  navLabelActive: { color: colors.green, fontWeight: '900' },
});