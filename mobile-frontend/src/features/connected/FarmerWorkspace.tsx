import { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { deleteAccount, privacyPolicyUrl, type SessionUser } from '../../services/api';
import { synchronizeDiagnoses, type SyncSummary } from '../../services/diagnosisSync';
import { claimLocalOnlyDiagnoses, countAccountDiagnoses, countLocalOnlyDiagnoses, countPendingDiagnoses, deleteLocalAccountData } from '../../storage/localDiagnoses';
import { EmailVerificationNotice, ListGroup, ListRow, ProfileHeader, StatRow } from './AccountUI';
import { ActionButton, ConfirmSheet, Field, ModalSheet, Notice, palette, uiStyles } from './ui';

export function FarmerWorkspace({ user, onSignOut, onAccountDeleted, onChanged, onOpenHistory }: { user: SessionUser; onOpenHistory: () => void; onSignOut: () => Promise<void>; onAccountDeleted: (message: string) => void; onChanged: () => void }) {
  const [countsReady, setCountsReady] = useState(false);
  const [pending, setPending] = useState(0);
  const [localOnly, setLocalOnly] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [claimOpen, setClaimOpen] = useState(false);
  const [signOutPending, setSignOutPending] = useState<number | null>(null);
  const [totals, setTotals] = useState({ total: 0, reviewed: 0 });

  const refreshCount = useCallback(async () => {
    const [pendingCount, localOnlyCount, accountTotals] = await Promise.all([
      countPendingDiagnoses(user.id),
      countLocalOnlyDiagnoses(),
      countAccountDiagnoses(user.id),
    ]);
    setPending(pendingCount);
    setLocalOnly(localOnlyCount);
    setTotals(accountTotals);
    setCountsReady(true);
  }, [user.id]);
  useEffect(() => { setCountsReady(false); refreshCount().catch(() => setError('Scan totals could not be loaded. Try syncing again.')); }, [refreshCount]);

  const sync = async () => {
    setSyncing(true);
    setError('');
    setMessage('');
    try {
      const result: SyncSummary = await synchronizeDiagnoses(user.id);
      setMessage(result.pushed || result.pulled || result.deleted
        ? `Sync complete. ${result.pushed} scan${result.pushed === 1 ? '' : 's'} uploaded.`
        : 'Everything is already up to date.');
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Sync could not finish. Your local records are safe and will be retried.');
    } finally {
      await refreshCount().catch(() => undefined);
      setSyncing(false);
    }
  };

  const claimLocalScans = () => setClaimOpen(true);
  const confirmClaimLocalScans = async () => {
    setSyncing(true);
    setError('');
    try {
      const claimed = await claimLocalOnlyDiagnoses(user.id);
      const result = await synchronizeDiagnoses(user.id);
      setClaimOpen(false);
      setMessage(`${claimed} device-only scan${claimed === 1 ? '' : 's'} added. ${result.pushed} uploaded now.`);
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The scans were kept safely on this device and can be retried.');
      setClaimOpen(false);
    } finally {
      await refreshCount().catch(() => undefined);
      setSyncing(false);
    }
  };

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
      onAccountDeleted(localCleanupFailed
        ? 'Your server account was deleted, but some device data could not be removed. Clear DahonMD app data from Android settings to finish local cleanup.'
        : 'Your account and account-linked data were deleted. Device-only scans remain available in local history.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Your account could not be deleted. Nothing was removed.');
      setDeleteOpen(false);
    } finally {
      setSyncing(false);
    }
  };

  const finishSignOut = async () => {
    setSignOutPending(null);
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

    setSignOutPending(remaining);
  };

  return <View style={uiStyles.stack}>
    <ProfileHeader
      name={user.name}
      email={user.email}
      role={user.role}

    />
    <EmailVerificationNotice user={user} />
    {message && <Notice tone="success">{message}</Notice>}
    {error && <Notice>{error}</Notice>}
    <View style={styles.syncCard}>
      <View style={styles.statusRow}>
        <View style={styles.icon}><Ionicons name="sync-outline" size={25} color={palette.green} /></View>
        <View style={uiStyles.flex}><Text style={uiStyles.cardTitle}>Your scan collection</Text><Text style={uiStyles.cardMeta}>Results and reviews saved on this phone.</Text></View>
      </View>
      <StatRow items={[
        { icon: 'leaf-outline', value: countsReady ? totals.total : '\u2014', label: 'Saved scans' },
        { icon: 'cloud-upload-outline', value: countsReady ? pending : '\u2014', label: 'Pending changes' },
        { icon: 'shield-checkmark-outline', value: countsReady ? totals.reviewed : '\u2014', label: 'Reviews' },
      ]} />
      <ActionButton variant="secondary" icon="time-outline" onPress={onOpenHistory}>View scan history</ActionButton>
      <View style={styles.syncDivider} />
      <Text style={styles.syncTitle}>{!countsReady ? 'Checking saved scans...' : pending ? `${pending} change${pending === 1 ? '' : 's'} waiting to sync` : 'No changes waiting to upload'}</Text>
      <Text style={uiStyles.cardMeta}>Sync to upload pending changes and download the latest results and reviews.</Text>
      <ActionButton icon="sync" disabled={syncing} onPress={sync}>{syncing ? 'Synchronizing...' : 'Sync now'}</ActionButton>
    </View>
    {localOnly > 0 && <View style={uiStyles.card}>
      <View style={styles.statusRow}>
        <View style={styles.icon}><Ionicons name="phone-portrait-outline" size={24} color={palette.green} /></View>
        <View style={uiStyles.flex}><Text style={uiStyles.cardTitle}>{localOnly} device-only scan{localOnly === 1 ? '' : 's'}</Text><Text style={uiStyles.cardMeta}>Made while signed out. They stay private unless you add them to this account.</Text></View>
      </View>
      <ActionButton variant="secondary" icon="person-add-outline" disabled={syncing} onPress={claimLocalScans}>Add to my account</ActionButton>
    </View>}
    <ListGroup title="Data & privacy">
      <ListRow first icon="image-outline" title="You control photo sharing" subtitle="Photos may be uploaded when you request a review or consent to research. Signing in does not share every photo." />
      <ListRow icon="document-text-outline" title="Privacy policy" external onPress={() => openPage(privacyPolicyUrl(), 'The privacy policy')} />
    </ListGroup>
    <ListGroup title="Session">
      <ListRow first icon="log-out-outline" title="Sign out" subtitle="Uploads waiting scans first" disabled={syncing} onPress={secureSignOut} />
    </ListGroup>
    <ListGroup title="Delete account">
      <ListRow first icon="trash-outline" title="Delete my account" subtitle="Permanently removes your account and synced data" danger disabled={syncing} onPress={() => setDeleteOpen(true)} />
    </ListGroup>
    <ModalSheet visible={deleteOpen} title="Permanently delete account?" description="Confirm your current password. This removes the account, synchronized classifications, and account-linked image copies on this device." onClose={() => { if (!syncing) { setDeleteOpen(false); setDeletePassword(''); } }}>
      <Field label="Current password" secureTextEntry autoComplete="current-password" value={deletePassword} onChangeText={setDeletePassword} />
      <View style={uiStyles.actions}><ActionButton variant="secondary" disabled={syncing} onPress={() => { setDeleteOpen(false); setDeletePassword(''); }}>Cancel</ActionButton><ActionButton variant="danger" disabled={syncing || !deletePassword} onPress={confirmAccountDeletion}>{syncing ? 'Deleting…' : 'Delete account'}</ActionButton></View>
    </ModalSheet>
    <ConfirmSheet visible={claimOpen} title="Add device-only scans?" text={`${localOnly} scan${localOnly === 1 ? '' : 's'} created while signed out will be linked to ${user.name} and queued for synchronization.`} confirmLabel="Add to account" danger={false} busy={syncing} onCancel={() => setClaimOpen(false)} onConfirm={confirmClaimLocalScans} />
    <ConfirmSheet visible={signOutPending !== null} title="Discard unsynchronized changes?" text={`${signOutPending ?? 0} unsynchronized change${signOutPending === 1 ? '' : 's'} will be permanently removed from this device when you sign out.`} confirmLabel="Discard and sign out" busy={syncing} onCancel={() => setSignOutPending(null)} onConfirm={finishSignOut} />
  </View>;
}

const styles = StyleSheet.create({
  syncCard: { gap: 14, padding: 18, borderRadius: 24, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff' },
  syncTitle: { color: palette.ink, fontSize: 16, fontWeight: '700' },
  syncDivider: { height: 1, backgroundColor: palette.border, marginVertical: 2 },
  statusRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  icon: { width: 46, height: 46, borderRadius: 12, backgroundColor: palette.greenSoft, alignItems: 'center', justifyContent: 'center' },
});
