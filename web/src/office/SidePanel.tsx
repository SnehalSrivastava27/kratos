import { useState } from 'react';
import type { OfficeEvent } from '../shared/types';
import type { SceneState } from './officeState';
import { clean, roster } from './data';

const ROOM_LABEL: Record<string, string> = {
  war_room: 'War Room', analytics: 'Analytics', ads: 'Ads', creators: 'Creators', ops: 'Ops', design: 'Design', finance: 'Finance',
};
const time = (t: number) => (t > 1e12 ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `0:${String(Math.round(t / 1000)).padStart(2, '0')}`);

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
          <h3>Team <small>{roster.length}</small></h3>
          {roster.map((p) => {
            const s = scene.people[p.id];
            return (
              <button key={p.id} className={`hq-row${s.beacon ? ' hq-row-alert' : ''}`} onClick={() => { setOpen(p.id); onSelect(p.id); }}>
                <span className="hq-dot" style={{ background: p.color }}>{p.emoji}</span>
                <span className="hq-name">{p.name}<small>{p.kind === 'human' ? 'Human' : p.group?.split('· ')[1]}</small></span>
                <span className={`hq-pill hq-pill-${s.state}`}>{s.beacon ? 'needs you' : s.state}</span>
              </button>
            );
          })}
        </>
      ) : (
        <>
          <button className="hq-back" onClick={() => setOpen(null)}>← Team</button>
          <div className="hq-who">
            <span className="hq-dot hq-dot-lg" style={{ background: person.color }}>{person.emoji}</span>
            <div>
              <h3>{person.name}</h3>
              <div className="hq-sub">{person.group ?? 'Founder · Telegram'}</div>
            </div>
          </div>
          {thread.length === 0 && <div className="hq-sub">No messages yet.</div>}
          {thread.map((e) => (
            <div key={e.id} className={`hq-msg hq-msg-${e.type}${e.speaker === open ? '' : ' hq-msg-mention'}`}>
              <div className="hq-meta">
                <b>{e.speaker === open ? ROOM_LABEL[e.room] : `${roster.find((p) => p.id === e.speaker)?.name} → you`}</b>
                <span>{e.type.replace('_', ' ')} · {time(e.t)}</span>
              </div>
              <div className="hq-text">{clean(e.text)}</div>
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
