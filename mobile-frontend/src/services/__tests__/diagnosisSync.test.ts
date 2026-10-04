jest.mock('../api', () => ({
  api: jest.fn(),
  currentServerUrl: jest.fn(() => 'https://api.dahonmd.test/api'),
  resolveServerUrl: jest.fn((value) => value),
}));

jest.mock('../diagnosisReview', () => ({
  uploadSyncedScanImage: jest.fn(),
}));

jest.mock('../../storage/localDiagnoses', () => ({
  applyRemoteDeletion: jest.fn(),
  completeLocalDeletion: jest.fn(),
  getPendingDeletions: jest.fn(),
  getPendingDiagnoses: jest.fn(),
  getSyncCursor: jest.fn(),
  markBatchFailed: jest.fn(),
  markDeletionFailed: jest.fn(),
  markDiagnosesSyncing: jest.fn(),
  markDiagnosisFailed: jest.fn(),
  markDiagnosisSynced: jest.fn(),
  restoreRefusedDeletion: jest.fn(),
  saveRemoteImageUrl: jest.fn(),
  serverDiagnosisIdsMissingPhoto: jest.fn(),
  setSyncCursor: jest.fn(),
  syncedDiagnosesWithLocalPhoto: jest.fn(),
  upsertRemoteDiagnosis: jest.fn(),
}));

import { api } from '../api';
import { synchronizeDiagnoses, uploadUnsentPhotos } from '../diagnosisSync';
import { uploadSyncedScanImage } from '../diagnosisReview';
import {
  applyRemoteDeletion,
  completeLocalDeletion,
  getPendingDeletions,
  getPendingDiagnoses,
  getSyncCursor,
  markDeletionFailed,
  markDiagnosesSyncing,
  markDiagnosisFailed,
  markDiagnosisSynced,
  restoreRefusedDeletion,
  saveRemoteImageUrl,
  serverDiagnosisIdsMissingPhoto,
  setSyncCursor,
  syncedDiagnosesWithLocalPhoto,
  upsertRemoteDiagnosis,
} from '../../storage/localDiagnoses';

const mockedApi = api as jest.MockedFunction<typeof api>;
const mockedPending = getPendingDiagnoses as jest.MockedFunction<typeof getPendingDiagnoses>;
const mockedDeletions = getPendingDeletions as jest.MockedFunction<typeof getPendingDeletions>;
const mockedCursor = getSyncCursor as jest.MockedFunction<typeof getSyncCursor>;

beforeEach(() => {
  jest.clearAllMocks();
  mockedPending.mockResolvedValue([]);
  mockedDeletions.mockResolvedValue([]);
  mockedCursor.mockResolvedValue(null);
  (serverDiagnosisIdsMissingPhoto as jest.Mock).mockResolvedValue([]);
  (syncedDiagnosesWithLocalPhoto as jest.Mock).mockResolvedValue([]);
});

test('uploads the device photo of an earlier synced scan that the server is missing', async () => {
  const withoutServerPhoto = { local_id: 'old-1', server_id: 61, sync_uuid: 'a3b0c1d2-1111-4a57-9d59-2a1d7f0b6c11', image_uri: 'file:///old-1.jpg' };
  const withServerPhoto = { local_id: 'old-2', server_id: 62, sync_uuid: 'a3b0c1d2-2222-4a57-9d59-2a1d7f0b6c11', image_uri: 'file:///old-2.jpg' };
  (syncedDiagnosesWithLocalPhoto as jest.Mock).mockResolvedValue([withoutServerPhoto, withServerPhoto]);
  mockedApi.mockImplementation(async (path) => path.startsWith('/diagnoses?')
    ? { success: true, message: '', data: { items: [{ id: 61, image_url: null }, { id: 62, image_url: '/api/diagnosis-media/62/image' }], pagination: { last_page: 1 } } } as never
    : { success: true, message: '', data: { changes: [], next_cursor: null, has_more: false } } as never);

  await synchronizeDiagnoses(85);

  expect(uploadSyncedScanImage).toHaveBeenCalledTimes(1);
  expect(uploadSyncedScanImage).toHaveBeenCalledWith(withoutServerPhoto);
});

