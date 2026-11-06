// Office actions (contracts/api.md "Office actions (v2)"): POST /api/command, GET /api/people, GET/POST /api/employees.
// v3: every call is scoped to one workspace (ctx.ws); index.ts has already checked the session (or ADMIN_TOKEN) owns it.
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getWs, type Workspace } from "./workspaces.js";
import { listEmployees, saveEmployee, deleteEmployee, type Employee, type OfficeEvent } from "./store.js";
import { postAsOffice, createManagedAgent, storeHireTemplate, activate, findAgent, switchAgents, removeAgent, SwitchError, OFFICE_AGENT, type HireSpec } from "./switch.js";
import { loadLibrary } from "./library/index.js";
import { log } from "./log.js";

type Person = { id: string; name: string; kind: string; zone: string; emoji?: string; color?: string; topic?: string; role?: string; lead?: boolean; reports_to?: string };
type Room = { id: string; label: string; zone: string; topic?: string; internal?: boolean };
export type OfficeCtx = {
  root: string;
  roster: { people: Person[]; rooms: Room[]; telegram?: { group?: string } };
  ws: Workspace;
  readJson: () => Promise<any>;
  send: (status: number, body: unknown) => void;
  emit: (e: Omit<OfficeEvent, "id">) => void;
};

const env = process.env;
const COMMANDS_PER_MIN = 10;
const HIRE_MAX = Number(env.HIRE_MAX) || 24; // employees on the floor at once
const HIRES_PER_10_MIN = 3;
const PALETTE = ["#0EA5E9", "#14B8A6", "#F97316", "#E11D48", "#84CC16", "#6366F1", "#A855F7", "#EAB308"];
/** The team's Telegram writing rules, shared with switch/agents/*.md (read per hire, so edits apply to the next hire). */
const telegramStyle = (root: string) => readFileSync(join(root, "switch/TELEGRAM_STYLE.md"), "utf8").trim();

const bad = (msg: string): never => {
  throw new SwitchError(400, msg);
};
// Control chars and invisible/bidi overrides out (they'd smuggle text into an agent's prompt or spoof a name).
// Multiline fields keep \n and \t; ZWJ stays so emoji sequences survive.
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
export const str = (v: unknown, field: string, min: number, max: number, multiline = false) => {
  if (typeof v !== "string") return bad(`${field}: string of ${min}–${max} chars`);
  let clean = v.replace(INVISIBLE, "");
  clean = (multiline ? clean.replace(/\r\n?/g, "\n") : clean.replace(/\s+/g, " ")).trim();
  if (clean.length < min || clean.length > max) bad(`${field}: string of ${min}–${max} chars`);
  return clean;
};

const cmdWindows = new Map<string, { reset: number; n: number }>(); // per workspace: its founder's console

/** The text as posted: a topic hashtag when Switch has no thread for the topic yet, and the room's lead agent
 *  addressed when the founder named nobody (Switch agents only act on messages that address them). */
export function commandBody(ctx: Pick<OfficeCtx, "roster">, room: Room, text: string, threaded: boolean, extra: Person[] = []) {
  const agents = [...ctx.roster.people, ...extra].filter((p) => p.kind === "agent");
  const named = agents.some((p) => new RegExp(`@${p.id}\\b`, "i").test(text));
  const inRoom = agents.filter((p) => p.topic === (room.topic ?? room.label) && p.id !== "librarian");
  const lead = inRoom.find((p) => p.lead) ?? inRoom[0];
  const tag = threaded ? "" : `#${(room.topic ?? room.label).replace(/\W+/g, "")} `;
  return `${tag}${!named && lead ? `@${lead.id} ` : ""}${text}`;
}

const slug = (name: string) =>
  name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "employee";
const reserved = new Set<string>(); // ids being hired right now (the Switch calls are async)

/** Unique person id: d2c-<slug>, then -2, -3… past roster people, employees, in-flight hires and Switch agents. */
export function newId(ctx: Pick<OfficeCtx, "roster">, name: string, inSwitch: string[] = []) {
  const taken = new Set([...ctx.roster.people.map((p) => p.id), ...listEmployees().map((e) => e.id), ...reserved, ...inSwitch, OFFICE_AGENT, "d2c-observer"]);
  const stem = `d2c-${slug(name)}`;
  let id = stem;
  for (let i = 2; taken.has(id); i++) id = `${stem}-${i}`;
  return id;
}

