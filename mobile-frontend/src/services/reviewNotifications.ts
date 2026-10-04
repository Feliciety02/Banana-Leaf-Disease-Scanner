import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { getLanguage, translate } from '../i18n';
import { className } from '../i18n/content';
import { deviceStateValue, diagnosesWithNewReviews, parseDiagnosisReview } from '../storage/localDiagnoses';

const CHANNEL_ID = 'expert-reviews';
const MAX_REMEMBERED = 200;

// Show the notification even while the app is open. On Android a silent
// notification does not pop up, so the normal sound is kept.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: translate(getLanguage(), 'notify.channel'),
    importance: Notifications.AndroidImportance.HIGH,
  });
}

/**
 * Asks once, at the moment it makes sense (after the farmer asks an expert),
 * whether DahonMD may show a notification when the answer arrives.
 */
export async function askToNotifyAboutReviews() {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || !current.canAskAgain) return current.granted;
    await ensureChannel();
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * After a sync, shows a notification for each newly answered review exactly
 * once (several at once become one summary). Runs in the background task too.
 */
export async function notifyNewReviews(ownerUserId: number) {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return 0;
  const stateKey = `notified-reviews:${ownerUserId}`;
  const raw = await deviceStateValue(stateKey);
  const notified: string[] = raw ? JSON.parse(raw) as string[] : [];
  const fresh = (await diagnosesWithNewReviews(ownerUserId)).filter((record) => {
    const review = parseDiagnosisReview(record.review_json);
    return review && !notified.includes(`${review.id}:${review.reviewed_at}`);
  });
  if (!fresh.length) return 0;

  await ensureChannel();
  const language = getLanguage();
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(language, key, vars);
  const single = fresh.length === 1 ? fresh[0] : null;
  await Notifications.scheduleNotificationAsync({
    content: single
      ? { title: t('notify.reviewTitle'), body: t('notify.reviewBody', { name: className(single.predicted_class, language) }), data: { localId: single.local_id } }
      : { title: t('notify.manyTitle', { count: fresh.length }), body: t('notify.manyBody'), data: {} },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
  });

  for (const record of fresh) {
    const review = parseDiagnosisReview(record.review_json);
    if (review) notified.push(`${review.id}:${review.reviewed_at}`);
  }
  await deviceStateValue(stateKey, JSON.stringify(notified.slice(-MAX_REMEMBERED)));
  return fresh.length;
}
