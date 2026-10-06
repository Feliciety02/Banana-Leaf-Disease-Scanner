import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useT } from '../../i18n';

import { currentServerUrl, defaultServerUrl, resetServerUrl, setServerUrl } from '../../services/api';
import { ActionButton, Field, Notice, palette } from './ui';

/** Lets the user point the app at a DahonMD server (HTTPS only, verified first). */
export function ServerAddress({ onChanged }: { onChanged: () => void }) {
  const { t } = useT();
  const current = currentServerUrl();
  const [open, setOpen] = useState(!current);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await setServerUrl(draft);
      setDraft('');
      setMessage({ tone: 'success', text: t('server.connected', { url: saved.replace(/\/api$/, '') }) });
      onChanged();
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : t('server.error') });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    await resetServerUrl();
    setMessage({ tone: 'success', text: t('server.builtIn') });
    onChanged();
  };

  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={styles.header}>
        <Ionicons name="server-outline" size={20} color={palette.green} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{t('server.title')}</Text>
          <Text style={styles.value} numberOfLines={1}>{current ? t('server.saved') : t('server.missing')}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.muted} />
      </Pressable>
      {open && (
        <View style={styles.body}>
          {current && <Text selectable style={styles.hint}>{current.replace(/\/api$/, '')}</Text>}
          <Text style={styles.hint}>{t('server.hint')}</Text>
          <Field label={t('server.newAddress')} value={draft} onChangeText={setDraft} placeholder="https://…" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          <View style={styles.actions}>
            <ActionButton icon="checkmark" disabled={busy || !draft.trim()} onPress={save}>{busy ? t('server.checking') : t('server.save')}</ActionButton>
            {defaultServerUrl() && current !== defaultServerUrl() && <ActionButton variant="ghost" onPress={reset}>{t('server.reset')}</ActionButton>}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: '#fff', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 76, paddingHorizontal: 14 },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: palette.ink, fontSize: 15, fontWeight: '700' },
  value: { color: palette.muted, fontSize: 12 },
  body: { gap: 12, padding: 14, borderTopWidth: 1, borderTopColor: palette.border },
  hint: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
