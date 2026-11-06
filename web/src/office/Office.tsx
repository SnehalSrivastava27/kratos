/// <reference types="vite/client" />
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OfficeEvent, Zone } from '../shared/types';
import saleDemo from '../../../demo/feeds/sale-demo.json';
import { caption, ctx, firstLine, galleryUrl, roomZone, zoneById } from './data';
import { ChatList, ChatPane, ROOMS } from './Telegram';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Maximize2, RotateCcw } from 'lucide-react';
import { reduce, type SceneState } from './officeState';
import { useEventFeed } from './useEventFeed';
import { OfficeEngine } from './engine/Engine';
import type { GalleryItem } from './engine/props';
import './office.css';

const MAX_CHAT = 200;

export default function Office({ mode, feed }: { mode: 'live' | 'autoplay'; feed?: OfficeEvent[] }) {
  // Replay (live): run the story again locally from the top, as a fresh array so the feed hook restarts.
  const [replay, setReplay] = useState(() => (mode === 'live' && new URLSearchParams(location.search).has('demo') ? 1 : 0)); // /office?demo = local story, no server
  const replayFeed = useMemo(() => (replay ? [...(feed ?? (saleDemo as OfficeEvent[]))] : undefined), [replay, feed]);
  const events = useEventFeed(replay ? 'autoplay' : mode, replayFeed ?? feed);
  const scene = useMemo(() => reduce(events, ctx), [events]);
  // the live array never resets: chat UI, the hub wall and the phone only ever see the latest MAX_CHAT events
  const recent = useMemo(() => (events.length > MAX_CHAT ? events.slice(-MAX_CHAT) : events), [events]);
  // local replay (button, ?demo, or the feed hook's fallback when the server is down) vs server events (`id@run` or epoch t)
  const last = events[events.length - 1];
  const local = replay > 0 || (!!last && !last.id.includes('@') && last.t < 1e12);
  const gallery = useMemo(
    () => events.flatMap((e) => {
      const url = e.type === 'artifact' ? galleryUrl(e.meta?.artifact_url) : null;
      return url ? [{ url, title: firstLine(e.text) }] : [];
    }),
    [events],
  );
  const [focus, setFocus] = useState<Zone | null>(null);
  // stable handler for the memo'd Stage; always calls the latest pickZone
  const pickRef = useRef(pickZone);
  pickRef.current = pickZone;
  const onPick = useCallback((id: string | null) => pickRef.current(id ? zoneById[id] ?? null : null), []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  const stage = <Stage interactive={mode === 'live'} scene={scene} events={recent} gallery={gallery} focus={focus?.id ?? null} onPick={onPick} />;

  // Telegram side: which group is open, unread counts, phone list → chat navigation.
  const [room, setRoom] = useState('war_room'); // the founder's main group is open to start, like their Telegram
  const [mView, setMView] = useState<'list' | 'chat'>('list');
  const [seen, setSeen] = useState<Record<string, number>>({});
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of recent) c[e.room] = (c[e.room] ?? 0) + 1;
    return c;
  }, [recent]);
  useEffect(() => setSeen((s) => (events.length === 0 ? {} : { ...s, [room]: counts[room] ?? 0 })), [room, counts, events.length]);
  const unread = Object.fromEntries(ROOMS.map((r) => [r.id, Math.max(0, (counts[r.id] ?? 0) - (seen[r.id] ?? 0))]));
  const openRoom = (id: string) => {
    setRoom(id);
    setMView('chat');
    setFocus(zoneById[roomZone[id]] ?? null);
  };
  function pickZone(z: Zone | null) {
    const r = z && ROOMS.find((rm) => rm.zone === z.id);
    if (!z || focus?.id === z.id) return setFocus(null);
    if (r) openRoom(r.id);
    else setFocus(z);
  }
  const overview = () => setFocus(null);
  const cap = caption(events, scene);

  if (mode === 'autoplay') {
    // landing hero: chrome-less, just the scene with its bubbles
    return (
      <div className="hq-root" style={{ height: '100%', width: '100%' }}>
        {stage}
      </div>
    );
  }
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-[#F1F1F4] font-sans text-black antialiased">
      <header className="z-10 flex h-12 shrink-0 items-center gap-3 border-b border-black/[0.06] bg-white px-3 md:px-4">
        <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-[#F4A300] to-[#E07A00] text-sm font-bold text-white">K</div>
        <div className="text-[15px] font-semibold">Kesar HQ</div>
        <span className={cn('flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold', local ? 'bg-[#3390EC]/10 text-[#1A6FB5]' : 'bg-[#3CCB8B]/15 text-[#0F7A4F]')}>
          <span className={cn('size-1.5 rounded-full', local ? 'bg-[#3390EC]' : 'animate-pulse bg-[#3CCB8B]')} />
          {local ? 'Replay' : 'Live'}
        </span>
        <div className={cn('hidden min-w-0 flex-1 truncate text-sm md:block', cap.tone === 'red' ? 'text-[#C8303A]' : cap.tone === 'mint' ? 'text-[#0F7A4F]' : 'text-[#707579]')}>
          {cap.text}
        </div>
        <Button variant="outline" size="sm" className="ml-auto md:ml-0" onClick={() => { overview(); setSeen({}); setReplay((r) => r + 1); }}>
          <RotateCcw /> Replay
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <ChatList events={recent} scene={scene} selected={room} unread={unread} onSelect={openRoom}
          className={cn('md:flex md:w-[300px] lg:w-[330px]', mView === 'list' ? 'flex flex-1 md:flex-none' : 'hidden')} />
        <div className="hq-root order-first h-[34svh] shrink-0 md:order-none md:h-auto md:min-w-0 md:flex-1">
          {stage}
          {focus && (
            <Button variant="outline" size="sm" className="absolute top-3 left-3 bg-white/90 shadow-sm" onClick={overview}>
              <Maximize2 /> Whole office
            </Button>
          )}
        </div>
        <ChatPane room={room} events={recent} scene={scene} onBack={() => setMView('list')}
          className={cn('md:flex md:w-[360px] lg:w-[400px]', mView === 'chat' ? 'flex flex-1 md:flex-none' : 'hidden')} />
      </div>
    </div>
  );
}

/**
 * The 3D office: one imperative engine (engine/Engine.ts) mounted once into a div. React only pushes the
 * reducer's latest scene and the focused zone into it; the scene itself is never re-rendered by React.
 */
const Stage = memo(function Stage({ interactive, scene, events, gallery, focus, onPick }: {
  interactive: boolean; scene: SceneState; events: OfficeEvent[]; gallery: GalleryItem[]; focus: string | null; onPick: (id: string | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<OfficeEngine | null>(null);
  useEffect(() => {
    const e = (engine.current = new OfficeEngine(host.current!, { interactive, onPick }));
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, [interactive, onPick]);
  useEffect(() => engine.current?.apply(scene, events, gallery), [scene, events, gallery, interactive, onPick]);
  useEffect(() => engine.current?.focus(focus), [focus, interactive, onPick]);
  return <div ref={host} className="hq-stage" />;
});
