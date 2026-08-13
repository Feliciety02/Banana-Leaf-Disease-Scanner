import { getRetryDelayMs, isRetryableHttpStatus } from '../syncPolicy';

describe('sync retry policy', () => {
  it('backs off exponentially and caps retries at 30 seconds', () => {
    expect([1, 2, 3, 4, 5, 6].map(getRetryDelayMs)).toEqual([
      2_000, 4_000, 8_000, 16_000, 30_000, 30_000,
    ]);
  });

  it('retries transient HTTP failures only', () => {
    expect(isRetryableHttpStatus(408)).toBe(true);
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(401)).toBe(false);
    expect(isRetryableHttpStatus(422)).toBe(false);
  });
});
