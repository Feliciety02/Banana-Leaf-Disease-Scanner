import * as SecureStore from 'expo-secure-store';
import { Session, User } from '../types';
import { API_URL } from './apiConfig';
import { fetchWithTimeout } from './http';

const SESSION_KEY = 'dahonmd.session';

async function request(path: string, options: RequestInit = {}, token?: string) {
  const response = await fetchWithTimeout(`${API_URL}${path}`, {
    ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message ?? 'The request could not be completed.') as Error & { errors?: Record<string, string[]> };
    error.errors = payload?.errors; throw error;
  }
  return payload;
}

async function persist(session: Session | null) {
  if (session) await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  else await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function restoreSession(): Promise<Session | null> {
  try {
    const value = await SecureStore.getItemAsync(SESSION_KEY);
    const stored = value ? JSON.parse(value) as Partial<Session> : null;
    const session = stored ? { ...stored, isPersistent: true } as Session : null;
    if (session && session.apiUrl !== API_URL) { await persist(null); return null; }
    return session;
  }
  catch { return null; }
}

export async function authenticate(mode: 'login' | 'register', fields: Record<string, string>, remember = true): Promise<Session> {
  const payload = await request(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(fields) });
  const session = { ...(payload.data as Omit<Session, 'apiUrl' | 'isPersistent'>), apiUrl: API_URL, isPersistent: remember }; if (remember) await persist(session); return session;
}

export async function updateProfile(session: Session, fields: Pick<User, 'name' | 'email'>): Promise<Session> {
  const payload = await request('/profile', { method: 'PUT', body: JSON.stringify(fields) }, session.token);
  const updated = { ...session, user: payload.data.user as User }; if (updated.isPersistent) await persist(updated); return updated;
}

export async function changePassword(session: Session, fields: Record<string, string>) {
  await request('/profile/password', { method: 'PUT', body: JSON.stringify(fields) }, session.token);
}

export async function logoutSession(session: Session) {
  try { await request('/auth/logout', { method: 'POST' }, session.token); } catch { /* Local logout remains available offline. */ }
  await persist(null);
}

export async function deleteAccount(session: Session) {
  await request('/profile', { method: 'DELETE' }, session.token); await persist(null);
}
