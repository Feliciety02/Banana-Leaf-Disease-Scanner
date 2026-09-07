import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { CLASS_DISPLAY_NAMES } from '../classification/disease-data';
import {
  listLocalDiagnoses,
  requestLocalDiagnosisDeletion,
  retryLocalDiagnosis,
  type LocalDiagnosis,
  type LocalSyncStatus,
} from '../../storage/localDiagnoses';
import { Empty, Loading, Notice, palette, SectionHeader, uiStyles } from '../connected/ui';
import { authenticatedImageSource } from '../../services/api';

const statusCopy: Record<LocalSyncStatus, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  local_only: { label: 'Only on this device', icon: 'phone-portrait-outline', color: palette.muted },
  pending: { label: 'Waiting to sync', icon: 'time-outline', color: '#856617' },
  syncing: { label: 'Syncing', icon: 'sync-outline', color: palette.green },
  synced: { label: 'Synced', icon: 'cloud-done-outline', color: palette.green },
  failed: { label: 'Needs retry', icon: 'warning-outline', color: '#a13a2f' },
  pending_delete: { label: 'Waiting to delete', icon: 'trash-outline', color: '#856617' },
  delete_failed: { label: 'Delete needs retry', icon: 'warning-outline', color: '#a13a2f' },
};

export function LocalHistory({ ownerUserId, refreshKey = 0, onChanged }: { ownerUserId: number | null; refreshKey?: number; onChanged?: () => void }) {
  const [items, setItems] = useState<LocalDiagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listLocalDiagnoses(ownerUserId));
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Offline history could not be opened.');
    } finally {
      setLoading(false);
    }
  }, [ownerUserId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const remove = (item: LocalDiagnosis) => {
    const cloudCopy = item.server_id ? ' It will also be removed from your account when synchronization completes.' : '';
    Alert.alert('Delete this scan?', `The saved result and its device image will be removed.${cloudCopy}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusyId(item.local_id);
        try {
          await requestLocalDiagnosisDeletion(item.local_id);
          await load();
          onChanged?.();
        } catch (requestError) {
          setError(requestError instanceof Error ? requestError.message : 'The scan could not be deleted.');
        } finally {
          setBusyId(null);
        }
      } },
    ]);
  };

  const retry = async (item: LocalDiagnosis) => {
    setBusyId(item.local_id);
    try {
      await retryLocalDiagnosis(item.local_id);
      await load();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  return <View style={uiStyles.stack}>
    <SectionHeader
      eyebrow="LOCAL SQLITE HISTORY"
      title="Scan history"
      text="Results are written to this device first. Signed-in farmer scans are copied to the shared SQL database when a connection returns. Images stay local unless you explicitly consent to research upload."
      action={<Pressable accessibilityRole="button" accessibilityLabel="Refresh history" onPress={load} style={styles.refresh}><Ionicons name="refresh" size={19} color={palette.green} /></Pressable>}
    />
    {!ownerUserId && <Notice tone="warning">Scans made while signed out remain only on this device. Sign in before scanning when you want a result synchronized to your account.</Notice>}
    {error && <Notice>{error}</Notice>}
    {loading ? <Loading text="Opening offline history…" /> : items.length ? items.map((item) => {
      const status = statusCopy[item.sync_status];
      return <View key={item.local_id} style={uiStyles.card}>
        <View style={uiStyles.row}>
          {item.image_uri ? <Image source={authenticatedImageSource(item.image_uri)} style={styles.thumb} /> : <View style={styles.placeholder}><Ionicons name="leaf-outline" size={25} color={palette.green} /></View>}
          <View style={uiStyles.flex}>
            <Text style={uiStyles.cardTitle}>{CLASS_DISPLAY_NAMES[item.predicted_class]}</Text>
            <Text style={uiStyles.cardMeta}>{item.confidence.toFixed(1)}% confidence · {formatLocalDate(item.diagnosed_at)}</Text>
            <View style={styles.status}><Ionicons name={status.icon} size={15} color={status.color} /><Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text></View>
          </View>
        </View>
        {item.last_error && <Text style={styles.error}>{item.last_error}</Text>}
        <View style={styles.actions}>
          {(item.sync_status === 'failed' || item.sync_status === 'delete_failed') && <Pressable accessibilityRole="button" disabled={busyId === item.local_id} onPress={() => retry(item)} style={styles.retryButton}><Ionicons name="refresh" size={15} color={palette.green} /><Text style={styles.retryText}>Retry</Text></Pressable>}
          <Pressable accessibilityRole="button" disabled={busyId === item.local_id || item.sync_status === 'pending_delete'} onPress={() => remove(item)} style={styles.deleteButton}><Ionicons name="trash-outline" size={15} color={palette.danger} /><Text style={styles.deleteText}>{item.sync_status === 'pending_delete' ? 'Deletion queued' : 'Delete'}</Text></Pressable>
        </View>
      </View>;
    }) : <Empty title="No saved scans yet" text="Your next classification will be stored here even when the device is offline." />}
  </View>;
}

function formatLocalDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const styles = StyleSheet.create({
  refresh: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: palette.border },
  thumb: { width: 72, height: 72, borderRadius: 15, backgroundColor: palette.greenSoft },
  placeholder: { width: 72, height: 72, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.greenSoft },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  statusText: { fontSize: 12, fontWeight: '800' },
  error: { color: '#8e3028', fontSize: 12, lineHeight: 17, paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.border },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 4 },
  retryButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: palette.green, flexDirection: 'row', alignItems: 'center', gap: 5 },
  retryText: { color: palette.green, fontSize: 12, fontWeight: '800' },
  deleteButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 11, borderWidth: 1, borderColor: '#e7bbb7', flexDirection: 'row', alignItems: 'center', gap: 5 },
  deleteText: { color: palette.danger, fontSize: 12, fontWeight: '800' },
});
