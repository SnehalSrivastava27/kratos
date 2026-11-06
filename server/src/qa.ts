// QA Lab API for evals (contracts/api.md v4, ADMIN_TOKEN only; index.ts checks it): ask an agent a question in a
// workspace's QA Lab topic through Switch, then read what came back.
import { randomUUID } from "node:crypto";
import { resolveWs } from "./workspaces.js";
import { listEmployees, recent, roomEvents, RING_MAX } from "./store.js";
import { postAsOffice, SwitchError } from "./switch.js";
import { str, credsFile } from "./office.js";

const QA_ROOM = "qa_lab";
const PER_MIN = Number(process.env.QA_PER_MIN) || 30;
const windows = new Map<string, { reset: number; n: number }>(); // per workspace

type Ctx = { root: string; roster: { people: { id: string; kind: string }[] }; url: URL; readJson: () => Promise<any>; send: (status: number, body: unknown) => void };
const bad = (msg: string): never => {
  throw new SwitchError(400, msg);
};
/** Roster agents that are Switch agents (not the Librarian), plus the workspace's hires. */
const isAgent = (ctx: Ctx, ws: string, id: unknown) =>
  typeof id === "string" && (ctx.roster.people.some((p) => p.id === id && p.kind === "agent" && p.id !== "librarian") || listEmployees(ws).some((e) => e.id === id));

export async function handleQa(method: string, path: string, ctx: Ctx): Promise<boolean> {
  if (method === "POST" && path === "/api/qa/ask") {
    const b = await ctx.readJson();
    const ws = resolveWs(null, typeof b.workspace === "string" ? b.workspace : null);
    if (!isAgent(ctx, ws.id, b.agent)) bad("agent: a roster agent id, e.g. d2c-analyst");
    const text = str(b.text, "text", 1, 1000, true);
    if (ws.status !== "ready") throw new SwitchError(409, "this workspace is still being set up");
    const now = Date.now();
    let w = windows.get(ws.id);
    if (!w || now >= w.reset) windows.set(ws.id, (w = { reset: now + 60_000, n: 0 }));
    if (++w.n > PER_MIN) throw new SwitchError(429, `max ${PER_MIN} QA asks a minute`);
    const threadId = ws.topics[QA_ROOM]?.switchThreadId ?? null;
    const sent = await postAsOffice({ credsFile: credsFile(ctx.root), roomId: ws.switchRoomId, body: `${threadId ? "" : "#QALab "}@${b.agent} ${text}`, threadId });
    ctx.send(202, { id: sent?.event_id ?? `qa-${randomUUID()}`, sentAt: now, workspace: ws.id, thread: threadId ? "topic" : "group" });
    return true;
  }
  if (method === "GET" && path === "/api/qa/replies") {
    const q = ctx.url.searchParams;
    const ws = resolveWs(null, q.get("workspace"));
    const agent = q.get("agent");
    if (agent !== null && !isAgent(ctx, ws.id, agent)) bad("agent: a roster agent id");
    const after = Number(q.get("after") ?? 0) || 0;
    // Until the QA Lab topic has a Switch thread, asks go to General and replies can't be told apart by topic:
    // then every event of the workspace counts (filter by `agent`).
    const threaded = !!ws.topics[QA_ROOM]?.switchThreadId;
    const events = threaded ? roomEvents(ws.id, QA_ROOM, RING_MAX) : recent(ws.id, RING_MAX);
    ctx.send(200, events.filter((e) => e.t > after && (agent === null || e.speaker === agent)));
    return true;
  }
  return false;
}
