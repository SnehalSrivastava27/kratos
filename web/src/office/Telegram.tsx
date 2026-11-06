// Telegram-Desktop-style chrome around the office: the group chat list and the open group's chat.
// Everything is derived client-side from the event feed.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Check, CheckCheck, Pencil, ExternalLink, Mic, Paperclip, Search, Smile, Sunrise } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { OfficeEvent, RoomId } from '../shared/types';
import type { SceneState } from './officeState';
import { ROOMS, TG_GROUP, clean, firstLine, galleryUrl, personById, readable, roomZone, roster, swMeta } from './data';
import { Tg, tgPlain } from './md';
import { PersonAvatar, RoomTile } from './icons';
import { FileChip, isFile } from './FileChip';

export { ROOMS };
export const ROOM_EMOJI: Record<string, string> = { war_room: '🎯', analytics: '📊', ads: '📣', creators: '⭐', ops: '📦', design: '🎨', finance: '💰' };
export const ROOM_COLOR: Record<string, string> = Object.fromEntries(ROOMS.map((r) => [r.id, roster.find((p) => p.zone === r.zone)?.color ?? '#3390EC']));
export const TG = { blue: '#3390EC', green: '#4FAE4E', out: '#EEFFDE', bg: '#F1F1F1' };

/** Story time → a clock: replay offsets count as minutes after 21:00 (live events carry epoch ms). */
export const clock = (t: number) => {
  if (t > 1e12) return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const m = 21 * 60 + Math.floor(t / 1000);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const strip = (e: OfficeEvent) => clean(e.text);
const topicOf = (room: string) => ROOMS.find((r) => r.id === room)!;

/** Who's "typing…" in a room: agents working whose latest message was posted there. */
export function typingIn(room: string, events: OfficeEvent[], scene: SceneState) {
  const lastRoom: Record<string, string> = {};
  for (const e of events) lastRoom[e.speaker] = e.room;
  return roster.filter((p) => p.kind === 'agent' && scene.people[p.id]?.state === 'working' && lastRoom[p.id] === room).map((p) => p.name);
}

/** A forum topic's icon: the department's Lucide icon on a tinted rounded square. */
export function TopicIcon({ room, size = 40 }: { room: string; size?: number }) {
  return <RoomTile room={room} size={size} />;
}
function GroupAvatar({ size = 42 }: { size?: number }) {
  return (
    <div className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5AB0F5] to-[#3390EC] font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {TG_GROUP.charAt(0)}
    </div>
  );
}

export function ChatList({ events, scene, selected, unread, onSelect, className, actions }: {
  events: OfficeEvent[]; scene: SceneState; selected: string; unread: Record<string, number>; onSelect: (room: string) => void; className?: string; actions?: ReactNode;
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
        <div className="flex h-9 flex-1 items-center gap-2 rounded-full bg-[#F1F1F4] px-3 text-sm text-[#707579]">
          <Search className="size-4" /> Search
        </div>
        {actions}
      </div>
      <div className="mx-1.5 mb-1 flex items-center gap-3 rounded-xl px-2 py-2">
        <GroupAvatar />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{TG_GROUP}</div>
          <div className="truncate text-[13px] text-[#707579]">{ROOMS.length} topics · {roster.length} members</div>
        </div>
      </div>
      <div className="px-4 pb-1 text-[12px] font-semibold tracking-wide text-[#707579] uppercase">Topics</div>
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
              className={cn('flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors', active ? 'bg-[#2475C7] text-white' : 'hover:bg-[#F4F4F5]')}
            >
              <TopicIcon room={r.id} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[15px] font-semibold">{r.topic}</span>
                  {r.last && (
                    <span className={cn('ml-auto flex shrink-0 items-center gap-0.5 text-xs', active ? 'text-white' : 'text-[#707579]')}>
                      {personById[r.last.speaker]?.kind === 'human' && <CheckCheck className={cn('size-3.5', active ? 'text-white' : 'text-[#4FAE4E]')} />}
                      {clock(r.last.t)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn('truncate text-sm', active ? 'text-white' : 'text-[#707579]')}>
                    {typing.length ? (
                      <span className={active ? 'text-white' : 'text-[#1A6FB5]'}>{typing[0]} is typing…</span>
                    ) : r.last ? (
                      <>
                        <span className={active ? 'text-white' : 'text-[#222]'}>{who}: </span>
                        {tgPlain(strip(r.last)).replace(/\n+/g, ' ')}
                      </>
                    ) : (
                      'No messages yet'
                    )}
                  </span>
                  {n > 0 && !active && (
                    <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#2475C7] px-1.5 text-xs font-semibold text-white">{n}</span>
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

const isMine = (e: OfficeEvent) => personById[e.speaker]?.kind === 'human';
const bannerTitle = (e: OfficeEvent) => firstLine(e.text);

type Command = (room: RoomId, text: string) => Promise<unknown>;

function Message({ e, first, last, onCommand }: { e: OfficeEvent; first: boolean; last: boolean; onCommand?: Command }) {
  const p = personById[e.speaker];
  const mine = p?.kind === 'human';
  const accent = e.type === 'pushback' ? '#E5484D' : e.type === 'approved' ? '#3CCB8B' : undefined;
  const body = strip(e);
  const link = galleryUrl(e.meta?.artifact_url);
  return (
    <div className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
      {!mine && (last ? (
        <PersonAvatar person={p} size={34} />
      ) : (
        <div className="w-[34px] shrink-0" />
      ))}
      <div className={cn('relative max-w-[82%] rounded-2xl px-3 pt-1.5 pb-1 text-[14.5px] leading-snug shadow-[0_1px_1px_rgba(0,0,0,0.12)]', mine ? 'rounded-br-md bg-[#EEFFDE]' : 'rounded-bl-md bg-white')}
        style={accent ? { boxShadow: `inset 3px 0 0 ${accent}, 0 1px 1px rgba(0,0,0,.12)` } : undefined}>
        {!mine && first && <div className="text-[13px] font-semibold text-[#1A6FB5]">Switch <span className="font-normal text-[#707579]">bot</span></div>}
        {swMeta(e).kind === 'morning_brief' && (
          <div className="-mx-1 mt-1 mb-1 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#FFE3A3] via-[#FFC58A] to-[#FF9E7A] px-2 py-1 text-[12px] font-semibold text-[#7a3a00]">
            <Sunrise className="size-3.5" strokeWidth={2.5} /> Morning brief <span className="font-normal text-[#7a3a00]/80">· via Switch</span>
          </div>
        )}
        <div className="whitespace-pre-wrap text-[#000]">
          {!mine && <b style={{ color: readable(p?.color ?? '#1A6FB5') }}>{p?.name}</b>}
          {!mine && <br />}
          <Tg text={body} />
        </div>
        {swMeta(e).kind === 'catch_up' && <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#3390EC]/10 px-2 py-0.5 text-[11.5px] font-semibold text-[#1A6FB5]">↻ caught up via Switch</div>}
        {swMeta(e).switch_document?.title && <div className="mt-1 ml-1 inline-flex items-center gap-1 rounded-full bg-[#F4A300]/15 px-2 py-0.5 text-[11.5px] font-semibold text-[#8a5a00]">📌 Pinned in Switch</div>}
        {e.type === 'artifact' && link && isFile(link) && <FileChip url={link} />}
        {e.type === 'artifact' && link && !isFile(link) && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1.5 flex gap-2 rounded-md border-l-[3px] border-[#3390EC] bg-[#3390EC]/[0.07] p-1.5 pr-2 no-underline hover:bg-[#3390EC]/[0.12]">
            <div className="size-11 shrink-0 rounded bg-gradient-to-br from-[#F4A300] to-[#DB2777]" />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#1A6FB5]">Kesar Gallery</div>
              <div className="truncate text-[13px] text-black">{bannerTitle(e)}</div>
              <div className="flex items-center gap-1 text-xs text-[#707579]">{link} <ExternalLink className="size-3" /></div>
            </div>
          </a>
        )}
        <div className={cn('float-right -mb-0.5 ml-2 flex items-center gap-0.5 pt-1 text-[11px]', mine ? 'text-[#2E7D32]' : 'text-[#707579]')}>
          {clock(e.t)}
          {mine && <CheckCheck className="size-3.5" />}
        </div>
        <div className="clear-both" />
        {e.type === 'approval_needed' && onCommand && <ApprovalButtons room={e.room} who={p?.name ?? 'the bot'} onCommand={onCommand} />}
      </div>
    </div>
  );
}

/** Inline-keyboard buttons under an approval request: they post into the same topic (POST /api/command). */
function ApprovalButtons({ room, who, onCommand }: { room: RoomId; who: string; onCommand: Command }) {
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (body: string) => {
    setBusy(true);
    try {
      await onCommand(room, body);
      toast(`Sent to ${who}: “${body}”`);
      setAsking(false);
      setText('');
    } catch (err) {
      toast.error(`Not sent: ${err instanceof Error ? err.message : 'error'}`);
    } finally {
      setBusy(false);
    }
  };
  const btn = 'flex items-center justify-center gap-1.5 rounded-lg bg-[#3390EC]/10 py-1.5 text-[13px] font-semibold text-[#1A6FB5] hover:bg-[#3390EC]/20 disabled:opacity-50';
  return (
    <div className="-mx-1 mt-1 mb-0.5">
      <div className="grid grid-cols-2 gap-1">
        <button type="button" className={btn} disabled={busy} onClick={() => void send('Approved ✅')}><Check className="size-3.5" strokeWidth={2} />Approve</button>
        <button type="button" className={btn} disabled={busy} aria-expanded={asking} onClick={() => setAsking((a) => !a)}><Pencil className="size-3.5" strokeWidth={2} />Ask changes</button>
      </div>
      {asking && (
        <form className="mt-1 flex gap-1" onSubmit={(ev) => (ev.preventDefault(), text.trim() && void send(`Please change: ${text.trim()}`))}>
          <input autoFocus value={text} onChange={(ev) => setText(ev.target.value)} maxLength={1900} placeholder="What should change?" aria-label="What should change?"
            className="min-w-0 flex-1 rounded-lg border border-black/15 px-2 py-1 text-[13px] outline-none focus:border-[#3390EC]" />
          <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-[#3390EC] px-2.5 text-[13px] font-semibold text-white disabled:opacity-50">Send</button>
        </form>
      )}
    </div>
  );
}

export function ChatPane({ room, events, scene, onBack, onCompose, onCommand, className, actions }: {
  room: string; events: OfficeEvent[]; scene: SceneState; onBack?: () => void; onCompose?: () => void; onCommand?: Command; className?: string; actions?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const info = topicOf(room);
  const msgs = useMemo(() => events.filter((e) => e.room === room), [events, room]);
  // Only the latest gate still waiting on a decision keeps its buttons (an old one, or one already answered, doesn't).
  const openGate = useMemo(() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].type === 'approved') return null;
      if (msgs[i].type === 'approval_needed') return msgs[i].id;
    }
    return null;
  }, [msgs]);
  const typing = typingIn(room, events, scene);
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
        <TopicIcon room={room} size={38} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{info.topic} <span className="font-normal text-[#707579]">· {TG_GROUP}</span></div>
          <div className="truncate text-[13px]">
            {typing.length ? (
              <span className="text-[#1A6FB5]">{typing.join(', ')} {typing.length > 1 ? 'are' : 'is'} typing<span className="hq-dots" /></span>
            ) : (
              <span className="text-[#707579]">{roster.length} members{zoneOwner ? ` · ${zoneOwner.name} online` : ''}</span>
            )}
          </div>
        </div>
        {actions}
      </header>
      <div ref={scroller} className="hq-tg-wall min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto mb-2 w-fit rounded-full bg-black/45 px-2.5 py-0.5 text-xs font-medium text-white">Today</div>
        {msgs.length === 0 && <div className="mx-auto mt-10 w-fit rounded-2xl bg-black/45 px-3 py-1.5 text-sm text-white">No messages here yet…</div>}
        <div className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {msgs.map((e, i) => (
              <motion.div key={e.id} initial={reduce ? false : { opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
                <Message e={e} first={i === 0 || isMine(msgs[i - 1]) !== isMine(e)} last={i === msgs.length - 1 || isMine(msgs[i + 1]) !== isMine(e)} onCommand={e.id === openGate ? onCommand : undefined} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
      <button type="button" onClick={onCompose} className="flex shrink-0 items-center gap-2 border-t border-black/[0.06] px-3 py-2 text-left text-[#707579] hover:bg-[#F7F7F8]">
        <Paperclip className="size-5 shrink-0" />
        <div className="flex-1 truncate text-sm">Message in {info.topic}… <span className="ml-1 rounded border border-black/10 px-1 text-[11px]">/</span></div>
        <Smile className="size-5 shrink-0" />
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#3390EC] text-white"><Mic className="size-4.5" /></div>
      </button>
    </section>
  );
}

