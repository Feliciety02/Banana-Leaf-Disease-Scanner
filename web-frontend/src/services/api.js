const API_URL = import.meta.env.VITE_WEB_API_URL ?? 'http://127.0.0.1:8001/api';
const TOKEN_KEY = 'dahonmd-web-token';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
export const setToken = (token, remember = true) => {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
};

export async function api(path, options = {}) {
  const headers = { Accept: 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || 'The request could not be completed.');
    error.status = response.status; error.errors = payload?.errors || {};
    throw error;
  }
  return payload;
}

export async function authenticate(mode, fields, remember = true) {
  const payload = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ ...fields, device_name: 'web' }) });
  setToken(payload.data.token, remember);
  return payload.data.user;
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } finally { setToken(null); }
}
