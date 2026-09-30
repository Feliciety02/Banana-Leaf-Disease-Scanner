import { landingTab, navigationForRole, validTab } from '../navigation';

describe('role navigation transitions', () => {
  it('keeps farmer scans out of reviewer and administrator navigation', () => {
    for (const role of ['admin', 'agricultural_expert']) {
      const keys = navigationForRole(role).map((item) => item.key);
      expect(keys).toContain('account');
      expect(keys).not.toContain('scan');
      expect(keys).not.toContain('history');
      expect(validTab('scan', role)).toBe(landingTab(role));
    }
  });
  it('recovers from stale tabs on sign-out and role changes', () => {
    expect(validTab('requests', null)).toBe('home');
    expect(validTab('overview', 'farmer')).toBe('home');
    expect(validTab('requests', 'admin')).toBe('overview');
    expect(validTab('overview', 'agricultural_expert')).toBe('requests');
    expect(validTab('account', 'admin')).toBe('account');
  });
  it('gives reviewers the content-verification workspace', () => {
    expect(navigationForRole('agricultural_expert').map((item) => item.key)).toContain('content');
    expect(validTab('content', 'farmer')).toBe('home');
    expect(validTab('content', 'admin')).toBe('overview');
  });
  it('keeps all bars compact with unique destinations', () => {
    for (const role of [null, 'farmer', 'agricultural_expert', 'admin']) {
      const items = navigationForRole(role);
      expect(items.length).toBeLessThanOrEqual(5);
      expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    }
  });
});
