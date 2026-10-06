jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
const originalUsbBridge = process.env.EXPO_PUBLIC_TEST_USB_BRIDGE;

describe('mobile API security boundaries', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_API_URL = 'https://api.dahonmd.example/api';
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
    process.env.EXPO_PUBLIC_TEST_USB_BRIDGE = originalUsbBridge;
  });

  it('limits the USB test bridge to the loopback API in a release build', () => {
    const originalDev = __DEV__;
    try {
      (global as typeof global & { __DEV__: boolean }).__DEV__ = false;
      process.env.EXPO_PUBLIC_TEST_USB_BRIDGE = 'true';
      const service = require('../api') as typeof import('../api');

      expect(service.normalizeServerUrl('http://127.0.0.1:4174')).toBe('http://127.0.0.1:4174/api');
      expect(service.normalizeServerUrl('http://127.0.0.1:4174/api')).toBe('http://127.0.0.1:4174/api');
      expect(service.normalizeServerUrl('http://example.com')).toBeNull();
      expect(service.normalizeServerUrl('http://127.0.0.1:8002')).toBeNull();
    } finally {
      (global as typeof global & { __DEV__: boolean }).__DEV__ = originalDev;
      process.env.EXPO_PUBLIC_TEST_USB_BRIDGE = originalUsbBridge;
    }
  });

  it('reads the current launcher QR as a server address without accepting other web pages', () => {
    const service = require('../api') as typeof import('../api');
    expect(service.serverUrlFromConnectionQr('https://fresh-link.trycloudflare.com/connect.html'))
      .toBe('https://fresh-link.trycloudflare.com/api');
    expect(service.serverUrlFromConnectionQr('dahonmd://server?url=https%3A%2F%2Ffresh-link.trycloudflare.com'))
      .toBe('https://fresh-link.trycloudflare.com/api');
    expect(service.serverUrlFromConnectionQr('https://unrelated.example/article')).toBeNull();
    expect(service.serverUrlFromConnectionQr('http://unrelated.example/connect.html')).toBeNull();
  });

  it('enables account sign-in for the configured USB test bridge in a release build', () => {
    const originalDev = __DEV__;
    try {
      (global as typeof global & { __DEV__: boolean }).__DEV__ = false;
      process.env.EXPO_PUBLIC_TEST_USB_BRIDGE = 'true';
      process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:4174/api';
      const service = require('../api') as typeof import('../api');

      expect(service.hasConnectedConfiguration()).toBe(true);
    } finally {
      (global as typeof global & { __DEV__: boolean }).__DEV__ = originalDev;
      process.env.EXPO_PUBLIC_TEST_USB_BRIDGE = originalUsbBridge;
    }
  });

  it('resolves private scan photos on the USB test server without allowing other HTTP origins', () => {
    const originalDev = __DEV__;
    try {
      (global as typeof global & { __DEV__: boolean }).__DEV__ = false;
      process.env.EXPO_PUBLIC_TEST_USB_BRIDGE = 'true';
      process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:4174/api';
      const service = require('../api') as typeof import('../api');

      expect(service.resolveServerUrl('/api/diagnosis-media/12/image'))
        .toBe('http://127.0.0.1:4174/api/diagnosis-media/12/image');
      expect(service.authenticatedImageSource('http://127.0.0.1:4174/api/diagnosis-media/12/image'))
        .toEqual({ uri: 'http://127.0.0.1:4174/api/diagnosis-media/12/image' });
      expect(service.resolveServerUrl('http://example.com/api/diagnosis-media/12/image')).toBeNull();
      expect(service.resolveServerUrl('http://127.0.0.1:8002/api/diagnosis-media/12/image')).toBeNull();
    } finally {
      (global as typeof global & { __DEV__: boolean }).__DEV__ = originalDev;
      process.env.EXPO_PUBLIC_TEST_USB_BRIDGE = originalUsbBridge;
    }
  });

  it('only resolves authenticated media on the configured API origin', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock;
    };
    secureStore.getItemAsync.mockImplementation((key: string, options?: object) => {
      if (!options) return Promise.resolve(null);
      if (key === 'dahonmd-mobile-token') return Promise.resolve('secret-token');
      if (key === 'dahonmd-mobile-session-server') return Promise.resolve('https://api.dahonmd.example/api');
      if (key === 'dahonmd-mobile-user') return Promise.resolve(JSON.stringify({ id: 7, name: 'Field User', email: 'field@example.test', role: 'farmer' }));
      return Promise.resolve(null);
    });
    const service = require('../api') as typeof import('../api');
    await service.restoreSession();

    expect(service.resolveServerUrl('/api/diagnosis-media/1/image')).toBe('https://api.dahonmd.example/api/diagnosis-media/1/image');
    expect(service.authenticatedImageSource('/api/diagnosis-media/1/image')).toEqual({
      uri: 'https://api.dahonmd.example/api/diagnosis-media/1/image',
      headers: { Authorization: 'Bearer secret-token' },
    });
    expect(service.authenticatedImageSource('https://attacker.example/collect')).toBeUndefined();
    expect(service.authenticatedImageSource('file:///private/leaf.jpg')).toEqual({ uri: 'file:///private/leaf.jpg' });
  });

  it('downloads private profile photos with the session token and rejects non-image replies', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock;
    };
    secureStore.getItemAsync.mockImplementation((key: string, options?: object) => {
      if (!options) return Promise.resolve(null);
      if (key === 'dahonmd-mobile-token') return Promise.resolve('secret-token');
      if (key === 'dahonmd-mobile-session-server') return Promise.resolve('https://api.dahonmd.example/api');
      if (key === 'dahonmd-mobile-user') return Promise.resolve(JSON.stringify({ id: 7, name: 'Field User', email: 'field@example.test', role: 'farmer' }));
      return Promise.resolve(null);
    });
    const service = require('../api') as typeof import('../api');
    await service.restoreSession();
    const originalFetch = global.fetch;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new Uint8Array([255, 216]).buffer })
      .mockResolvedValueOnce({ ok: false, status: 401, headers: { get: () => 'application/json' }, arrayBuffer: async () => new ArrayBuffer(0) });
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(service.fetchPrivateImage('/api/user-avatars/7?v=abc')).resolves.toEqual(new Uint8Array([255, 216]));
      expect(fetchMock).toHaveBeenCalledWith('https://api.dahonmd.example/api/user-avatars/7?v=abc', {
        headers: { Accept: 'image/*', Authorization: 'Bearer secret-token' },
      });
      await expect(service.fetchPrivateImage('/api/user-avatars/7?v=abc')).rejects.toThrow('HTTP 401');
      await expect(service.fetchPrivateImage('https://attacker.example/collect')).rejects.toThrow('not allowed');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('migrates legacy credentials into the device-only unlocked secure-store class', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock;
      setItemAsync: jest.Mock;
      deleteItemAsync: jest.Mock;
    };
    secureStore.getItemAsync.mockImplementation((key: string, options?: object) => {
      if (options) return Promise.resolve(null);
      if (key === 'dahonmd-mobile-token') return Promise.resolve('legacy-token');
      if (key === 'dahonmd-mobile-session-server') return Promise.resolve('https://api.dahonmd.example/api');
      if (key === 'dahonmd-mobile-user') return Promise.resolve(JSON.stringify({ id: 4, name: 'Legacy User', email: 'legacy@example.test', role: 'farmer' }));
      return Promise.resolve(null);
    });
    const service = require('../api') as typeof import('../api');

    await expect(service.restoreSession()).resolves.toMatchObject({ id: 4, role: 'farmer' });
    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(3);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'dahonmd-mobile-token',
      'legacy-token',
      expect.objectContaining({
        keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
        keychainService: 'com.dahonmd.field.session',
      }),
    );
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('dahonmd-mobile-token');
  });
});
