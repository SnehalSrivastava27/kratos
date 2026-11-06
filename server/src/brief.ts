// The Captain's morning brief. Switch 0.31.0 has no scheduler, cron or trigger (survey: docs/switch/12-feature-survey.md),
// so the office server is the clock: at MORNING_BRIEF_AT (IST) it asks @d2c-captain, through Switch as d2c-office, for
// the day's brief in the War Room topic. Once per workspace per day (kv), only inside a 2-hour window so a restart at
// 3 PM doesn't send a "morning" brief. POST /api/brief asks for one now (demo, or a founder who wants it early).
import { allWorkspaces, type Workspace } from "./workspaces.js";
import { kvGet, kvSet } from "./store.js";
import { postAsOffice, SwitchError } from "./switch.js";
import { credsFile } from "./office.js";
import { log } from "./log.js";

const env = process.env;
const IST_MS = 330 * 60_000; // ponytail: the brand is Indian, so IST is fixed; a per-workspace tz if one ever isn't
const WINDOW_MIN = 120;

/** "HH:MM" → minutes after midnight (default 09:00). */
const at = () => {
  const m = (env.MORNING_BRIEF_AT ?? "09:00").match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 540;
};

/** The IST day ("2026-11-07") whose brief is due at `now`, or null outside the window. */
export function dueDay(now: number, atMin = at()): string | null {
  const ist = new Date(now + IST_MS);
  const min = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return min >= atMin && min < atMin + WINDOW_MIN ? ist.toISOString().slice(0, 10) : null;
}

export const briefBody = (day: string, threaded: boolean) =>
  `${threaded ? "" : "#WarRoom "}@d2c-captain ⏰ Morning brief for ${day}. Post today's morning brief in War Room, titled "Morning brief, <date>": ` +
  "yesterday's orders and revenue vs the day before, any stock at risk, ad spend and ROAS, " +
  "and the one decision the founder needs to make today. Facts only from data/, no assignments to leads.";

/** Posts the brief request into the workspace's War Room topic (top level with a #WarRoom tag if it has no thread yet). */
export async function sendBrief(root: string, ws: Workspace, day: string) {
  const threadId = ws.topics.war_room?.switchThreadId ?? null;
  await postAsOffice({ credsFile: credsFile(root), roomId: ws.switchRoomId, threadId, body: briefBody(day, !!threadId) });
  log.info("morning brief requested", { ws: ws.id, day });
}

/** One scheduler tick: every ready workspace whose brief is due and not yet sent today. */
export async function tick(root: string, now = Date.now()) {
  const day = dueDay(now);
  if (!day) return;
  for (const ws of allWorkspaces().filter((w) => w.status === "ready")) {
    const k = `brief:${ws.id}`;
    if (kvGet(k) === day) continue;
    kvSet(k, day); // before the post: a failed post is retried tomorrow, never twice today
    await sendBrief(root, ws, day).catch((e) => log.warn("morning brief failed", { ws: ws.id, error: String(e.message ?? e) }));
  }
}

/** Starts the scheduler unless MORNING_BRIEF=off. */
export function startBriefs(root: string) {
  if (env.MORNING_BRIEF === "off") return null;
  const t = setInterval(() => void tick(root), Number(env.BRIEF_TICK_MS) || 60_000);
  t.unref();
  return t;
}

const manual = new Map<string, number>(); // ws → last manual brief
/** POST /api/brief: one now, at most once a minute per workspace. */
export async function briefNow(root: string, ws: Workspace) {
  if (ws.status !== "ready") throw new SwitchError(409, "this workspace is still being set up");
  if (Date.now() - (manual.get(ws.id) ?? 0) < 60_000) throw new SwitchError(429, "one brief a minute");
  manual.set(ws.id, Date.now());
  const day = new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
  await sendBrief(root, ws, day);
  return { ok: true, day, via: "switch:d2c-office" };
}
