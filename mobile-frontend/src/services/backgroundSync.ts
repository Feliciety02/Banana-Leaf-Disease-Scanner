import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { ApiError, restoreSession, type SessionUser } from './api';
import { synchronizeDiagnoses } from './diagnosisSync';
import { deleteLocalAccountData } from '../storage/localDiagnoses';

const BACKGROUND_SYNC_TASK = 'dahonmd-diagnosis-sync';

if (!TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK)) {
  TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    let user: SessionUser | null = null;
    try {
      user = await restoreSession();
      if (user?.role === 'farmer') await synchronizeDiagnoses(user.id);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      if (user?.role === 'farmer' && error instanceof ApiError && error.unauthorized) {
        await deleteLocalAccountData(user.id).catch(() => undefined);
      }
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function configureBackgroundSync(enabled: boolean) {
  if (!await TaskManager.isAvailableAsync()) return false;
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);

  if (!enabled) {
    if (registered) await BackgroundTask.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
    return false;
  }

  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;
  if (!registered) {
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 60 });
  }
  return true;
}
