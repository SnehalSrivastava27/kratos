// /demo, playable: the viewer starts the story, and it waits at each approval for them to decide.
// The landing hero and the live office don't use this (they keep useEventFeed).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { OfficeEvent } from '../shared/types';
import { personById, roster, zoneById } from './data';
import { approvalFor, decide, nextGate, revision } from './demoScript';

export type DemoPhase = 'ready' | 'playing' | 'waiting' | 'done';
const LEAD_IN = 400; // ms from a click to the first event

export function useDemoDirector(feed: OfficeEvent[], on: boolean) {
  const [events, setEvents] = useState<OfficeEvent[]>([]);
  const [phase, setPhase] = useState<DemoPhase>('ready');
  const s = useRef({ at: 0, timers: [] as number[], t0: 0, rev: 0, phase: 'ready' as DemoPhase, revGate: null as OfficeEvent | null });
  const go = (p: DemoPhase) => setPhase((s.current.phase = p));
  const clear = () => {
    s.current.timers.forEach(clearTimeout);
    s.current.timers = [];
  };
  useEffect(() => {
    clear();
    Object.assign(s.current, { at: 0, rev: 0, t0: 0, revGate: null });
    setEvents([]);
    go('ready');
    return clear;
  }, [feed, on]);

  /** Push these, each `t` ms from now (re-stamped as time since the story started), then enter `then`. */
  const play = (list: OfficeEvent[], then: DemoPhase) => {
    go('playing');
    const last = list[list.length - 1]?.t ?? 0;
    for (const e of list)
      s.current.timers.push(window.setTimeout(() => setEvents((prev) => [...prev, { ...e, t: Date.now() - s.current.t0 }]), e.t + LEAD_IN));
    s.current.timers.push(window.setTimeout(() => go(then), last + LEAD_IN + 50));
  };
  const humans = () => new Set(roster.filter((p) => p.kind === 'human').map((p) => p.id));
  /** The recorded story from `at` up to and including the next gate (or to the end). */
  const resume = (lead: OfficeEvent[] = []) => {
    const from = s.current.at;
    const g = nextGate(feed, from, humans());
    const end = g < 0 ? feed.length : g + 1;
    const base = feed[from]?.t ?? 0;
    const shift = lead.length ? (lead[lead.length - 1].t + 600) : 0;
    s.current.at = end;
    play([...lead, ...feed.slice(from, end).map((e) => ({ ...e, t: e.t - base + shift }))], g < 0 ? 'done' : 'waiting');
  };

  const start = useCallback(() => {
    if (s.current.phase !== 'ready') return;
    s.current.t0 = Date.now();
    resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed]);
  const approve = useCallback(() => {
    if (s.current.phase !== 'waiting') return;
    const gate = [...feed.slice(0, s.current.at)].reverse().find((e) => e.type === 'approval_needed');
    const founder = roster.find((p) => p.kind === 'human')?.id ?? 'founder';
    // After a revision: approve the revised plan (the recording's own approval is about the original, so skip it).
    const rev = s.current.revGate;
    if (rev) {
      s.current.revGate = null;
      if (feed[s.current.at]?.type === 'approved') s.current.at++;
      return resume([approvalFor(rev, founder)]);
    }
    // The recording's own approval if it follows the gate, else the founder's.
    resume(feed[s.current.at]?.type === 'approved' || !gate ? [] : [approvalFor(gate, founder)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed]);
  const changes = useCallback((ask?: string) => {
    if (s.current.phase !== 'waiting') return;
    const founder = roster.find((p) => p.kind === 'human')?.id ?? 'founder';
    const gate = [...feed.slice(0, s.current.at)].reverse().find((e) => e.type === 'approval_needed');
    const fin = personById['d2c-finance'];
    const lead = fin && zoneById[fin.zone] ? fin : personById['d2c-ads'] ?? personById['d2c-captain'];
    const list = revision(++s.current.rev, { ask, founder, captain: gate?.speaker ?? 'd2c-captain', lead: { id: lead.id, emoji: lead.emoji ?? '💬' } });
    s.current.revGate = list[list.length - 1];
    play(list, 'waiting');
  }, [feed]);
  /** Text from the command bar or the chat: starts the story, or answers the open approval. */
  const command = useCallback((text: string): boolean => {
    const p = s.current.phase;
    if (p === 'ready') return (start(), true);
    if (p !== 'waiting') return false;
    const d = decide(text);
    if (d.approve) approve();
    else changes(d.ask);
    return true;
  }, [start, approve, changes]);

  return { events, phase, start, approve, changes, command };
}
