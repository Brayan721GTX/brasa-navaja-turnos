import type { AuthUser } from './types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/* ───────── Estado "el servidor se está despertando" (Render gratis se duerme a los 15 min) ───────── */

type WakeState = { waking: boolean };
const wakeListeners = new Set<(s: WakeState) => void>();
let wakeState: WakeState = { waking: false };
const setWake = (waking: boolean) => {
  if (wakeState.waking === waking) return;
  wakeState = { waking };
  wakeListeners.forEach((l) => l(wakeState));
};
export const subscribeWake = (l: (s: WakeState) => void) => {
  wakeListeners.add(l);
  return () => {
    wakeListeners.delete(l);
  };
};
export const getWake = () => wakeState;

let pending = 0;
let slowTimer: ReturnType<typeof setTimeout> | null = null;
const begin = () => {
  pending++;
  if (!slowTimer) slowTimer = setTimeout(() => pending > 0 && setWake(true), 3500);
};
const end = () => {
  pending = Math.max(0, pending - 1);
  if (pending === 0) {
    if (slowTimer) clearTimeout(slowTimer);
    slowTimer = null;
    setWake(false);
  }
};

/* ───────── Sesión ───────── */

const KEY = 'turnos.session';
export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export const loadSession = (): Session | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};
export const saveSession = (s: Session | null) => {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* modo privado: la sesión dura lo que dure la pestaña */
  }
  sessionListeners.forEach((l) => l(s));
};
const sessionListeners = new Set<(s: Session | null) => void>();
export const subscribeSession = (l: (s: Session | null) => void) => {
  sessionListeners.add(l);
  return () => {
    sessionListeners.delete(l);
  };
};

let refreshing: Promise<Session | null> | null = null;
async function refreshSession(): Promise<Session | null> {
  const current = loadSession();
  if (!current) return null;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) throw new Error('refresh');
      const data = await res.json();
      const next: Session = { accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user };
      saveSession(next);
      return next;
    } catch {
      saveSession(null);
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/* ───────── Requests ───────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function doFetch(path: string, init: RequestInit, token?: string): Promise<Response> {
  // Si el servidor está dormido, la conexión tarda o falla: reintentamos con paciencia
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await fetch(`${BASE}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
      });
    } catch (e) {
      lastError = e;
      setWake(true);
      await sleep(attempt < 2 ? 2500 : 6000);
    }
  }
  throw lastError;
}

async function request<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
  begin();
  try {
    let session = auth ? loadSession() : null;
    let res = await doFetch(path, init, session?.accessToken);
    if (auth && res.status === 401 && session) {
      session = await refreshSession();
      if (session) res = await doFetch(path, init, session.accessToken);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = data?.error;
      throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? 'Ocurrió un error inesperado', err?.details);
    }
    return data as T;
  } finally {
    end();
  }
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  get: <T>(path: string, auth = false) => request<T>(path, {}, auth),
  post: <T>(path: string, body?: unknown, auth = false) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : json(body) }, auth),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: json(body) }, true),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: json(body) }, true),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }, true),
  /** Para endpoints admin (con JWT) */
  admin: {
    get: <T>(path: string) => request<T>(`/admin${path}`, {}, true),
    post: <T>(path: string, body?: unknown) => request<T>(`/admin${path}`, { method: 'POST', body: body === undefined ? undefined : json(body) }, true),
    put: <T>(path: string, body: unknown) => request<T>(`/admin${path}`, { method: 'PUT', body: json(body) }, true),
    patch: <T>(path: string, body: unknown) => request<T>(`/admin${path}`, { method: 'PATCH', body: json(body) }, true),
    del: <T>(path: string) => request<T>(`/admin${path}`, { method: 'DELETE' }, true),
  },
};

export const apiBase = BASE;
