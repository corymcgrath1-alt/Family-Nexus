import { API_BASE } from './api-base';
type AuthUser = import('./auth').AuthUser;

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error ?? 'Request failed'), { status: res.status });
  }
  if (res.status === 204) return null;
  return res.json();
}

export const apiLogin = (email: string, password: string): Promise<AuthUser> =>
  apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

export const apiRegister = (data: {
  householdName: string;
  displayName: string;
  email: string;
  password: string;
}): Promise<AuthUser> =>
  apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) });

export const apiLogout = (): Promise<null> =>
  apiFetch('/auth/logout', { method: 'POST' });

export const apiGetInvite = (token: string): Promise<{
  householdName: string;
  inviterName: string;
  email: string;
}> => apiFetch(`/auth/invite/${token}`);

export const apiJoin = (
  token: string,
  data: { displayName: string; email: string; password: string }
): Promise<AuthUser> =>
  apiFetch(`/auth/join/${token}`, { method: 'POST', body: JSON.stringify(data) });

export const apiSendMessage = (body: string, messageType: string): Promise<unknown> =>
  apiFetch('/messages', { method: 'POST', body: JSON.stringify({ body, messageType }) });

export const apiGetUnreadCounts = (): Promise<{
  messages: number;
  invitations: number;
  notifications: number;
}> => apiFetch('/notifications/unread-count');
