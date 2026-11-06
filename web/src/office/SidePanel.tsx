import { useState } from 'react';
import type { OfficeEvent } from '../shared/types';
import type { SceneState } from './officeState';
import { roster } from './data';

const ROOM_LABEL: Record<string, string> = {
  war_room: 'War Room', analytics: 'Analytics', ads: 'Ads', creators: 'Creators', ops: 'Ops', design: 'Design', finance: 'Finance',
};

/** Teammate list; click one → their persistent thread (everything they said, plus where they were @-mentioned). */
export default function SidePanel({ events, scene, onSelect }: { events: OfficeEvent[]; scene: SceneState; onSelect: (personId: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const person = roster.find((p) => p.id === open);
  const thread = events.filter((e) => e.speaker === open || e.meta?.targets?.includes(open ?? ''));
  const ps = open ? scene.people[open] : undefined;

  return (
    <aside className="hq-panel">
      {!person ? (
        <>
          <h3>Team</h3>
          {roster.map((p) => {
            const s = scene.people[p.id];
            return (
              <button key={p.id} className="hq-row" onClick={() => { setOpen(p.id); onSelect(p.id); }}>
                <span className="hq-dot" style={{ background: p.color }}>{p.emoji}</span>
                <span className="hq-name">{p.name}</span>
                <span className={`hq-st hq-st-${s.state}`}>{s.beacon ? '🔴 ' : ''}{s.state}</span>
              </button>
            );
          })}
        </>
      ) : (
        <>
          <button className="hq-back" onClick={() => setOpen(null)}>← Team</button>
          <h3>{person.emoji} {person.name}</h3>
          <div className="hq-sub">{person.group ?? 'Founder'}</div>
          {thread.length === 0 && <div className="hq-sub">No messages yet.</div>}
          {thread.map((e) => (
            <div key={e.id} className="hq-msg">
              <div className="hq-meta">
                {e.speaker === open ? ROOM_LABEL[e.room] : `@ by ${roster.find((p) => p.id === e.speaker)?.name} · ${ROOM_LABEL[e.room]}`} · {e.type.replace('_', ' ')}
              </div>
              <div className="hq-text">{e.text}</div>
            </div>
          ))}
          {(ps?.state === 'working' || ps?.state === 'waiting') && (
            <div className="hq-thinking">{ps.state === 'waiting' ? `Waiting… ${ps.beacon ?? ''}` : 'Thinking…'}</div>
          )}
        </>
      )}
    </aside>
  );
}

export const PANEL_CSS = `
.hq-panel { position: absolute; top: 12px; right: 12px; bottom: 12px; width: 290px; overflow-y: auto; background: rgba(255,255,255,.92);
  backdrop-filter: blur(8px); border-radius: 18px; padding: 14px; box-shadow: 0 10px 30px rgba(30,19,40,.15); font: 13px system-ui; color: #1E1328; z-index: 100 }
.hq-panel h3 { margin: 4px 4px 10px; font: 800 16px ui-rounded, 'SF Pro Rounded', system-ui }
.hq-row { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; background: none; padding: 8px; border-radius: 12px; cursor: pointer; font: inherit; color: inherit; text-align: left }
.hq-row:hover { background: #FFF6E5 }
.hq-dot { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 15px; flex: none }
.hq-name { flex: 1; font-weight: 600 }
.hq-st { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #eee }
.hq-st-working { background: #FFE7B3 } .hq-st-waiting { background: #FFD6D7 } .hq-st-done { background: #C9F2DD }
.hq-back { border: 0; background: none; cursor: pointer; color: #F4A300; font: 600 13px system-ui; padding: 4px }
.hq-sub { margin: -6px 4px 12px; opacity: .6; font-size: 12px }
.hq-msg { background: #FFF6E5; border-radius: 12px; padding: 8px 10px; margin-bottom: 8px }
.hq-meta { font-size: 11px; opacity: .6; margin-bottom: 3px }
.hq-text { white-space: pre-line; line-height: 1.4 }
.hq-thinking { font-style: italic; opacity: .7; padding: 6px 4px; animation: hq-blink 1.4s infinite }
@keyframes hq-blink { 50% { opacity: .3 } }
@media (max-width: 700px) { .hq-panel { top: auto; left: 12px; width: auto; height: 38vh } }
`;
