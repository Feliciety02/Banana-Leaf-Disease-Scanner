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
  if (item.predicted_class === 'healthy') return 'No supported pattern detected';
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
          <Pressable accessibilityRole="button" disabled={syncing} onPress={syncNow} style={[styles.syncButton, syncing && styles.dim]}>
            <Ionicons name={syncing ? 'sync' : 'refresh'} size={15} color={palette.green} />
            <Text style={styles.syncButtonText}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
          </Pressable>
        </View>
      )}

      <Pressable accessibilityRole="button" accessibilityLabel="Start a scan" onPress={() => onNavigate('scan')} style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="camera" size={30} color={palette.green} />
        </View>
        <Text style={styles.heroTitle}>Check a leaf</Text>
        <Text style={styles.heroText}>Take a clear photo or choose one from your gallery.</Text>
        <View style={styles.heroAction}>
          <Text style={styles.heroActionText}>Start scan</Text>
          <Ionicons name="chevron-forward" size={18} color={palette.lime} />
        </View>
      </Pressable>

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
  hello: { color: palette.ink, fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: '#6c7d77', fontSize: 16, lineHeight: 23, fontWeight: '500', marginTop: -4 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14, borderRadius: 14, borderLeftWidth: 4 },
  bannerOnline: { backgroundColor: '#e6f1eb', borderLeftColor: palette.green },
  bannerOffline: { backgroundColor: palette.warningSoft, borderLeftColor: palette.warning },
  bannerCopy: { flex: 1, gap: 3 },
  bannerTitle: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  bannerText: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  syncButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: palette.green, backgroundColor: '#fff', marginTop: 8 },
  syncButtonText: { color: palette.green, fontSize: 13, fontWeight: '800' },
  dim: { opacity: 0.55 },
  hero: { borderRadius: 18, backgroundColor: palette.green, padding: 20, gap: 5 },
  heroIcon: { width: 64, height: 64, borderRadius: 19, backgroundColor: palette.lime, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle: { color: '#fff', fontSize: 24, lineHeight: 30, fontWeight: '900', letterSpacing: -0.3 },
  heroText: { color: '#c9ddd5', fontSize: 13, lineHeight: 19 },
  heroAction: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 8 },
  heroActionText: { color: palette.lime, fontSize: 13, fontWeight: '800' },
  panel: { borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', overflow: 'hidden' },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  sectionTitle: { color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '900' },
  panelTitle: { color: palette.ink, fontSize: 16, lineHeight: 22, fontWeight: '900', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingLeft: 8 },
  viewAllText: { color: palette.green, fontSize: 12, fontWeight: '800' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: palette.border },
  linkIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  linkCopy: { flex: 1, gap: 2 },
  linkTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  linkText: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: 1, borderTopColor: palette.border },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: palette.greenSoft },
  thumbPlaceholder: { width: 52, height: 52, borderRadius: 12, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  recentCopy: { flex: 1, minWidth: 0, gap: 2 },
  recentTitle: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  recentMeta: { color: palette.muted, fontSize: 11, fontWeight: '600' },
  recentDate: { color: palette.muted, fontSize: 11, fontWeight: '600' },
  recentStatus: { maxWidth: 96, alignItems: 'flex-end', gap: 3 },
  recentStatusText: { fontSize: 9, fontWeight: '800' },
});