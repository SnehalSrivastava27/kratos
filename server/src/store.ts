// Event store: SQLite (node:sqlite) on disk + an in-memory ring of the newest events for fast reads.
// No node:sqlite (Node < 22.13) or the DB won't open → ring only, with a warning.
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { log } from "./log.js";

export type OfficeEvent = { id: string; t: number; room: string; speaker: string; [k: string]: unknown };

export const RING_MAX = 500;
const RETAIN = 10_000; // ponytail: rows kept on disk; prune is a single DELETE every 100 inserts

const ring: OfficeEvent[] = [];
let db: DatabaseSync | null = null;
let inserts = 0;

export function openStore(dataDir: string) {
  try {
    const { DatabaseSync } = (process as any).getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
    mkdirSync(dataDir, { recursive: true });
    const file = join(resolve(dataDir), "events.db");
    db = new DatabaseSync(file);
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=2000;
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
        room TEXT NOT NULL, speaker TEXT NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_room ON events(room, seq);`);
    const rows = db.prepare("SELECT json FROM events ORDER BY seq DESC LIMIT ?").all(RING_MAX) as { json: string }[];
    ring.push(...rows.reverse().map((r) => JSON.parse(r.json)));
    log.info("store open", { kind: "sqlite", file, loaded: ring.length });
  } catch (e) {
    db = null;
    log.warn("node:sqlite unavailable, events are in memory only (lost on restart)", { error: String(e) });
  }
}

export const storeKind = () => (db ? "sqlite" : "memory");

export function dbStatus(): "ok" | "memory" | "error" {
  if (!db) return "memory";
  try {
    db.prepare("SELECT 1").get();
    return "ok";
  } catch {
    return "error";
  }
}

export function addEvent(ev: OfficeEvent) {
  ring.push(ev);
  if (ring.length > RING_MAX) ring.shift();
  if (!db) return;
  try {
    db.prepare("INSERT OR IGNORE INTO events (id, room, speaker, json) VALUES (?, ?, ?, ?)").run(ev.id, ev.room, ev.speaker, JSON.stringify(ev));
    if (++inserts % 100 === 0) db.prepare("DELETE FROM events WHERE seq <= (SELECT MAX(seq) FROM events) - ?").run(RETAIN);
  } catch (e) {
    log.error("store insert failed", e); // event still broadcast + in the ring
  }
}

/** Newest `limit` events, oldest first. */
export const recent = (limit: number) => (limit > 0 ? ring.slice(-limit) : []);

/** Newest `limit` events in a room, oldest first. */
export function roomEvents(room: string, limit: number): OfficeEvent[] {
  if (!db) return ring.filter((e) => e.room === room).slice(-limit);
  const rows = db.prepare("SELECT json FROM events WHERE room = ? ORDER BY seq DESC LIMIT ?").all(room, limit) as { json: string }[];
  return rows.reverse().map((r) => JSON.parse(r.json));
}

/** Per room: stored event count and the newest event. */
export function roomStats(): Map<string, { count: number; last: OfficeEvent }> {
  const out = new Map<string, { count: number; last: OfficeEvent }>();
  if (!db) {
    for (const e of ring) out.set(e.room, { count: (out.get(e.room)?.count ?? 0) + 1, last: e });
    return out;
  }
  const rows = db.prepare(`SELECT e.room, c.n, e.json FROM events e JOIN
    (SELECT room, COUNT(*) n, MAX(seq) s FROM events GROUP BY room) c ON e.seq = c.s`).all() as { room: string; n: number; json: string }[];
  for (const r of rows) out.set(r.room, { count: Number(r.n), last: JSON.parse(r.json) });
  return out;
}

export function closeStore() {
  try {
    db?.close();
  } catch {}
  db = null;
}
