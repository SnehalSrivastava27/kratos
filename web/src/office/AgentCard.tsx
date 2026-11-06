// "Talk to <name>" (E next to an agent): who they are, what they're doing, what they last said, and two
// quick ways to reach them (both prefill the command bar in their topic: commands still go through the API).
import { ClipboardPlus, MessageCircleQuestion } from 'lucide-react';
import type { OfficeEvent } from '../shared/types';
import type { PersonState } from './officeState';
import { clean, readable, type HiredPerson } from './data';
import { Modal } from './Hud';
import { Tg } from './md';
import { personDept } from './icons';
import { clock } from './Telegram';

const STATE: Record<string, [string, string]> = {
  idle: ['Free', '#64748B'], working: ['Working on it', '#2563EB'], walking: ['On the move', '#64748B'], waiting: ['Needs your reply', '#C8303A'], done: ['Delivered', '#0F7A4F'],
};

export function AgentCard({ person, ps, last, topic, onAsk, onAssign, onClose }: {
  person: HiredPerson; ps?: PersonState; last?: OfficeEvent; topic: string;
  onAsk: () => void; onAssign: () => void; onClose: () => void;
}) {
  const dept = personDept(person);
  const [label, color] = ps?.beacon ? STATE.waiting : STATE[ps?.state ?? 'idle'] ?? STATE.idle;
  return (
    <Modal className="w-[min(420px,100%)]" onClose={onClose} label={`Talk to ${person.name}`} title={
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border-[3px] border-[var(--ink)]" style={{ background: `${dept.color}22` }}>
          <dept.Icon className="size-[18px]" color={readable(dept.color)} strokeWidth={2.5} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate">{person.name}</span>
          <span className="block truncate text-[12.5px] font-bold text-[var(--muted)]">{topic} topic</span>
        </span>
      </span>
    }>
      <div className="ao-body grid gap-3 !pt-3">
        {person.role && <p className="m-0 text-[13.5px] font-bold leading-snug">{person.role}</p>}
        <div className="flex items-center gap-2 text-[12.5px] font-extrabold">
          <span className="size-2.5 rounded-full" style={{ background: color }} />
          <span style={{ color }}>{label}</span>
          {ps?.beacon && <span className="truncate font-bold text-[var(--muted)]">· {ps.beacon}</span>}
        </div>
        <div className="rounded-2xl border-2 border-[var(--ink)]/15 bg-white px-3 py-2 text-[13.5px]">
          {last ? (
            <>
              <div className="mb-0.5 flex justify-between text-[11px] font-extrabold tracking-wide text-[var(--muted)] uppercase">
                <span>Last message</span><span className="tabular-nums">{clock(last.t)}</span>
              </div>
              <div className="line-clamp-4"><Tg text={clean(last.text)} max={4} /></div>
            </>
          ) : (
            <span className="font-bold text-[var(--muted)]">Nothing from {person.name} yet. Say hi?</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="ao-btn tg !justify-center" onClick={onAsk}><MessageCircleQuestion />Ask a question</button>
          <button type="button" className="ao-btn !justify-center" onClick={onAssign}><ClipboardPlus />Assign task</button>
        </div>
      </div>
    </Modal>
  );
}
