import { useCallback, useEffect, useRef, useState } from 'react';
import { markSynced } from '../services/database';
import { syncDiagnoses, SyncRequestError } from '../services/sync';
import { getRetryDelayMs } from '../services/syncPolicy';
import { Diagnosis, Session, SyncStatus } from '../types';

type Options = {
  online: boolean;
  pendingCount: number;
  records: Diagnosis[];
  refresh: () => Promise<void>;
  session: Session | null;
};

export function useDiagnosisSync({ online, pendingCount, records, refresh, session }: Options) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [retryDelayMs, setRetryDelayMs] = useState<number | null>(null);
  const [trigger, setTrigger] = useState(0);
  const syncing = useRef(false);
  const retryAttempt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetry = useCallback(() => {
    if (retryTimer.current !== null) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    setRetryDelayMs(null);
  }, []);

  const run = useCallback(async () => {
    const pendingRecords = records.filter((record) => !record.synced);
    if (!session || !online || syncing.current || !pendingRecords.length) return;

    clearRetry();
    syncing.current = true;
    setStatus('syncing');
    setError(null);

    try {
      const ids = await syncDiagnoses(pendingRecords, session.token);
      if (!ids.length) throw new SyncRequestError('The server did not accept the pending scans.', false);
      await markSynced(ids);
      retryAttempt.current = 0;
      setStatus('idle');
      await refresh();
    } catch (syncError) {
      setStatus('error');
      setError(syncError instanceof Error ? syncError.message : 'Synchronization failed.');
      const retryable = !(syncError instanceof SyncRequestError) || syncError.retryable;
      if (retryable) {
        retryAttempt.current += 1;
        const delay = getRetryDelayMs(retryAttempt.current);
        setRetryDelayMs(delay);
        retryTimer.current = setTimeout(() => {
          retryTimer.current = null;
          setTrigger((value) => value + 1);
        }, delay);
      } else {
        setRetryDelayMs(null);
      }
    } finally {
      syncing.current = false;
    }
  }, [clearRetry, online, records, refresh, session]);

  useEffect(() => { void run(); }, [run, trigger]);
  useEffect(() => () => { if (retryTimer.current !== null) clearTimeout(retryTimer.current); }, []);
  useEffect(() => { if (!online) { clearRetry(); setStatus('idle'); } }, [clearRetry, online]);

  const retry = useCallback(() => {
    if (!online) return;
    clearRetry();
    retryAttempt.current = 0;
    setStatus('syncing');
    setError(null);
    setTrigger((value) => value + 1);
  }, [clearRetry, online]);

  const reset = useCallback(() => {
    clearRetry();
    retryAttempt.current = 0;
    setStatus('idle');
    setError(null);
  }, [clearRetry]);

  return { error, pending: pendingCount, retry, retryDelayMs, reset, status };
}