/** zone#index: roster people in the zone take 0..k-1, employees the next free index. */
export function desk(ctx: Pick<OfficeCtx, "roster" | "ws">, zone: string) {
  const used = new Set(listEmployees(ctx.ws.id).map((e) => e.desk));
  let i = ctx.roster.people.filter((p) => p.zone === zone).length;
  while (used.has(`${zone}#${i}`)) i++;
  return `${zone}#${i}`;
}

export const employeePerson = (e: Employee, rooms: Room[]) => {
  const room = rooms.find((r) => r.id === e.room);
  return {
    id: e.id, name: e.name, emoji: e.emoji, kind: "agent", zone: e.desk.split("#")[0], color: e.color, topic: room?.topic ?? room?.label, role: e.role,
    ...(e.reports_to ? { reports_to: e.reports_to } : {}), desk: e.desk, hiredAt: e.hiredAt, status: e.status,
  };
};
const publicEmployee = ({ instructions: _i, skills: _s, ws: _w, ...e }: Employee) => e;

function instructionsFor(e: { name: string; role: string; instructions: string; skills: string[]; reportsTo: string | null }, room: Room, group: string, root: string) {
  const topic = room.topic ?? room.label;
  return [
    `You are ${e.name}, ${e.role} at Kesar & Co., a D2C skincare brand. You were just hired from the office screen.`,
    e.instructions,
    e.skills.length ? `Skills from the office library to use when relevant: ${e.skills.join(", ")}.` : "",
    telegramStyle(root),
    `The Telegram group "${group}" has one topic per department; yours is ${topic}. ` +
      `Reply in the topic that addressed you (use that message's thread). Report to @${e.reportsTo ?? "d2c-captain"}.`,
  ].filter(Boolean).join("\n\n");
}

export const credsFile = (root: string) => env.SWITCH_OFFICE_CREDS || join(root, ".switch/agents/d2c-office.json");
const agentDir = (root: string) => env.AGENT_DIR || root; // the repo; operator-set only, never from a request
const hireTimes = new Map<string, number[]>(); // per workspace

/** Flip pending_console hires to active once Console has created the agent (template fallback). */
export async function syncPending() {
  for (const e of listEmployees().filter((x) => x.status === "pending_console")) {
    const ws = e.ws ? getWs(e.ws) : null;
    const id = ws && (await findAgent(e.id));
    if (!ws || !id) continue;
    await activate(id, ws.switchRoomId);
    saveEmployee({ ...e, switchAgentId: id, status: "active" });
    log.info("employee active", { id: e.id });
  }
}

