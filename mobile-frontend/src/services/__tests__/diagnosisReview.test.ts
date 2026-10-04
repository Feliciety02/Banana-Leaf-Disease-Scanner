jest.mock('../api', () => ({
  api: jest.fn(),
  uploadFile: jest.fn(),
}));

jest.mock('../../storage/localDiagnoses', () => ({
  isNewReview: (review: { review_status: string; farmer_seen_at?: string | null } | null) => Boolean(review && review.review_status !== 'pending' && !review.farmer_seen_at),
  getLocalDiagnosis: jest.fn(),
  parseDiagnosisReview: jest.fn(),
  replaceLocalDiagnosisImage: jest.fn(),
  saveDiagnosisReview: jest.fn(),
}));

import { api, uploadFile } from '../api';
import { markReviewSeen, requestAgriculturalReview, sendReviewFollowUp, uploadReviewImage } from '../diagnosisReview';
import {
  getLocalDiagnosis,
  parseDiagnosisReview,
  replaceLocalDiagnosisImage,
  saveDiagnosisReview,
} from '../../storage/localDiagnoses';

const mockedApi = api as jest.MockedFunction<typeof api>;
const mockedUpload = uploadFile as jest.MockedFunction<typeof uploadFile>;
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
    expect(path).toBe('/diagnoses/31/review-request');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({ farmer_notes: 'Wilt near the base' });
    return { success: true, message: '', data: { review: pendingReview } } as never;
  });
  mockedUpload.mockResolvedValue({ success: true, message: '', data: {} } as never);

  await expect(requestAgriculturalReview('local-1')).resolves.toEqual({ review: pendingReview, imageUploaded: true });
  expect(mockedSave).toHaveBeenCalledWith('local-1', pendingReview);
  expect(mockedUpload).toHaveBeenCalledWith('/sync/62e92d82-9204-483f-ad75-68eb2c40c537/image', 'file:///storage/diagnosis-images/local-1.jpg', { fieldName: 'image', mimeType: 'image/jpeg', parameters: { purpose: 'review' } });
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
  mockedApi.mockResolvedValue({ success: true, message: '', data: { review: pendingReview } } as never);
  mockedUpload.mockRejectedValue(new Error('upload exploded'));

  await expect(requestAgriculturalReview('local-1')).rejects.toThrow('could not be uploaded');
  expect(mockedSave).toHaveBeenCalledWith('local-1', pendingReview);
});

test('resends the scan image for a pending review only', async () => {
  mockedGet.mockResolvedValue(record());
  mockedParse.mockReturnValue(pendingReview as never);
  mockedUpload.mockResolvedValue({ success: true, message: '', data: {} } as never);

  await expect(uploadReviewImage('local-1')).resolves.toBeUndefined();
  expect(mockedUpload).toHaveBeenCalledWith('/sync/62e92d82-9204-483f-ad75-68eb2c40c537/image', 'file:///storage/diagnosis-images/local-1.jpg', expect.objectContaining({ fieldName: 'image', parameters: { purpose: 'review' } }));
});

test('refuses to resend an image when the review is no longer pending', async () => {
  mockedGet.mockResolvedValue(record());
  mockedParse.mockReturnValue({ ...pendingReview, review_status: 'confirmed' } as never);
  await expect(uploadReviewImage('local-1')).rejects.toThrow('pending review');
  expect(mockedApi).not.toHaveBeenCalled();
});

test('marks a new expert review as read locally first, then on the server', async () => {
  const completed = { ...pendingReview, review_status: 'confirmed', reviewed_at: '2026-09-11T04:00:00Z', farmer_seen_at: null };
  mockedGet.mockResolvedValue(record({ review_json: JSON.stringify(completed) }));
  mockedParse.mockReturnValue(completed as never);
  mockedApi.mockResolvedValue({ success: true, message: '', data: { review: { ...completed, farmer_seen_at: '2026-09-12T00:00:00Z' } } } as never);

  await markReviewSeen('local-1');

  expect(mockedSave).toHaveBeenNthCalledWith(1, 'local-1', expect.objectContaining({ farmer_seen_at: expect.any(String) }));
  expect(mockedApi).toHaveBeenCalledWith('/diagnoses/31/review-seen', { method: 'POST' });
  expect(mockedSave).toHaveBeenNthCalledWith(2, 'local-1', expect.objectContaining({ farmer_seen_at: '2026-09-12T00:00:00Z' }));
});

test('does not mark a pending or already-read review', async () => {
  mockedGet.mockResolvedValue(record());
  mockedParse.mockReturnValue(pendingReview as never);
  await markReviewSeen('local-1');
  mockedParse.mockReturnValue({ ...pendingReview, review_status: 'confirmed', farmer_seen_at: '2026-09-12T00:00:00Z' } as never);
  await markReviewSeen('local-1');

  expect(mockedApi).not.toHaveBeenCalled();
  expect(mockedSave).not.toHaveBeenCalled();
});

test('sends a text reply to reopen a completed review', async () => {
  const reopened = { ...pendingReview, farmer_reply: 'Spots spread to new leaves.' };
  mockedGet.mockResolvedValue(record());
  mockedApi.mockResolvedValue({ success: true, message: '', data: { review: reopened } } as never);

  await expect(sendReviewFollowUp('local-1', '  Spots spread to new leaves. ')).resolves.toEqual(reopened);

  expect(mockedApi).toHaveBeenCalledWith('/diagnoses/31/follow-up', { method: 'POST', body: JSON.stringify({ farmer_reply: 'Spots spread to new leaves.' }) });
  expect(mockedSave).toHaveBeenCalledWith('local-1', reopened);
  expect(replaceLocalDiagnosisImage).not.toHaveBeenCalled();
});

test('sends a new photo with the reply and keeps it on the device', async () => {
  mockedGet.mockResolvedValue(record());
  mockedUpload.mockResolvedValue({ success: true, message: '', data: { review: pendingReview } } as never);

  await sendReviewFollowUp('local-1', 'Clearer photo', 'file:///cache/retake.png');

  expect(mockedUpload).toHaveBeenCalledWith('/diagnoses/31/follow-up', 'file:///cache/retake.png', { fieldName: 'image', mimeType: 'image/png', parameters: { farmer_reply: 'Clearer photo' } });
  expect(replaceLocalDiagnosisImage).toHaveBeenCalledWith('local-1', 'file:///cache/retake.png');
});

test('refuses an empty reply or an unsynchronized scan', async () => {
  mockedGet.mockResolvedValue(record());
  await expect(sendReviewFollowUp('local-1', '   ')).rejects.toThrow('Write a short reply');
  mockedGet.mockResolvedValue(record({ server_id: null }));
  await expect(sendReviewFollowUp('local-1', 'Hello')).rejects.toThrow('must be synchronized');
  expect(mockedApi).not.toHaveBeenCalled();
});
