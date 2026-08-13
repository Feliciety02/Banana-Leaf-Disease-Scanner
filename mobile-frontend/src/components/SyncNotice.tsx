import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SyncStatus } from '../types';

type Props = {
  online: boolean;
  pending: number;
  retryDelayMs: number | null;
  syncError: string | null;
  syncStatus: SyncStatus;
  onRetry: () => void;
};

export function getSyncMessage({
  online,
  pending,
  retryDelayMs,
  syncError,
  syncStatus,
}: Omit<Props, 'onRetry'>): string {
  if (!online) {
    return 'You can still scan leaves. Results are saved on this device and uploaded when your connection returns.';
  }
  if (syncStatus === 'syncing') {
    return `Uploading ${pending} saved ${pending === 1 ? 'scan' : 'scans'}…`;
  }
  if (syncStatus === 'error' && pending > 0) {
    return `${syncError ?? 'Synchronization failed.'}${retryDelayMs ? ` Retrying in ${Math.ceil(retryDelayMs / 1000)} seconds.` : ''} Tap to retry now.`;
  }
  if (pending > 0) {
    return `${pending} saved ${pending === 1 ? 'scan is' : 'scans are'} waiting to synchronize.`;
  }
  return 'All synchronized scans are saved online.';
}

export function SyncNotice(props: Props) {
  const failed = props.online && props.pending > 0 && props.syncStatus === 'error';
  const color = !props.online ? '#b97816' : failed ? '#b84d45' : '#176348';
  const icon = !props.online ? 'cloud-offline-outline' : failed ? 'alert-circle-outline' : 'cloud-done-outline';

  return (
    <Pressable
      accessibilityRole={failed ? 'button' : undefined}
      accessibilityLabel={failed ? 'Synchronization failed. Retry now.' : undefined}
      disabled={!failed}
      onPress={props.onRetry}
      style={({ pressed }) => [styles.notice, failed && styles.error, pressed && styles.pressed]}
    >
      {props.syncStatus === 'syncing'
        ? <ActivityIndicator size="small" color="#176348" />
        : <Ionicons name={icon} size={20} color={color} />}
      <Text style={[styles.text, failed && styles.errorText]}>{getSyncMessage(props)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  notice: { marginTop: 15, padding: 13, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#e8f1ec' },
  error: { backgroundColor: '#f8e5e3', borderWidth: 1, borderColor: '#e5b8b4' },
  pressed: { opacity: 0.74 },
  text: { flex: 1, minWidth: 0, color: '#51645d', fontSize: 10, lineHeight: 15 },
  errorText: { color: '#7b3430' },
});
