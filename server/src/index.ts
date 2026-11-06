import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync, createReadStream, readdirSync } from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import Ajv2020 from "ajv/dist/2020.js";
import { log } from "./log.js";
import { openStore, closeStore, addEvent, recent, roomEvents, roomStats, dbStatus, listEmployees, eventCount, RING_MAX, type OfficeEvent } from "./store.js";
import { AuthError, signup, login, createSession, deleteSession, sessionUser, sessionCookie, cookieValue, normEmail, limitLogin, isHostOwner, sessionValid, ipKey, sha as shaHex, type User } from "./auth.js";
import { resolveWs, userWorkspaces, publicWs, issueCode, connectStatus, ingest, watchRooms, type Workspace } from "./workspaces.js";
import { rooms, agents, type Roster } from "./derive.js";
import { handleOffice, syncPending, employeePerson } from "./office.js";
import { SwitchError } from "./switch.js";
import { handleLibrary } from "./library/index.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const env = process.env;
const PORT = Number(env.PORT ?? env.SERVER_PORT ?? 8787);
const OBSERVER_TOKEN = env.OBSERVER_TOKEN || "";
const ADMIN_TOKEN = env.ADMIN_TOKEN || "";
const RATE_LIMIT = Number(env.RATE_LIMIT_PER_MIN) || 120; // POSTs per IP per minute
const MAX_WS_CLIENTS = Number(env.MAX_WS_CLIENTS) || 400; // cap on live office viewers
const BODY_MAX = 64 * 1024;
const GALLERY = join(ROOT, "gallery");
const DIST = join(ROOT, "web/dist"); // production: serve the built site if present
const SERVE_WEB = existsSync(join(DIST, "index.html"));
const VERSION: string = JSON.parse(readFileSync(join(ROOT, "server/package.json"), "utf8")).version;

const schema = JSON.parse(readFileSync(join(ROOT, "contracts/events.schema.json"), "utf8"));
const validate = new Ajv2020.default({ allErrors: true, strict: false }).compile(schema);
const ROSTER_RAW = readFileSync(join(ROOT, "contracts/roster.json"));
const roster: Roster = JSON.parse(ROSTER_RAW.toString());
const ROOM_IDS = new Set(roster.rooms.map((r) => r.id));

const PROD = env.NODE_ENV === "production";
// Office actions trust loopback callers (the office opened on this Mac). Behind a same-host reverse proxy every
// request looks local, so set TRUST_LOOPBACK=0 there; production defaults to off.
const TRUST_LOOPBACK = env.TRUST_LOOPBACK ? env.TRUST_LOOPBACK !== "0" : !PROD;
if (PROD && (!OBSERVER_TOKEN || !ADMIN_TOKEN) && env.ALLOW_OPEN !== "1") {
  log.error("refusing to start: NODE_ENV=production needs OBSERVER_TOKEN and ADMIN_TOKEN (set ALLOW_OPEN=1 to run open anyway)");
  process.exit(1);
}
openStore(env.DATA_DIR || ".data");
if (!OBSERVER_TOKEN) log.warn("OBSERVER_TOKEN unset: POST /api/events is open to anyone (fine for local dev only)");
if (!ADMIN_TOKEN) log.warn("ADMIN_TOKEN unset: POST /api/replay and /api/replay/stop are open (fine for local dev only)");

let seq = 0;
let shuttingDown = false;

/** Server-made events (hired, librarian) in workspace `ws`: our id, schema-checked, then stored + broadcast. */
const emitTo = (ws: string) => (e: Omit<OfficeEvent, "id">) => {
  const ev = { ...e, ws, id: `srv-${Date.now()}-${++seq}` };
  if (validate(ev)) broadcast(ev as OfficeEvent);
  else log.error("dropped invalid server event", undefined, { type: e.type, errors: JSON.stringify(validate.errors) });
};
/** roster.json plus the workspace's hires, its group name, for the read models. */
const liveRoster = (ws: Workspace): Roster => ({
  ...roster, telegram: { ...roster.telegram, group: ws.name }, people: [...roster.people, ...listEmployees(ws.id).map((e) => employeePerson(e, roster.rooms))],
});

/** Stores the event and sends it to that workspace's sockets only. */
function broadcast(ev: OfficeEvent) {
  addEvent(ev);
  const msg = JSON.stringify(ev);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN && socketWs.get(c) === ev.ws) c.send(msg);
}