test('recovers previously hidden photos from the farmer account without changing scan ownership', async () => {
  (serverDiagnosisIdsMissingPhoto as jest.Mock).mockResolvedValue([84]);
  mockedApi.mockImplementation(async (path) => path.startsWith('/diagnoses?')
    ? { success: true, message: '', data: { items: [{ id: 84, image_url: '/api/diagnosis-media/84/image' }], pagination: { last_page: 1 } } } as never
    : { success: true, message: '', data: { changes: [], next_cursor: null, has_more: false } } as never);

  await synchronizeDiagnoses(84);

  expect(saveRemoteImageUrl).toHaveBeenCalledWith(84, 84, '/api/diagnosis-media/84/image');
});

test('pushes UUID-only deletions and applies an incremental pull page', async () => {
  mockedPending.mockResolvedValue([{
    local_id: 'local-upload', sync_uuid: '62e92d82-9204-483f-ad75-68eb2c40c537',
    predicted_class: 'healthy', confidence: 91, model_version: 'student-int8',
    inference_time_ms: 22, farmer_notes: null, diagnosed_at: '2026-09-03T00:00:00Z',
    research_consent: 0,
  }] as never);
  mockedDeletions.mockResolvedValue([{
    local_id: 'local-delete', server_id: null,
    sync_uuid: '9715b43d-ab20-453c-adbb-cfa6ad3029ca',
  }] as never);
  mockedApi.mockImplementation(async (path, options) => {
    if (options?.method === 'POST') {
      return { success: true, message: '', data: {
        results: [{ sync_uuid: '62e92d82-9204-483f-ad75-68eb2c40c537', status: 'created', diagnosis_id: 31 }],
        deletion_results: [{ server_id: 19, sync_uuid: '9715b43d-ab20-453c-adbb-cfa6ad3029ca', status: 'deleted' }],
      } } as never;
    }
    expect(path).toBe('/sync?limit=100');
    return { success: true, message: '', data: {
      changes: [
        { type: 'upsert', diagnosis: { id: 31, predicted_class: 'healthy', confidence: 91, diagnosed_at: '2026-09-03T00:00:00Z' } },
        { type: 'delete', server_id: 19, sync_uuid: '9715b43d-ab20-453c-adbb-cfa6ad3029ca' },
      ],
      next_cursor: 'cursor-page-1',
      has_more: false,
    } } as never;
  });

  await expect(synchronizeDiagnoses(7)).resolves.toEqual({ pushed: 1, rejected: 0, pulled: 2, deleted: 1 });
  expect(markDiagnosesSyncing).toHaveBeenCalledWith(['local-upload']);
  expect(markDiagnosisSynced).toHaveBeenCalledWith('62e92d82-9204-483f-ad75-68eb2c40c537', 31);
  expect(completeLocalDeletion).toHaveBeenCalledWith(19, '9715b43d-ab20-453c-adbb-cfa6ad3029ca');
  expect(upsertRemoteDiagnosis).toHaveBeenCalledWith(expect.objectContaining({ id: 31 }), 7);
  expect(applyRemoteDeletion).toHaveBeenCalledWith(19, '9715b43d-ab20-453c-adbb-cfa6ad3029ca');
  expect(setSyncCursor).toHaveBeenCalledWith(7, 'cursor-page-1');

  const postBody = JSON.parse(String(mockedApi.mock.calls[0][1]?.body));
  expect(postBody.deletions).toEqual([{ server_id: null, sync_uuid: '9715b43d-ab20-453c-adbb-cfa6ad3029ca' }]);
});

test('keeps a scan whose deletion the server refused instead of retrying it', async () => {
  mockedDeletions.mockResolvedValue([{ local_id: 'local-approved', server_id: 44, sync_uuid: null }] as never);
  mockedApi.mockImplementation(async (_path, options) => {
    if (options?.method === 'POST') {
      return { success: true, message: '', data: {
        results: [],
        deletion_results: [{ server_id: 44, sync_uuid: null, status: 'rejected', errors: { server_id: ['This image is already part of an approved research dataset.'] } }],
      } } as never;
    }
    return { success: true, message: '', data: { changes: [], next_cursor: null, has_more: false } } as never;
  });

  await expect(synchronizeDiagnoses(9)).resolves.toEqual({ pushed: 0, rejected: 1, pulled: 0, deleted: 0 });
  expect(restoreRefusedDeletion).toHaveBeenCalledWith('local-approved', 'This image is already part of an approved research dataset.');
  expect(markDeletionFailed).not.toHaveBeenCalled();
  expect(completeLocalDeletion).not.toHaveBeenCalled();
});

