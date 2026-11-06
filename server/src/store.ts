// SQLite (node:sqlite) store: events, hired employees, accounts and workspaces (contracts/api.md v3).
// If the DB file can't open, an in-memory SQLite DB is used instead (dbStatus "memory", lost on restart).
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { log } from "./log.js";

export type OfficeEvent = { id: string; t: number; room: string; speaker: string; ws?: string; [k: string]: unknown };

export const RING_MAX = 500; // newest events the read models fold
export type Employee = {
  id: string; name: string; role: string; room: string; emoji: string; color: string; desk: string;
  hiredAt: number; switchAgentId: string | null; status: "active" | "pending_console"; instructions: string; skills: string[];
  ws?: string; // owning workspace (v3); legacy hires get one in the Kratos D2C migration
  reports_to?: string | null; // v4: a lead of the same department
};
const RETAIN = 10_000; // ponytail: rows kept per workspace; prune is a single DELETE every 100 inserts

let db: DatabaseSync;
let memory = false;
let inserts = 0;

const SCHEMA = `PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
    room TEXT NOT NULL, speaker TEXT NOT NULL, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS probe (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    pass TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, switch_room_id TEXT NOT NULL UNIQUE,
    chat_id TEXT, owner_id TEXT NOT NULL REFERENCES users(id), topics TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL,
    detail TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS link_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, code_hash TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    used_at INTEGER, workspace_id TEXT, detail TEXT, misses INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS link_codes_hash ON link_codes(code_hash);
  CREATE TABLE IF NOT EXISTS link_attempts (seq INTEGER PRIMARY KEY AUTOINCREMENT, switch_room_id TEXT NOT NULL,
    room_name TEXT, chat_id TEXT, at INTEGER NOT NULL, matched INTEGER NOT NULL);`;

export function openStore(dataDir: string) {
  const { DatabaseSync } = (process as any).getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
  try {
    mkdirSync(dataDir, { recursive: true });
    db = new DatabaseSync(join(resolve(dataDir), "events.db"));
    db.exec(SCHEMA);
  } catch (e) {
    log.warn("events.db unavailable, using an in-memory DB (lost on restart)", { error: String(e) });
    db = new DatabaseSync(":memory:");
    db.exec(SCHEMA);
    memory = true;
  }
  // v3 migration: every event belongs to a workspace (NULL = legacy, hidden until the Kratos D2C migration).
  if (!(db.prepare("PRAGMA table_info(events)").all() as { name: string }[]).some((c) => c.name === "ws")) db.exec("ALTER TABLE events ADD COLUMN ws TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS events_ws_room ON events(ws, room, seq); CREATE INDEX IF NOT EXISTS events_ws ON events(ws, seq)");
  log.info("store open", { kind: memory ? "memory" : "sqlite", events: eventCount() });
}

/** The open DB, for the auth and workspace modules. */
export const sql = () => db;

export function dbStatus(): "ok" | "memory" | "error" {
  if (memory) return "memory";
  try {
    const now = Date.now(); // real write + read: catches a full/read-only disk, not just an open handle
    db.prepare("INSERT INTO probe (k, v) VALUES ('ping', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(now);
    return (db.prepare("SELECT v FROM probe WHERE k = 'ping'").get() as { v: number }).v === now ? "ok" : "error";
  } catch {
    return "error";
  }
}

export const kvGet = (k: string) => (db.prepare("SELECT v FROM kv WHERE k = ?").get(k) as { v: string } | undefined)?.v;
export const kvSet = (k: string, v: string) => db.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, v);

/** Stores the event; false if one with that id is already stored (idempotent ingest). */
export function addEvent(ev: OfficeEvent): boolean {
  const added = Number(db.prepare("INSERT OR IGNORE INTO events (id, room, speaker, ws, json) VALUES (?, ?, ?, ?, ?)").run(ev.id, ev.room, ev.speaker, ev.ws ?? null, JSON.stringify(ev)).changes) === 1;
  if (!added) return false;
  if (++inserts % 100 === 0)
    db.prepare("DELETE FROM events WHERE ws IS ? AND seq <= (SELECT seq FROM events WHERE ws IS ? ORDER BY seq DESC LIMIT 1 OFFSET ?)").run(ev.ws ?? null, ev.ws ?? null, RETAIN);
  return true;
}

export const getEvent = (id: string) => {
  const r = db.prepare("SELECT json FROM events WHERE id = ?").get(id) as { json: string } | undefined;
  return r ? (JSON.parse(r.json) as OfficeEvent) : null;
};

const parse = (rows: unknown[]) => (rows as { json: string }[]).reverse().map((r) => JSON.parse(r.json) as OfficeEvent);

/** Newest `limit` events of a workspace, oldest first. */
export const recent = (ws: string, limit: number) =>
  limit > 0 ? parse(db.prepare("SELECT json FROM events WHERE ws = ? ORDER BY seq DESC LIMIT ?").all(ws, limit)) : [];

/** Newest `limit` events in a room of a workspace, oldest first. */
export const roomEvents = (ws: string, room: string, limit: number) =>
  parse(db.prepare("SELECT json FROM events WHERE ws = ? AND room = ? ORDER BY seq DESC LIMIT ?").all(ws, room, limit));

export const eventCount = () => Number((db.prepare("SELECT COUNT(*) n FROM events").get() as { n: number }).n);

/** Per room of a workspace: stored event count and the newest event. */
export function roomStats(ws: string): Map<string, { count: number; last: OfficeEvent }> {
  const rows = db.prepare(`SELECT e.room, c.n, e.json FROM events e JOIN
    (SELECT room, COUNT(*) n, MAX(seq) s FROM events WHERE ws = ? GROUP BY room) c ON e.seq = c.s`).all(ws) as { room: string; n: number; json: string }[];
  return new Map(rows.map((r) => [r.room, { count: Number(r.n), last: JSON.parse(r.json) }]));
}

/** Hired employees, oldest first: of one workspace, or all of them (host-wide caps, Switch name clashes). */
export function listEmployees(ws?: string): Employee[] {
  const all = (db.prepare("SELECT json FROM employees ORDER BY rowid").all() as { json: string }[]).map((r) => JSON.parse(r.json) as Employee);
  return ws === undefined ? all : all.filter((e) => e.ws === ws);
}

/** Insert or replace. Throws if the DB write fails, so a hire is never reported but lost. */
export function saveEmployee(e: Employee) {
  db.prepare("INSERT INTO employees (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json").run(e.id, JSON.stringify(e));
}

export function deleteEmployee(id: string) {
  db.prepare("DELETE FROM employees WHERE id = ?").run(id);
}

/** Legacy (pre-v3) events and hires with no workspace join `ws`. Returns how many events moved. */
export function adoptLegacy(ws: string) {
  const n = Number(db.prepare("UPDATE events SET ws = ?, json = json_set(json, '$.ws', ?) WHERE ws IS NULL").run(ws, ws).changes);
  for (const e of listEmployees()) if (!e.ws) saveEmployee({ ...e, ws });
  return n;
}

/** Checkpoints the WAL into events.db and closes it (graceful shutdown). */
export function closeStore() {
  try {
    if (!memory) db?.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {}
  try {
    db?.close();
  } catch {}
}
