import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync, createReadStream, readdirSync } from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import Ajv2020 from "ajv/dist/2020.js";
import { log } from "./log.js";
import { openStore, closeStore, addEvent, recent, roomEvents, roomStats, dbStatus, RING_MAX, type OfficeEvent } from "./store.js";
import { rooms, agents, type Roster } from "./derive.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const env = process.env;
const PORT = Number(env.PORT ?? env.SERVER_PORT ?? 8787);
const OBSERVER_TOKEN = env.OBSERVER_TOKEN || "";
const ADMIN_TOKEN = env.ADMIN_TOKEN || "";
const RATE_LIMIT = Number(env.RATE_LIMIT_PER_MIN) || 120; // POSTs per IP per minute
const MAX_WS_CLIENTS = Number(env.MAX_WS_CLIENTS) || 400; // keep below fly.toml hard_limit
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

openStore(env.DATA_DIR || ".data");
if (!OBSERVER_TOKEN) log.warn("OBSERVER_TOKEN unset: POST /api/events is open to anyone (fine for local dev only)");
if (!ADMIN_TOKEN) log.warn("ADMIN_TOKEN unset: POST /api/replay and /api/replay/stop are open (fine for local dev only)");

let seq = 0;
let shuttingDown = false;

function broadcast(ev: OfficeEvent) {
  addEvent(ev);
  const msg = JSON.stringify(ev);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
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
function startReplay(feed: OfficeEvent[], loop: boolean, speed: number) {
  stopReplay();
  const last = Math.max(0, ...feed.map((e) => e.t));
  const run = (replayRun = Math.max(Date.now(), replayRun + 1));
  for (const ev of feed) replayTimers.push(setTimeout(() => broadcast({ ...ev, id: `${ev.id}@${run}` }), ev.t / speed));
  if (loop) replayTimers.push(setTimeout(() => startReplay(feed, loop, speed), (last + 3000) / speed));
}

// --- guards ---
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const sha = (s: string) => createHash("sha256").update(s).digest();
function requireToken(req: IncomingMessage, token: string) {
  if (token && !timingSafeEqual(sha(req.headers.authorization ?? ""), sha(`Bearer ${token}`))) throw new HttpError(401, "unauthorized");
}
// Behind Fly's proxy every request comes from the proxy; Fly sets Fly-Client-IP (clients can't spoof it there).
const clientIp = (req: IncomingMessage) => (env.FLY_APP_NAME && String(req.headers["fly-client-ip"] ?? "")) || req.socket.remoteAddress || "?";
const hits = new Map<string, { n: number; reset: number }>(); // ponytail: fixed 1-min window per IP, in memory (single instance)
function rateLimit(ip: string) {
  const now = Date.now();
  let h = hits.get(ip);
  if (!h || now >= h.reset) {
    if (hits.size > 10_000) for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
    hits.set(ip, (h = { n: 0, reset: now + 60_000 }));
  }
  if (++h.n > RATE_LIMIT) throw new HttpError(429, "rate limited");
}

// --- http ---
const BASE_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" };
// Vite build: same-origin module scripts, inline styles (React style props), Google Fonts CSS + font files.
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
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
function gallery() {
  if (!existsSync(GALLERY)) return [];
  return readdirSync(GALLERY, { withFileTypes: true })
    .filter((d) => d.isFile() && !d.name.startsWith("."))
    .map((d) => {
      const st = statSync(join(GALLERY, d.name));
      return { name: d.name, url: `/gallery/${encodeURIComponent(d.name)}`, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}
const limitParam = (url: URL, def: number) => Math.min(RING_MAX, Math.max(0, Number(url.searchParams.get("limit") ?? def) || 0));

async function handle(req: IncomingMessage, res: ServerResponse, url: URL) {
  const method = req.method === "HEAD" ? "GET" : req.method; // node drops the body for HEAD
  const route = `${method} ${url.pathname}`;

  if (method === "POST") rateLimit(clientIp(req));

  if (route === "GET /api/health")
    return send(res, 200, { ok: true, version: VERSION, uptime: process.uptime(), clients: wss.clients.size, history: recent(RING_MAX).length, db: dbStatus() });
  if (route === "GET /api/ready") {
    const db = dbStatus();
    const ready = !shuttingDown && db !== "error";
    return send(res, ready ? 200 : 503, { ready, db });
  }
  if (route === "GET /api/roster") {
    res.writeHead(200, { "content-type": "application/json", ...BASE_HEADERS });
    return res.end(ROSTER_RAW);
  }
  if (route === "GET /api/history") return send(res, 200, recent(limitParam(url, 200)));
  if (route === "GET /api/rooms") return send(res, 200, rooms(roster, roomStats(), recent(RING_MAX)));
  const roomMatch = method === "GET" && url.pathname.match(/^\/api\/rooms\/([\w-]+)\/events$/);
  if (roomMatch) {
    if (!ROOM_IDS.has(roomMatch[1])) return send(res, 404, { error: `unknown room: ${roomMatch[1]}` });
    return send(res, 200, roomEvents(roomMatch[1], limitParam(url, 50)));
  }
  if (route === "GET /api/agents") return send(res, 200, agents(roster, recent(RING_MAX)));
  if (route === "GET /api/gallery") return send(res, 200, gallery());

  if (route === "POST /api/events") {
    requireToken(req, OBSERVER_TOKEN);
    const body = await readJson(req);
    const ev = { ...body, id: `srv-${Date.now()}-${++seq}` }; // always our id: client ids could break run ordering
    if (!validate(ev)) return send(res, 400, { error: "invalid event", details: validate.errors });
    broadcast(ev as OfficeEvent);
    return send(res, 201, ev);
  }
  if (route === "POST /api/replay") {
    requireToken(req, ADMIN_TOKEN);
    const { feed = "sale-demo", loop = false, speed = 1 } = await readJson(req);
    const events = loadFeed(String(feed));
    if (!events) return send(res, 404, { error: `feed not found: ${feed}` });
    const s = Number(speed) > 0 ? Number(speed) : 1;
    startReplay(events, Boolean(loop), s);
    return send(res, 200, { ok: true, feed, events: events.length, loop: Boolean(loop), speed: s });
  }
  if (route === "POST /api/replay/stop") {
    requireToken(req, ADMIN_TOKEN);
    stopReplay();
    return send(res, 200, { ok: true });
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
      return send(res, e.status, { error: e.message }, e.status === 401 ? { "www-authenticate": "Bearer" } : {});
    }
    if (e instanceof URIError) return send(res, 400, { error: "bad path" });
    log.error("request failed", e, { method: req.method, path: url.pathname });
    if (!res.headersSent) send(res, 500, { error: "internal error" });
    else res.destroy();
  }
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;

// --- ws: server → client only, so tiny frames; dead clients dropped by ping/pong ---
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
const alive = new WeakMap<WebSocket, boolean>();
wss.on("connection", (ws) => {
  ws.on("error", () => ws.terminate()); // malformed frame: drop that client, not the server
  if (wss.clients.size > MAX_WS_CLIENTS) return ws.close(1013, "server full, retry later");
  alive.set(ws, true);
  ws.on("pong", () => alive.set(ws, true));
});
wss.on("error", (e) => log.error("wss error", e));
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}, Number(env.WS_PING_MS) || 30_000);

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
