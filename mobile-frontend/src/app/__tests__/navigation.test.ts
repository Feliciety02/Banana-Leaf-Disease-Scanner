import { landingTab, navigationForRole, validTab } from '../navigation';

describe('role navigation transitions', () => {
  it('starts guests on Scan without a Home tab', () => {
    expect(navigationForRole(null).map((item) => item.key)).toEqual(['scan', 'history', 'guide', 'account']);
    expect(landingTab(null)).toBe('scan');
    expect(validTab('home', null)).toBe('scan');
  });
  it('keeps farmer scans out of reviewer and administrator navigation', () => {
    for (const role of ['admin', 'agricultural_expert']) {
      const keys = navigationForRole(role).map((item) => item.key);
      expect(keys[0]).toBe('home');
      expect(keys).toContain('account');
      expect(keys).not.toContain('scan');
      expect(keys).not.toContain('history');
      expect(validTab('scan', role)).toBe(landingTab(role));
    }
  });
  it('recovers from stale tabs on sign-out and role changes', () => {
    expect(validTab('reviewed', null)).toBe('scan');
    expect(validTab('accounts', 'farmer')).toBe('home');
    expect(validTab('reviewed', 'admin')).toBe('home');
    expect(validTab('accounts', 'agricultural_expert')).toBe('home');
    expect(validTab('account', 'admin')).toBe('account');
  });
  it('gives signed-in roles their own home and workspaces', () => {
    expect(navigationForRole('farmer').map((item) => item.key)).toEqual(['home', 'scan', 'history', 'guide', 'account']);
    expect(navigationForRole('agricultural_expert').map((item) => item.key)).toEqual(['home', 'reviewed', 'content', 'guide', 'account']);
    expect(navigationForRole('admin').map((item) => item.key)).toEqual(['home', 'accounts', 'diagnoses', 'knowledge', 'account']);
    expect(validTab('content', 'farmer')).toBe('home');
    expect(validTab('content', 'admin')).toBe('home');
  });
  it('keeps all bars compact with unique destinations', () => {
    for (const role of [null, 'farmer', 'agricultural_expert', 'admin']) {
      const items = navigationForRole(role);
      expect(items.length).toBeLessThanOrEqual(5);
      expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
    }
  });
});
