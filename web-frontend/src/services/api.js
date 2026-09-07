const API_URL = import.meta.env.VITE_WEB_API_URL ?? '/api';
const SESSION_MARKER_KEY = 'dahonmd-web-session';
const API_TIMEOUT_MS = 15000;

// Remove credentials written by pre-cookie-session builds.
localStorage.removeItem('dahonmd-web-token');
sessionStorage.removeItem('dahonmd-web-token');

// This marker is not a credential. The real website session is an HttpOnly cookie.
export const getToken = () => localStorage.getItem(SESSION_MARKER_KEY);
export const setToken = (active) => {
  localStorage.removeItem('dahonmd-web-token');
  sessionStorage.removeItem('dahonmd-web-token');
  if (active) localStorage.setItem(SESSION_MARKER_KEY, 'active');
  else localStorage.removeItem(SESSION_MARKER_KEY);
};

export const AUTH_EXPIRED_EVENT = 'dahonmd:auth-expired';

export function notifyAuthExpired() {
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

const csrfUrl = () => `${new URL(API_URL, window.location.origin).origin}/sanctum/csrf-cookie`;
const csrfToken = () => document.cookie.split('; ')
  .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
  ?.split('=').slice(1).join('=');

async function ensureCsrfCookie() {
  if (csrfToken()) return;
  const response = await fetch(csrfUrl(), { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('The secure browser session could not be initialized.');
}

export async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...options.headers };
  const method = (options.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    await ensureCsrfCookie();
    const token = csrfToken();
    if (token) headers['X-XSRF-TOKEN'] = decodeURIComponent(token);
  }
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include', signal: options.signal ?? controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && getToken()) {
      setToken(null);
      notifyAuthExpired();
    }
    const error = new Error(payload?.message || 'The request could not be completed.');
    error.status = response.status; error.errors = payload?.errors || {};
    throw error;
  }
  return payload;
}

export async function authenticate(mode, fields, remember = true) {
  const payload = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ ...fields, device_name: 'web', remember }) });
  setToken(true);
  return payload.data.user;
}

export async function requestPasswordReset(email) {
  const payload = await api('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  return payload.message;
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' });
  setToken(null);
}
