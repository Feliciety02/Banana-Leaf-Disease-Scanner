import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { api, type SessionUser } from '../services/api';
import { countNewReviews, subscribeToLocalDiagnosisChanges } from '../storage/localDiagnoses';
import type { TabKey } from './navigation';

export type TabBadges = Partial<Record<TabKey, number>>;

/**
 * Counts shown on the tab bar so nobody has to check by hand: farmers see new
 * expert reviews on History, agriculturists see waiting farmer requests on Home.
 */
export function useTabBadges(user: SessionUser | null | undefined): TabBadges {
  const [badges, setBadges] = useState<TabBadges>({});

  useEffect(() => {
    setBadges({});
    if (user?.role !== 'farmer') return undefined;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let subscription: { remove: () => void } | null = null;
    const refresh = () => { countNewReviews(user.id).then((count) => { if (active) setBadges({ history: count }); }).catch(() => undefined); };
    refresh();
    subscribeToLocalDiagnosisChanges(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 300);
    }).then((value) => { if (active) subscription = value; else value.remove(); }).catch(() => undefined);
    return () => { active = false; if (timer) clearTimeout(timer); subscription?.remove(); };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (user?.role !== 'agricultural_expert') return undefined;
    let active = true;
    const refresh = () => {
      if (AppState.currentState !== 'active') return;
      api<{ farmer_review_requests: number }>('/expert/dashboard')
        .then((payload) => { if (active) setBadges({ home: payload.data.farmer_review_requests }); })
        .catch(() => undefined);
    };
    refresh();
    const timer = setInterval(refresh, 60000);
    const foreground = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { active = false; clearInterval(timer); foreground.remove(); };
  }, [user?.id, user?.role]);

  return badges;
}
