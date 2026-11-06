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

/** DEV only: the v3 backend isn't answering (route 404s, or the Vite proxy can't reach :8787). */
class NoBackend extends Error {}
const DEV = import.meta.env.DEV;

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw DEV ? new NoBackend() : e;
  }
  if (DEV && (r.status === 404 || (r.status >= 500 && !r.headers.get('content-type')?.includes('json')))) throw new NoBackend();
  if (r.status === 204) return undefined as T;
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, (data as { error?: string } | null)?.error ?? r.statusText);
  return data as T;
}

const real: AuthApi = {
  me: () => req<Me>('GET', '/api/auth/me').catch((e) => (e instanceof ApiError && e.status === 401 ? null : Promise.reject(e))),
  signup: (b) => req<{ user: User }>('POST', '/api/auth/signup', b).then((r) => r.user),
  login: (b) => req<{ user: User }>('POST', '/api/auth/login', b).then((r) => r.user),
  logout: () => req<void>('POST', '/api/auth/logout', {}), // the server's write guard requires a JSON body
  connect: () => req<ConnectCode>('POST', '/api/workspaces/connect', {}),
  connectStatus: () => req<ConnectStatus>('GET', '/api/workspaces/connect/status'),
  workspaces: () => req<Workspace[]>('GET', '/api/workspaces'),
};

/** True while the last call fell back to the dev mock (a small badge in the UI says so). */
export let isMock = false;

/**
 * Every call tries the real server first; the real answer always wins, so the mock switches itself
 * off the moment the backend comes up. Only in DEV, and only when the server isn't there, the
 * localStorage mock (./mock.ts) answers instead. Production never loads it.
 */
function via<K extends keyof AuthApi>(k: K): AuthApi[K] {
  return ((...args: unknown[]) =>
    (real[k] as (...a: unknown[]) => Promise<unknown>)(...args).then(
      (v) => { isMock = false; return v; },
      async (e) => {
        if (!(e instanceof NoBackend)) throw e;
        if (!isMock) console.warn('[auth] v3 backend not answering: using the DEV localStorage mock (web/src/auth/mock.ts)');
        isMock = true;
        const { mock } = await import('./mock');
        return (mock[k] as (...a: unknown[]) => Promise<unknown>)(...args);
      },
    )) as AuthApi[K];
}

export const api: AuthApi = {
  me: via('me'),
  signup: via('signup'),
  login: via('login'),
  logout: via('logout'),
  connect: via('connect'),
  connectStatus: via('connectStatus'),
  workspaces: via('workspaces'),
};
