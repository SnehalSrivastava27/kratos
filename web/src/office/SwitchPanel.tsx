// The Switch hub's panel: what Switch does, live counters, and the last few messages it carried.
import { ArrowRight, Network } from 'lucide-react';
import type { OfficeEvent } from '../shared/types';
import { ROOMS, firstLine, personById, roster } from './data';
import { Modal } from './Hud';
import './switch.css';

const topicOf = (room: string) => ROOMS.find((r) => r.id === room)?.topic ?? room;
const who = (id: string) => (personById[id]?.kind === 'human' ? 'Founder' : `@${personById[id]?.name ?? id}`);

/** One routed message as a hop: where it came from, where Switch sent it. */
export function hop(e: OfficeEvent): { from: string; to: string } {
  const human = personById[e.speaker]?.kind === 'human';
  const targets = (e.meta?.targets ?? []).filter((t) => personById[t] && t !== e.speaker);
  const agents = targets.filter((t) => personById[t]?.kind === 'agent').map(who);
  const to = human ? (agents.length ? agents.join(', ') : `#${topicOf(e.room)}`) : [`#${topicOf(e.room)}`, ...agents.slice(0, 2)].join(' · ');
  return { from: who(e.speaker), to };
}

/** Header chip: Switch is always on screen, wherever the camera is. It blinks as each message goes through. */
export function SwitchChip({ routed, onOpen }: { routed: number; onOpen: () => void }) {
  return (
    <button type="button" className="ao-panel sw-chip" onClick={onOpen} title="Switch routes every message between Telegram and your agents">
      <span className="sw-mark"><Network className="size-4" strokeWidth={2.75} /></span>
      <span className="sw-chip-text"><b>Switch</b><span key={routed} className="sw-chip-n">{routed} routed</span></span>
      <span className="hq-switch-dot" />
    </button>
  );
}

export function SwitchPanel({ events, onClose }: { events: OfficeEvent[]; onClose: () => void }) {
  const agents = roster.filter((p) => p.kind === 'agent').length;
  const topics = ROOMS.filter((r) => !(r as { internal?: boolean }).internal).length;
  const last = events.filter((e) => e.type !== 'command').slice(-6).reverse();
  return (
    <Modal label="Switch" onClose={onClose} className="sw-panel"
      title={<span className="inline-flex items-center gap-2"><span className="sw-mark"><Network className="size-4" strokeWidth={2.75} /></span> Switch</span>}>
      <div className="ao-body">
        <p className="sw-lede">Routes every message between Telegram and your {agents} agents. One bot, one group, a topic per team.</p>
        <div className="sw-flow" aria-hidden="true">
          <span className="sw-node tg">Telegram</span><i /><span className="sw-node sw">Switch</span><i /><span className="sw-node ag">{agents} agents</span>
        </div>
        <div className="sw-stats">
          <div><b>{events.length}</b><span>messages routed</span></div>
          <div><b>{agents}</b><span>agents online</span></div>
          <div><b>{topics}</b><span>topics</span></div>
        </div>
        <h3 className="sw-h">Last routed</h3>
        {last.length === 0 ? (
          <p className="sw-empty">Nothing yet: the first message in Telegram will show up here.</p>
        ) : (
          <ul className="sw-hops">
            {last.map((e) => {
              const h = hop(e);
              return (
                <li key={e.id}>
                  <div className="sw-route">
                    <span>{h.from}</span><ArrowRight /><span className="sw-via">Switch</span><ArrowRight /><span>{h.to}</span>
                  </div>
                  <div className="sw-text">{firstLine(e.text)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
