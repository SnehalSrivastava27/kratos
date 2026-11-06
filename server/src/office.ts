// Office actions (contracts/api.md "Office actions (v2)"): POST /api/command, GET /api/people, GET/POST /api/employees.
// Writes need ctx.isTrusted (loopback or ADMIN_TOKEN); reads are open like the other read APIs.
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listEmployees, saveEmployee, type Employee, type OfficeEvent } from "./store.js";
import { postAsOffice, createManagedAgent, storeHireTemplate, activate, findAgent, teamRoomId, SwitchError, OFFICE_AGENT, type HireSpec } from "./switch.js";
import { log } from "./log.js";

type Person = { id: string; name: string; kind: string; zone: string; emoji?: string; color?: string; topic?: string; role?: string };
type Room = { id: string; label: string; zone: string; topic?: string };
export type OfficeCtx = {
  root: string;
  roster: { people: Person[]; rooms: Room[]; telegram?: { group?: string } };
  isTrusted: boolean;
  readJson: () => Promise<any>;
  send: (status: number, body: unknown) => void;
  emit: (e: Omit<OfficeEvent, "id">) => void;
};

const env = process.env;
const COMMANDS_PER_MIN = 10;
const PALETTE = ["#0EA5E9", "#14B8A6", "#F97316", "#E11D48", "#84CC16", "#6366F1", "#A855F7", "#EAB308"];
/** The team's Telegram writing rules, shared with switch/agents/*.md (read per hire, so edits apply to the next hire). */
const telegramStyle = (root: string) => readFileSync(join(root, "switch/TELEGRAM_STYLE.md"), "utf8").trim();

const bad = (msg: string): never => {
  throw new SwitchError(400, msg);
};
const str = (v: unknown, field: string, min: number, max: number) => {
  if (typeof v !== "string" || v.trim().length < min || v.trim().length > max) bad(`${field}: string of ${min}–${max} chars`);
  return (v as string).trim();
};

/** observer/topics.json (written by scripts/switch-up.sh), re-read per call. Missing = no topics yet. */
function topics(root: string): { chat_id?: string; topics: Record<string, { name: string; switch_thread_id?: string | null }> } {
  try {
    return JSON.parse(readFileSync(env.TOPICS_FILE || join(root, "observer/topics.json"), "utf8"));
  } catch {
    return { topics: {} };
  }
}

let cmdWindow = { reset: 0, n: 0 }; // ponytail: one global window; this is the founder's console, not a public API

/** The text as posted: a topic hashtag when Switch has no thread for the topic yet, and the room's lead agent
 *  addressed when the founder named nobody (Switch agents only act on messages that address them). */
export function commandBody(ctx: Pick<OfficeCtx, "roster">, room: Room, text: string, threaded: boolean, extra: Person[] = []) {
  const agents = [...ctx.roster.people, ...extra].filter((p) => p.kind === "agent");
  const named = agents.some((p) => new RegExp(`@${p.id}\\b`, "i").test(text));
  const lead = agents.find((p) => p.topic === (room.topic ?? room.label) && p.id !== "librarian");
  const tag = threaded ? "" : `#${(room.topic ?? room.label).replace(/\W+/g, "")} `;
  return `${tag}${!named && lead ? `@${lead.id} ` : ""}${text}`;
}

const slug = (name: string) =>
  name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "employee";
const reserved = new Set<string>(); // ids being hired right now (the Switch calls are async)

/** Unique person id: d2c-<slug>, then -2, -3… past roster people, employees and in-flight hires. */
export function newId(ctx: Pick<OfficeCtx, "roster">, name: string) {
  const taken = new Set([...ctx.roster.people.map((p) => p.id), ...listEmployees().map((e) => e.id), ...reserved, OFFICE_AGENT, "d2c-observer"]);
  const stem = `d2c-${slug(name)}`;
  let id = stem;
  for (let i = 2; taken.has(id); i++) id = `${stem}-${i}`;
  return id;
}

/** zone#index: roster people in the zone take 0..k-1, employees the next free index. */
export function desk(ctx: Pick<OfficeCtx, "roster">, zone: string) {
  const used = new Set(listEmployees().map((e) => e.desk));
  let i = ctx.roster.people.filter((p) => p.zone === zone).length;
  while (used.has(`${zone}#${i}`)) i++;
  return `${zone}#${i}`;
}

export const employeePerson = (e: Employee, rooms: Room[]) => {
  const room = rooms.find((r) => r.id === e.room);
  return { id: e.id, name: e.name, emoji: e.emoji, kind: "agent", zone: e.desk.split("#")[0], color: e.color, topic: room?.topic ?? room?.label, role: e.role, desk: e.desk, hiredAt: e.hiredAt, status: e.status };
};
const publicEmployee = ({ instructions: _i, skills: _s, ...e }: Employee) => e;

function instructionsFor(e: { name: string; role: string; instructions: string; skills: string[] }, room: Room, roster: OfficeCtx["roster"], root: string) {
  const topic = room.topic ?? room.label;
  return [
    `You are ${e.name}, ${e.role} at Kesar & Co., a D2C skincare brand. You were just hired from the office screen.`,
    e.instructions,
    e.skills.length ? `Skills from the office library to use when relevant: ${e.skills.join(", ")}.` : "",
    telegramStyle(root),
    `The Telegram group "${roster.telegram?.group ?? "Kratos D2C"}" has one topic per department; yours is ${topic}. ` +
      `observer/topics.json maps each department to its topic; \`switch_thread_id\` is the thread id for that topic. ` +
      `Reply in the topic that addressed you (use that message's thread). Report to @d2c-captain.`,
  ].filter(Boolean).join("\n\n");
}

