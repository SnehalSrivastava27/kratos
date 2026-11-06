// Pure event → scene reducer (PLAN §9.6). No runtime imports so it runs under plain node for the check.
import type { AgentState, OfficeEvent, Person } from '../shared/types';

export interface PersonState {
  state: AgentState; // logical state; Character shows 'walking' while in transit
  zone: string; // where they end up
  route: string[]; // zones to walk through, last = zone
  routeId?: string; // changes whenever a new walk starts
  bubble?: { id: string; text: string; t: number };
  jumpId?: string; // changes → jump once
  beacon?: string; // banner text while waiting
}

export interface SceneState {
  people: Record<string, PersonState>;
  gallery: string[];
  pinPulseId?: string;
  boxId?: string;
  confettiId?: string;
}

export interface Ctx { roster: Person[]; roomZone: Record<string, string> }

const BUBBLE_CHARS = 80;
const IDLE_ZONE = 'chai_pantry';

export function initialState({ roster }: Ctx): SceneState {
  const people: Record<string, PersonState> = {};
  for (const p of roster) {
    // Founder and captain start at their posts; everyone else idles in the pantry until assigned.
    const zone = p.kind === 'human' || p.id === 'd2c-captain' ? p.zone : IDLE_ZONE;
    people[p.id] = { state: 'idle', zone, route: [] };
  }
  return { people, gallery: [] };
}

export function reduce(events: OfficeEvent[], ctx: Ctx): SceneState {
  const s = initialState(ctx);
  const home = Object.fromEntries(ctx.roster.map((p) => [p.id, p.zone]));
  const name = Object.fromEntries(ctx.roster.map((p) => [p.id, p.name]));
  const walk = (id: string, route: string[], evId: string) => {
    const p = s.people[id];
    if (!route.length || (route.length === 1 && route[0] === p.zone)) return;
    p.route = route;
    p.zone = route[route.length - 1];
    p.routeId = evId;
  };

  for (const e of events) {
    const sp = s.people[e.speaker];
    if (!sp) continue; // unknown speaker: ignore rather than crash
    const roomZone = ctx.roomZone[e.room] ?? sp.zone;
    const targets = (e.meta?.targets ?? []).filter((t) => s.people[t]);
    walk(e.speaker, [roomZone], e.id);
    for (const p of Object.values(s.people)) p.bubble = undefined; // one bubble on screen at a time
    sp.bubble = { id: e.id, t: e.t, text: e.text.length > BUBBLE_CHARS ? e.text.slice(0, BUBBLE_CHARS - 1) + '…' : e.text };

    switch (e.type) {
      case 'assign':
        sp.state = 'working';
        walk(e.speaker, [...targets.map((t) => home[t]), roomZone], e.id); // desk-to-desk tour
        for (const t of targets) {
          s.people[t].state = 'working';
          walk(t, [home[t]], e.id);
        }
        break;
      case 'working':
      case 'message':
        if (sp.state === 'idle' && e.type === 'working') sp.state = 'working';
        break;
      case 'done':
      case 'artifact':
        sp.state = 'done';
        sp.jumpId = e.id;
        sp.beacon = undefined;
        if (e.type === 'artifact' && e.meta?.artifact_url) s.gallery.push(e.meta.artifact_url);
        break;
      case 'pushback':
        sp.state = 'working';
        for (const t of targets) {
          s.people[t].state = 'waiting';
          s.people[t].beacon = `${name[e.speaker]} pushed back on ${name[t]}`;
        }
        break;
      case 'approved':
        sp.state = 'done';
        sp.jumpId = e.id;
        for (const t of targets) s.people[t].beacon = undefined;
        break;
      case 'approval_needed': {
        sp.state = 'waiting';
        const who = targets.map((t) => (ctx.roster.find((p) => p.id === t)?.kind === 'human' ? 'the founder' : name[t]));
        sp.beacon = `${name[e.speaker]} needs ${who.join(', ') || 'the founder'}`;
        break;
      }
      case 'celebrate':
        s.confettiId = e.id;
        for (const p of Object.values(s.people)) {
          p.state = 'done';
          p.jumpId = e.id;
          p.beacon = undefined;
        }
        break;
    }
    if (e.meta?.transfers?.length) s.pinPulseId = s.boxId = e.id;
  }
  return s;
}
