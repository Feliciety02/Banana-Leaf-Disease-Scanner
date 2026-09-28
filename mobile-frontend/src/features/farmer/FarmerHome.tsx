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
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const signedInFarmer = user?.role === 'farmer';

  const syncNow = async () => {
    if (!signedInFarmer || syncing) return;
    setSyncing(true);
    try {
      await synchronizeDiagnoses(user.id);
      onSynced?.();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.hello}>{firstName ? `Hello, ${firstName}.` : 'Welcome to DahonMD.'}</Text>
      <Text style={styles.subtitle}>{user ? 'Check a banana leaf or look up a symptom you have noticed.' : 'Scan a banana leaf or look up a symptom using the guide.'}</Text>

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

      <View style={styles.scanCard}>
        <View style={styles.scanIcon}>
          <Ionicons name="leaf-outline" size={28} color={palette.green} />
        </View>
        <Text style={styles.scanTitle}>Check a leaf</Text>
        <Text style={styles.scanText}>Take a clear photo or choose one from your gallery.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Start a scan" onPress={() => onNavigate('scan')} style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}>
          <Ionicons name="camera-outline" size={20} color="#fff" />
          <Text style={styles.scanButtonText}>Start scan</Text>
        </Pressable>
        <Text style={styles.scanTip}>Keep the whole leaf visible and avoid shadows.</Text>
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
          {items.slice(0, 4).map((item) => {
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
  screen: { gap: 14, paddingTop: 14, paddingBottom: 24 },
  hello: { color: palette.ink, fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 20, marginTop: -8 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  bannerOnline: { backgroundColor: palette.successSoft, borderColor: '#c7ddce' },
  bannerOffline: { backgroundColor: palette.warningSoft, borderColor: '#e6d09e' },
  bannerCopy: { flex: 1, gap: 3 },
  bannerTitle: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  bannerText: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  syncButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 42, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#b9cbc1', backgroundColor: '#fff' },
  syncButtonText: { color: palette.green, fontSize: 13, fontWeight: '700' },
  dim: { opacity: 0.55 },
  scanCard: { alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', paddingHorizontal: 18, paddingVertical: 22 },
  scanIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  scanTitle: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  scanText: { color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  scanButton: { alignSelf: 'stretch', minHeight: 52, borderRadius: 12, backgroundColor: palette.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  scanButtonPressed: { backgroundColor: palette.greenPressed },
  scanButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  scanTip: { color: '#737d77', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
  panel: { borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', overflow: 'hidden' },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  sectionTitle: { color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  panelTitle: { color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '800', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 40, paddingLeft: 8 },
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
