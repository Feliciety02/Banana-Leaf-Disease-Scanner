import * as SecureStore from 'expo-secure-store';
import { FileSystemSessionType, FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'farmer' | 'agricultural_expert' | string;
  email_verified_at?: string | null;
  avatar_url?: string | null;
};

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  errors?: Record<string, string[]>;
};

type ApiOptions = Omit<RequestInit, 'headers'> & { headers?: Record<string, string>; timeoutMs?: number };

const TOKEN_KEY = 'dahonmd-mobile-token';
const USER_KEY = 'dahonmd-mobile-user';
const SESSION_SERVER_KEY = 'dahonmd-mobile-session-server';
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'com.dahonmd.field.session',
};
const API_TIMEOUT_MS = 15_000;
const SERVER_URL_KEY = 'dahonmd-server-url';
const USB_TEST_API_URL = 'http://127.0.0.1:4174/api';
const buildUrl = normalizeServerUrl(process.env.EXPO_PUBLIC_API_URL);
const configuredPrivacyUrl = publicWebUrl(process.env.EXPO_PUBLIC_PRIVACY_URL);
const configuredAccountDeletionUrl = publicWebUrl(process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL);

// The API address baked into the build is the default; a server address saved
// on the device (Account → Server address) wins.
// Temporary HTTPS tunnels change address when restarted, so this avoids
// rebuilding the app just to reconnect.
let configuredUrl: string | null = buildUrl;
let serverUrlLoaded: Promise<void> | null = null;

let sessionToken: string | null = null;

let connectionUnavailable = false;
const connectionListeners = new Set<(unavailable: boolean) => void>();
function reportConnection(unavailable: boolean) {
  connectionUnavailable = unavailable;
  connectionListeners.forEach((listener) => listener(unavailable));
}
export function subscribeConnection(listener: (unavailable: boolean) => void) {
  connectionListeners.add(listener); listener(connectionUnavailable);
  return () => { connectionListeners.delete(listener); };
}
export async function checkConnection() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(apiUrl('/health'), { signal: controller.signal, headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok || data?.service !== 'dahonmd-api') throw new Error('Server unavailable');
    reportConnection(false);
  } catch {
    reportConnection(true);
    throw new ApiError('Server unavailable. Retry or update the connection. Offline scanning still works.');
  } finally { clearTimeout(timer); }
}

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
    throw new ApiError('Online features are not available in this version of the app.');
  }
  if (!isDevelopmentBuild() && !configuredUrl.startsWith('https://') && !isUsbTestApiUrl(configuredUrl)) {
    throw new ApiError('Connected features require an HTTPS API URL in production builds.');
  }
  return `${configuredUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function isDevelopmentBuild() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function isUsbTestApiUrl(value: string) {
  return process.env.EXPO_PUBLIC_TEST_USB_BRIDGE === 'true' && value === USB_TEST_API_URL;
}

/**
 * Accepts "https://host", "https://host/" or "https://host/api" and returns the
 * API base ("https://host/api"). Only HTTPS is allowed outside development.
 */
export function normalizeServerUrl(value?: string | null): string | null {
  // Pattern-based so it does not depend on React Native's partial URL support.
  const match = value?.trim().match(/^(https?):\/\/([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?)(\/[^?#\s]*)?$/i);
  if (!match) return null;
  const [, scheme, host, rawPath = ''] = match;
  if (scheme.toLowerCase() !== 'https' && !(isDevelopmentBuild() && scheme.toLowerCase() === 'http') &&
      !(process.env.EXPO_PUBLIC_TEST_USB_BRIDGE === 'true' && scheme.toLowerCase() === 'http' &&
        host === '127.0.0.1:4174' && (!rawPath || rawPath === '/' || rawPath === '/api'))) return null;
  const path = rawPath.replace(/\/+$/, '');
  return `${scheme.toLowerCase()}://${host.toLowerCase()}${path.endsWith('/api') ? path : `${path}/api`}`;
}

function originOf(apiBase: string) {
  return apiBase.replace(/^(https?:\/\/[^/]+).*$/i, '$1');
}

/** Loads a server address saved on this device (once). */
export function loadServerUrl(): Promise<void> {
  serverUrlLoaded ??= readSecureItem(SERVER_URL_KEY)
    .then((saved) => {
      const url = normalizeServerUrl(saved);
      if (url) configuredUrl = url;
    })
    .catch(() => undefined);
  return serverUrlLoaded;
}

export function currentServerUrl() {
  return configuredUrl;
}

export function defaultServerUrl() {
  return buildUrl;
}

