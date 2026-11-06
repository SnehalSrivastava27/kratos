// Telegram-Desktop-style chrome around the office: the group chat list and the open group's chat.
// Everything is derived client-side from the event feed.
import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, CheckCheck, ExternalLink, Mic, Paperclip, Search, Smile } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { OfficeEvent } from '../shared/types';
import type { SceneState } from './officeState';
import { clean, personById, roomZone, roster } from './data';
import rosterJson from '../../../contracts/roster.json';

export const ROOMS = rosterJson.rooms as { id: string; label: string; zone: string }[];
const ROOM_EMOJI: Record<string, string> = { war_room: '🎯', analytics: '📊', ads: '📣', creators: '⭐', ops: '📦', design: '🎨', finance: '💰' };
const ROOM_COLOR: Record<string, string> = Object.fromEntries(ROOMS.map((r) => [r.id, roster.find((p) => p.zone === r.zone)?.color ?? '#3390EC']));
export const TG = { blue: '#3390EC', green: '#4FAE4E', out: '#EEFFDE', bg: '#F1F1F1' };

/** Story time → a clock: replay offsets count as minutes after 21:00 (live events carry epoch ms). */
export const clock = (t: number) => {
  if (t > 1e12) return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const m = 21 * 60 + Math.floor(t / 1000);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const strip = (e: OfficeEvent) => clean(e.text);
const groupName = (label: string) => `Kesar HQ · ${label}`;

/** Who's "typing…" in a room: agents working whose latest message was posted there. */
export function typingIn(room: string, events: OfficeEvent[], scene: SceneState) {
  const lastRoom: Record<string, string> = {};
  for (const e of events) lastRoom[e.speaker] = e.room;
  return roster.filter((p) => p.kind === 'agent' && scene.people[p.id]?.state === 'working' && lastRoom[p.id] === room).map((p) => p.name);
}

function GroupAvatar({ room, size = 46 }: { room: string; size?: number }) {
  const c = ROOM_COLOR[room];
  return (
    <div className="grid shrink-0 place-items-center rounded-full text-white shadow-inner" style={{ width: size, height: size, fontSize: size * 0.45, background: `linear-gradient(160deg, ${c}cc, ${c})` }}>
      {ROOM_EMOJI[room]}
    </div>
  );
}

export function ChatList({ events, scene, selected, unread, onSelect, className }: {
  events: OfficeEvent[]; scene: SceneState; selected: string; unread: Record<string, number>; onSelect: (room: string) => void; className?: string;
}) {
  const reduce = useReducedMotion();
  const rows = useMemo(() => {
    const last: Record<string, OfficeEvent> = {};
    for (const e of events) last[e.room] = e;
    return ROOMS.map((r) => ({ ...r, last: last[r.id] })).sort((a, b) => (b.last?.t ?? -1) - (a.last?.t ?? -1));
  }, [events]);
  return (
    <aside className={cn('flex min-h-0 flex-col border-r border-black/[0.06] bg-white', className)}>
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="flex h-9 flex-1 items-center gap-2 rounded-full bg-[#F1F1F4] px-3 text-sm text-[#8E9AA6]">
          <Search className="size-4" /> Search
        </div>
      </div>
      <div className="flex gap-1 px-3 pb-2 text-[13px] font-medium">
        <span className="rounded-full bg-[#3390EC]/10 px-2.5 py-1 text-[#3390EC]">All chats</span>
        <span className="rounded-full px-2.5 py-1 text-[#707579]">Agents</span>
        <span className="rounded-full px-2.5 py-1 text-[#707579]">Approvals</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {rows.map((r) => {
          const active = r.id === selected;
          const typing = typingIn(r.id, events, scene);
          const who = r.last && (personById[r.last.speaker]?.kind === 'human' ? 'You' : personById[r.last.speaker]?.name);
          const n = unread[r.id] ?? 0;
          return (
            <motion.button
              layout={!reduce}
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={cn('flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors', active ? 'bg-[#3390EC] text-white' : 'hover:bg-[#F4F4F5]')}
            >
              <GroupAvatar room={r.id} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[15px] font-semibold">{groupName(r.label)}</span>
                  {r.last && (
                    <span className={cn('ml-auto flex shrink-0 items-center gap-0.5 text-xs', active ? 'text-white/80' : 'text-[#8E9AA6]')}>
                      {personById[r.last.speaker]?.kind === 'human' && <CheckCheck className={cn('size-3.5', active ? 'text-white' : 'text-[#4FAE4E]')} />}
                      {clock(r.last.t)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('truncate text-sm', active ? 'text-white/90' : 'text-[#707579]')}>
                    {typing.length ? (
                      <span className={active ? 'text-white' : 'text-[#3390EC]'}>{typing[0]} is typing…</span>
                    ) : r.last ? (
                      <>
                        <span className={active ? 'text-white' : 'text-[#222]'}>{who}: </span>
                        {strip(r.last).replace(/\n/g, ' ')}
                      </>
                    ) : (
                      'No messages yet'
                    )}
                  </span>
                  {n > 0 && !active && (
                    <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#3390EC] px-1.5 text-xs font-semibold text-white">{n}</span>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </aside>
  );
}

const bannerTitle = (e: OfficeEvent) => strip(e).split('\n')[0];

function Message({ e, first }: { e: OfficeEvent; first: boolean }) {
  const p = personById[e.speaker];
  const mine = p?.kind === 'human';
  const accent = e.type === 'pushback' ? '#E5484D' : e.type === 'approved' ? '#3CCB8B' : undefined;
  const body = strip(e);
  return (
    <div className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
      {!mine && (first ? (
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5AB0F5] to-[#3390EC] text-[11px] font-bold text-white">SW</div>
      ) : (
        <div className="w-8 shrink-0" />
      ))}
      <div className={cn('relative max-w-[82%] rounded-2xl px-3 pt-1.5 pb-1 text-[14.5px] leading-snug shadow-[0_1px_1px_rgba(0,0,0,0.12)]', mine ? 'rounded-br-md bg-[#EEFFDE]' : 'rounded-bl-md bg-white')}
        style={accent ? { boxShadow: `inset 3px 0 0 ${accent}, 0 1px 1px rgba(0,0,0,.12)` } : undefined}>
        {!mine && first && <div className="text-[13px] font-semibold text-[#3390EC]">Switch <span className="font-normal text-[#8E9AA6]">bot</span></div>}
        <div className="whitespace-pre-line text-[#000]">
          {!mine && <b style={{ color: p?.color }}>{p?.emoji} {p?.name}</b>}
          {!mine && <br />}
          {body}
        </div>
        {e.type === 'artifact' && e.meta?.artifact_url && (
          <a href={e.meta.artifact_url} target="_blank" rel="noreferrer" className="mt-1.5 flex gap-2 rounded-md border-l-[3px] border-[#3390EC] bg-[#3390EC]/[0.07] p-1.5 pr-2 no-underline hover:bg-[#3390EC]/[0.12]">
            <div className="size-11 shrink-0 rounded bg-gradient-to-br from-[#F4A300] to-[#DB2777]" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#3390EC]">Kesar Gallery</div>
              <div className="truncate text-[13px] text-black">{bannerTitle(e)}</div>
              <div className="flex items-center gap-1 text-xs text-[#707579]">{e.meta.artifact_url} <ExternalLink className="size-3" /></div>
            </div>
          </a>
        )}
        <div className={cn('float-right -mb-0.5 ml-2 flex items-center gap-0.5 pt-1 text-[11px]', mine ? 'text-[#4FAE4E]' : 'text-[#8E9AA6]')}>
          {clock(e.t)}
          {mine && <CheckCheck className="size-3.5" />}
        </div>
        <div className="clear-both" />
        {e.type === 'approval_needed' && (
          <div className="-mx-1 mt-1 mb-0.5 grid grid-cols-2 gap-1">
            {['✅ Approve', '✏️ Ask changes'].map((b) => (
              <button key={b} onClick={() => toast(`Sent “${b.slice(2)}” to ${p?.name ?? 'the bot'}`)}
                className="rounded-lg bg-[#3390EC]/10 py-1.5 text-[13px] font-semibold text-[#3390EC] hover:bg-[#3390EC]/20">{b}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatPane({ room, events, scene, onBack, className }: { room: string; events: OfficeEvent[]; scene: SceneState; onBack?: () => void; className?: string }) {
  const reduce = useReducedMotion();
  const info = ROOMS.find((r) => r.id === room)!;
  const msgs = useMemo(() => events.filter((e) => e.room === room), [events, room]);
  const typing = typingIn(room, events, scene);
  const members = new Set(['founder', ...msgs.flatMap((e) => [e.speaker, ...(e.meta?.targets ?? [])])]).size + 1;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [msgs.length, room, reduce]);
  const zoneOwner = roster.find((p) => p.zone === roomZone[room]);
  return (
    <section className={cn('flex min-h-0 flex-col border-l border-black/[0.06] bg-white', className)}>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/[0.06] px-3">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to chats" className="md:hidden">
            <ArrowLeft className="size-5 text-[#707579]" />
          </Button>
        )}
        <GroupAvatar room={room} size={40} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">{groupName(info.label)}</div>
          <div className="truncate text-[13px]">
            {typing.length ? (
              <span className="text-[#3390EC]">{typing.join(', ')} {typing.length > 1 ? 'are' : 'is'} typing<span className="hq-dots" /></span>
            ) : (
              <span className="text-[#8E9AA6]">{members} members{zoneOwner ? ` · ${zoneOwner.name} online` : ''}</span>
            )}
          </div>
        </div>
      </header>
      <div ref={scroller} className="hq-tg-wall min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto mb-2 w-fit rounded-full bg-black/20 px-2.5 py-0.5 text-xs font-medium text-white">Today</div>
        {msgs.length === 0 && <div className="mx-auto mt-10 w-fit rounded-2xl bg-black/20 px-3 py-1.5 text-sm text-white">No messages here yet…</div>}
        <div className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {msgs.map((e, i) => (
              <motion.div key={e.id} initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
                <Message e={e} first={i === 0 || msgs[i - 1].speaker !== e.speaker || personById[e.speaker]?.kind !== personById[msgs[i - 1].speaker]?.kind} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
      <footer className="flex shrink-0 items-center gap-2 border-t border-black/[0.06] px-3 py-2 text-[#8E9AA6]">
        <Paperclip className="size-5 shrink-0" />
        <div className="flex-1 truncate text-sm">Message {groupName(info.label)}</div>
        <Smile className="size-5 shrink-0" />
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#3390EC] text-white"><Mic className="size-4.5" /></div>
      </footer>
    </section>
  );
}

