import * as Location from 'expo-location';

import { api } from './api';
import { getLocalDiagnosis, saveLocalLocation } from '../storage/localDiagnoses';

/** About 110 m: enough to see where a disease is spreading, without pinpointing a house. */
export function roundCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Attaches the phone's current location to one scan, only when the farmer asks.
 * A scan that has not synced yet carries it in its upload; a synced scan is
 * updated on the server straight away.
 */
export async function attachCurrentLocation(localId: string) {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Location permission was not given. You can still save and share the scan without it.');
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const location = { latitude: roundCoordinate(position.coords.latitude), longitude: roundCoordinate(position.coords.longitude) };
  const record = await getLocalDiagnosis(localId);
  if (record?.server_id && record.sync_status === 'synced') {
    await api(`/diagnoses/${record.server_id}/location`, { method: 'PUT', body: JSON.stringify(location) });
  }
  await saveLocalLocation(localId, location);
  return location;
}

export async function removeScanLocation(localId: string) {
  const record = await getLocalDiagnosis(localId);
  if (record?.server_id && record.sync_status === 'synced') {
    await api(`/diagnoses/${record.server_id}/location`, { method: 'DELETE' });
  }
  await saveLocalLocation(localId, null);
}
