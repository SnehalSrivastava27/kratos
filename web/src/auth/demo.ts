/// <reference types="vite/client" />
// The public demo account and the static (hosted, no server) build. Both live entirely in the browser:
// the demo credentials are checked here and never sent anywhere; the session is a localStorage flag.
import type { User, Workspace } from '@/shared/types';

export const DEMO_EMAIL = 'demo@kratos.app';
export const DEMO_PASSWORD = 'kratos-demo';

/** Built with VITE_STATIC=1 (the Vercel copy): there is no API behind this page, so never call it. */
export const STATIC = import.meta.env.VITE_STATIC === '1';

export const READ_ONLY = 'Demo account is read-only: run Kratos with your own Telegram group to do this';
export const HOSTED_NOTE = 'This hosted copy is a demo. Sign in with the demo account, or self-host Kratos to use your own team.';
/** Signup / real sign-in on the static build. */
export class HostedDemoError extends Error {
  constructor() { super(HOSTED_NOTE); }
}

export const DEMO_USER: User = { id: 'u_demo', email: DEMO_EMAIL, name: 'Demo Founder', createdAt: 0 };
export const DEMO_WS: Workspace = {
  id: 'demo', name: 'Kesar HQ', switchRoomId: 'demo', chatId: null, ownerId: DEMO_USER.id,
  topics: {}, status: 'ready', createdAt: 0,
};

export const isDemoLogin = (email: string, password: string) => email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;

const KEY = 'hq.demoAccount';
let mem = false; // storage can be blocked: the session still lasts this tab
export const demoSession = {
  get: () => {
    try { return localStorage.getItem(KEY) === '1' || mem; } catch { return mem; }
  },
  set: (on: boolean) => {
    mem = on;
    try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* blocked */ }
  },
};