// --- replay ---
let replayTimers: NodeJS.Timeout[] = [];
let replayRun = 0; // per-iteration id suffix (`evt-001@<run>`); epoch-ms based so it keeps increasing across restarts
function stopReplay() {
  replayTimers.forEach(clearTimeout);
  replayTimers = [];
}
function loadFeed(name: string): OfficeEvent[] | null {
  if (!/^[\w-]+$/.test(name)) return null;
  const file = join(ROOT, "demo/feeds", `${name}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  if (name === "sale-demo") return JSON.parse(readFileSync(join(ROOT, "contracts/sample-feed.json"), "utf8"));
  return null;
}
function startReplay(feed: OfficeEvent[], loop: boolean, speed: number, ws: string) {
  stopReplay();
  const last = Math.max(0, ...feed.map((e) => e.t));
  const run = (replayRun = Math.max(Date.now(), replayRun + 1));
  for (const ev of feed) replayTimers.push(setTimeout(() => broadcast({ ...ev, ws, id: `${ev.id}@${run}` }), ev.t / speed));
  if (loop) replayTimers.push(setTimeout(() => startReplay(feed, loop, speed, ws), (last + 3000) / speed));
}

// --- guards ---
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const sha = (s: string) => createHash("sha256").update(s).digest();
const hasToken = (req: IncomingMessage, token: string) => !!token && timingSafeEqual(sha(req.headers.authorization ?? ""), sha(`Bearer ${token}`));
function requireToken(req: IncomingMessage, token: string) {
  if (token && !hasToken(req, token)) throw new HttpError(401, "unauthorized");
}
// Client IP for rate limiting (no proxy header is trusted; put a proxy in front only with care).
const clientIp = (req: IncomingMessage) => req.socket.remoteAddress || "?";

// ---- office-action trust: CSRF, DNS rebinding and proxy laundering ----
const LOOPBACK_IP = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i;
// The office's own origins besides same-origin: the Vite dev server, plus OFFICE_ORIGINS (comma-separated), whose
// hosts are also accepted as Host (a public deployment: OFFICE_ORIGINS=https://hq.example.com).
const ORIGINS = new Set(["http://localhost:5173", "http://127.0.0.1:5173", ...(env.OFFICE_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean)]);
const ORIGIN_HOSTS = new Set([...ORIGINS].map((o) => URL.parse(o)?.host.toLowerCase()).filter(Boolean));
const header = (req: IncomingMessage, name: string) => String(req.headers[name] ?? "");
const localHost = (req: IncomingMessage) => LOCAL_HOST.test(header(req, "host"));
const knownHost = (req: IncomingMessage) => localHost(req) || ORIGIN_HOSTS.has(header(req, "host").toLowerCase());
/** No Origin, or the office's own: http(s)://<this known Host> or a configured web origin. */
const originOk = (req: IncomingMessage) => {
  const o = header(req, "origin");
  return !o || ORIGINS.has(o) || (knownHost(req) && (o === `http://${header(req, "host")}` || o === `https://${header(req, "host")}`));
};
/** Proxied requests (the Vite dev proxy sets X-Forwarded-*) count as local only if every hop is this Mac:
 *  a proxy appends the real client address, so a remote client can't fake an all-loopback chain. */
const localHops = (req: IncomingMessage) =>
  !req.headers.forwarded &&
  (!req.headers["x-forwarded-host"] || LOCAL_HOST.test(header(req, "x-forwarded-host"))) &&
  header(req, "x-forwarded-for").split(",").every((ip) => !ip.trim() || LOOPBACK_IP.test(ip.trim()));
/** The office on this Mac: loopback socket and hops (unless TRUST_LOOPBACK=0) and a local Host (no DNS rebinding). */
const isLocalOffice = (req: IncomingMessage) => TRUST_LOOPBACK && LOOPBACK_IP.test(req.socket.remoteAddress ?? "") && localHops(req) && localHost(req);
/** Reads that reveal local paths. Cross-site pages can't read responses (no CORS), so Host is what matters. */
const isTrustedRead = (req: IncomingMessage) => hasToken(req, ADMIN_TOKEN) || (isLocalOffice(req) && originOk(req));
const WRITE_ROUTE = /^\/api\/(command|employees(\/[\w-]+)?|library\/categorize|replay(\/stop)?|auth\/(signup|login|logout)|workspaces\/connect)$/;
/** Every state-changing office/admin/auth route: JSON only (a cross-site "simple" POST can't send it without a preflight
 *  we never answer), a foreign Origin is refused, and without the token the Host must be local or configured. */
function checkWrite(req: IncomingMessage) {
  if (!/^application\/json\s*(;|$)/i.test(header(req, "content-type"))) throw new HttpError(415, "content-type must be application/json");
  if (!originOk(req)) throw new HttpError(403, "origin not allowed");
  if (!hasToken(req, ADMIN_TOKEN) && !knownHost(req)) throw new HttpError(403, "host not allowed");
}
/** Cookie `Secure`: https here, or X-Forwarded-Proto=https from a trusted hop (a same-host proxy, or TRUST_PROXY=1). */
const isHttps = (req: IncomingMessage) =>
  (req.socket as { encrypted?: boolean }).encrypted === true ||
  (header(req, "x-forwarded-proto") === "https" && (LOOPBACK_IP.test(req.socket.remoteAddress ?? "") || env.TRUST_PROXY === "1"));
/** The workspace a scoped read/write acts on: needs a session that owns `?ws=` (or ADMIN_TOKEN). */
function scope(req: IncomingMessage, url: URL): { user: User | null; ws: Workspace } {
  const admin = hasToken(req, ADMIN_TOKEN);
  const user = sessionUser(req);
  if (!user && !admin) throw new HttpError(401, "sign in first");
  return { user, ws: resolveWs(admin ? null : user!.id, url.searchParams.get("ws")) };
}
function needUser(req: IncomingMessage): User {
  const user = sessionUser(req);
  if (!user) throw new HttpError(401, "sign in first");
  return user;
}
const HITS_MAX = 10_000;
const hits = new Map<string, { n: number; reset: number }>(); // ponytail: fixed 1-min window per IP, in memory (single instance)
function rateLimit(ip: string) {
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || now >= h.reset) {
    hits.delete(ip); // re-insert so Map order = window start order
    if (hits.size >= HITS_MAX) for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
    while (hits.size >= HITS_MAX) hits.delete(hits.keys().next().value!); // still full: evict the oldest windows
    hits.set(ip, (h = { n: 0, reset: now + 60_000 }));
  }
  if (++h.n > RATE_LIMIT) throw new HttpError(429, "rate limited");
}

