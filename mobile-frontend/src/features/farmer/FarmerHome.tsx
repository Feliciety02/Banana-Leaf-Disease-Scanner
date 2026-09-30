import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CLASS_DISPLAY_NAMES } from '../classification/disease-data';
import { formatDate, palette } from '../connected/ui';
import { synchronizeDiagnoses } from '../../services/diagnosisSync';
import { authenticatedImageSource, type SessionUser } from '../../services/api';
import {
  listLocalDiagnoses,
  subscribeToLocalDiagnosisChanges,
  type LocalDiagnosis,
  type LocalSyncStatus,
} from '../../storage/localDiagnoses';

const LOW_CONFIDENCE = 70;

const syncMeta: Record<LocalSyncStatus, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  local_only: { icon: 'cloud-offline-outline', color: palette.muted, label: 'On this device' },
  pending: { icon: 'cloud-upload-outline', color: palette.warning, label: 'Waiting to sync' },
  syncing: { icon: 'sync-outline', color: palette.green, label: 'Syncing' },
  synced: { icon: 'cloud-done-outline', color: palette.green, label: 'Synced' },
  failed: { icon: 'cloud-offline-outline', color: palette.danger, label: 'Needs retry' },
  pending_delete: { icon: 'time-outline', color: palette.warning, label: 'Waiting to delete' },
  delete_failed: { icon: 'cloud-offline-outline', color: palette.danger, label: 'Delete needs retry' },
};

const clampPercent = (value: number) => `${Math.min(99.99, Math.max(0, value)).toFixed(1)}%`;

const confidenceText = (value: number) => (value < LOW_CONFIDENCE ? 'Uncertain result' : value >= 85 ? 'High confidence' : 'Moderate confidence');

function recentTitle(item: LocalDiagnosis) {
  if (item.confidence < LOW_CONFIDENCE) return 'Uncertain result';
  return CLASS_DISPLAY_NAMES[item.predicted_class];
}

