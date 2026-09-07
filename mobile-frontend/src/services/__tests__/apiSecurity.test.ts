jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;

describe('mobile API security boundaries', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_API_URL = 'https://api.dahonmd.example/api';
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
  });

  it('only resolves authenticated media on the configured API origin', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock;
    };
    secureStore.getItemAsync.mockImplementation((key: string, options?: object) => {
      if (!options) return Promise.resolve(null);
      if (key === 'dahonmd-mobile-token') return Promise.resolve('secret-token');
      return Promise.resolve(JSON.stringify({ id: 7, name: 'Field User', email: 'field@example.test', role: 'farmer' }));
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

  it('migrates legacy credentials into the device-only unlocked secure-store class', async () => {
    const secureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: jest.Mock;
      setItemAsync: jest.Mock;
      deleteItemAsync: jest.Mock;
    };
    secureStore.getItemAsync.mockImplementation((key: string, options?: object) => {
      if (options) return Promise.resolve(null);
      if (key === 'dahonmd-mobile-token') return Promise.resolve('legacy-token');
      return Promise.resolve(JSON.stringify({ id: 4, name: 'Legacy User', email: 'legacy@example.test', role: 'farmer' }));
    });
    const service = require('../api') as typeof import('../api');

    await expect(service.restoreSession()).resolves.toMatchObject({ id: 4, role: 'farmer' });
    expect(secureStore.setItemAsync).toHaveBeenCalledTimes(2);
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
