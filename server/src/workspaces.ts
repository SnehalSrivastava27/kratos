// Workspaces (contracts/api.md v3): one Telegram group = one Switch room = one user's private office.
// Linking: the user gets a 6-digit code, sends it in the group; the observer forwards it here (ingest), the room is
// linked to that user and set up: Bot API checks, the 6 forum topics, the team + observer + office agents joined.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt, randomUUID } from "node:crypto";
import { sql, kvGet, kvSet, adoptLegacy, type OfficeEvent } from "./store.js";
import { sha, AuthError, type User } from "./auth.js";
import { roomChatId, joinAgents, joinRoom, gw, switchAgents, OFFICE_AGENT } from "./switch.js";
import { log } from "./log.js";

const env = process.env;
const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
export const BOT_USERNAME = env.BOT_USERNAME || "kratosd2c_bot";
const TG_API = (env.TELEGRAM_API || "https://api.telegram.org").replace(/\/$/, "");
const CODE_TTL = Number(env.LINK_CODE_TTL_MS) || 15 * 60_000; // env: tests only
const CODES_PER_HOUR = 5;
const TEAM = ["d2c-captain", "d2c-analyst", "d2c-ads", "d2c-influencers", "d2c-ops", "d2c-design"];
// room id, topic name, icon color (Telegram's fixed palette), as in scripts/switch-up.sh
const TOPICS: [string, string, number][] = [
  ["war_room", "War Room", 7322096], ["analytics", "Analytics", 16766590], ["ads", "Ads", 13338331],
  ["creators", "Creators", 9367192], ["ops", "Ops", 16749490], ["design", "Design", 16478047],
];

type Topic = { threadId: number | null; switchThreadId?: string | null };
export type Workspace = {
  id: string; name: string; switchRoomId: string; chatId: string | null; ownerId: string;
  topics: Record<string, Topic>; status: "linking" | "ready" | "needs_admin"; createdAt: number; detail: string | null;
};

const row2ws = (r: any): Workspace => ({
  id: r.id, name: r.name, switchRoomId: r.switch_room_id, chatId: r.chat_id ?? null, ownerId: r.owner_id,
  topics: JSON.parse(r.topics), status: r.status, createdAt: Number(r.created_at), detail: r.detail ?? null,
});
/** The contract's Workspace: no internal detail, topics as { threadId } only. */
export const publicWs = (w: Workspace) => ({
  id: w.id, name: w.name, switchRoomId: w.switchRoomId, chatId: w.chatId, ownerId: w.ownerId, status: w.status, createdAt: w.createdAt,
  topics: Object.fromEntries(Object.entries(w.topics).map(([k, v]) => [k, { threadId: v.threadId }])),
});

export const getWs = (id: string) => {
  const r = sql().prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
  return r ? row2ws(r) : null;
};
const wsByRoom = (switchRoomId: string) => {
  const r = sql().prepare("SELECT * FROM workspaces WHERE switch_room_id = ?").get(switchRoomId);
  return r ? row2ws(r) : null;
};
export const userWorkspaces = (userId: string) => (sql().prepare("SELECT * FROM workspaces WHERE owner_id = ? ORDER BY created_at, rowid").all(userId) as any[]).map(row2ws);
function save(w: Workspace) {
  sql().prepare("UPDATE workspaces SET name = ?, switch_room_id = ?, chat_id = ?, topics = ?, status = ?, detail = ? WHERE id = ?")
    .run(w.name, w.switchRoomId, w.chatId, JSON.stringify(w.topics), w.status, w.detail, w.id);
}

/** The workspace a request acts on: `?ws=` (must be the user's), else the user's first ready one, else their first.
 *  `userId` null = ADMIN_TOKEN: any workspace. */
