import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { mapUrl } from './MapLink';
import { attachCurrentLocation, removeScanLocation } from '../services/scanLocation';
import { getLocalDiagnosis } from '../storage/localDiagnoses';
import { ActionButton, palette } from '../features/connected/ui';
import { useT } from '../i18n';

type Coordinates = { latitude: number; longitude: number };

/**
 * Optional location for one scan. Nothing is read until the farmer taps the
 * button, and it can be removed again at any time.
 */
export function ScanLocationControl({ localId, onChanged }: { localId: string; onChanged?: () => void }) {
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { t } = useT();

  useEffect(() => {
    let active = true;
    getLocalDiagnosis(localId).then((record) => {
      if (!active) return;
      setLocation(record?.latitude != null && record.longitude != null ? { latitude: record.latitude, longitude: record.longitude } : null);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [localId]);

  const run = async (action: () => Promise<Coordinates | null>) => {
    setBusy(true); setError('');
    try { setLocation(await action()); onChanged?.(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The location could not be updated. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  return <View style={styles.box}>
    {location ? <>
      <Text style={styles.title}>{t('location.added')}</Text>
      <Text style={styles.text}>{t('location.near', { lat: location.latitude.toFixed(3), lng: location.longitude.toFixed(3) })}</Text>
      <View style={styles.actions}>
        <ActionButton variant="ghost" icon="map-outline" onPress={() => { void Linking.openURL(mapUrl(location)); }}>{t('location.viewMap')}</ActionButton>
        <ActionButton variant="ghost" icon="close-circle-outline" disabled={busy} onPress={() => { void run(async () => { await removeScanLocation(localId); return null; }); }}>{busy ? t('location.removing') : t('location.remove')}</ActionButton>
      </View>
    </> : <>
      <Text style={styles.text}>{t('location.explain')}</Text>
      <ActionButton variant="secondary" icon="location-outline" disabled={busy} onPress={() => { void run(() => attachCurrentLocation(localId)); }}>{busy ? t('location.getting') : t('location.add')}</ActionButton>
    </>}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  title: { color: palette.ink, fontSize: 14, fontWeight: '800' },
  text: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: palette.danger, fontSize: 13 },
});