// --- http ---
const BASE_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" };
// Vite build: same-origin module scripts, inline styles (React style props), Google Fonts CSS + font files.
const CSP = [
  "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'",
  "worker-src 'self' blob:", "frame-src 'self'", "frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'",
].join("; ");
// Banners are agent-written HTML: sandboxed (opaque origin) so their scripts can't touch the app or its API.
const GALLERY_CSP = "sandbox allow-scripts; default-src 'self' 'unsafe-inline' data: https://fonts.googleapis.com https://fonts.gstatic.com";

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...BASE_HEADERS, ...headers });
  res.end(JSON.stringify(body));
}
async function readJson(req: IncomingMessage): Promise<any> {
  if (Number(req.headers["content-length"]) > BODY_MAX) throw new HttpError(413, "body too large");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_MAX) throw new HttpError(413, "body too large");
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".mjs": "text/javascript", ".map": "application/json", ".txt": "text/plain", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".gif": "image/gif",
};

/** Streams `rel` from inside `base`; false if it isn't a file there. Rejects traversal outside `base`. */
function serveFile(res: ServerResponse, base: string, rel: string, headers: Record<string, string> = {}): boolean | "forbidden" {
  const file = resolve(base, "." + rel);
  if (!file.startsWith(base + sep)) return "forbidden";
  if (!existsSync(file) || !statSync(file).isFile()) return false;
  res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream", ...BASE_HEADERS, ...headers });
  createReadStream(file).pipe(res);
  return true;
}
/** Banner files, titled from gallery/index.json ([{ title, file, sku }]) when listed there: listed ones first
 *  in index order, then the rest newest first. index.json itself is not a banner. */
