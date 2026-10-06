import { useCallback, useEffect, useState } from 'react';
import { Linking, Switch, Text, View } from 'react-native';

import { deleteAccount, listResearchPhotos, removeResearchPhoto, privacyPolicyUrl, updateResearchPreference, type ResearchPhoto, type SessionUser } from '../../services/api';
import { synchronizeDiagnoses, uploadUnsentPhotos } from '../../services/diagnosisSync';
import { claimLocalOnlyDiagnoses, countAccountDiagnoses, countLocalOnlyDiagnoses, countPendingDiagnoses, deleteLocalAccountData, subscribeToLocalDiagnosisChanges } from '../../storage/localDiagnoses';
import { EmailVerificationNotice, ListGroup, ListRow, ProfileHeader } from './AccountUI';
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
  const [removeResearchCopies, setRemoveResearchCopies] = useState(false);
  const [researchPhotos, setResearchPhotos] = useState<ResearchPhoto[]>([]);
  const [researchTarget, setResearchTarget] = useState<ResearchPhoto | null>(null);
  const [researchBusy, setResearchBusy] = useState(false);
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
  useEffect(() => { setCountsReady(false); refreshCount().catch(() => setError(t('account.scansLoadFailed'))); }, [refreshCount]);
  useEffect(() => { listResearchPhotos().then(setResearchPhotos).catch(() => undefined); }, [user.id]);

  const revokeResearchPhoto = async () => {
    if (!researchTarget) return;
    setSyncing(true);
    try {
      await removeResearchPhoto(researchTarget.id);
      setResearchPhotos(await listResearchPhotos());
      setResearchTarget(null);
      setMessage(t('account.researchPhotoRemoved'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('account.researchPhotoFailed'));
    } finally {
      setSyncing(false);
    }
  };
  const changeResearchPreference = async (enabled: boolean) => {
    setResearchBusy(true); setError('');
    try {
      onUser(await updateResearchPreference(enabled));
      await synchronizeDiagnoses(user.id).catch(() => undefined);
      setResearchPhotos(await listResearchPhotos());
      onChanged();
      setMessage(t(enabled ? 'account.researchTurnedOn' : 'account.researchTurnedOff'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('account.researchUpdateFailed'));
    } finally { setResearchBusy(false); }
  };
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
      setMessage(t('account.scansAdded', { count: claimed, uploaded: result.pushed }));
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('account.scansRetry'));
      setClaimOpen(false);
    } finally {
      await refreshCount().catch(() => undefined);
      setSyncing(false);
    }
  };

  const openPage = async (url: string | null, label: string) => {
    if (!url) {
      setError(t('account.linkUnavailable', { name: label }));
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setError(t('account.linkOpenFailed', { name: label }));
    }
  };

  const confirmAccountDeletion = async () => {
    setSyncing(true);
    setError('');
    try {
      await deleteAccount(deletePassword, removeResearchCopies);
      let localCleanupFailed = false;
      try {
        await deleteLocalAccountData(user.id);
      } catch {
        localCleanupFailed = true;
      }
      setDeleteOpen(false);
      setDeletePassword('');
      setRemoveResearchCopies(false);
      onAccountDeleted(localCleanupFailed ? t('account.deletedDeviceCleanup') : t('account.deletedSuccess'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('account.deleteFailed'));
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
      setError(t('account.signOutFailed'));
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
      ? { icon: 'cloud-upload-outline' as const, label: t('account.waitingSync', { count: pending }), tone: 'waiting' as const }
      : { icon: 'cloud-done-outline' as const, label: t('account.synced'), tone: 'ok' as const }
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
    <ListGroup title={t('account.privacy')}>
      <View style={{ padding: 16, gap: 8 }}><Text style={{ fontWeight: '700' }}>{t('account.researchSharing')}</Text><Text>{t('account.researchSharingText')}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Switch accessibilityLabel={t('account.researchSharing')} value={Boolean(user.research_photo_consent)} disabled={researchBusy} onValueChange={(value) => { void changeResearchPreference(value); }} /><Text style={{ flex: 1 }}>{t(user.research_photo_consent ? 'account.researchOn' : 'account.researchOff')}</Text></View></View>
      <ListRow first icon="image-outline" title={t('account.scanPhotos')} subtitle={t('account.scanPhotosText')} />
      <ListRow icon="flask-outline" title={t('account.researchPhotos')} subtitle={t('account.researchPhotosText', { count: researchPhotos.filter((photo) => !photo.revoked_at).length })} onPress={() => listResearchPhotos().then(setResearchPhotos).catch(() => setError(t('account.researchPhotoFailed')))} />
      {researchPhotos.filter((photo) => !photo.revoked_at || photo.file_removal_pending).map((photo) => <ListRow key={photo.id} icon="close-circle-outline" title={`#${photo.id} · ${photo.verified_label.replaceAll('-', ' ')}`} subtitle={t(photo.file_removal_pending ? 'account.retryResearchPhoto' : 'account.removeResearchPhoto')} danger onPress={() => setResearchTarget(photo)} />)}
      <ListRow icon="location-outline" title={t('account.scanLocation')} subtitle={t('account.scanLocationText')} />
      <ListRow icon="document-text-outline" title={t('account.privacyPolicy')} external onPress={() => openPage(privacyPolicyUrl(), t('account.privacyPolicy'))} />
    </ListGroup>
    <ListGroup title={t('account.account')}>
      <ListRow first icon="log-out-outline" title={t('account.signOut')} disabled={syncing} onPress={secureSignOut} />
      <ListRow icon="trash-outline" title={t('account.delete')} subtitle={t('account.deleteText')} danger disabled={syncing} onPress={() => setDeleteOpen(true)} />
    </ListGroup>
    <ModalSheet visible={deleteOpen} title={t('account.deleteTitle')} description={t('account.deleteDescription')} onClose={() => { if (!syncing) { setDeleteOpen(false); setDeletePassword(''); } }}>
      <Field label={t('account.currentPassword')} secureTextEntry autoComplete="current-password" value={deletePassword} onChangeText={setDeletePassword} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}><Switch accessibilityLabel={t('account.removeResearchCopies')} value={removeResearchCopies} onValueChange={setRemoveResearchCopies} /><Text style={{ flex: 1 }}>{t('account.removeResearchCopies')}</Text></View>
      <View style={uiStyles.actions}><ActionButton variant="secondary" disabled={syncing} onPress={() => { setDeleteOpen(false); setDeletePassword(''); }}>{t('common.cancel')}</ActionButton><ActionButton variant="danger" disabled={syncing || !deletePassword} onPress={confirmAccountDeletion}>{syncing ? t('account.deleting') : t('account.deleteButton')}</ActionButton></View>
    </ModalSheet>
    <ConfirmSheet visible={claimOpen} title={t('account.addTitle')} text={t('account.addText', { count: localOnly, name: user.name })} confirmLabel={t('account.addConfirm')} danger={false} busy={syncing} onCancel={() => setClaimOpen(false)} onConfirm={confirmClaimLocalScans} />
    <ConfirmSheet visible={signOutPending !== null} title={t('account.discardTitle')} text={t('account.discardText', { count: signOutPending ?? 0 })} confirmLabel={t('account.discardConfirm')} busy={syncing} onCancel={() => setSignOutPending(null)} onConfirm={finishSignOut} />
    <ConfirmSheet visible={Boolean(researchTarget)} title={t(researchTarget?.file_removal_pending ? 'account.retryResearchPhoto' : 'account.removeResearchPhoto')} text={t(researchTarget?.file_removal_pending ? 'account.retryResearchPhotoText' : 'account.removeResearchPhotoText')} confirmLabel={t(researchTarget?.file_removal_pending ? 'account.retryResearchPhoto' : 'account.removeResearchPhoto')} danger busy={syncing} onCancel={() => setResearchTarget(null)} onConfirm={revokeResearchPhoto} />
  </View>;
}
