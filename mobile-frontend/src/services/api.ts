import * as SecureStore from 'expo-secure-store';

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'farmer' | 'agricultural_expert' | string;
};

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  errors?: Record<string, string[]>;
};

type ApiOptions = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

const TOKEN_KEY = 'dahonmd-mobile-token';
const USER_KEY = 'dahonmd-mobile-user';
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'com.dahonmd.field.session',
};
const API_TIMEOUT_MS = 15_000;
const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
const configuredPrivacyUrl = publicWebUrl(process.env.EXPO_PUBLIC_PRIVACY_URL);
const configuredAccountDeletionUrl = publicWebUrl(process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL);

let sessionToken: string | null = null;

let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

export class ApiError extends Error {
  status?: number;
  errors: Record<string, string[]>;
  unauthorized = false;

  constructor(message: string, status?: number, errors: Record<string, string[]> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.unauthorized = status === 401;
  }
}

function apiUrl(path: string) {
  if (!configuredUrl) {
    throw new ApiError('Connected features are not configured. Set EXPO_PUBLIC_API_URL to the Laravel API URL.');
  }
  if (!isDevelopmentBuild() && !configuredUrl.startsWith('https://')) {
    throw new ApiError('Connected features require an HTTPS API URL in production builds.');
  }
  return `${configuredUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function isDevelopmentBuild() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function publicWebUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol === 'https:' || (isDevelopmentBuild() && url.protocol === 'http:')) return url.toString();
  } catch {
    // Invalid configuration is exposed through the null getter below.
  }
  return null;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  if (options.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...options, headers, signal: options.signal ?? controller.signal });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('The server took too long to respond. Offline diagnosis is still available.');
    }
    throw new ApiError('The connected workspace is unavailable. Check your connection and API address; offline diagnosis still works.');
  } finally {
    clearTimeout(timer);
  }

  const payload = response.status === 204
    ? ({ success: true, message: '', data: undefined } as ApiEnvelope<T>)
    : await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok) {
    const error = new ApiError(
      Object.values(payload?.errors || {}).flat()[0] || payload?.message || 'The request could not be completed.',
      response.status,
      payload?.errors,
    );
    if (error.unauthorized && sessionToken) {
      await clearSession();
      onSessionExpired?.();
    }
    throw error;
  }
  if (!payload) throw new ApiError('The server returned an unreadable response.', response.status);
  return payload;
}

export async function restoreSession(): Promise<SessionUser | null> {
  const [token, rawUser] = await Promise.all([
    readSecureItem(TOKEN_KEY),
    readSecureItem(USER_KEY),
  ]);
  sessionToken = token;
  if (!token || !rawUser) return null;
  try {
    const user = JSON.parse(rawUser) as unknown;
    if (!isSessionUser(user)) throw new Error('Invalid saved identity.');
    return user;
  } catch {
    await clearSession();
    return null;
  }
}

export async function refreshSession(): Promise<SessionUser> {
  const payload = await api<{ user: SessionUser }>('/auth/me');
  await writeSecureItem(USER_KEY, JSON.stringify(payload.data.user));
  return payload.data.user;
}

async function authenticate(mode: 'login' | 'register', fields: Record<string, string>): Promise<SessionUser> {
  const payload = await api<{ token: string; user: SessionUser }>(`/auth/${mode}`, {
    method: 'POST',
    body: JSON.stringify({ ...fields, email: fields.email.trim().toLowerCase(), device_name: 'mobile', remember: true }),
  });
  await Promise.all([
    writeSecureItem(TOKEN_KEY, payload.data.token),
    writeSecureItem(USER_KEY, JSON.stringify(payload.data.user)),
  ]);
  sessionToken = payload.data.token;
  return payload.data.user;
}

export function login(email: string, password: string) {
  return authenticate('login', { email, password });
}

export function register(name: string, email: string, password: string, passwordConfirmation: string) {
  return authenticate('register', { name: name.trim(), email, password, password_confirmation: passwordConfirmation });
}

export async function requestPasswordReset(email: string) {
  const payload = await api<Record<string, never>>('/auth/forgot-password', {
    method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  return payload.message;
}

export async function logout() {
  try {
    if (sessionToken) await api('/auth/logout', { method: 'POST' });
  } finally {
    await clearSession();
  }
}

export async function deleteAccount(currentPassword: string) {
  await api('/profile', { method: 'DELETE', body: JSON.stringify({ current_password: currentPassword }) });
  await clearSession();
}

export async function clearSession() {
  sessionToken = null;
  await Promise.all([
    deleteSecureItem(TOKEN_KEY),
    deleteSecureItem(USER_KEY),
  ]);
}

async function readSecureItem(key: string) {
  const protectedValue = await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
  if (protectedValue !== null) return protectedValue;

  const legacyValue = await SecureStore.getItemAsync(key);
  if (legacyValue === null) return null;
  await SecureStore.setItemAsync(key, legacyValue, SECURE_STORE_OPTIONS);
  await SecureStore.deleteItemAsync(key);
  return legacyValue;
}

function writeSecureItem(key: string, value: string) {
  return SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
}

async function deleteSecureItem(key: string) {
  await Promise.all([
    SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(key),
  ]);
}

function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<SessionUser>;
  return Number.isInteger(user.id) && Number(user.id) > 0
    && typeof user.name === 'string' && user.name.length > 0
    && typeof user.email === 'string' && user.email.length > 0
    && typeof user.role === 'string' && user.role.length > 0;
}

export function hasConnectedConfiguration() {
  return Boolean(configuredUrl && (configuredUrl.startsWith('https://') || isDevelopmentBuild()));
}

export function privacyPolicyUrl() {
  return configuredPrivacyUrl;
}

export function accountDeletionUrl() {
  return configuredAccountDeletionUrl;
}

export function resolveServerUrl(value?: string | null) {
  if (!value) return null;
  if (/^(?:file|content):\/\//i.test(value)) return value;
  if (!configuredUrl) return null;
  try {
    const apiOrigin = new URL(configuredUrl).origin;
    const url = new URL(value, apiOrigin);
    if (url.origin !== apiOrigin) return null;
    if (url.protocol !== 'https:' && !(isDevelopmentBuild() && url.protocol === 'http:')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function authenticatedImageSource(value?: string | null) {
  const uri = resolveServerUrl(value);
  if (!uri) return undefined;
  const remote = /^https?:\/\//i.test(uri);
  return { uri, ...(remote && sessionToken ? { headers: { Authorization: `Bearer ${sessionToken}` } } : {}) };
}