test('uploads the photo of every synced scan and retries when the upload fails', async () => {
  const consented = {
    local_id: 'local-consent', sync_uuid: '0c6f7a8e-3f5b-4a57-9d59-2a1d7f0b6c11',
    predicted_class: 'sigatoka', confidence: 88, model_version: 'student-int8',
    inference_time_ms: 30, farmer_notes: null, diagnosed_at: '2026-10-01T00:00:00Z',
    research_consent: 0, image_uri: 'file:///scan.jpg',
  };
  mockedPending.mockResolvedValue([consented] as never);
  mockedApi.mockImplementation(async (_path, options) => options?.method === 'POST'
    ? { success: true, message: '', data: { results: [{ sync_uuid: consented.sync_uuid, status: 'created', diagnosis_id: 50 }], deletion_results: [] } } as never
    : { success: true, message: '', data: { changes: [], next_cursor: null, has_more: false } } as never);

  await expect(synchronizeDiagnoses(10)).resolves.toMatchObject({ pushed: 1, rejected: 0 });
  expect(uploadSyncedScanImage).toHaveBeenCalledWith(consented);
  expect(markDiagnosisSynced).toHaveBeenCalledWith(consented.sync_uuid, 50);

  jest.clearAllMocks();
  mockedDeletions.mockResolvedValue([]);
  mockedCursor.mockResolvedValue(null);
  (uploadSyncedScanImage as jest.Mock).mockRejectedValueOnce(new Error('Network down'));
  await expect(synchronizeDiagnoses(10)).resolves.toMatchObject({ pushed: 0, rejected: 1 });
  expect(markDiagnosisFailed).toHaveBeenCalledWith(consented.sync_uuid, 'The scan photo could not be uploaded: Network down');
  expect(markDiagnosisSynced).not.toHaveBeenCalled();
});

test('rejects a stalled server cursor instead of looping forever', async () => {
  mockedCursor.mockResolvedValue('same-cursor');
  mockedApi.mockResolvedValue({ success: true, message: '', data: {
    changes: [], next_cursor: 'same-cursor', has_more: true,
  } } as never);

  await expect(synchronizeDiagnoses(8)).rejects.toThrow('stalled synchronization cursor');
});

describe('uploading photos before sign-out', () => {
  const photo = (serverId: number) => ({ local_id: `old-${serverId}`, server_id: serverId, sync_uuid: `uuid-${serverId}`, image_uri: `file:///old-${serverId}.jpg` });
  const listing = (items: Array<{ id: number; image_url: string | null }>) => mockedApi.mockImplementation(async (path) => (path.startsWith('/diagnoses?')
    ? { success: true, message: '', data: { items, pagination: { last_page: 1 } } }
    : { success: true, message: '', data: { changes: [], next_cursor: null, has_more: false } }) as never);

  test('reports nothing unsaved when every photo is already on the server', async () => {
    (syncedDiagnosesWithLocalPhoto as jest.Mock).mockResolvedValue([]);
    await expect(uploadUnsentPhotos(40)).resolves.toBe(0);
    expect(mockedApi).not.toHaveBeenCalled();
  });

  test('sends photos even when this session already checked, and counts the ones that failed', async () => {
    (syncedDiagnosesWithLocalPhoto as jest.Mock).mockResolvedValue([photo(1), photo(2)]);
    listing([{ id: 1, image_url: null }, { id: 2, image_url: null }]);
    (uploadSyncedScanImage as jest.Mock).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));

    await expect(uploadUnsentPhotos(41)).resolves.toBe(1);
    expect(uploadSyncedScanImage).toHaveBeenCalledTimes(2);

    // A second attempt in the same session tries again instead of skipping.
    (uploadSyncedScanImage as jest.Mock).mockResolvedValue(undefined);
    await expect(uploadUnsentPhotos(41)).resolves.toBe(0);
    expect(uploadSyncedScanImage).toHaveBeenCalledTimes(4);
  });

  test('treats every local photo as unsaved when the server cannot be reached', async () => {
    (syncedDiagnosesWithLocalPhoto as jest.Mock).mockResolvedValue([photo(3), photo(4)]);
    mockedApi.mockRejectedValue(new Error('offline'));
    await expect(uploadUnsentPhotos(42)).resolves.toBe(2);
  });
});
