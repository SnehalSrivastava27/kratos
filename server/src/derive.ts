// Read models for the Telegram-style office UI: rooms and per-person state, derived from events.
import type { OfficeEvent } from "./store.js";

type Person = { id: string; name: string; kind: string; zone: string };
type Room = { id: string; label: string; zone: string; topic?: string };
export type Roster = { people: Person[]; rooms: Room[]; telegram?: { group?: string } };
type State = "idle" | "working" | "waiting" | "done";

const runOf = (id: string) => {
  const at = id.lastIndexOf("@");
  return at < 0 ? 0 : Number(id.slice(at + 1)) || 0;
};

/** Membership mirrors switch/d2c-team.template.yaml: humans and the captain join every room,
 *  every agent joins war_room and its home room (same zone). Anyone who spoke there is added too. */
export function rooms(roster: Roster, stats: Map<string, { count: number; last: OfficeEvent }>, events: OfficeEvent[]) {
  return roster.rooms.map((r) => {
    const members = new Set(
      roster.people.filter((p) => p.kind === "human" || p.id === "d2c-captain" || r.id === "war_room" || p.zone === r.zone).map((p) => p.id),
    );
    for (const e of events) if (e.room === r.id) members.add(e.speaker);
    const s = stats.get(r.id);
    return { id: r.id, label: r.label, group: roster.telegram?.group ?? "", topic: r.topic ?? r.label, members: [...members], last: s?.last ?? null, count: s?.count ?? 0 };
  });
}

/** Same rules as web/src/office/officeState.ts (minus walking). A newer replay run (`id@<run>`) resets. */
export function agents(roster: Roster, events: OfficeEvent[]) {
  const init = () => new Map(roster.people.map((p) => [p.id, { state: "idle" as State, last: null as OfficeEvent | null, room: null as string | null }]));
  let s = init();
  let run = 0;
  for (const e of events) {
    const r = runOf(e.id);
    if (r && r < run) continue;
    if (r > run) {
      s = init();
      run = r;
    }
    const sp = s.get(e.speaker);
    if (!sp) continue;
    sp.last = e;
    sp.room = e.room;
    const targets = ((e.meta as { targets?: string[] } | undefined)?.targets ?? []).map((t) => s.get(t)).filter((t) => t !== undefined);
    switch (e.type) {
      case "assign":
        sp.state = "working";
        for (const t of targets) t.state = "working";
        break;
      case "working":
        if (sp.state === "idle") sp.state = "working";
        break;
      case "done":
      case "artifact":
      case "approved":
        sp.state = "done";
        break;
      case "pushback":
        sp.state = "working";
        for (const t of targets) t.state = "waiting";
        break;
      case "approval_needed":
        sp.state = "waiting";
        break;
      case "celebrate":
        for (const p of s.values()) p.state = "done";
        break;
    }
  }
  return roster.people.map((p) => ({ id: p.id, name: p.name, kind: p.kind, ...s.get(p.id)! }));
}