/**
 * Checks that an address is a reachable DahonMD server, then saves it. Signing
 * in to a different server clears the current session, because its login token
 * belongs to the old server.
 */
export async function setServerUrl(value: string): Promise<string> {
  const url = normalizeServerUrl(value);
  if (!url) throw new ApiError('Enter a full HTTPS address, for example https://example.com');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/health`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    const payload = await response.json().catch(() => null) as { service?: string; status?: string } | null;
    if (!response.ok || payload?.service !== 'dahonmd-api') throw new ApiError('That address is not a DahonMD server.');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Could not reach that server. Check the address and your connection.');
  } finally {
    clearTimeout(timer);
  }
  const changedServer = configuredUrl !== url;
  if (changedServer) await clearSession();
  await writeSecureItem(SERVER_URL_KEY, url);
  configuredUrl = url;
  reportConnection(false);
  return url;
}

/** Forgets the saved address and returns to the one built into the app. */
export async function resetServerUrl() {
  const changedServer = configuredUrl !== buildUrl;
  if (changedServer) await clearSession();
  await deleteSecureItem(SERVER_URL_KEY);
  configuredUrl = buildUrl;
}

/** Reads the address from a dahonmd://server?url=https://… link, if valid. */
export function serverUrlFromLink(link: string | null): string | null {
  // Parsed by hand: React Native's URL implementation lacks searchParams.
  const match = link?.match(/^dahonmd:\/\/\/?server\/?\?(.*)$/i);
  if (!match) return null;
  for (const pair of match[1].split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key === 'url') {
      try {
        return normalizeServerUrl(decodeURIComponent(value));
      } catch {
        return null;
      }
    }
  }
  return null;
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
  const timeout = options.timeoutMs ?? API_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...options, headers, signal: options.signal ?? controller.signal });
  } catch (error) {
    reportConnection(true);
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

  reportConnection(response.status >= 500 || !payload);
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

/**
 * Uploads a local file as multipart form data from native code. React Native's
 * fetch with a file part fails on some Android devices before the request is
 * sent, so photos go through Expo's native uploader instead.
 */
export async function uploadFile<T>(path: string, fileUri: string, options: { fieldName: string; mimeType: string; parameters?: Record<string, string> }): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  let result: Awaited<ReturnType<typeof uploadAsync>>;
  try {
    result = await uploadAsync(apiUrl(path), fileUri, {
      httpMethod: 'POST',
      headers,
      sessionType: FileSystemSessionType.FOREGROUND,
      uploadType: FileSystemUploadType.MULTIPART,
      fieldName: options.fieldName,
      mimeType: options.mimeType,
      parameters: options.parameters,
    });
  } catch (error) {
    reportConnection(true);
    if (error instanceof ApiError) throw error;
    throw new ApiError('The photo could not be sent. Check your internet connection and try again.');
  }

  let payload: ApiEnvelope<T> | null = null;
  try { payload = JSON.parse(result.body) as ApiEnvelope<T>; } catch { payload = null; }
  reportConnection(result.status >= 500 || !payload);
  if (result.status < 200 || result.status >= 300) {
    const error = new ApiError(
      Object.values(payload?.errors || {}).flat()[0] || payload?.message || (result.status === 413 ? 'The photo is too large to send.' : 'The photo could not be sent.'),
      result.status,
      payload?.errors,
    );
    if (error.unauthorized && sessionToken) {
      await clearSession();
      onSessionExpired?.();
    }
    throw error;
  }
  if (!payload) throw new ApiError('The server returned an unreadable response.', result.status);
  return payload;
}

export async function restoreSession(): Promise<SessionUser | null> {
  await loadServerUrl();
  const [token, rawUser, sessionServer] = await Promise.all([
    readSecureItem(TOKEN_KEY),
    readSecureItem(USER_KEY),
    readSecureItem(SESSION_SERVER_KEY),
  ]);
  if (!token) return null;
  if (!rawUser || !configuredUrl || sessionServer !== configuredUrl) {
    await clearSession();
    return null;
  }
  sessionToken = token;
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
  if (!configuredUrl || !payload.data.token || !isSessionUser(payload.data.user)) {
    throw new ApiError('The server returned an incomplete login response.');
  }
  try {
    await Promise.all([
      writeSecureItem(TOKEN_KEY, payload.data.token),
      writeSecureItem(USER_KEY, JSON.stringify(payload.data.user)),
      writeSecureItem(SESSION_SERVER_KEY, configuredUrl),
    ]);
  } catch (error) {
    await clearSession();
    throw error;
  }
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

export async function resendVerificationEmail() {
  const payload = await api<Record<string, never>>('/auth/verification-notification', { method: 'POST' });
  return payload.message;
}

export async function logout() {
  try {
    if (sessionToken) await api('/auth/logout', { method: 'POST' });
  } finally {
    await clearSession();
  }
}

/** Updates name and email. Changing the email needs the current password and resets verification. */
export async function uploadAvatar(fileUri: string, mimeType: string): Promise<SessionUser> {
  const payload = await uploadFile<{ user: SessionUser }>('/profile/avatar', fileUri, { fieldName: 'avatar', mimeType });
  await writeSecureItem(USER_KEY, JSON.stringify(payload.data.user));
  return payload.data.user;
}

export async function removeAvatar(): Promise<SessionUser> {
  const payload = await api<{ user: SessionUser }>('/profile/avatar', { method: 'DELETE' });
  await writeSecureItem(USER_KEY, JSON.stringify(payload.data.user));
  return payload.data.user;
}

export async function updateProfile(fields: { name: string; email: string; currentPassword?: string }): Promise<SessionUser> {
  const payload = await api<{ user: SessionUser }>('/profile', {
    method: 'PUT',
    body: JSON.stringify({
      name: fields.name.trim(),
      email: fields.email.trim().toLowerCase(),
      ...(fields.currentPassword ? { current_password: fields.currentPassword } : {}),
    }),
  });
  await writeSecureItem(USER_KEY, JSON.stringify(payload.data.user));
  return payload.data.user;
}

/** Changes the password; the server keeps this device signed in and ends other sessions. */
export async function updatePassword(currentPassword: string, password: string, passwordConfirmation: string) {
  const payload = await api<Record<string, never>>('/profile/password', {
    method: 'PUT',
    body: JSON.stringify({ current_password: currentPassword, password, password_confirmation: passwordConfirmation }),
  });
  return payload.message;
}

export async function deleteAccount(currentPassword: string, removeResearchCopies = false) {
  await api('/profile', { method: 'DELETE', body: JSON.stringify({ current_password: currentPassword, remove_research_copies: removeResearchCopies }) });
  await clearSession();
}

export type ResearchPhoto = { id: number; source_diagnosis_id: number; verified_label: string; approved_at: string; revoked_at: string | null; file_removal_pending: boolean };

export async function listResearchPhotos() {
  return (await api<ResearchPhoto[]>('/research-images')).data;
}

export async function removeResearchPhoto(id: number) {
  return (await api<ResearchPhoto>(`/research-images/${id}`, { method: 'DELETE' })).data;
}

export async function clearSession() {
  sessionToken = null;
  await Promise.all([
    deleteSecureItem(TOKEN_KEY),
    deleteSecureItem(USER_KEY),
    deleteSecureItem(SESSION_SERVER_KEY),
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
  return Boolean(configuredUrl && (configuredUrl.startsWith('https://') || isDevelopmentBuild() || isUsbTestApiUrl(configuredUrl)));
}

function serverPageUrl(path: string) {
  return configuredUrl ? `${originOf(configuredUrl)}${path}` : null;
}

export function privacyPolicyUrl() {
  return configuredPrivacyUrl ?? serverPageUrl('/privacy');
}

export function accountDeletionUrl() {
  return configuredAccountDeletionUrl ?? serverPageUrl('/account-deletion');
}

export function resolveServerUrl(value?: string | null) {
  if (!value) return null;
  if (/^(?:file|content):\/\//i.test(value)) return value;
  if (!configuredUrl) return null;
  try {
    const apiOrigin = new URL(configuredUrl).origin;
    const url = new URL(value, apiOrigin);
    if (url.origin !== apiOrigin) return null;
    if (url.protocol !== 'https:' && !(isDevelopmentBuild() && url.protocol === 'http:') && !isUsbTestApiUrl(configuredUrl)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Downloads a private image (such as a profile photo) with the session token.
 * Rejects with the HTTP status when the server does not return an image.
 */
export async function fetchPrivateImage(value: string): Promise<Uint8Array> {
  const uri = resolveServerUrl(value);
  if (!uri || !/^https?:\/\//i.test(uri)) throw new ApiError('This photo address is not allowed.');
  const response = await fetch(uri, { headers: { Accept: 'image/*', ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) } });
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || !type.startsWith('image/')) {
    throw new ApiError(`The photo could not be loaded (HTTP ${response.status}).`, response.status);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export function authenticatedImageSource(value?: string | null) {
  const uri = resolveServerUrl(value);
  if (!uri) return undefined;
  const remote = /^https?:\/\//i.test(uri);
  return { uri, ...(remote && sessionToken ? { headers: { Authorization: `Bearer ${sessionToken}` } } : {}) };
}
