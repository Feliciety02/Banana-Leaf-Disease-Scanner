jest.mock('../api', () => ({
  api: jest.fn(),
  resolveServerUrl: jest.fn((value) => value),
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
  setSyncCursor: jest.fn(),
  upsertRemoteDiagnosis: jest.fn(),
}));

import { api } from '../api';
import { synchronizeDiagnoses } from '../diagnosisSync';
import {
  applyRemoteDeletion,
  completeLocalDeletion,
  getPendingDeletions,
  getPendingDiagnoses,
  getSyncCursor,
  markDiagnosesSyncing,
  markDiagnosisSynced,
  setSyncCursor,
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

test('rejects a stalled server cursor instead of looping forever', async () => {
  mockedCursor.mockResolvedValue('same-cursor');
  mockedApi.mockResolvedValue({ success: true, message: '', data: {
    changes: [], next_cursor: 'same-cursor', has_more: true,
  } } as never);

  await expect(synchronizeDiagnoses(8)).rejects.toThrow('stalled synchronization cursor');
});
