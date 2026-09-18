jest.mock('../api', () => ({
  api: jest.fn(),
}));

jest.mock('../../storage/localDiagnoses', () => ({
  getLocalDiagnosis: jest.fn(),
  parseDiagnosisReview: jest.fn(),
  saveDiagnosisReview: jest.fn(),
}));

import { api } from '../api';
import { requestAgriculturalReview, uploadReviewImage } from '../diagnosisReview';
import {
  getLocalDiagnosis,
  parseDiagnosisReview,
  saveDiagnosisReview,
} from '../../storage/localDiagnoses';

const mockedApi = api as jest.MockedFunction<typeof api>;
const mockedGet = getLocalDiagnosis as jest.MockedFunction<typeof getLocalDiagnosis>;
const mockedParse = parseDiagnosisReview as jest.MockedFunction<typeof parseDiagnosisReview>;
const mockedSave = saveDiagnosisReview as jest.MockedFunction<typeof saveDiagnosisReview>;

function record(overrides: Record<string, unknown> = {}) {
  return {
    local_id: 'local-1', sync_uuid: '62e92d82-9204-483f-ad75-68eb2c40c537', server_id: 31,
    owner_user_id: 7, predicted_class: 'healthy', confidence: 91, model_version: 'student-int8',
    inference_time_ms: 22, image_uri: 'file:///storage/diagnosis-images/local-1.jpg',
    farmer_notes: 'Wilt near the base', research_consent: 0, source: 'mobile',
    sync_status: 'synced', last_error: null, probabilities_json: null, baseline_json: null,
    enhanced_json: null, review_json: null, diagnosed_at: '2026-09-03T00:00:00Z',
    created_at: '2026-09-03T00:00:00Z', updated_at: '2026-09-03T00:00:00Z',
    ...overrides,
  } as never;
}

const pendingReview = {
  id: 55, review_status: 'pending', verified_label: null, image_quality: null,
  next_steps: [], requires_field_inspection: false, requested_at: '2026-09-10T04:00:00Z',
  reviewed_at: null, reviewer: null, farmer_follow_up: 'The review is pending.',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedParse.mockReturnValue(null);
});

test('requests a review, uploads the scan image, and saves the pending review locally', async () => {
  mockedGet.mockResolvedValue(record());
  mockedApi.mockImplementation(async (path, options) => {
    if (path.startsWith('/diagnoses/31/review-request')) {
      expect(options?.method).toBe('POST');
      expect(JSON.parse(String(options?.body))).toEqual({ farmer_notes: 'Wilt near the base' });
      return { success: true, message: '', data: { review: pendingReview } } as never;
    }
    expect(path).toBe('/sync/62e92d82-9204-483f-ad75-68eb2c40c537/image');
    expect(options?.method).toBe('POST');
    expect(options?.body).toBeInstanceOf(FormData);
    expect(options?.timeoutMs).toBe(60_000);
    return { success: true, message: '', data: {} } as never;
  });

  await expect(requestAgriculturalReview('local-1')).resolves.toEqual({ review: pendingReview, imageUploaded: true });
  expect(mockedSave).toHaveBeenCalledWith('local-1', pendingReview);
  expect(mockedApi).toHaveBeenCalledWith('/sync/62e92d82-9204-483f-ad75-68eb2c40c537/image', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
});

test('refuses a review request until the scan has synchronized', async () => {
  mockedGet.mockResolvedValue(record({ server_id: null, sync_status: 'local_only' }));
  await expect(requestAgriculturalReview('local-1')).rejects.toThrow('synchronized');
  expect(mockedApi).not.toHaveBeenCalled();
});

test('refuses a second review once the assessment is complete', async () => {
  mockedGet.mockResolvedValue(record());
  mockedParse.mockReturnValue({ ...pendingReview, review_status: 'confirmed' } as never);
  await expect(requestAgriculturalReview('local-1')).rejects.toThrow('already has an agricultural reviewer assessment');
  expect(mockedApi).not.toHaveBeenCalled();
});

test('keeps the pending review saved when the image upload fails and reports the error', async () => {
  mockedGet.mockResolvedValue(record());
  mockedApi.mockImplementation(async (path) => {
    if (path.startsWith('/diagnoses/31/review-request')) {
      return { success: true, message: '', data: { review: pendingReview } } as never;
    }
    throw new Error('upload exploded');
  });

  await expect(requestAgriculturalReview('local-1')).rejects.toThrow('could not be uploaded');
  expect(mockedSave).toHaveBeenCalledWith('local-1', pendingReview);
});

test('resends the scan image for a pending review only', async () => {
  mockedGet.mockResolvedValue(record());
  mockedParse.mockReturnValue(pendingReview as never);
  mockedApi.mockResolvedValue({ success: true, message: '', data: {} } as never);

  await expect(uploadReviewImage('local-1')).resolves.toBeUndefined();
  expect(mockedApi).toHaveBeenCalledWith('/sync/62e92d82-9204-483f-ad75-68eb2c40c537/image', expect.objectContaining({ method: 'POST', body: expect.any(FormData) }));
});

test('refuses to resend an image when the review is no longer pending', async () => {
  mockedGet.mockResolvedValue(record());
  mockedParse.mockReturnValue({ ...pendingReview, review_status: 'confirmed' } as never);
  await expect(uploadReviewImage('local-1')).rejects.toThrow('pending review');
  expect(mockedApi).not.toHaveBeenCalled();
});