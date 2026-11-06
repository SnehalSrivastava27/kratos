// /demo, playable: the start card, the founder's decision on the Captain's plan, and "play again".
import { Check, Pencil, Play, RotateCcw } from 'lucide-react';
import type { OfficeEvent } from '../shared/types';
import { Tg } from './md';
import { clean, personById } from './data';
import type { DemoPhase } from './demoDirector';
import './switch.css';

/** The plan being asked about: the gate itself if it lists the plan, else the asker's last delivery before it. */
function planOf(events: OfficeEvent[]) {
  let gi = events.length - 1;
  while (gi >= 0 && events[gi].type !== 'approval_needed') gi--;
  if (gi < 0) return null;
  const gate = events[gi];
  const bullets = (e: OfficeEvent) => /^\s*[-•]/m.test(e.text);
  const plan = bullets(gate) ? gate : events.slice(0, gi).reverse().find((e) => e.speaker === gate.speaker && e.type === 'done' && bullets(e)) ?? gate;
  return { gate, plan };
}

export function DemoPrompt({ phase, events, first, onStart, onApprove, onChanges, onRestart }: {
  phase: DemoPhase; events: OfficeEvent[]; first?: OfficeEvent;
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
      <div className="dm-card dm-ask" role="dialog" aria-label="Approve the plan">
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