const credsFile = (root: string) => env.SWITCH_OFFICE_CREDS || join(root, ".switch/agents/d2c-office.json");
const agentDir = (root: string) => env.AGENT_DIR || root;

/** Flip pending_console hires to active once Console has created the agent (template fallback). */
export async function syncPending(ctx: Pick<OfficeCtx, "root" | "roster">) {
  const pending = listEmployees().filter((e) => e.status === "pending_console");
  if (!pending.length) return;
  const roomId = await teamRoomId(topics(ctx.root).chat_id, ctx.roster.telegram?.group ?? "Kratos D2C");
  for (const e of pending) {
    const id = await findAgent(e.id);
    if (!id) continue;
    await activate(id, roomId);
    saveEmployee({ ...e, switchAgentId: id, status: "active" });
    log.info("employee active", { id: e.id });
  }
}

export async function handleOffice(req: IncomingMessage, url: URL, ctx: OfficeCtx): Promise<boolean> {
  const route = `${req.method === "HEAD" ? "GET" : req.method} ${url.pathname}`;
  const rooms = ctx.roster.rooms;

  if (route === "GET /api/people") {
    ctx.send(200, [...ctx.roster.people, ...listEmployees().map((e) => employeePerson(e, rooms))]);
    return true;
  }
  if (route === "GET /api/employees") {
    ctx.send(200, listEmployees().map(publicEmployee));
    return true;
  }
  if (route !== "POST /api/command" && route !== "POST /api/employees") return false;
  if (!ctx.isTrusted) throw new SwitchError(401, "unauthorized");

  if (route === "POST /api/command") {
    const now = Date.now();
    if (now >= cmdWindow.reset) cmdWindow = { reset: now + 60_000, n: 0 };
    if (++cmdWindow.n > COMMANDS_PER_MIN) throw new SwitchError(429, "rate limited");
    const body = await ctx.readJson();
    const room = rooms.find((r) => r.id === body.room) ?? bad(`room: one of ${rooms.map((r) => r.id).join(", ")}`);
    const text = str(body.text, "text", 1, 2000);
    const t = topics(ctx.root);
    const threadId = t.topics[room.id]?.switch_thread_id ?? null;
    const people = listEmployees().map((e) => employeePerson(e, rooms));
    await postAsOffice({ credsFile: credsFile(ctx.root), chatId: t.chat_id, roomName: ctx.roster.telegram?.group ?? "Kratos D2C", body: commandBody(ctx, room, text, !!threadId, people), threadId });
    ctx.send(202, { ok: true, via: `switch:${OFFICE_AGENT}`, thread: threadId ? "topic" : "group" });
    return true;
  }

  // POST /api/employees
  const b = await ctx.readJson();
  const name = str(b.name, "name", 1, 40);
  if (!/[\p{L}\p{N}]/u.test(name)) bad("name: needs a letter or digit");
  const role = str(b.role, "role", 1, 80);
  const room = rooms.find((r) => r.id === b.room) ?? bad(`room: one of ${rooms.map((r) => r.id).join(", ")}`);
  const instructions = str(b.instructions, "instructions", 1, 4000);
  const emoji = b.emoji === undefined ? "🧑‍💼" : str(b.emoji, "emoji", 1, 16);
  if (b.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(b.color))) bad("color: #rrggbb");
  if (b.skills !== undefined && (!Array.isArray(b.skills) || b.skills.length > 20 || b.skills.some((s: unknown) => typeof s !== "string" || !s || s.length > 200)))
    bad("skills: up to 20 library book ids");
  const skills: string[] = b.skills ?? [];
  const id = newId(ctx, name);
  reserved.add(id);
  try {
    const spec: HireSpec = { id, displayName: name, description: role, instructions: instructionsFor({ name, role, instructions, skills }, room, ctx.roster, ctx.root), directory: agentDir(ctx.root) };
    const roomName = ctx.roster.telegram?.group ?? "Kratos D2C";
    const roomId = await teamRoomId(topics(ctx.root).chat_id, roomName);
    let switchAgentId: string | null = null;
    let templateId: string | null = null;
    let active = false;
    try {
      switchAgentId = await createManagedAgent(spec);
      await activate(switchAgentId, roomId);
      active = true;
    } catch (e) {
      if (!(e instanceof SwitchError)) throw e;
      if (switchAgentId) log.warn("hired agent created but not joined yet; syncPending retries", { id, error: e.message });
      else {
        log.warn("managed agent create failed, storing a Console template instead", { id, error: e.message });
        templateId = await storeHireTemplate(spec, roomName);
      }
    }
    const employee: Employee = {
      id, name, role, room: room.id, emoji, color: b.color ?? PALETTE[listEmployees().length % PALETTE.length],
      desk: desk(ctx, room.zone), hiredAt: Date.now(), switchAgentId, status: active ? "active" : "pending_console", instructions, skills,
    };
    saveEmployee(employee);
    ctx.emit({ t: employee.hiredAt, room: room.id, speaker: id, type: "hired", text: `${emoji} ${name} joined as ${role}`, meta: { employee_id: id } });
    if (!templateId) ctx.send(201, publicEmployee(employee));
    else ctx.send(202, { employee: publicEmployee(employee), action: { kind: "open_url", url: `switchdash://open/template/${templateId}`, label: "Finish in Switch Console" } });
  } finally {
    reserved.delete(id);
  }
  return true;
}
