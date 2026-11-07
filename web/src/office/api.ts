// Office actions (contracts/api.md "Office actions (v2)", scoped per v3). Live: the signed-in user's
// workspace (`?ws=<id>`, the session cookie), a 401 calls onUnauthorized, errors are thrown, and nothing
// is ever faked. Demo (landing hero, explicit demo): no request leaves the page; local fake data answers.
import type { Employee, GalleryItem, Kpis, Library, LibraryBook, Person, RoomId } from '../shared/types';
import exampleLib from '../../../data/library.example.json';
import { DESKS, deskById, freeDesks, roomZone, roster } from './data';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export interface Res<T> { data: T; status: number; mock: boolean }

const scope: { live: boolean; ws?: string; onUnauthorized?: () => void } = { live: false };
/** Office calls this on every render: live + workspace, or demo. */
export function configureApi(live: boolean, ws?: string, onUnauthorized?: () => void) {
  Object.assign(scope, { live, ws, onUnauthorized });
}
/** Which data the calls answer for right now (demo, or a workspace): caches key on it. */
export const apiScope = () => (scope.live ? `ws:${scope.ws ?? ''}` : 'demo');

async function call<T>(path: string, init: RequestInit | undefined, mock: () => { data: T; status?: number }): Promise<Res<T>> {
  if (!scope.live) {
    const m = mock();
    return { data: m.data, status: m.status ?? 200, mock: true };
  }
  const url = scope.ws ? `${path}${path.includes('?') ? '&' : '?'}ws=${encodeURIComponent(scope.ws)}` : path;
  let status = 0, body: unknown = null;
  try {
    const r = await fetch(url, { ...init, credentials: 'include', headers: { 'content-type': 'application/json', ...init?.headers } });
    status = r.status;
    body = await r.json().catch(() => null);
  } catch {
    throw new ApiError(0, 'The office server is unreachable');
  }
  if (status === 401) scope.onUnauthorized?.();
  // Commands and hires wait for the workspace to be linked (Telegram group, topics, agents): say so plainly.
  if (status === 409 && /^\/api\/(command|employees)/.test(path)) throw new ApiError(409, 'Your Telegram group is still being set up');
  if (status >= 400) throw new ApiError(status, status === 404 && (body as { error?: string })?.error === 'not found' ? 'not available on this server yet' : (body as { error?: string })?.error ?? `HTTP ${status}`);
  return { data: body as T, status, mock: false };
}

// ---- mock state (this tab only) ----
const mockHires: (Person & { desk: string; hiredAt: number })[] = [];
const mockLib: Library = { ...(exampleLib as Library), librarian: 'idle' };
/** A fresh demo: no hires from a previous mount. */
export const resetMock = () => void mockHires.splice(0);

export const getPeople = () => call<(Person & { desk?: string; hiredAt?: number })[]>('/api/people', undefined, () => ({ data: [...mockHires] })); // the static roster is already in; the mock adds hires

/** The Design agent's banners (live only; the demo pins its own as the story plays). */
export const getGallery = () => call<GalleryItem[]>('/api/gallery', undefined, () => ({ data: [] }));

