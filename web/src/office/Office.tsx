/// <reference types="vite/client" />
// Full-screen office, laid out like AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// (src/client/index.html + style.css: the world edge to edge, a top bar, panels floating over it).
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OfficeEvent, Zone } from '../shared/types';
import saleDemo from '../../../demo/feeds/sale-demo.json';
import { caption, ctx, firstLine, galleryUrl, roomZone, zoneById } from './data';
import { ChatList, ChatPane, ROOMS } from './Telegram';
import { HelpDialog } from './Hud';
import { Expand, HelpCircle, MessageCircle, PanelLeft, Pin, PinOff, RotateCcw, Shrink, X } from 'lucide-react';
import { reduce, type SceneState } from './officeState';
import { useEventFeed } from './useEventFeed';
import { OfficeEngine } from './engine/Engine';
import type { GalleryItem } from './engine/props';
import './office.css';

const MAX_CHAT = 200;

/** A panel's open/pinned flags, remembered per browser (best effort: storage can be blocked). */
function usePanel(key: string, open0: boolean) {
  const read = () => {
    try {
      const v = JSON.parse(localStorage.getItem(`hq.${key}`) ?? 'null');
      if (v && typeof v.open === 'boolean') return v as { open: boolean; pinned: boolean };
    } catch { /* storage blocked */ }
    return { open: open0, pinned: false };
  };
  const [s, set] = useState(read);
  useEffect(() => {
    try { localStorage.setItem(`hq.${key}`, JSON.stringify(s)); } catch { /* storage blocked */ }
  }, [key, s]);
  return [s, set] as const;
}

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

  const stage = <Stage interactive={mode === 'live'} scene={scene} events={recent} gallery={gallery} focus={focus?.id ?? null} onPick={onPick} />;

  // Telegram side: which topic is open, unread counts.
  const narrow = typeof window !== 'undefined' && window.innerWidth < 760;
  const [drawer, setDrawer] = usePanel('drawer', false);
  const [chat, setChat] = usePanel('chat', !narrow);
  const [help, setHelp] = useState(false);
  const [full, setFull] = useState(false);
  const [room, setRoom] = useState('war_room'); // the founder's main topic is open to start, like their Telegram
  const [seen, setSeen] = useState<Record<string, number>>({});
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of recent) c[e.room] = (c[e.room] ?? 0) + 1;
    return c;
  }, [recent]);
  useEffect(() => setSeen((s) => (events.length === 0 ? {} : chat.open ? { ...s, [room]: counts[room] ?? 0 } : s)), [room, counts, events.length, chat.open]);
  const unread = Object.fromEntries(ROOMS.map((r) => [r.id, Math.max(0, (counts[r.id] ?? 0) - (seen[r.id] ?? 0))]));
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const openRoom = (id: string) => {
    setRoom(id);
    setChat((c) => ({ ...c, open: true }));
    if (narrow) setDrawer((d) => ({ ...d, open: false })); // phones: one sheet at a time
    setFocus(zoneById[roomZone[id]] ?? null);
  };
  function pickZone(z: Zone | null) {
    // A click on the world lets go of whatever isn't pinned.
    if (!drawer.pinned) setDrawer((d) => ({ ...d, open: false }));
    const r = z && ROOMS.find((rm) => rm.zone === z.id);
    if (!z || focus?.id === z.id) return setFocus(null);
    if (r) openRoom(r.id);
    else setFocus(z);
  }
  const cap = caption(events, scene);

  // Fullscreen API: the button, F, and the browser's own Esc all keep `full` in step.
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  // Keys. Esc closes the top-most thing: a window, then unpinned panels, then the zone focus.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]');
    if (e.key === 'Escape') {
      if (help) return setHelp(false);
      if (narrow && (drawer.open || chat.open)) return (setDrawer((d) => ({ ...d, open: false })), setChat((c) => ({ ...c, open: false })));
      if (drawer.open && !drawer.pinned) return setDrawer((d) => ({ ...d, open: false }));
      if (chat.open && !chat.pinned) return setChat((c) => ({ ...c, open: false }));
      return setFocus(null);
    }
    if (typing || help || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyT') setChat((c) => ({ ...c, open: true }));
    else if (e.code === 'KeyF') toggleFull();
    else if (e.key === '?') setHelp(true);
  };
  useEffect(() => {
    if (mode !== 'live') return;
    const k = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [mode]);

  if (mode === 'autoplay') {
    // landing hero: chrome-less, just the scene with its bubbles
    return (
      <div className="hq-root" style={{ height: '100%', width: '100%' }}>
        {stage}
      </div>
    );
  }

  const panelBtns = (p: { pinned: boolean }, set: typeof setChat, what: string) => (
    <>
      <button type="button" className={`ao-x${p.pinned ? ' on' : ''}`} aria-pressed={p.pinned} aria-label={p.pinned ? `Unpin ${what}` : `Pin ${what}`} title={p.pinned ? 'Pinned: stays open' : 'Pin open'}
        onClick={() => set((s) => ({ ...s, pinned: !s.pinned }))}>{p.pinned ? <Pin /> : <PinOff />}</button>
      <button type="button" className="ao-x" aria-label={`Close ${what}`} onClick={() => set((s) => ({ ...s, open: false }))}><X /></button>
    </>
  );

  return (
    <div className="hq-root hq-full">
      {stage}
      <div className="hq-hud">
        <header className="ao-top">
          <div className="ao-panel ao-brand">
            <div className="ao-logo">K</div>
            <div className="min-w-0">
              <div className="ao-name">
                Kesar HQ
                <span className={`ao-pill ${local ? 'replay' : 'live'}`}><i />{local ? 'Replay' : 'Live'}</span>
              </div>
              <div className={`ao-meta ${cap.tone}`} title={cap.text}>{cap.text}</div>
            </div>
          </div>
          <div className="ao-panel ao-controls">
            <button type="button" className={`ao-btn${drawer.open ? ' on' : ''}`} onClick={() => setDrawer((d) => ({ ...d, open: !d.open }))} title="Telegram topics" aria-pressed={drawer.open}>
              <PanelLeft /><span className="hidden sm:inline">Topics</span>
            </button>
            <button type="button" className={`ao-btn${chat.open ? ' on' : ''}`} onClick={() => setChat((c) => ({ ...c, open: !c.open }))} title="Chat (T)" aria-pressed={chat.open}>
              <MessageCircle /><span className="hidden sm:inline">Chat</span>
              {totalUnread > 0 && !chat.open && <span className="rounded-full bg-[#3390EC] px-1.5 text-[11px] text-white">{totalUnread}</span>}
            </button>
            <button type="button" className="ao-btn icon" onClick={() => { setFocus(null); setSeen({}); setReplay((r) => r + 1); }} title="Replay the story" aria-label="Replay the story"><RotateCcw /></button>
            <button type="button" className="ao-btn icon" onClick={toggleFull} title="Fullscreen (F)" aria-label="Fullscreen">{full ? <Shrink /> : <Expand />}</button>
            <button type="button" className="ao-btn icon" onClick={() => setHelp(true)} title="Controls (?)" aria-label="Controls"><HelpCircle /></button>
          </div>
        </header>
        {drawer.open && (
          <div className="ao-panel ao-drawer">
            <ChatList events={recent} scene={scene} selected={room} unread={unread} onSelect={openRoom} className="border-r-0" actions={panelBtns(drawer, setDrawer, 'topics')} />
          </div>
        )}
        {chat.open && (
          <div className="ao-panel ao-chat">
            <ChatPane room={room} events={recent} scene={scene} className="border-l-0" actions={panelBtns(chat, setChat, 'chat')} />
          </div>
        )}
      </div>
      {help && <HelpDialog onClose={() => setHelp(false)} />}
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
