// /demo, playable: the start card, the founder's decision on the Captain's plan, and "play again".
import { Check, ClipboardList, Pencil, Play, RotateCcw } from 'lucide-react';
import { Modal } from './Hud';
import type { OfficeEvent } from '../shared/types';
import { Tg } from './md';
import { clean, personById } from './data';
import type { DemoPhase } from './demoDirector';
import './switch.css';

/** The plan being asked about: the gate itself if it lists the plan, else the asker's last delivery before it. */
export function planOf(events: OfficeEvent[]) {
  let gi = events.length - 1;
  while (gi >= 0 && events[gi].type !== 'approval_needed') gi--;
  if (gi < 0) return null;
  const gate = events[gi];
  const bullets = (e: OfficeEvent) => /^\s*[-•]/m.test(e.text);
  const plan = bullets(gate) ? gate : events.slice(0, gi).reverse().find((e) => e.speaker === gate.speaker && e.type === 'done' && bullets(e)) ?? gate;
  return { gate, plan };
}

export function DemoPrompt({ phase, events, first, onStart, onApprove, onChanges, onRestart, nudge = 0 }: {
  phase: DemoPhase; events: OfficeEvent[]; first?: OfficeEvent; nudge?: number;
  onStart: () => void; onApprove: () => void; onChanges: () => void; onRestart: () => void;
}) {
  if (phase === 'ready') {
    return (
      <div className="dm-card dm-start" role="dialog" aria-label="Start the demo">
        <div className="dm-eyebrow">Interactive demo · Kesar &amp; Co.</div>
        <h2>Plan a festive sale with your AI team</h2>
        <p>You’re the founder. Send one message in Telegram: Switch routes it to the agents, they plan it out in their topics, and you approve the result.</p>
        {first && <div className="dm-bubble"><Tg text={clean(first.text)} /></div>}
        <button type="button" className="ao-btn primary dm-go" onClick={onStart} autoFocus><Play />Start the sale plan</button>
        <div className="dm-alt">or press <span className="ao-key">/</span> and message the War Room</div>
      </div>
    );
  }
  if (phase === 'waiting') {
    const p = planOf(events);
    if (!p) return null;
    const asker = personById[p.gate.speaker];
    return (
      <div key={nudge} className={`dm-card dm-ask${nudge ? ' dm-nudge' : ''}`} role="dialog" aria-label="Approve the plan">
        <div className="dm-head">
          <span className="dm-avatar" style={{ background: asker?.color }}>{asker?.emoji ?? '🎯'}</span>
          <div className="min-w-0">
            <div className="dm-title">{asker?.name ?? 'The Captain'} needs your call</div>
            <div className="dm-sub">The plan is ready. Approve it, or ask for a change.</div>
          </div>
        </div>
        <div className="dm-plan"><Tg text={clean(p.plan.text).replace(/\n{2,}/g, '\n')} /></div>
        <div className="dm-actions">
          <button type="button" className="ao-btn dm-ok" onClick={onApprove} autoFocus><Check />Approve plan</button>
          <button type="button" className="ao-btn" onClick={onChanges}><Pencil />Ask for changes</button>
        </div>
      </div>
    );
  }
  if (phase === 'done') {
    return (
      <div className="dm-card dm-end" role="status">
        <span>🎉 The festive sale is a go</span>
        <button type="button" className="ao-btn" onClick={onRestart}><RotateCcw />Play again</button>
      </div>
    );
  }
  return null;
}

/**
 * "Review the plan" (E at the War Room table): the Captain's latest plan, read-only, with the way to answer it.
 * The /demo approval itself stays in DemoPrompt (the director); this card covers every other moment.
 */
export function PlanCard({ events, captain, onReply, onStart, onClose }: {
  events: OfficeEvent[]; captain: string; onReply: () => void; onStart?: () => void; onClose: () => void;
}) {
  const bullets = (e: OfficeEvent) => /^\s*[-•]/m.test(e.text);
  const gate = planOf(events);
  const plan = gate?.plan ?? [...events].reverse().find((e) => e.room === 'war_room' && e.speaker === captain && bullets(e));
  const who = personById[plan?.speaker ?? captain];
  return (
    <Modal className="w-[min(480px,100%)]" onClose={onClose} label="The plan" title={
      <span className="flex items-center gap-2"><ClipboardList className="size-5" strokeWidth={2.5} /> The plan <span className="text-[13px] font-bold text-[var(--muted)]">· War Room</span></span>
    }>
      <div className="ao-body grid gap-3 !pt-3">
        {plan ? (
          <>
            <div className="text-[12.5px] font-extrabold text-[var(--muted)]">From {who?.name ?? 'the Captain'}{gate ? ' · waiting on your call' : ''}</div>
            <div className="dm-plan !m-0"><Tg text={clean(plan.text).replace(/\n{2,}/g, '\n')} /></div>
          </>
        ) : (
          <p className="m-0 text-[14px] font-bold text-[var(--muted)]">No plan on the screen yet. Brief {who?.name ?? 'the Captain'} and the team will draw one up here.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {onStart ? (
            <button type="button" className="ao-btn primary" onClick={onStart}><Play />Start the sale plan</button>
          ) : (
            <button type="button" className="ao-btn tg" onClick={onReply}><Pencil />{plan ? `Reply to ${who?.name ?? 'the Captain'}` : `Brief ${who?.name ?? 'the Captain'}`}</button>
          )}
        </div>
      </div>
    </Modal>
  );
}
