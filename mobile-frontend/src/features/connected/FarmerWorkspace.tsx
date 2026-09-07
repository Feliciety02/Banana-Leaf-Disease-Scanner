import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { accountDeletionUrl, deleteAccount, privacyPolicyUrl, type SessionUser } from '../../services/api';
import { synchronizeDiagnoses, type SyncSummary } from '../../services/diagnosisSync';
import { claimLocalOnlyDiagnoses, countLocalOnlyDiagnoses, countPendingDiagnoses, deleteLocalAccountData } from '../../storage/localDiagnoses';
import { ActionButton, Field, ModalSheet, Notice, palette, SectionHeader, uiStyles } from './ui';

export function FarmerWorkspace({ user, onSignOut, onAccountDeleted, onChanged }: { user: SessionUser; onSignOut: () => Promise<void>; onAccountDeleted: () => void; onChanged: () => void }) {
  const [pending, setPending] = useState(0);
  const [localOnly, setLocalOnly] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const refreshCount = useCallback(async () => {
    const [pendingCount, localOnlyCount] = await Promise.all([
      countPendingDiagnoses(user.id),
      countLocalOnlyDiagnoses(),
    ]);
    setPending(pendingCount);
    setLocalOnly(localOnlyCount);
  }, [user.id]);
  useEffect(() => { refreshCount().catch(() => undefined); }, [refreshCount]);

  const sync = async () => {
    setSyncing(true);
    setError('');
    setMessage('');
    try {
      const result: SyncSummary = await synchronizeDiagnoses(user.id);
      setMessage(result.pushed || result.pulled || result.deleted
        ? `Sync complete: ${result.pushed} uploaded, ${result.deleted} deleted, and ${result.pulled} server changes applied.`
        : 'Everything is already up to date.');
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Sync could not finish. Your local records are safe and will be retried.');
    } finally {
      await refreshCount().catch(() => undefined);
      setSyncing(false);
    }
  };

  const claimLocalScans = () => Alert.alert(
    'Add device-only scans to this account?',
    `${localOnly} scan${localOnly === 1 ? '' : 's'} created while signed out will be linked to ${user.name} and queued for synchronization.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add to account', onPress: async () => {
        setSyncing(true);
        setError('');
        try {
          const claimed = await claimLocalOnlyDiagnoses(user.id);
          const result = await synchronizeDiagnoses(user.id);
          setMessage(`${claimed} device-only scan${claimed === 1 ? '' : 's'} added. ${result.pushed} uploaded now.`);
          onChanged();
        } catch (requestError) {
          setError(requestError instanceof Error ? requestError.message : 'The scans were kept safely on this device and can be retried.');
        } finally {
          await refreshCount().catch(() => undefined);
          setSyncing(false);
        }
      } },
    ],
  );

  const openPage = async (url: string | null, label: string) => {
    if (!url) {
      setError(`${label} is not configured for this build.`);
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setError(`${label} could not be opened.`);
    }
  };

  const confirmAccountDeletion = async () => {
    setSyncing(true);
    setError('');
    try {
      await deleteAccount(deletePassword);
      let localCleanupFailed = false;
      try {
        await deleteLocalAccountData(user.id);
      } catch {
        localCleanupFailed = true;
      }
      setDeleteOpen(false);
      setDeletePassword('');
      onAccountDeleted();
      Alert.alert(
        'Account deleted',
        localCleanupFailed
          ? 'Your server account was deleted, but some device data could not be removed. Clear DahonMD app data from Android settings to finish local cleanup.'
          : 'Your account and account-linked data were deleted. Device-only scans remain available in local history.',
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Your account could not be deleted. Nothing was removed.');
      setDeleteOpen(false);
    } finally {
      setSyncing(false);
    }
  };

  const finishSignOut = async () => {
    setSyncing(true);
    setError('');
    try {
      await deleteLocalAccountData(user.id);
      await onSignOut();
      onChanged();
    } catch {
      setError('DahonMD could not securely remove this account\'s device data. Sign-out was stopped; try again or clear the app data in system settings.');
    } finally {
      setSyncing(false);
    }
  };

  const secureSignOut = async () => {
    setSyncing(true);
    setError('');
    let remaining = pending;
    try {
      await synchronizeDiagnoses(user.id);
      remaining = await countPendingDiagnoses(user.id);
    } catch {
      remaining = await countPendingDiagnoses(user.id).catch(() => pending);
    } finally {
      setSyncing(false);
    }

    if (!remaining) {
      await finishSignOut();
      return;
    }

    Alert.alert(
      'Discard unsynchronized changes?',
      `${remaining} unsynchronized change${remaining === 1 ? '' : 's'} will be permanently removed from this device when you sign out.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard and sign out', style: 'destructive', onPress: finishSignOut },
      ],
    );
  };

  return <View style={uiStyles.stack}>
    <SectionHeader eyebrow="FARMER WORKSPACE" title={`Hello, ${user.name}`} text="Your device database remains usable offline and reconnects to your account when the API is reachable." />
    {message && <Notice tone="success">{message}</Notice>}
    {error && <Notice>{error}</Notice>}
    <View style={uiStyles.card}>
      <View style={styles.statusRow}>
        <View style={styles.icon}><Ionicons name={pending ? 'cloud-upload-outline' : 'cloud-done-outline'} size={27} color={palette.green} /></View>
        <View style={uiStyles.flex}><Text style={uiStyles.cardTitle}>{pending ? `${pending} record${pending === 1 ? '' : 's'} waiting` : 'Device is up to date'}</Text><Text style={uiStyles.cardMeta}>A UUID prevents duplicate server records if a retry happens after an interrupted request.</Text></View>
      </View>
      <ActionButton icon="sync" disabled={syncing} onPress={sync}>{syncing ? 'Synchronizing…' : 'Sync now'}</ActionButton>
    </View>
    {localOnly > 0 && <View style={uiStyles.card}>
      <View style={styles.statusRow}>
        <View style={styles.icon}><Ionicons name="phone-portrait-outline" size={25} color={palette.green} /></View>
        <View style={uiStyles.flex}><Text style={uiStyles.cardTitle}>{localOnly} device-only scan{localOnly === 1 ? '' : 's'}</Text><Text style={uiStyles.cardMeta}>These were created while signed out. They remain private unless you choose to add them to this account.</Text></View>
      </View>
      <ActionButton variant="secondary" icon="person-add-outline" disabled={syncing} onPress={claimLocalScans}>Add to my account</ActionButton>
    </View>}
    <View style={styles.privacy}><Ionicons name="image-outline" size={22} color={palette.green} /><Text style={styles.privacyText}>The SQL sync sends prediction metadata only. Leaf images remain in local storage unless you separately provide explicit research consent.</Text></View>
    <View style={uiStyles.card}>
      <Text style={uiStyles.cardTitle}>Privacy and account</Text>
      <Text style={uiStyles.cardMeta}>Review how DahonMD handles data or permanently remove your account and its synchronized data.</Text>
      <View style={uiStyles.actions}>
        <ActionButton variant="secondary" icon="document-text-outline" onPress={() => openPage(privacyPolicyUrl(), 'The privacy policy')}>Privacy policy</ActionButton>
        <ActionButton variant="ghost" icon="open-outline" onPress={() => openPage(accountDeletionUrl(), 'The web deletion page')}>Web deletion page</ActionButton>
      </View>
      <ActionButton variant="danger" icon="trash-outline" disabled={syncing} onPress={() => setDeleteOpen(true)}>Delete my account</ActionButton>
    </View>
    <ActionButton variant="secondary" icon="log-out-outline" disabled={syncing} onPress={secureSignOut}>Sign out</ActionButton>
    <ModalSheet visible={deleteOpen} title="Permanently delete account?" description="Confirm your current password. This removes the account, synchronized classifications, and account-linked image copies on this device." onClose={() => { if (!syncing) { setDeleteOpen(false); setDeletePassword(''); } }}>
      <Field label="Current password" secureTextEntry autoComplete="current-password" value={deletePassword} onChangeText={setDeletePassword} />
      <View style={uiStyles.actions}><ActionButton variant="secondary" disabled={syncing} onPress={() => { setDeleteOpen(false); setDeletePassword(''); }}>Cancel</ActionButton><ActionButton variant="danger" disabled={syncing || !deletePassword} onPress={confirmAccountDeletion}>{syncing ? 'Deleting…' : 'Delete account'}</ActionButton></View>
    </ModalSheet>
  </View>;
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  icon: { width: 48, height: 48, borderRadius: 15, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 15, borderRadius: 17, backgroundColor: palette.greenSoft },
  privacyText: { flex: 1, color: palette.muted, fontSize: 13, lineHeight: 19 },
});
