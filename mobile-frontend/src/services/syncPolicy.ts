const INITIAL_RETRY_DELAY_MS = 2_000;
const MAX_RETRY_DELAY_MS = 30_000;

export function getRetryDelayMs(attempt: number): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * (2 ** (safeAttempt - 1)));
}

export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