/** The demo brand's headline numbers (a snapshot of GET /api/kpis on data/*.csv), for /demo and whenever /api/kpis can't answer. */
export const MOCK_KPIS: Kpis = {"updated": null, "window": {"from": "2026-08-01", "to": "2026-10-31"}, "net_revenue": 10903903, "orders": 11129, "aov": 1089, "rto_pct": 8, "return_pct": 2.9, "meta_roas": 2.92, "blended_roas": 6.63, "ebitda_last_month": -411749, "by_channel": [{"channel": "Website", "orders": 5848, "net_revenue": 5724287, "rto_pct": 9.9}, {"channel": "Amazon", "orders": 1385, "net_revenue": 1294200, "rto_pct": 5.6}, {"channel": "Nykaa", "orders": 790, "net_revenue": 753901, "rto_pct": 4.2}, {"channel": "Flipkart", "orders": 620, "net_revenue": 576456, "rto_pct": 10.6}, {"channel": "Blinkit", "orders": 456, "net_revenue": 516393, "rto_pct": 1.3}, {"channel": "Zepto", "orders": 341, "net_revenue": 366678, "rto_pct": 3.5}, {"channel": "Instamart", "orders": 257, "net_revenue": 310360, "rto_pct": 1.2}, {"channel": "Purplle", "orders": 251, "net_revenue": 243676, "rto_pct": 6.8}, {"channel": "Myntra", "orders": 208, "net_revenue": 194761, "rto_pct": 6.7}, {"channel": "Meesho", "orders": 264, "net_revenue": 173373, "rto_pct": 23.5}, {"channel": "Health & Glow", "orders": 147, "net_revenue": 173032, "rto_pct": 0}, {"channel": "Apollo Pharmacy", "orders": 107, "net_revenue": 118080, "rto_pct": 0}, {"channel": "BB Now", "orders": 98, "net_revenue": 110253, "rto_pct": 2}, {"channel": "Tata CLiQ", "orders": 104, "net_revenue": 100265, "rto_pct": 1.9}, {"channel": "JioMart", "orders": 79, "net_revenue": 74101, "rto_pct": 12.7}, {"channel": "AJIO", "orders": 72, "net_revenue": 73777, "rto_pct": 4.2}, {"channel": "Flipkart Minutes", "orders": 63, "net_revenue": 61909, "rto_pct": 0}, {"channel": "Amazon Global", "orders": 39, "net_revenue": 38401, "rto_pct": 5.1}], "top_skus": [{"sku": "SKU02", "name": "Sunscreen SPF 50", "units": 6420, "net_revenue": 3377419}, {"sku": "SKU01", "name": "Vitamin C Serum", "units": 3627, "net_revenue": 2860422}, {"sku": "SKU03", "name": "Hydrating Moisturiser", "units": 2752, "net_revenue": 1814224}, {"sku": "SKU05", "name": "Glow Kit (bundle)", "units": 906, "net_revenue": 1594597}, {"sku": "SKU04", "name": "Kesar Face Oil", "units": 1097, "net_revenue": 1257241}]};
/** GET /api/kpis (public). Live but failing or empty: the sample numbers, flagged `mock`. */
export const getKpis = (): Promise<Res<Kpis>> =>
  call<Kpis>('/api/kpis', undefined, () => ({ data: MOCK_KPIS })).then(
    (r) => (r.data?.net_revenue == null ? { data: MOCK_KPIS, status: r.status, mock: true } : r),
    () => ({ data: MOCK_KPIS, status: 0, mock: true }),
  );

export const getLibrary = () => call<Library>('/api/library', undefined, () => ({ data: mockLib }));

export const getBook = (id: string) =>
  call<{ book: LibraryBook; markdown: string }>(`/api/library/book?id=${encodeURIComponent(id)}`, undefined, () => {
    const book = mockLib.shelves.flatMap((s) => s.books).find((b) => b.id === id);
    if (!book) throw new ApiError(404, 'book not found');
    const markdown = `---\nname: ${book.name}\ndescription: ${book.description}\n---\n\n# ${book.name}\n\n${book.description}\n\n## On this shelf because\n\n${book.why}\n\n## Source\n\n\`${book.source}\` (mock copy: the real SKILL.md loads once the server is up)\n`;
    return { data: { book, markdown } };
  });

export const categorize = () => call<{ ok: boolean; runId: string }>('/api/library/categorize', { method: 'POST', body: '{}' }, () => ({ data: { ok: true, runId: `mock-${Date.now()}` }, status: 202 }));

export const sendCommand = (room: RoomId, text: string) =>
  call<{ ok: boolean; via: string }>('/api/command', { method: 'POST', body: JSON.stringify({ room, text }) }, () => ({ data: { ok: true, via: 'mock' }, status: 202 }));

export interface HireBody { name: string; role: string; room: RoomId; emoji?: string; color?: string; instructions: string; skills?: string[]; reports_to?: string /* the department lead's id (B3) */ }
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
    mockHires.push({ id: e.id, name: e.name, emoji: e.emoji, kind: 'agent', zone: deskById[d.id].zone, color: e.color, desk: d.id, hiredAt: e.hiredAt, role: e.role, ...(body.reports_to ? { reports_to: body.reports_to } : {}) });
    // ?console in the URL: act out the "a human must finish this in Switch Console" path.
    if (new URLSearchParams(location.search).has('console'))
      return { data: { employee: { ...e, status: 'pending_console' }, action: { kind: 'open_url', url: 'http://localhost:3000/agents/new', label: 'Finish in Switch Console' } }, status: 202 };
    return { data: e, status: 201 };
  });
