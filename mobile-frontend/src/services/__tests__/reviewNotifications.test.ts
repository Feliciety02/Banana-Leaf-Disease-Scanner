jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
}));

jest.mock('../../storage/localDiagnoses', () => {
  const state = new Map<string, string>();
  return {
    __state: state,
    deviceStateValue: jest.fn(async (key: string, value?: string) => {
      if (value !== undefined) { state.set(key, value); return value; }
      return state.get(key) ?? null;
    }),
    diagnosesWithNewReviews: jest.fn(),
    parseDiagnosisReview: (raw: string | null) => (raw ? JSON.parse(raw) : null),
  };
});

import * as Notifications from 'expo-notifications';

import { askToNotifyAboutReviews, notifyNewReviews } from '../reviewNotifications';
import { diagnosesWithNewReviews } from '../../storage/localDiagnoses';

const permissions = Notifications.getPermissionsAsync as jest.Mock;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const newReviews = diagnosesWithNewReviews as jest.Mock;

function scan(localId: string, reviewId: number, predictedClass = 'sigatoka') {
  return { local_id: localId, predicted_class: predictedClass, review_json: JSON.stringify({ id: reviewId, review_status: 'confirmed', reviewed_at: '2026-10-04T10:00:00Z' }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  (jest.requireMock('../../storage/localDiagnoses') as { __state: Map<string, string> }).__state.clear();
  permissions.mockResolvedValue({ granted: true, canAskAgain: true });
});

test('does nothing when the farmer has not allowed notifications', async () => {
  permissions.mockResolvedValue({ granted: false, canAskAgain: true });
  newReviews.mockResolvedValue([scan('a', 1)]);
  await expect(notifyNewReviews(7)).resolves.toBe(0);
  expect(schedule).not.toHaveBeenCalled();
});

test('announces a new expert answer once and opens that scan when tapped', async () => {
  newReviews.mockResolvedValue([scan('local-1', 11)]);

  await expect(notifyNewReviews(7)).resolves.toBe(1);
  expect(schedule).toHaveBeenCalledWith(expect.objectContaining({
    content: expect.objectContaining({ title: 'Expert answer ready', data: { localId: 'local-1' } }),
  }));
  expect(schedule.mock.calls[0][0].content.body).toContain('Black Sigatoka');

  // The same answer is never announced twice, even after the next sync.
  await expect(notifyNewReviews(7)).resolves.toBe(0);
  expect(schedule).toHaveBeenCalledTimes(1);
});

test('groups several new answers into one notification', async () => {
  newReviews.mockResolvedValue([scan('a', 21), scan('b', 22, 'healthy'), scan('c', 23)]);
  await expect(notifyNewReviews(8)).resolves.toBe(3);
  expect(schedule).toHaveBeenCalledTimes(1);
  expect(schedule.mock.calls[0][0].content.title).toBe('3 expert answers ready');
});

test('asks for permission only when it can still be asked', async () => {
  permissions.mockResolvedValue({ granted: false, canAskAgain: false });
  await expect(askToNotifyAboutReviews()).resolves.toBe(false);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();

  permissions.mockResolvedValue({ granted: false, canAskAgain: true });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  await expect(askToNotifyAboutReviews()).resolves.toBe(true);
});