function gallery() {
  if (!existsSync(GALLERY)) return [];
  let index: { title?: string; file?: string; sku?: string | null }[] = [];
  try {
    index = JSON.parse(readFileSync(join(GALLERY, "index.json"), "utf8"));
  } catch {}
  const pos = (name: string) => {
    const i = Array.isArray(index) ? index.findIndex((e) => e?.file === name) : -1;
    return i < 0 ? Infinity : i;
  };
  return readdirSync(GALLERY, { withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.startsWith(".") && d.name !== "index.json")
    .map((d) => {
      const st = statSync(join(GALLERY, d.name));
      const meta = index[pos(d.name)];
      return { name: d.name, url: `/gallery/${encodeURIComponent(d.name)}`, size: st.size, mtime: st.mtimeMs, title: meta?.title ?? d.name, sku: meta?.sku ?? null };
    })
    .sort((a, b) => pos(a.name) - pos(b.name) || b.mtime - a.mtime);
}
const limitParam = (url: URL, def: number) => Math.min(RING_MAX, Math.max(0, Math.floor(Number(url.searchParams.get("limit") ?? def)) || 0));

async function handle(req: IncomingMessage, res: ServerResponse, url: URL) {
  const method = req.method === "HEAD" ? "GET" : req.method; // node drops the body for HEAD
  const route = `${method} ${url.pathname}`;

  // Valid tokens skip the limit: an observer burst must not drop events. Bad/missing tokens are limited (brute force).
  if ((method === "POST" || method === "DELETE") && !hasToken(req, OBSERVER_TOKEN) && !hasToken(req, ADMIN_TOKEN)) rateLimit(ipKey(clientIp(req)));
  if ((method === "POST" || method === "DELETE") && WRITE_ROUTE.test(url.pathname)) checkWrite(req);

  if (route === "GET /api/health")
    return send(res, 200, { ok: true, version: VERSION, uptime: process.uptime(), clients: wss.clients.size, history: eventCount(), db: dbStatus() });
  if (route === "GET /api/ready") {
    const db = dbStatus();
    // DATA_DIR in production means "persist": a memory fallback there is a broken deploy, not a degraded one.
    const ready = !shuttingDown && db !== "error" && !(PROD && env.DATA_DIR && db === "memory");
    return send(res, ready ? 200 : 503, { ready, db });
  }
  if (route === "GET /api/roster") {
    if (!hasToken(req, ADMIN_TOKEN)) needUser(req); // not public (v3): the demo imports its own copy
    res.writeHead(200, { "content-type": "application/json", ...BASE_HEADERS });
    return res.end(ROSTER_RAW);
  }
  if (route === "GET /api/gallery") return send(res, 200, gallery());

  // ---- v3 accounts ----
  if (route === "POST /api/auth/signup" || route === "POST /api/auth/login") {
    const body = await readJson(req);
    const signingUp = route === "POST /api/auth/signup";
    let email = "";
    try {
      email = normEmail(body.email);
    } catch {}
    limitLogin(clientIp(req), signingUp ? "" : email);
    const user = signingUp ? await signup(body) : await login(body);
    return send(res, signingUp ? 201 : 200, { user }, { "set-cookie": sessionCookie(createSession(user.id), isHttps(req)) });
  }
  if (route === "POST /api/auth/logout") {
    const id = cookieValue(req);
    if (!id || !sessionUser(req)) throw new HttpError(401, "sign in first");
    deleteSession(id);
    closeSockets((h) => h === shaHex(id)); // this session's live offices stop at once
    res.writeHead(204, { "cache-control": "no-store", ...BASE_HEADERS, "set-cookie": sessionCookie(null, isHttps(req)) });
    return res.end();
  }
  if (route === "GET /api/auth/me") {
    const user = needUser(req);
    return send(res, 200, { user, workspaces: userWorkspaces(user.id).map(publicWs) });
  }
  if (route === "GET /api/workspaces") return send(res, 200, userWorkspaces(needUser(req).id).map(publicWs));
  if (route === "POST /api/workspaces/connect") {
    const code = issueCode(needUser(req));
    void watchRooms().catch((e) => log.warn("room watch failed", { error: String(e.message ?? e) }));
    return send(res, 200, code);
  }
  if (route === "GET /api/workspaces/connect/status") return send(res, 200, connectStatus(needUser(req)));

  if (route === "POST /api/events") {
    requireToken(req, OBSERVER_TOKEN);
    const body = await readJson(req);
    const { ws: _ignored, ...rest } = body ?? {}; // the server assigns ws, never the caller
    const ev = { ...rest, id: `srv-${Date.now()}-${++seq}` }; // always our id: client ids could break run ordering
    if (!validate(ev)) return send(res, 400, { error: "invalid event", details: validate.errors });
    const { event, linked } = await ingest(ev as OfficeEvent);
    if (!event) return send(res, 202, { ok: true, stored: false, linked: !!linked }); // no workspace: a link attempt only
    broadcast(event);
    return send(res, 201, event);
  }
  if (route === "POST /api/replay" || route === "POST /api/replay/stop") {
    if (!hasToken(req, ADMIN_TOKEN)) throw new HttpError(401, "unauthorized"); // admin only, even in dev
    if (route === "POST /api/replay/stop") return stopReplay(), send(res, 200, { ok: true });
    const { feed = "sale-demo", loop = false, speed = 1, ws } = await readJson(req);
    const target = resolveWs(null, typeof ws === "string" ? ws : null);
    const events = loadFeed(String(feed));
    if (!events) return send(res, 404, { error: `feed not found: ${feed}` });
    const s = Number(speed) > 0 ? Number(speed) : 1;
    startReplay(events, Boolean(loop), s, target.id);
    return send(res, 200, { ok: true, feed, events: events.length, loop: Boolean(loop), speed: s, ws: target.id });
  }
  // The observer learns hired names (all workspaces) with its own token.
  if (route === "GET /api/people" && hasToken(req, OBSERVER_TOKEN) && !sessionUser(req))
    return send(res, 200, [...roster.people, ...listEmployees().map((e) => employeePerson(e, roster.rooms))]);

  // ---- scoped to one workspace (v3): session (or ADMIN_TOKEN) + ?ws= ----
  if (/^\/api\/(history|rooms|agents|people|employees|command|library)(\/|$)/.test(url.pathname)) {
    const { user, ws } = scope(req, url);
    if (route === "GET /api/history") return send(res, 200, recent(ws.id, limitParam(url, 200)));
    if (route === "GET /api/rooms") return send(res, 200, rooms(liveRoster(ws), roomStats(ws.id), recent(ws.id, RING_MAX)));
    const roomMatch = method === "GET" && url.pathname.match(/^\/api\/rooms\/([\w-]+)\/events$/);
    if (roomMatch) {
      if (!ROOM_IDS.has(roomMatch[1])) return send(res, 404, { error: `unknown room: ${roomMatch[1]}` });
      return send(res, 200, roomEvents(ws.id, roomMatch[1], limitParam(url, 50)));
    }
    if (route === "GET /api/agents") return send(res, 200, agents(liveRoster(ws), recent(ws.id, RING_MAX)));
    if (await handleOffice(req, url, { root: ROOT, roster, ws, readJson: () => readJson(req), send: (st, b) => send(res, st, b), emit: emitTo(ws.id) })) return;
    // Library paths are shown only to the office on this Mac (or ADMIN_TOKEN). Re-shelving is host-wide (rewrites
    // data/library.json, runs Claude Code): ADMIN_TOKEN, or the host owner in a browser on this Mac.
    if (method !== "GET" && url.pathname.startsWith("/api/library") && !hasToken(req, ADMIN_TOKEN) &&
        !(user && isHostOwner(user) && isLocalOffice(req) && !!req.headers.origin && originOk(req)))
      throw new HttpError(403, "only the host owner, in the office on this Mac");
    const trusted = method === "GET" ? isTrustedRead(req) : true;
    if (url.pathname.startsWith("/api/library") && (await handleLibrary(req, res, url, { isTrusted: trusted, emit: emitTo(ws.id) }))) return;
  }
  if (method === "GET" && url.pathname.startsWith("/gallery/")) {
    const r = serveFile(res, GALLERY, decodeURIComponent(url.pathname.slice("/gallery".length)), { "content-security-policy": GALLERY_CSP });
    if (r === "forbidden") return send(res, 403, { error: "forbidden" });
    if (!r) return send(res, 404, { error: "not found" });
    return;
  }
  if (SERVE_WEB && method === "GET" && !/^\/(api|ws|gallery)(\/|$)/.test(url.pathname)) {
    const path = decodeURIComponent(url.pathname);
    const cache = path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    const headers = { "cache-control": cache, "content-security-policy": CSP };
    const r = path === "/" ? false : serveFile(res, DIST, path, headers);
    if (r === "forbidden") return send(res, 403, { error: "forbidden" });
    if (r) return;
    // SPA fallback: extension-less paths (/office) get index.html; missing assets stay 404.
    if (!extname(path) && serveFile(res, DIST, "/index.html", { ...headers, "cache-control": "no-cache" })) return;
  }
  send(res, 404, { error: "not found" });
}

const server = createServer(async (req, res) => {
  const start = performance.now();
  if (req.headers["x-forwarded-proto"] === "https") res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains"); // behind a TLS proxy
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname !== "/api/health" && url.pathname !== "/api/ready") // probes would drown the log
    res.on("finish", () =>
      log.info("request", { method: req.method, path: url.pathname, status: res.statusCode, ms: Math.round(performance.now() - start), ip: clientIp(req) }),
    );
  try {
    await handle(req, res, url);
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 413) res.setHeader("connection", "close"); // don't read the rest of a huge body
      const extra: Record<string, string> = e.status === 401 ? { "www-authenticate": "Bearer" } : e.status === 429 ? { "retry-after": "60" } : {};
      return send(res, e.status, { error: e.message }, extra);
    }
    if (e instanceof AuthError) return send(res, e.status, { error: e.message }, e.status === 429 ? { "retry-after": "60" } : {});
    if (e instanceof URIError) return send(res, 400, { error: "bad path" });
    if (e instanceof SwitchError) {
      // Our own 4xx pass through; whatever Switch answered (detail) is logged here and shown as a generic 502/503.
      const status = e.detail === undefined && e.status < 500 ? e.status : e.status === 503 ? 503 : 502;
      if (status >= 500) log.warn("switch call failed", { path: url.pathname, error: e.message, detail: e.detail });
      return send(res, status, { error: e.message }, status === 401 ? { "www-authenticate": "Bearer" } : status === 429 ? { "retry-after": "60" } : {});
    }
    log.error("request failed", e, { method: req.method, path: url.pathname });
    if (!res.headersSent) send(res, 500, { error: "internal error" });
    else res.destroy();
  }
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;

