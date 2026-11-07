// DEV-ONLY MOCK of the v3 auth + workspace API, backed by localStorage. Loaded by ./api.ts only when
// import.meta.env.DEV and the real server isn't there. Passwords are stored in plain text: never ship this.
// The connect code "links itself": waiting for 6 s, linking for 4 s, then ready (a workspace appears).
import type { RoomId, User, Workspace } from '@/shared/types';
import { ApiError, type AuthApi } from './api';

type Db = {
  users: { user: User; password: string }[];
  session: string | null; // user id
  workspaces: Workspace[];
  pending: { code: string; ownerId: string; issuedAt: number; expiresAt: number } | null;
};
const KEY = 'hq.devmock.v1';
const ROOMS: RoomId[] = ['war_room', 'analytics', 'ads', 'creators', 'ops', 'design', 'finance'];
const WAIT_MS = 6000;
const LINK_MS = 4000;

const load = (): Db => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (d?.users) return d;
  } catch { /* fresh */ }
  return { users: [], session: null, workspaces: [], pending: null };
};
const save = (d: Db) => localStorage.setItem(KEY, JSON.stringify(d));
const later = <T>(v: () => T) => new Promise<T>((ok, no) => setTimeout(() => { try { ok(v()); } catch (e) { no(e); } }, 350));
const id = () => Math.random().toString(36).slice(2, 10);
const sessionUser = (d: Db) => {
  const u = d.users.find((x) => x.user.id === d.session)?.user;
  if (!u) throw new ApiError(401, 'Not signed in');
  return u;
};

export const mock: AuthApi = {
  me: () => later(() => {
    const d = load();
    const u = d.users.find((x) => x.user.id === d.session)?.user;
    return u ? { user: u, workspaces: d.workspaces.filter((w) => w.ownerId === u.id) } : null;
  }),
  signup: ({ email, password, name }) => later(() => {
    const d = load();
    email = email.trim().toLowerCase();
    if (password.length < 10) throw new ApiError(400, 'Password must be at least 10 characters');
    if (d.users.some((x) => x.user.email === email)) throw new ApiError(409, 'Email already registered');
    const user: User = { id: `u_${id()}`, email, name: name.trim(), createdAt: Date.now() };
    d.users.push({ user, password });
    d.session = user.id;
    save(d);
    return user;
  }),
  login: ({ email, password }) => later(() => {
    const d = load();
    const hit = d.users.find((x) => x.user.email === email.trim().toLowerCase() && x.password === password);
    if (!hit) throw new ApiError(401, 'Email or password is wrong');
    d.session = hit.user.id;
    save(d);
    return hit.user;
  }),
  logout: () => later(() => {
    const d = load();
    d.session = null;
    save(d);
  }),
  connect: () => later(() => {
    const d = load();
    const u = sessionUser(d);
    const now = Date.now();
    d.pending = { code: String(Math.floor(100000 + Math.random() * 900000)), ownerId: u.id, issuedAt: now, expiresAt: now + 15 * 60_000 };
    save(d);
    return { code: d.pending.code, botUsername: 'kratosd2c_bot', expiresAt: d.pending.expiresAt };
  }),
  recheck: () => mock.connectStatus(),
  connectStatus: () => later(() => {
    const d = load();
    const u = sessionUser(d);
    const p = d.pending;
    if (!p || p.ownerId !== u.id || Date.now() > p.expiresAt) return { state: 'expired' as const };
    const age = Date.now() - p.issuedAt;
    if (age < WAIT_MS) return { state: 'waiting' as const };
    if (age < WAIT_MS + LINK_MS) return { state: 'linking' as const, detail: 'Creating topics' };
    let ws = d.workspaces.find((w) => w.id === `ws_${p.code}`);
    if (!ws) {
      const n = d.workspaces.filter((w) => w.ownerId === u.id).length;
      ws = {
        id: `ws_${p.code}`,
        name: n ? `${u.name.split(' ')[0]}'s team ${n + 1}` : `${u.name.split(' ')[0]}'s team`,
        switchRoomId: `room_${id()}`,
        chatId: `-100${p.code}`,
        ownerId: u.id,
        topics: Object.fromEntries(ROOMS.map((r, i) => [r, { threadId: i + 2 }])),
        status: 'ready',
        createdAt: Date.now(),
      };
      d.workspaces.push(ws);
      save(d);
    }
    return { state: 'ready' as const, workspace: ws };
  }),
  workspaces: () => later(() => {
    const d = load();
    const u = sessionUser(d);
    return d.workspaces.filter((w) => w.ownerId === u.id);
  }),
};