export async function handleOffice(req: IncomingMessage, url: URL, ctx: OfficeCtx): Promise<boolean> {
  const route = `${req.method === "HEAD" ? "GET" : req.method} ${url.pathname}`;
  const rooms = ctx.roster.rooms;
  const ws = ctx.ws;

  if (route === "GET /api/people") {
    ctx.send(200, [...ctx.roster.people, ...listEmployees(ws.id).map((e) => employeePerson(e, rooms))]);
    return true;
  }
  if (route === "GET /api/employees") {
    ctx.send(200, listEmployees(ws.id).map(publicEmployee));
    return true;
  }
  const fire = req.method === "DELETE" && url.pathname.match(/^\/api\/employees\/([\w-]+)$/);
  if (route !== "POST /api/command" && route !== "POST /api/employees" && !fire) return false;

  if (fire) {
    const e = listEmployees(ws.id).find((x) => x.id === fire[1]);
    if (!e) throw new SwitchError(404, `no employee ${fire[1]}`);
    const agentId = e.switchAgentId ?? (await findAgent(e.id));
    if (agentId) await removeAgent(agentId);
    deleteEmployee(e.id); // frees the desk: desk() only counts current employees
    log.info("employee fired", { id: e.id });
    ctx.send(200, { ok: true, id: e.id });
    return true;
  }

  if (route === "POST /api/command") {
    const body = await ctx.readJson();
    const room = rooms.find((r) => r.id === body.room) ?? bad(`room: one of ${rooms.map((r) => r.id).join(", ")}`);
    const text = str(body.text, "text", 1, 2000, true);
    if (ws.status !== "ready") throw new SwitchError(409, "this workspace is still being set up");
    const now = Date.now(); // only valid commands count
    let w = cmdWindows.get(ws.id);
    if (!w || now >= w.reset) cmdWindows.set(ws.id, (w = { reset: now + 60_000, n: 0 }));
    if (++w.n > COMMANDS_PER_MIN) throw new SwitchError(429, `max ${COMMANDS_PER_MIN} commands a minute`);
    const threadId = ws.topics[room.id]?.switchThreadId ?? null;
    const people = listEmployees(ws.id).map((e) => employeePerson(e, rooms));
    await postAsOffice({ credsFile: credsFile(ctx.root), roomId: ws.switchRoomId, body: commandBody(ctx, room, text, !!threadId, people), threadId });
    ctx.send(202, { ok: true, via: `switch:${OFFICE_AGENT}`, thread: threadId ? "topic" : "group" });
    return true;
  }

  // POST /api/employees
  const b = await ctx.readJson();
  const name = str(b.name, "name", 1, 40);
  if (!/[\p{L}\p{N}]/u.test(name)) bad("name: needs a letter or digit");
  const role = str(b.role, "role", 1, 80);
  const depts = rooms.filter((r) => !r.internal); // nobody is hired into the QA Lab
  const room = depts.find((r) => r.id === b.room) ?? bad(`room: one of ${depts.map((r) => r.id).join(", ")}`);
  const instructions = str(b.instructions, "instructions", 1, 4000, true);
  const leads = ctx.roster.people.filter((p) => p.kind === "agent" && p.lead && p.topic === (room.topic ?? room.label));
  if (b.reports_to !== undefined && b.reports_to !== null && !leads.some((p) => p.id === b.reports_to))
    bad(`reports_to: a lead of ${room.label}${leads.length ? ` (${leads.map((p) => p.id).join(", ")})` : ""}`);
  const reportsTo: string | null = b.reports_to ?? null;
  const emoji = b.emoji === undefined ? "🧑‍💼" : str(b.emoji, "emoji", 1, 16);
  if (b.color !== undefined && !/^#[0-9a-f]{6}$/i.test(String(b.color))) bad("color: #rrggbb");
  if (b.skills !== undefined && (!Array.isArray(b.skills) || b.skills.length > 20 || b.skills.some((s: unknown) => typeof s !== "string" || !s || s.length > 200)))
    bad("skills: up to 20 library book ids");
  const skills: string[] = b.skills ?? [];
  const books = new Set(loadLibrary().shelves.flatMap((sh) => sh.books.map((x) => x.id)));
  const unknown = skills.find((sk) => !books.has(sk));
  if (unknown !== undefined) bad(`skills: "${unknown.slice(0, 60)}" is not in the library`);
  if (listEmployees().length + reserved.size >= HIRE_MAX) throw new SwitchError(429, `the office is full: ${HIRE_MAX} employees max (HIRE_MAX). Fire someone first.`);
  if (ws.status !== "ready") throw new SwitchError(409, "this workspace is still being set up");
  const now = Date.now();
  const times = (hireTimes.get(ws.id) ?? []).filter((t) => now - t < 600_000);
  hireTimes.set(ws.id, times);
  if (times.length >= HIRES_PER_10_MIN)
    throw new SwitchError(429, `max ${HIRES_PER_10_MIN} hires per 10 minutes; next one in ${Math.ceil((times[0] + 600_000 - now) / 60_000)} min`);
  times.push(now);
  const id = newId(ctx, name, (await switchAgents()).map((a) => a.name));
  reserved.add(id);
  try {
    const spec: HireSpec = { id, displayName: name, description: role, instructions: instructionsFor({ name, role, instructions, skills, reportsTo }, room, ws.name, ctx.root), directory: agentDir(ctx.root) };
    const roomName = ws.name;
    const roomId = ws.switchRoomId;
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
      id, name, role, room: room.id, emoji, color: b.color ?? PALETTE[listEmployees(ws.id).length % PALETTE.length],
      desk: desk(ctx, room.zone), hiredAt: Date.now(), switchAgentId, status: active ? "active" : "pending_console", instructions, skills, ws: ws.id, reports_to: reportsTo,
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