export function resolveWs(userId: string | null, param: string | null): Workspace {
  if (param) {
    const w = getWs(param);
    if (!w || (userId && w.ownerId !== userId)) throw new AuthError(403, "not your workspace");
    return w;
  }
  const all = userId ? userWorkspaces(userId) : (sql().prepare("SELECT * FROM workspaces ORDER BY created_at, rowid").all() as any[]).map(row2ws);
  const w = all.find((x) => x.status === "ready") ?? all[0];
  if (!w) throw new AuthError(404, "no workspace yet: connect a Telegram group at /connect");
  return w;
}

// ---- link codes ----
export function issueCode(user: User) {
  const now = Date.now();
  const n = Number((sql().prepare("SELECT COUNT(*) n FROM link_codes WHERE user_id = ? AND created_at > ?").get(user.id, now - 3_600_000) as { n: number }).n);
  if (n >= CODES_PER_HOUR) throw new AuthError(429, `at most ${CODES_PER_HOUR} codes an hour`);
  sql().prepare("UPDATE link_codes SET expires_at = ? WHERE user_id = ? AND used_at IS NULL AND expires_at > ?").run(now, user.id, now);
  let code: string;
  do code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  while (liveCode(code)); // unique among live codes
  const expiresAt = now + CODE_TTL;
  sql().prepare("INSERT INTO link_codes (code_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(sha(code), user.id, now, expiresAt);
  return { code, botUsername: BOT_USERNAME, expiresAt };
}
const liveCode = (code: string) =>
  sql().prepare("SELECT id, user_id FROM link_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?").get(sha(code), Date.now()) as { id: number; user_id: string } | undefined;

export function connectStatus(user: User) {
  const c = sql().prepare("SELECT * FROM link_codes WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(user.id) as any;
  if (!c) return { state: "expired", detail: "no code yet" };
  const w = c.workspace_id ? getWs(c.workspace_id) : null;
  if (w) return { state: w.status, workspace: publicWs(w), ...(w.detail ? { detail: w.detail } : {}) };
  if (c.used_at || c.expires_at <= Date.now()) return { state: "expired", ...(c.detail ? { detail: c.detail } : {}) };
  return { state: "waiting", ...(c.detail ? { detail: c.detail } : {}) };
}

const observerIn = new Set<string>(); // Switch rooms the observer was joined to by watchRooms
/** While any code is live, joins d2c-observer to every Telegram room of the Switch server that no workspace has yet:
 *  a group the bot was just added to is a new room with no agents, so the code sent there would go unseen. */
export async function watchRooms() {
  if (!sql().prepare("SELECT 1 FROM link_codes WHERE used_at IS NULL AND expires_at > ? LIMIT 1").get(Date.now())) return;
  const rooms: { id: string; bridge_type?: string }[] = await gw("GET", "/rooms");
  const fresh = rooms.filter((r) => r.bridge_type === "telegram" && !observerIn.has(r.id) && !wsByRoom(r.id));
  if (!fresh.length) return;
  const obs = (await switchAgents()).find((a) => a.name === "d2c-observer");
  if (!obs) return log.warn("d2c-observer is not registered in Switch: run scripts/switch-up.sh");
  for (const r of fresh) {
    await joinRoom(r.id, obs.id);
    observerIn.add(r.id);
  }
}

// Guessing a code (1e6 of them): at most 10 wrong per Switch room per 10 min, 30 wrong per minute on the whole host
// (then codes are ignored until the minute is over), and every live code is voided once 20 wrong codes were tried
// anywhere during its life. Only short messages are checked: a code is sent on its own.
const ROOM_MISSES = 10;
const MISSES_PER_MIN = 30;
const CODE_MISS_BUDGET = 20;
const misses = new Map<string, { n: number; reset: number }>(); // per room; entries only for rooms that guessed
let minute = { n: 0, reset: 0 };
/** The live code in `text` (6 digits on their own), if any. */
function findCode(text: string, room: string) {
  const cands = text.length <= 64 ? [...text.matchAll(/(?<!\d)\d{6}(?!\d)/g)].map((m) => m[0]) : [];
  if (!cands.length) return null;
  const now = Date.now();
  if (now >= minute.reset) minute = { n: 0, reset: now + 60_000 };
  for (const [k, v] of misses) if (now >= v.reset) misses.delete(k);
  for (const cand of cands) {
    const m = misses.get(room) ?? { n: 0, reset: now + 600_000 };
    if (m.n >= ROOM_MISSES || minute.n >= MISSES_PER_MIN) return null;
    const c = liveCode(cand);
    if (c) return c;
    m.n++;
    minute.n++;
    misses.set(room, m);
    sql().prepare("UPDATE link_codes SET misses = misses + 1 WHERE used_at IS NULL AND expires_at > ?").run(now);
    sql().prepare("UPDATE link_codes SET expires_at = ?, detail = ? WHERE used_at IS NULL AND expires_at > ? AND misses >= ?")
      .run(now, "Too many wrong codes were tried in Telegram; get a new code.", now, CODE_MISS_BUDGET);
  }
  return null;
}

/** POST /api/events from the observer. Returns the event to store + broadcast (with `ws`), or null when the room
 *  belongs to no workspace (then it is only recorded as a link attempt, and may link the room). */
export async function ingest(ev: OfficeEvent): Promise<{ event: OfficeEvent | null; linked?: string }> {
  const meta = (ev.meta ?? {}) as Record<string, unknown>;
  const room = typeof meta.switch_room_id === "string" ? meta.switch_room_id : "";
  const text = String(ev.text ?? "");
  const mapped = room ? wsByRoom(room) : null;
  if (mapped) {
    const code = findCode(text, room);
    if (code && code.user_id === mapped.ownerId) take(code) && bind(code, mapped); // re-sent in their own group: confirms it
    else if (code) refuse(code, ALREADY_LINKED);
    if (mapped.status !== "ready") void setup(mapped.id);
    // Topic → department: the workspace's own map (by Switch thread id); otherwise keep the observer's guess.
    const t = Object.entries(mapped.topics).find(([, v]) => v.switchThreadId && v.switchThreadId === meta.switch_thread_id);
    const out = { ...ev, ws: mapped.id } as OfficeEvent;
    if (t) Object.assign(out, { room: t[0], meta: { ...meta, ...(t[1].threadId ? { thread_id: t[1].threadId } : {}) } });
    return { event: out };
  }
  if (!room) return { event: null };
  const name = typeof meta.room_name === "string" ? meta.room_name.replace(/^Telegram:\s*/i, "").trim().slice(0, 128) : "";
  let chatId = typeof meta.chat_id === "string" || typeof meta.chat_id === "number" ? String(meta.chat_id) : null;
  const code = findCode(text, room);
  sql().prepare("INSERT INTO link_attempts (switch_room_id, room_name, chat_id, at, matched) VALUES (?, ?, ?, ?, ?)").run(room, name, chatId, Date.now(), code ? 1 : 0);
  sql().prepare("DELETE FROM link_attempts WHERE seq <= (SELECT MAX(seq) FROM link_attempts) - 1000").run();
  // Claim the code before any await: two groups sending it at once can't both link.
  if (!code || !take(code)) return { event: null };

  chatId ??= await roomChatId(room).catch(() => null);
  if (chatId && !GROUP_CHAT.test(chatId)) return refuse(code, NOT_GROUP), { event: null }; // a private chat
  if (wsByRoom(room)) return refuse(code, ALREADY_LINKED), { event: null }; // linked meanwhile
  const sameChat = chatId ? (sql().prepare("SELECT * FROM workspaces WHERE chat_id = ?").get(chatId) as any) : null;
  if (sameChat) {
    const w = row2ws(sameChat);
    if (w.ownerId !== code.user_id) return refuse(code, ALREADY_LINKED), { event: null };
    w.switchRoomId = room; // Switch re-created the room for the same group: follow it
    save(w);
    bind(code, w);
    void setup(w.id);
    return { event: null, linked: w.id };
  }
  const w: Workspace = {
    id: `ws_${randomUUID().replace(/-/g, "").slice(0, 16)}`, name: name || "Telegram group", switchRoomId: room, chatId, ownerId: code.user_id,
    topics: {}, status: "linking", createdAt: Date.now(), detail: null,
  };
  sql().prepare("INSERT INTO workspaces (id, name, switch_room_id, chat_id, owner_id, topics, status, created_at) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)")
    .run(w.id, w.name, room, chatId, w.ownerId, w.status, w.createdAt);
  bind(code, w);
  log.info("workspace linked", { ws: w.id, owner: w.ownerId });
  void setup(w.id);
  return { event: null, linked: w.id };
}

const ALREADY_LINKED = "That Telegram group is already linked to another account.";
const NOT_GROUP = "Only Telegram groups can be linked.";
const GROUP_CHAT = /^-\d+$/; // Telegram: groups and supergroups have negative ids, private chats positive
/** Not a group after all (Bot API): drop the workspace and give the code back. */
function reject(w: Workspace) {
  sql().prepare("UPDATE link_codes SET used_at = NULL, workspace_id = NULL, detail = ? WHERE workspace_id = ?").run(NOT_GROUP, w.id);
  sql().prepare("DELETE FROM workspaces WHERE id = ?").run(w.id);
  log.warn("link refused: not a Telegram group", { ws: w.id });
}
/** Marks the code used, atomically: true only for the one caller that got it. */
const take = (code: { id: number }) =>
  Number(sql().prepare("UPDATE link_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").run(Date.now(), code.id).changes) === 1;
const bind = (code: { id: number }, w: Workspace) => sql().prepare("UPDATE link_codes SET workspace_id = ? WHERE id = ?").run(w.id, code.id);
/** The code can't link this group: give it back (still usable elsewhere) with the reason for /connect/status. */
const refuse = (code: { id: number }, detail: string) =>
  sql().prepare("UPDATE link_codes SET used_at = NULL, detail = ? WHERE id = ? AND workspace_id IS NULL").run(detail, code.id);

// ---- Telegram Bot API (read-only checks + forum topics; never getUpdates: Switch polls the bot) ----
function botToken(): string {
  if (env.TELEGRAM_BOT_TOKEN) return env.TELEGRAM_BOT_TOKEN;
  try {
    const line = readFileSync(env.ENV_FILE || join(ROOT, ".env"), "utf8").split("\n").find((l) => l.startsWith("TELEGRAM_BOT_TOKEN="));
    if (line) return line.slice(19).trim().replace(/^["']|["']$/g, "");
  } catch {}
  throw new Error("TELEGRAM_BOT_TOKEN is not set on the server");
}
async function tg(method: string, params: Record<string, unknown>): Promise<{ ok: boolean; result?: any; description?: string; parameters?: any }> {
  try {
    const res = await fetch(`${TG_API}/bot${botToken()}/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(params), signal: AbortSignal.timeout(15_000),
    });
    return await res.json();
  } catch (e) {
    if (String((e as Error).message).startsWith("TELEGRAM_BOT_TOKEN")) throw e;
    throw new Error(`Telegram ${method} unreachable`); // never the URL: it holds the token
  }
}

/** Topics + legacy events/hires of the pre-v3 "Kratos D2C" setup, once, for the group whose Telegram chat id is the
 *  one in observer/topics.json (or LEGACY_CHAT_ID). Never by name: anyone can name a group "Kratos D2C". */
function adoptLegacyIfMatch(w: Workspace) {
  if (kvGet("legacy_ws")) return;
  let file: { chat_id?: string; topics?: Record<string, { message_thread_id: number; switch_thread_id?: string | null }> } = {};
  try {
    file = JSON.parse(readFileSync(env.TOPICS_FILE || join(ROOT, "observer/topics.json"), "utf8"));
  } catch {}
  const legacyChat = env.LEGACY_CHAT_ID || file.chat_id;
  if (!legacyChat || String(legacyChat) !== w.chatId) return;
  for (const [room, t] of Object.entries(file.topics ?? {}))
    w.topics[room] ??= { threadId: t.message_thread_id ?? null, switchThreadId: t.switch_thread_id ?? null };
  kvSet("legacy_ws", w.id);
  const moved = adoptLegacy(w.id);
  save(w);
  log.info("legacy Kratos D2C data adopted", { ws: w.id, events: moved });
}

const running = new Set<string>();
/** Brings a linked workspace to ready. Idempotent; re-run on each message from its room until ready. */
export async function setup(id: string) {
  if (running.has(id)) return;
  running.add(id);
  const w = getWs(id);
  if (!w) return void running.delete(id);
  try {
    w.chatId ??= await roomChatId(w.switchRoomId);
    if (!w.chatId) throw new Error("Switch has no Telegram chat for this room yet");
    if (!GROUP_CHAT.test(w.chatId)) return reject(w);
    // (a) a group (not a private chat or channel), a forum, and the bot an admin that may manage topics
    let chat = await tg("getChat", { chat_id: w.chatId });
    const moved = chat.parameters?.migrate_to_chat_id ?? chat.result?.migrate_to_chat_id;
    if (moved) {
      w.chatId = String(moved);
      chat = await tg("getChat", { chat_id: w.chatId });
    }
    if (chat.ok && chat.result?.type !== "group" && chat.result?.type !== "supergroup") return reject(w);
    adoptLegacyIfMatch(w);
    const member = chat.ok ? await tg("getChatMember", { chat_id: w.chatId, user_id: Number(botToken().split(":")[0]) }) : null;
    const m = member?.result ?? {};
    const admin = m.status === "creator" || (m.status === "administrator" && m.can_manage_topics);
    if (!chat.ok || !chat.result?.is_forum || !admin) {
      w.status = "needs_admin";
      w.detail = [
        !chat.ok && `@${BOT_USERNAME} can't see this group yet.`,
        chat.ok && !chat.result?.is_forum && "Turn Topics on (group → Edit → Topics).",
        !admin && `Make @${BOT_USERNAME} an admin with "Manage topics" on.`,
        "Then send any message in the group.",
      ].filter(Boolean).join(" ");
      return save(w);
    }
    if (w.status !== "linking" || w.detail) (w.status = "linking"), (w.detail = null), save(w);
    // (b) the 6 topics, idempotently: a stored topic that still exists is kept (renaming to its own name is a no-op)
    for (const [room, name, color] of TOPICS) {
      const t = w.topics[room];
      if (t?.threadId) {
        const r = await tg("editForumTopic", { chat_id: w.chatId, message_thread_id: t.threadId, name });
        if (r.ok || /NOT_MODIFIED/.test(r.description ?? "")) continue;
      }
      const r = await tg("createForumTopic", { chat_id: w.chatId, name, icon_color: color });
      if (!r.ok) throw new Error(`createForumTopic ${name}: ${r.description ?? "failed"}`);
      w.topics[room] = { threadId: r.result.message_thread_id, switchThreadId: null };
      save(w);
    }
    // (c) the team, the observer and the office console into the Switch room
    const joined = await joinAgents(w.switchRoomId, [...TEAM, "d2c-observer", OFFICE_AGENT]);
    if (joined.length < TEAM.length + 1) log.warn("some agents don't exist in Switch yet", { ws: w.id, joined });
    w.status = "ready";
    w.detail = null;
    save(w);
    log.info("workspace ready", { ws: w.id });
  } catch (e) {
    log.warn("workspace setup incomplete, retrying on the next message", { ws: id, error: (e as Error).message });
    w.detail = "Setup is not finished yet; it retries when the next message arrives in the group.";
    save(w);
  } finally {
    running.delete(id);
  }
}
