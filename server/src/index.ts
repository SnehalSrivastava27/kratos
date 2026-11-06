import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import Ajv2020 from "ajv/dist/2020.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const PORT = Number(process.env.PORT ?? process.env.SERVER_PORT ?? 8787);
const HISTORY_MAX = 500;
const GALLERY = join(ROOT, "gallery");

type OfficeEvent = { id: string; t: number; [k: string]: unknown };

const schema = JSON.parse(readFileSync(join(ROOT, "contracts/events.schema.json"), "utf8"));
const validate = new Ajv2020.default({ allErrors: true, strict: false }).compile(schema);

const history: OfficeEvent[] = [];
let seq = 0;

function broadcast(ev: OfficeEvent) {
  history.push(ev);
  if (history.length > HISTORY_MAX) history.shift();
  const msg = JSON.stringify(ev);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(msg);
}

// --- replay ---
let replayTimers: NodeJS.Timeout[] = [];
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
  for (const ev of feed) replayTimers.push(setTimeout(() => broadcast({ ...ev }), ev.t / speed));
  if (loop) replayTimers.push(setTimeout(() => startReplay(feed, loop, speed), (last + 3000) / speed));
}

// --- http ---
function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
async function readJson(req: IncomingMessage): Promise<any> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1e6) throw new Error("body too large");
  }
  return raw ? JSON.parse(raw) : {};
}
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".gif": "image/gif",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const route = `${req.method} ${url.pathname}`;
  try {
    if (route === "GET /api/roster") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(readFileSync(join(ROOT, "contracts/roster.json")));
    }
    if (route === "GET /api/history") {
      const limit = Math.min(HISTORY_MAX, Math.max(0, Number(url.searchParams.get("limit") ?? 200) || 0));
      return send(res, 200, limit ? history.slice(-limit) : []);
    }
    if (route === "POST /api/events") {
      const body = await readJson(req);
      const ev = { id: `srv-${Date.now()}-${++seq}`, ...body };
      if (!validate(ev)) return send(res, 400, { error: "invalid event", details: validate.errors });
      broadcast(ev as OfficeEvent);
      return send(res, 201, ev);
    }
    if (route === "POST /api/replay") {
      const { feed = "sale-demo", loop = false, speed = 1 } = await readJson(req);
      const events = loadFeed(String(feed));
      if (!events) return send(res, 404, { error: `feed not found: ${feed}` });
      const s = Number(speed) > 0 ? Number(speed) : 1;
      startReplay(events, Boolean(loop), s);
      return send(res, 200, { ok: true, feed, events: events.length, loop: Boolean(loop), speed: s });
    }
    if (route === "POST /api/replay/stop") {
      stopReplay();
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && url.pathname.startsWith("/gallery/")) {
      const file = resolve(GALLERY, "." + decodeURIComponent(url.pathname.slice("/gallery".length)));
      if (!file.startsWith(GALLERY + sep)) return send(res, 403, { error: "forbidden" });
      if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: "not found" });
      res.writeHead(200, { "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream" });
      return createReadStream(file).pipe(res);
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 400, { error: (e as Error).message });
  }
});

const wss = new WebSocketServer({ server, path: "/ws" });
server.listen(PORT, () => console.log(`hq-server on http://localhost:${PORT} (root ${ROOT})`));
