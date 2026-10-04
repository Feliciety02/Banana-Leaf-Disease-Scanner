import { useState } from 'react';
import { View } from 'react-native';

import { updatePassword, updateProfile, type SessionUser } from '../../services/api';
import { ListGroup, ListRow } from './AccountUI';
import { ActionButton, Field, ModalSheet, Notice, uiStyles } from './ui';
import { useT } from '../../i18n';

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'The change could not be saved.';
}

/** Account details and password, matching the website's Profile page. */
export function ProfileEditor({ user, onUser }: { user: SessionUser; onUser: (user: SessionUser) => void }) {
  const [open, setOpen] = useState<'profile' | 'password' | null>(null);
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();

  const show = (sheet: 'profile' | 'password') => {
    setName(user.name); setEmail(user.email); setCurrentPassword(''); setPassword(''); setConfirmation('');
    setError(''); setNotice(''); setOpen(sheet);
  };
  const close = () => { if (!busy) setOpen(null); };

  const saveProfile = async () => {
    setBusy(true); setError('');
    try {
      const updated = await updateProfile({ name, email, currentPassword: emailChanged ? currentPassword : undefined });
      onUser(updated);
      setOpen(null);
      setNotice(emailChanged ? t('profile.updatedEmail') : t('profile.updated'));
    } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  };

  const savePassword = async () => {
    setBusy(true); setError('');
    try {
      await updatePassword(currentPassword, password, confirmation);
      setOpen(null);
      setNotice(t('profile.passwordUpdated'));
    } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  };

  return <View style={uiStyles.stack}>
    {notice ? <Notice tone="success">{notice}</Notice> : null}
    {error && !open ? <Notice>{error}</Notice> : null}
    <ListGroup title={t('profile.title')}>
      <ListRow first icon="person-outline" title={t('profile.edit')} subtitle={`${user.name} · ${user.email}`} onPress={() => show('profile')} />
      <ListRow icon="key-outline" title={t('profile.changePassword')} onPress={() => show('password')} />
    </ListGroup>
    <ModalSheet visible={open === 'profile'} title={t('profile.editTitle')} description={t('profile.editDescription')} onClose={close}>
      <Field label={t('profile.name')} autoComplete="name" value={name} onChangeText={setName} />
      <Field label={t('profile.email')} autoComplete="email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      {emailChanged && <Field label={t('account.currentPassword')} secureTextEntry autoComplete="current-password" value={currentPassword} onChangeText={setCurrentPassword} />}
      {error ? <Notice>{error}</Notice> : null}
      <View style={uiStyles.actions}>
        <ActionButton variant="secondary" disabled={busy} onPress={close}>{t('common.cancel')}</ActionButton>
        <ActionButton disabled={busy || !name.trim() || !email.trim() || (emailChanged && !currentPassword)} onPress={saveProfile}>{busy ? t('common.saving') : t('profile.save')}</ActionButton>
      </View>
    </ModalSheet>
    <ModalSheet visible={open === 'password'} title={t('profile.changePassword')} description={t('profile.passwordDescription')} onClose={close}>
      <Field label={t('account.currentPassword')} secureTextEntry autoComplete="current-password" value={currentPassword} onChangeText={setCurrentPassword} />
      <Field label={t('profile.newPassword')} secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
      <Field label={t('profile.confirmPassword')} secureTextEntry autoComplete="new-password" value={confirmation} onChangeText={setConfirmation} />
      {error ? <Notice>{error}</Notice> : null}
      <View style={uiStyles.actions}>
        <ActionButton variant="secondary" disabled={busy} onPress={close}>{t('common.cancel')}</ActionButton>
        <ActionButton disabled={busy || !currentPassword || !password || password !== confirmation} onPress={savePassword}>{busy ? t('common.saving') : t('profile.changePassword')}</ActionButton>
      </View>
    </ModalSheet>
  </View>;
}
