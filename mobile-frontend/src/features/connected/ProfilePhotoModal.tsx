import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { UserAvatar } from '../../components/UserAvatar';
import { removeAvatar, uploadAvatar, type SessionUser } from '../../services/api';
import { ActionButton, ModalCard, Notice, palette } from './ui';
import { useT } from '../../i18n';

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Floating card to view, change or remove the profile photo. */
export function ProfilePhotoModal({ visible, user, onUser, onClose }: { visible: boolean; user: SessionUser; onUser: (user: SessionUser) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { t } = useT();
  useEffect(() => { if (visible) { setConfirmRemove(false); setError(''); setNotice(''); } }, [visible]);
  const close = () => { if (!busy) onClose(); };

  // The picker crops to a square; the photo is shrunk before upload to save data.
  const choosePhoto = async () => {
    setError(''); setNotice('');
    const selection = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
    if (selection.canceled) return;
    setBusy(true);
    try {
      const context = ImageManipulator.manipulate(selection.assets[0].uri);
      context.resize({ width: 512, height: 512 });
      const photo = await (await context.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      onUser(await uploadAvatar(photo.uri, 'image/jpeg'));
      setNotice(t('photo.updated'));
    } catch (e) { setError(messageOf(e, t('photo.changeFailed'))); } finally { setBusy(false); }
  };

  const deletePhoto = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      onUser(await removeAvatar());
      setConfirmRemove(false);
      setNotice(t('photo.removed'));
    } catch (e) { setError(messageOf(e, t('photo.changeFailed'))); } finally { setBusy(false); }
  };

  return <ModalCard visible={visible} title={t('photo.title')} description={t('photo.description')} onClose={close}>
    <View style={styles.preview}>
      <UserAvatar name={user.name} uri={user.avatar_url} size={168} inverted />
      {!user.avatar_url && <Text style={styles.empty}>{t('photo.none')}</Text>}
    </View>
    {notice ? <Notice tone="success">{notice}</Notice> : null}
    {error ? <Notice>{error}</Notice> : null}
    {confirmRemove ? <View style={styles.actions}>
      <Text style={styles.confirm}>{t('photo.confirmRemove')}</Text>
      <ActionButton variant="danger" icon="trash-outline" disabled={busy} onPress={deletePhoto}>{busy ? t('photo.removing') : t('photo.remove')}</ActionButton>
      <ActionButton variant="secondary" disabled={busy} onPress={() => setConfirmRemove(false)}>{t('photo.keep')}</ActionButton>
    </View> : <View style={styles.actions}>
      <ActionButton icon="images-outline" disabled={busy} onPress={choosePhoto}>{busy ? t('common.saving') : user.avatar_url ? t('photo.change') : t('photo.add')}</ActionButton>
      {user.avatar_url ? <ActionButton variant="secondary" icon="trash-outline" disabled={busy} onPress={() => { setNotice(''); setError(''); setConfirmRemove(true); }}>{t('photo.remove')}</ActionButton> : null}
      <ActionButton variant="ghost" disabled={busy} onPress={close}>{t('photo.done')}</ActionButton>
    </View>}
  </ModalCard>;
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  empty: { color: palette.muted, fontSize: 13, textAlign: 'center' },
  actions: { gap: 10 },
  confirm: { color: palette.ink, fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
