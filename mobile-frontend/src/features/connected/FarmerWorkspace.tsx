import { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { deleteAccount, privacyPolicyUrl, type SessionUser } from '../../services/api';
import { synchronizeDiagnoses, uploadUnsentPhotos } from '../../services/diagnosisSync';
import { claimLocalOnlyDiagnoses, countAccountDiagnoses, countLocalOnlyDiagnoses, countPendingDiagnoses, deleteLocalAccountData, subscribeToLocalDiagnosisChanges } from '../../storage/localDiagnoses';
import { EmailVerificationNotice, LanguagePicker, ListGroup, ListRow, ProfileHeader } from './AccountUI';
import { ProfileEditor } from './ProfileEditor';
import { ProfilePhotoModal } from './ProfilePhotoModal';
import { useT } from '../../i18n';
import { ActionButton, ConfirmSheet, Field, ModalSheet, Notice, uiStyles } from './ui';

export function FarmerWorkspace({ user, onUser, onSignOut, onAccountDeleted, onChanged, onOpenHistory }: { user: SessionUser; onUser: (user: SessionUser) => void; onOpenHistory: () => void; onSignOut: () => Promise<void>; onAccountDeleted: (message: string) => void; onChanged: () => void }) {
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
  const [photoOpen, setPhotoOpen] = useState(false);
  const { t } = useT();

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
  useEffect(() => { setCountsReady(false); refreshCount().catch(() => setError('Scan totals could not be loaded. Reopen this tab to try again.')); }, [refreshCount]);
  // Automatic synchronization changes the local records; keep the totals current.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let subscription: { remove: () => void } | null = null;
    subscribeToLocalDiagnosisChanges(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (active) refreshCount().catch(() => undefined); }, 200);
    }).then((value) => { if (active) subscription = value; else value.remove(); }).catch(() => undefined);
    return () => { active = false; if (timer) clearTimeout(timer); subscription?.remove(); };
  }, [refreshCount]);

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
      // Signing out deletes this account's photos from the phone, so any photo
      // the server does not have yet must be sent first or counted as unsaved.
      remaining = await countPendingDiagnoses(user.id) + await uploadUnsentPhotos(user.id);
    } catch {
      remaining = await countPendingDiagnoses(user.id).catch(() => pending) || 1;
    } finally {
      setSyncing(false);
    }

    if (!remaining) {
      await finishSignOut();
      return;
    }

    setSignOutPending(remaining);
  };

  const syncStatus = countsReady
    ? pending
      ? { icon: 'cloud-upload-outline' as const, label: `${pending} waiting to sync`, tone: 'waiting' as const }
      : { icon: 'cloud-done-outline' as const, label: 'Synced', tone: 'ok' as const }
    : undefined;

  return <View style={uiStyles.stack}>
    <ProfileHeader
      name={user.name}
      email={user.email}
      role={user.role}
      avatarUrl={user.avatar_url}
      status={syncStatus}
      onPressAvatar={() => setPhotoOpen(true)}
    />
    <EmailVerificationNotice user={user} />
    {message && <Notice tone="success">{message}</Notice>}
    {error && <Notice>{error}</Notice>}
    <ListGroup title={t('account.yourScans')}>
      <ListRow first icon="time-outline" title={t('account.scanHistory')} subtitle={countsReady ? t('account.scanCounts', { total: totals.total, reviewed: totals.reviewed }) : t('account.checking')} onPress={onOpenHistory} />
      {localOnly > 0 && <ListRow icon="person-add-outline" title={t('account.addDeviceScans', { count: localOnly })} subtitle={t('account.addDeviceScansText')} disabled={syncing} onPress={claimLocalScans} />}
    </ListGroup>
    <ProfileEditor user={user} onUser={onUser} />
    <ProfilePhotoModal visible={photoOpen} user={user} onUser={onUser} onClose={() => setPhotoOpen(false)} />
    <LanguagePicker />
    <ListGroup title={t('account.privacy')}>
      <ListRow first icon="image-outline" title={t('account.scanPhotos')} subtitle={t('account.scanPhotosText')} />
      <ListRow icon="location-outline" title={t('account.scanLocation')} subtitle={t('account.scanLocationText')} />
      <ListRow icon="document-text-outline" title={t('account.privacyPolicy')} external onPress={() => openPage(privacyPolicyUrl(), 'The privacy policy')} />
    </ListGroup>
    <ListGroup title={t('account.account')}>
      <ListRow first icon="log-out-outline" title={t('account.signOut')} subtitle={t('account.signOutText')} disabled={syncing} onPress={secureSignOut} />
      <ListRow icon="trash-outline" title={t('account.delete')} subtitle={t('account.deleteText')} danger disabled={syncing} onPress={() => setDeleteOpen(true)} />
    </ListGroup>
    <ModalSheet visible={deleteOpen} title={t('account.deleteTitle')} description={t('account.deleteDescription')} onClose={() => { if (!syncing) { setDeleteOpen(false); setDeletePassword(''); } }}>
      <Field label={t('account.currentPassword')} secureTextEntry autoComplete="current-password" value={deletePassword} onChangeText={setDeletePassword} />
      <View style={uiStyles.actions}><ActionButton variant="secondary" disabled={syncing} onPress={() => { setDeleteOpen(false); setDeletePassword(''); }}>{t('common.cancel')}</ActionButton><ActionButton variant="danger" disabled={syncing || !deletePassword} onPress={confirmAccountDeletion}>{syncing ? t('account.deleting') : t('account.deleteButton')}</ActionButton></View>
    </ModalSheet>
    <ConfirmSheet visible={claimOpen} title={t('account.addTitle')} text={t('account.addText', { count: localOnly, name: user.name })} confirmLabel={t('account.addConfirm')} danger={false} busy={syncing} onCancel={() => setClaimOpen(false)} onConfirm={confirmClaimLocalScans} />
    <ConfirmSheet visible={signOutPending !== null} title={t('account.discardTitle')} text={t('account.discardText', { count: signOutPending ?? 0 })} confirmLabel={t('account.discardConfirm')} busy={syncing} onCancel={() => setSignOutPending(null)} onConfirm={finishSignOut} />
  </View>;
}
