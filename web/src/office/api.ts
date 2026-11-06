// Office actions (contracts/api.md "Office actions (v2)"). Each call falls back to local fake data when
// the endpoint isn't there yet (unknown route 404, or no server behind the dev proxy), so the office is
// demoable before the backend lands. Real errors (bad input, 401 off-loopback, rate limit) are thrown.
import type { Employee, Library, LibraryBook, Person, RoomId } from '../shared/types';
import exampleLib from '../../../data/library.example.json';
import { DESKS, deskById, freeDesks, roomZone, roster } from './data';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export interface Res<T> { data: T; status: number; mock: boolean }

/** Missing route or no server: use the mock. Anything else the server says is real. */
const missing = (status: number, body: unknown) =>
  status === 404 ? (body as { error?: string } | null)?.error === 'not found' || body === null : status >= 500 && body === null;

async function call<T>(path: string, init: RequestInit | undefined, mock: () => { data: T; status?: number }): Promise<Res<T>> {
  let status = 0, body: unknown = null;
  try {
    const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
    status = r.status;
    body = await r.json().catch(() => null);
  } catch {
    status = 0; // offline / no server
  }
  if (status === 0 || missing(status, body)) {
    const m = mock();
    return { data: m.data, status: m.status ?? 200, mock: true };
  }
  if (status >= 400) throw new ApiError(status, (body as { error?: string })?.error ?? `HTTP ${status}`);
  return { data: body as T, status, mock: false };
}

// ---- mock state (this tab only) ----
const mockHires: (Person & { desk: string; hiredAt: number })[] = [];
const mockLib: Library = { ...(exampleLib as Library), librarian: 'idle' };

export const getPeople = () => call<(Person & { desk?: string; hiredAt?: number })[]>('/api/people', undefined, () => ({ data: [...mockHires] })); // the static roster is already in; the mock adds hires

export const getLibrary = () => call<Library>('/api/library', undefined, () => ({ data: mockLib }));

export const getBook = (id: string) =>
  call<{ book: LibraryBook; markdown: string }>(`/api/library/book?id=${encodeURIComponent(id)}`, undefined, () => {
    const book = mockLib.shelves.flatMap((s) => s.books).find((b) => b.id === id);
    if (!book) throw new ApiError(404, 'book not found');
    const markdown = `---\nname: ${book.name}\ndescription: ${book.description}\n---\n\n# ${book.name}\n\n${book.description}\n\n## On this shelf because\n\n${book.why}\n\n## Source\n\n\`${book.source}\` (mock copy: the real SKILL.md loads once the server is up)\n`;
    return { data: { book, markdown } };
  });

export const categorize = () => call<{ ok: boolean; runId: string }>('/api/library/categorize', { method: 'POST' }, () => ({ data: { ok: true, runId: `mock-${Date.now()}` }, status: 202 }));

export const sendCommand = (room: RoomId, text: string) =>
  call<{ ok: boolean; via: string }>('/api/command', { method: 'POST', body: JSON.stringify({ room, text }) }, () => ({ data: { ok: true, via: 'mock' }, status: 202 }));

export interface HireBody { name: string; role: string; room: RoomId; emoji?: string; color?: string; instructions: string; skills?: string[] }
export type HireResult = Employee | { employee: Employee; action: { kind: 'open_url'; url: string; label: string } };

/** `desk`: where the founder pressed E (the mock seats them there; the server picks its own free desk). */
export const hire = (body: HireBody, desk?: string) =>
  call<HireResult>('/api/employees', { method: 'POST', body: JSON.stringify(body) }, () => {
    const free = freeDesks().filter((d) => !mockHires.some((h) => h.desk === d.id));
    const d = (desk && free.find((f) => f.id === desk)) || free.find((f) => f.zone === roomZone[body.room]) || free.find((f) => f.zone === 'open_desks') || free[0] || DESKS[0];
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'hire';
    const e: Employee = {
      id: `hire-${slug}-${mockHires.length + 1}`, name: body.name, role: body.role, room: body.room, emoji: body.emoji || '🙂', color: body.color || '#5bc0eb',
      desk: d.id, hiredAt: Date.now(), switchAgentId: null, status: 'active',
    };
    mockHires.push({ id: e.id, name: e.name, emoji: e.emoji, kind: 'agent', zone: deskById[d.id].zone, color: e.color, desk: d.id, hiredAt: e.hiredAt });
    // ?console in the URL: act out the "a human must finish this in Switch Console" path.
    if (new URLSearchParams(location.search).has('console'))
      return { data: { employee: { ...e, status: 'pending_console' }, action: { kind: 'open_url', url: 'http://localhost:3000/agents/new', label: 'Finish in Switch Console' } }, status: 202 };
    return { data: e, status: 201 };
  });
