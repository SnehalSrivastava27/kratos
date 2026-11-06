// Typed client for /api/auth/* and /api/workspaces* (contracts/api.md "v3").
// In `vite dev` with no v3 backend yet (404, or the proxy can't reach :8787) it falls back to
// a localStorage mock (./mock.ts) so the flow is demoable. Production builds never use the mock.
import type { ConnectState, User, Workspace } from '@/shared/types';

export type Me = { user: User; workspaces: Workspace[] };
export type ConnectCode = { code: string; botUsername: string; expiresAt: number };
export type ConnectStatus = { state: ConnectState; workspace?: Workspace; detail?: string };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface AuthApi {
  me(): Promise<Me | null>;
  signup(b: { email: string; password: string; name: string }): Promise<User>;
  login(b: { email: string; password: string }): Promise<User>;
  logout(): Promise<void>;
  connect(): Promise<ConnectCode>;
  connectStatus(): Promise<ConnectStatus>;
  workspaces(): Promise<Workspace[]>;
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    credentials: 'include',
    headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 204) return undefined as T;
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, (data as { error?: string } | null)?.error ?? r.statusText);
  return data as T;
}

const real: AuthApi = {
  me: () => req<Me>('GET', '/api/auth/me').catch((e) => (e instanceof ApiError && e.status === 401 ? null : Promise.reject(e))),
  signup: (b) => req<{ user: User }>('POST', '/api/auth/signup', b).then((r) => r.user),
  login: (b) => req<{ user: User }>('POST', '/api/auth/login', b).then((r) => r.user),
  logout: () => req<void>('POST', '/api/auth/logout'),
  connect: () => req<ConnectCode>('POST', '/api/workspaces/connect'),
  connectStatus: () => req<ConnectStatus>('GET', '/api/workspaces/connect/status'),
  workspaces: () => req<Workspace[]>('GET', '/api/workspaces'),
};

/** True when we fell back to the dev mock (shown as a small badge in the UI). */
export let isMock = false;
let picked: Promise<AuthApi> | null = null;

/** Real backend unless DEV and /api/auth/me 404s or the dev proxy can't reach the server. */
function pick(): Promise<AuthApi> {
  if (!import.meta.env.DEV) return Promise.resolve(real);
  return (picked ??= fetch('/api/auth/me', { credentials: 'include' })
    .then((r) => r.status === 404 || (r.status >= 500 && !r.headers.get('content-type')?.includes('json')))
    .catch(() => true)
    .then(async (useMock) => {
      if (!useMock) return real;
      isMock = true;
      console.warn('[auth] v3 backend not found: using the DEV localStorage mock (web/src/auth/mock.ts)');
      return (await import('./mock')).mock;
    }));
}

export const api: AuthApi = {
  me: () => pick().then((a) => a.me()),
  signup: (b) => pick().then((a) => a.signup(b)),
  login: (b) => pick().then((a) => a.login(b)),
  logout: () => pick().then((a) => a.logout()),
  connect: () => pick().then((a) => a.connect()),
  connectStatus: () => pick().then((a) => a.connectStatus()),
  workspaces: () => pick().then((a) => a.workspaces()),
};
