const mockSecureItems = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: jest.fn(async (key: string) => mockSecureItems.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockSecureItems.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockSecureItems.delete(key); }),
}));

describe('mobile account session', () => {
  beforeEach(() => {
    mockSecureItems.clear();
    jest.resetModules();
  });

  it('never sends an existing account token to a newly selected server', async () => {
    const requests: Array<{ url: string; authorization?: string }> = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input);
      const authorization = (options?.headers as Record<string, string> | undefined)?.Authorization;
      requests.push({ url, authorization });
      const body = url.endsWith('/health')
        ? { service: 'dahonmd-api', status: 'ok' }
        : url.endsWith('/auth/login')
          ? { success: true, message: 'OK', data: { token: 'first-server-token', user: { id: 1, name: 'Farmer', email: 'farmer@example.test', role: 'farmer' } } }
          : { success: true, message: 'OK', data: { user: { id: 1, name: 'Farmer', email: 'farmer@example.test', role: 'farmer' } } };
      return { ok: true, status: 200, json: async () => body } as Response;
    }) as typeof fetch;

    const { api, login, setServerUrl } = require('../api') as typeof import('../api');
    await setServerUrl('https://first.example.test');
    await login('farmer@example.test', 'Secret123!');
    await setServerUrl('https://second.example.test');
    await api('/auth/me');

    expect(requests.at(-1)).toEqual({ url: 'https://second.example.test/api/auth/me', authorization: undefined });
    expect(mockSecureItems.has('dahonmd-mobile-token')).toBe(false);
  });
});


describe('connection recovery', () => {
  beforeEach(() => { mockSecureItems.clear(); jest.resetModules(); });
  it('reports an outage and clears it only after a valid DahonMD health response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ service: 'dahonmd-api' }) });
    global.fetch = fetchMock;
    const { setServerUrl, checkConnection, subscribeConnection } = require('../api') as typeof import('../api');
    await setServerUrl('https://recovery.example.test');
    const events: boolean[] = [];
    const remove = subscribeConnection((value) => events.push(value));
    fetchMock.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(checkConnection()).rejects.toThrow('Server unavailable');
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ service: 'another-service' }) });
    await expect(checkConnection()).rejects.toThrow('Server unavailable');
    await checkConnection();
    expect(events).toEqual([false, true, true, false]);
    expect(fetchMock.mock.calls.at(-1)[1].headers.Authorization).toBeUndefined();
    remove();
  });
});
