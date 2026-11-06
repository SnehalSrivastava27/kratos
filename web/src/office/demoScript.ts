// The playable /demo's script logic, pure (no runtime imports) so it runs under plain node for the check.
// The recorded story plays until the Captain asks the founder for a decision, then waits for the viewer.
// Keyed off event types and who is addressed, never fixed indexes: the feed can grow new beats and gates.
import type { OfficeEvent } from '../shared/types';

/** A decision for the viewer: an approval request addressed to the founder (or to nobody in particular). */
export const isGate = (e: OfficeEvent, humans: Set<string>) =>
  e.type === 'approval_needed' && (!e.meta?.targets?.length || e.meta.targets.some((t) => humans.has(t)));

/** Index of the next gate at or after `from`, or -1 when the story runs to its end. */
export const nextGate = (feed: OfficeEvent[], from: number, humans: Set<string>) => {
  for (let i = from; i < feed.length; i++) if (isGate(feed[i], humans)) return i;
  return -1;
};

/** What the viewer typed → a decision. Telegram's own buttons send "Approved ✅" / "Please change: …". */
export function decide(text: string): { approve: true } | { approve: false; ask: string } {
  const s = text.trim();
  if (/approv|^(yes|ok|okay|go|ship it|lgtm)\b|👍|✅/i.test(s)) return { approve: true };
  return { approve: false, ask: s.replace(/^please change:\s*/i, '') };
}

/** The founder's approval, when the recording doesn't have one right after the gate. */
export const approvalFor = (gate: OfficeEvent, founder: string): OfficeEvent => ({
  id: `${gate.id}-ok`, t: 0, room: gate.room, speaker: founder, type: 'approved', text: '👑 Approved ✅', meta: { targets: [gate.speaker] },
});

/**
 * "Ask for changes": a short canned revision. The founder's ask goes in, the Captain acknowledges, the lead
 * (Finance when the office has one) moves one budget line, and the Captain asks again. `t` is the delay in ms.
 */
export function revision(n: number, o: { ask?: string; founder: string; captain: string; lead: { id: string; emoji: string } }): OfficeEvent[] {
  const ask = o.ask?.trim() || 'Can we shift ₹20k from ads to creators?';
  const e = (k: number, t: number, speaker: string, type: OfficeEvent['type'], text: string, targets?: string[]): OfficeEvent =>
    ({ id: `rev${n}-${k}`, t, room: 'war_room', speaker, type, text, ...(targets ? { meta: { targets } } : {}) });
  return [
    e(1, 0, o.founder, 'message', `👑 @${o.captain} ${ask}`, [o.captain]),
    e(2, 1400, o.captain, 'working', `🎯 **On it**\n\n_@${o.lead.id} can you rework one line?_`, [o.lead.id]),
    e(3, 3800, o.lead.id, 'done', `${o.lead.emoji} **One line changed**\n\n- **Ads:** ₹3L → **₹2.8L**\n- **Creators:** ₹1.18L → **₹1.38L**\n\n_Total spend unchanged._`, [o.captain]),
    e(4, 6000, o.captain, 'approval_needed', `🎯 **Revised plan**\n\n- **Ads:** **₹2.8L** (was ₹3L)\n- **Creators:** **₹1.38L**\n- **Everything else:** unchanged\n\n**_@${o.founder} approve the plan?_**`, [o.founder]),
  ];
}
