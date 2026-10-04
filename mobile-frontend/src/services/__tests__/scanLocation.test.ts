jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock('../api', () => ({ api: jest.fn() }));

jest.mock('../../storage/localDiagnoses', () => ({
  getLocalDiagnosis: jest.fn(),
  saveLocalLocation: jest.fn(),
}));

import * as Location from 'expo-location';

import { api } from '../api';
import { attachCurrentLocation, removeScanLocation, roundCoordinate } from '../scanLocation';
import { getLocalDiagnosis, saveLocalLocation } from '../../storage/localDiagnoses';

const permission = Location.requestForegroundPermissionsAsync as jest.Mock;
const position = Location.getCurrentPositionAsync as jest.Mock;
const mockedApi = api as jest.Mock;
const mockedGet = getLocalDiagnosis as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  permission.mockResolvedValue({ granted: true });
  position.mockResolvedValue({ coords: { latitude: 7.0731234, longitude: 125.6128765 } });
});

test('rounds coordinates to about 110 m', () => {
  expect(roundCoordinate(7.0731234)).toBe(7.073);
  expect(roundCoordinate(125.6128765)).toBe(125.613);
});

test('updates the server first for a synced scan, then keeps the rounded location on the device', async () => {
  mockedGet.mockResolvedValue({ local_id: 'local-1', server_id: 31, sync_status: 'synced' });

  await expect(attachCurrentLocation('local-1')).resolves.toEqual({ latitude: 7.073, longitude: 125.613 });

  expect(mockedApi).toHaveBeenCalledWith('/diagnoses/31/location', { method: 'PUT', body: JSON.stringify({ latitude: 7.073, longitude: 125.613 }) });
  expect(saveLocalLocation).toHaveBeenCalledWith('local-1', { latitude: 7.073, longitude: 125.613 });
  expect(mockedApi.mock.invocationCallOrder[0]).toBeLessThan((saveLocalLocation as jest.Mock).mock.invocationCallOrder[0]);
});

test('keeps the location for the first upload of a scan that has not synced yet', async () => {
  mockedGet.mockResolvedValue({ local_id: 'local-2', server_id: null, sync_status: 'pending' });

  await attachCurrentLocation('local-2');

  expect(mockedApi).not.toHaveBeenCalled();
  expect(saveLocalLocation).toHaveBeenCalledWith('local-2', { latitude: 7.073, longitude: 125.613 });
});

test('does not read the location without permission', async () => {
  permission.mockResolvedValue({ granted: false });

  await expect(attachCurrentLocation('local-1')).rejects.toThrow('Location permission was not given');
  expect(position).not.toHaveBeenCalled();
  expect(saveLocalLocation).not.toHaveBeenCalled();
});

test('removes the location from the server and the device', async () => {
  mockedGet.mockResolvedValue({ local_id: 'local-1', server_id: 31, sync_status: 'synced' });

  await removeScanLocation('local-1');

  expect(mockedApi).toHaveBeenCalledWith('/diagnoses/31/location', { method: 'DELETE' });
  expect(saveLocalLocation).toHaveBeenCalledWith('local-1', null);
});