// --- ws: server → client only, so tiny frames; dead clients dropped by ping/pong ---
// Upgrade needs a session cookie that owns ?ws= (or ADMIN_TOKEN); a foreign Origin is refused (cross-site WS hijacking).
const upgradeWs = new WeakMap<IncomingMessage, string>();
const socketWs = new WeakMap<WebSocket, string>();
const socketSession = new WeakMap<WebSocket, string>(); // sha256 of the session id (sockets opened with ADMIN_TOKEN have none)
/** Closes (4401) the sockets whose session hash matches: on logout, and on expiry (checked every ping). */
function closeSockets(match: (sessionHash: string) => boolean) {
  for (const c of wss.clients) {
    const h = socketSession.get(c);
    if (h && match(h)) c.close(4401, "signed out");
  }
}
const wss = new WebSocketServer({
  server, path: "/ws", maxPayload: 4096,
  verifyClient: ({ req }, done) => {
    try {
      if (!originOk(req)) throw new HttpError(403, "origin not allowed");
      upgradeWs.set(req, scope(req, new URL(req.url ?? "/", "http://x")).ws.id);
      done(true);
    } catch (e) {
      done(false, e instanceof HttpError || e instanceof AuthError ? e.status : 500, "unauthorized");
    }
  },
});
const alive = new WeakMap<WebSocket, boolean>();
wss.on("connection", (ws, req) => {
  ws.on("error", () => ws.terminate()); // malformed frame: drop that client, not the server
  if (wss.clients.size > MAX_WS_CLIENTS) return ws.close(1013, "server full, retry later");
  socketWs.set(ws, upgradeWs.get(req)!);
  const cookie = cookieValue(req);
  if (cookie && !hasToken(req, ADMIN_TOKEN)) socketSession.set(ws, shaHex(cookie));
  alive.set(ws, true);
  ws.on("pong", () => alive.set(ws, true));
});
wss.on("error", (e) => log.error("wss error", e));
const heartbeat = setInterval(() => {
  closeSockets((h) => !sessionValid(h)); // expired or deleted sessions
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, Number(env.WS_PING_MS) || 30_000);

// Template-fallback hires go active once someone finishes them in Switch Console.
const pendingSync = setInterval(() => syncPending().catch((e) => log.warn("pending hire sync failed", { error: String(e.message ?? e) })), 30_000);
pendingSync.unref();
// While a link code is live, new Telegram rooms get the observer so the code is seen (workspaces.ts watchRooms).
const roomWatch = setInterval(() => watchRooms().catch((e) => log.warn("room watch failed", { error: String(e.message ?? e) })), Number(env.ROOM_WATCH_MS) || 10_000);
roomWatch.unref();

server.listen(PORT, () => {
  const port = (server.address() as { port: number }).port;
  log.info("listening", { port, version: VERSION, root: ROOT, web: SERVE_WEB, observerAuth: !!OBSERVER_TOKEN, adminAuth: !!ADMIN_TOKEN });
});

function shutdown(sig: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal: sig });
  stopReplay();
  clearInterval(heartbeat);
  for (const c of wss.clients) c.close(1001, "server shutting down");
  const exit = () => {
    closeStore();
    process.exit(0);
  };
  server.close(exit);
  server.closeIdleConnections();
  setTimeout(exit, 3000).unref(); // don't hang on keep-alive sockets
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