export function FarmerHome({ user, ownerUserId, online, refreshKey = 0, onNavigate, onSynced }: {
  user: SessionUser | null;
  ownerUserId: number | null;
  online: boolean;
  refreshKey?: number;
  onNavigate: (tab: 'home' | 'scan' | 'history' | 'guide') => void;
  onSynced?: () => void;
}) {
  const [items, setItems] = useState<LocalDiagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listLocalDiagnoses(ownerUserId));
    } finally {
      setLoading(false);
    }
  }, [ownerUserId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let subscription: { remove: () => void } | null = null;
    const scheduleReload = () => {
      if (!active) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { load(); }, 200);
    };
    subscribeToLocalDiagnosisChanges(scheduleReload).then((value) => {
      if (active) subscription = value;
      else value.remove();
    }).catch(() => undefined);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      subscription?.remove();
    };
  }, [load]);

  const pending = items.filter((item) => item.sync_status !== 'synced' && item.sync_status !== 'local_only').length;
  const uncertain = items.filter((item) => item.confidence < LOW_CONFIDENCE).length;
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const signedInFarmer = user?.role === 'farmer';

  const syncNow = async () => {
    if (!signedInFarmer || syncing) return;
    setSyncing(true);
    setSyncMessage('');
    try {
      const summary = await synchronizeDiagnoses(user.id);
      setSyncMessage(summary.rejected > 0 ? `${summary.rejected} scan${summary.rejected === 1 ? '' : 's'} need a retry. Open History to see them.` : 'Scans are up to date.');
      onSynced?.();
    } catch {
      setSyncMessage('Sync could not finish. Check your connection and try again.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.intro}>
        <Text style={styles.hello}>{firstName ? `Good to see you, ${firstName}.` : 'Welcome to DahonMD.'}</Text>
        <Text style={styles.subtitle}>A clearer picture of your banana leaves starts here.</Text>
      </View>

      <View style={styles.scanCard}>
        <View style={styles.heroDecoration} />
        <Image source={require('../../../assets/dahonmd-logo-white.png')} style={styles.heroLogo} resizeMode="contain" accessibilityLabel="DahonMD logo" />
        <Text style={styles.scanTitle}>Scan a banana leaf</Text>
        <Text style={styles.scanText}>Take a photo to see a screening result and practical next steps.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Start a scan" onPress={() => onNavigate('scan')} style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}>
          <Ionicons name="camera-outline" size={20} color="#173c2a" />
          <Text style={styles.scanButtonText}>Start a scan</Text>
          <Ionicons name="arrow-forward" size={18} color="#173c2a" />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}><Ionicons name="albums-outline" size={19} color={palette.green} /><Text style={styles.statValue}>{loading ? '–' : items.length}</Text><Text style={styles.statLabel}>Saved scans</Text></View>
        <View style={styles.statCard}><Ionicons name="alert-circle-outline" size={19} color="#ab7427" /><Text style={styles.statValue}>{loading ? '–' : uncertain}</Text><Text style={styles.statLabel}>Uncertain</Text></View>
        <View style={styles.statCard}><Ionicons name="cloud-upload-outline" size={19} color={palette.green} /><Text style={styles.statValue}>{loading ? '–' : pending}</Text><Text style={styles.statLabel}>To sync</Text></View>
      </View>

      <View style={styles.nextCard}>
        <View style={styles.nextIcon}><Ionicons name={uncertain > 0 ? 'alert-circle-outline' : pending > 0 ? 'cloud-upload-outline' : 'bulb-outline'} size={21} color={palette.green} /></View>
        <View style={styles.nextCopy}>
          <Text style={styles.nextTitle}>{uncertain > 0 ? 'Review an uncertain result' : pending > 0 ? 'Keep your scans in sync' : items.length > 0 ? 'Keep an eye on your leaves' : 'Start with your first leaf'}</Text>
          <Text style={styles.nextText}>{uncertain > 0 ? `${uncertain} saved result${uncertain === 1 ? '' : 's'} had low confidence. Compare visible signs in the guide or ask an expert.` : pending > 0 ? `${pending} change${pending === 1 ? '' : 's'} waiting. Sync when you have a connection.` : items.length > 0 ? 'Check your saved results or scan a new leaf if its appearance changes.' : 'Scan one clear leaf photo to create your first saved result.'}</Text>
          <Pressable accessibilityRole="button" onPress={() => onNavigate(uncertain > 0 || pending > 0 || items.length > 0 ? 'history' : 'scan')} style={styles.nextAction}><Text style={styles.nextActionText}>{uncertain > 0 || pending > 0 || items.length > 0 ? 'Open history' : 'Start scanning'}</Text><Ionicons name="arrow-forward" size={15} color={palette.green} /></Pressable>
        </View>
      </View>

      {!online && (
        <View style={[styles.banner, styles.bannerOffline]}>
          <Ionicons name="cloud-offline-outline" size={21} color={palette.warning} />
          <View style={styles.bannerCopy}>
            <Text style={[styles.bannerTitle, { color: '#76541e' }]}>You're offline</Text>
            <Text style={styles.bannerText}>Saved results stay on this device and upload automatically when the connection returns.</Text>
          </View>
        </View>
      )}

      {online && signedInFarmer && (
        <View style={[styles.banner, styles.bannerOnline]}>
          <Ionicons name={pending > 0 ? 'cloud-upload-outline' : 'cloud-done-outline'} size={21} color={palette.green} />
          <View style={styles.bannerCopy}>
            <Text style={[styles.bannerTitle, { color: '#315c4e' }]}>{pending > 0 ? `${pending} scan${pending === 1 ? '' : 's'} waiting to upload` : 'Your scans are connected'}</Text>
            <Text style={styles.bannerText}>Saved scans stay on this device. Use Sync now to check for updates from your account.</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={syncing} onPress={syncNow} style={({ pressed }) => [styles.syncButton, (syncing || pressed) && styles.dim]}>
            <Ionicons name={syncing ? 'sync' : 'refresh'} size={15} color={palette.green} />
            <Text style={styles.syncButtonText}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
          </Pressable>
        </View>
      )}
      {syncMessage ? <Text accessibilityRole="alert" style={styles.syncMessage}>{syncMessage}</Text> : null}

      <View style={styles.photoCard}>
        <View style={styles.photoHeading}><Ionicons name="sunny-outline" size={20} color={palette.green} /><Text style={styles.photoTitle}>Before you scan</Text></View>
        <Text style={styles.photoText}>A clear photo gives the scanner more to work with.</Text>
        {['Use bright, even light', 'Center one leaf in the frame', 'Keep visible symptoms in focus'].map((tip) => <View key={tip} style={styles.photoRow}><Ionicons name="checkmark-circle" size={17} color={palette.green} /><Text style={styles.photoTip}>{tip}</Text></View>)}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Useful links</Text>
        <Pressable accessibilityRole="button" onPress={() => onNavigate('guide')} style={styles.linkRow}>
          <View style={styles.linkIcon}><Ionicons name="book-outline" size={19} color={palette.green} /></View>
          <View style={styles.linkCopy}>
            <Text style={styles.linkTitle}>Disease guide</Text>
            <Text style={styles.linkText}>Compare visible signs and read verified guidance.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.muted} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => onNavigate('history')} style={styles.linkRow}>
          <View style={styles.linkIcon}><Ionicons name="time-outline" size={19} color={palette.green} /></View>
          <View style={styles.linkCopy}>
            <Text style={styles.linkTitle}>Scan history</Text>
            <Text style={styles.linkText}>Return to your saved results.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.muted} />
        </Pressable>
      </View>

      {!loading && items.length > 0 && (
        <View style={styles.panel}>
          <View style={styles.panelHeading}>
            <Text style={styles.sectionTitle}>Recent scans</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="View all scans" onPress={() => onNavigate('history')} style={styles.viewAll}>
              <Text style={styles.viewAllText}>View all</Text>
              <Ionicons name="chevron-forward" size={16} color={palette.green} />
            </Pressable>
          </View>
          {items.slice(0, 3).map((item) => {
            const meta = syncMeta[item.sync_status];
            return (
              <Pressable key={item.local_id} accessibilityRole="button" accessibilityLabel="Open scan history" onPress={() => onNavigate('history')} style={styles.recentRow}>
                {item.image_uri ? <Image source={authenticatedImageSource(item.image_uri)} style={styles.thumb} accessibilityLabel="Saved banana leaf" /> : <View style={styles.thumbPlaceholder}><Ionicons name="leaf-outline" size={22} color={palette.green} /></View>}
                <View style={styles.recentCopy}>
                  <Text style={styles.recentTitle} numberOfLines={1}>{recentTitle(item)}</Text>
                  <Text style={styles.recentMeta}>{confidenceText(item.confidence)} · {clampPercent(item.confidence)}</Text>
                  <Text style={styles.recentDate}>{formatDate(item.diagnosed_at, true)}</Text>
                </View>
                <View style={styles.recentStatus}>
                  <Ionicons name={meta.icon} size={13} color={meta.color} />
                  <Text style={[styles.recentStatusText, { color: meta.color }]} numberOfLines={1}>{meta.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 16, paddingTop: 16, paddingBottom: 30 },
  intro: { gap: 6, paddingHorizontal: 2, marginBottom: 2 },
  hello: { color: palette.ink, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  bannerOnline: { backgroundColor: palette.successSoft, borderColor: '#c7ddce' },
  bannerOffline: { backgroundColor: palette.warningSoft, borderColor: '#e6d09e' },
  bannerCopy: { flex: 1, gap: 3 },
  bannerTitle: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  bannerText: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  syncButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#b9cbc1', backgroundColor: '#fff' },
  syncMessage: { color: palette.green, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  syncButtonText: { color: palette.green, fontSize: 13, fontWeight: '700' },
  dim: { opacity: 0.55 },
  scanCard: { overflow: 'hidden', gap: 12, borderRadius: 24, backgroundColor: '#174c36', padding: 23, minHeight: 245 },
  heroDecoration: { position: 'absolute', right: -44, top: -64, width: 190, height: 190, borderRadius: 95, borderWidth: 28, borderColor: 'rgba(208, 240, 177, 0.11)' },
  heroLogo: { width: 40, height: 40 },
  scanTitle: { color: '#fff', fontSize: 25, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5, maxWidth: 250 },
  scanText: { color: '#dceee2', fontSize: 14, lineHeight: 21, maxWidth: 285 },
  scanButton: { alignSelf: 'flex-start', minHeight: 48, borderRadius: 12, backgroundColor: '#d9f4a5', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 16, marginTop: 6 },
  scanButtonPressed: { backgroundColor: '#c7e88d' },
  scanButtonText: { color: '#173c2a', fontSize: 14, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 9 },
  statCard: { flex: 1, minWidth: 0, minHeight: 103, gap: 4, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 11 },
  statValue: { color: palette.ink, fontSize: 23, lineHeight: 26, fontWeight: '800' },
  statLabel: { color: palette.muted, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  nextCard: { flexDirection: 'row', gap: 12, borderRadius: 18, backgroundColor: '#eaf4e9', padding: 17 },
  nextIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  nextCopy: { flex: 1, gap: 5 },
  nextTitle: { color: palette.ink, fontSize: 16, fontWeight: '800', lineHeight: 21 },
  nextText: { color: '#556b5e', fontSize: 14, lineHeight: 20 },
  nextAction: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48, marginTop: 2, paddingHorizontal: 4 },
  nextActionText: { color: palette.green, fontSize: 14, fontWeight: '800' },
  photoCard: { gap: 8, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', padding: 18 },
  photoHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoTitle: { color: palette.ink, fontSize: 16, fontWeight: '800' },
  photoText: { color: palette.muted, fontSize: 14, lineHeight: 20, marginBottom: 3 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoTip: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  panel: { borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', overflow: 'hidden' },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  sectionTitle: { color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  panelTitle: { color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '800', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 48, paddingLeft: 8 },
  viewAllText: { color: palette.green, fontSize: 13, fontWeight: '700' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: palette.border },
  linkIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  linkCopy: { flex: 1, gap: 2 },
  linkTitle: { color: palette.ink, fontSize: 15, fontWeight: '700' },
  linkText: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: 1, borderTopColor: palette.border },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eef2ef' },
  thumbPlaceholder: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eef2ef', alignItems: 'center', justifyContent: 'center' },
  recentCopy: { flex: 1, minWidth: 0, gap: 2 },
  recentTitle: { color: '#21382b', fontSize: 15, fontWeight: '700' },
  recentMeta: { color: palette.muted, fontSize: 12 },
  recentDate: { color: '#758078', fontSize: 11 },
  recentStatus: { maxWidth: 96, alignItems: 'flex-end', gap: 3 },
  recentStatusText: { fontSize: 10, fontWeight: '700' },
});
