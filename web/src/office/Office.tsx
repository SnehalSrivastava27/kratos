/// <reference types="vite/client" />
// Full-screen office, laid out like AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// (src/client/index.html + style.css: the world edge to edge, a top bar, panels floating over it).
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Library, OfficeEvent, RoomId, ShelfId, Workspace, Zone } from '../shared/types';
import saleDemo from '../../../demo/feeds/sale-demo.json';
import { DEMO_GROUP, addPerson, caption, setGroup, type HiredPerson, ctx, deskById, firstLine, galleryUrl, personById, roomZone, zoneById } from './data';
import * as api from './api';
import { CommandBar } from './CommandBar';
import { DEPT, personDept, type Dept } from './icons';

const HintIcon = ({ dept }: { dept: Dept }) => <dept.Icon size={17} color="#ffd166" strokeWidth={2} className="mr-1.5 inline -translate-y-px" />;
import { HireDialog } from './HireDialog';
import { LibraryWindow } from './LibraryWindow';
import { toast } from 'sonner';
import { ChatList, ChatPane, ROOMS } from './Telegram';
import { HelpDialog, Hint } from './Hud';
import { Command, Expand, Eye, Music, PawPrint, VolumeX, HelpCircle, MessageCircle, PanelLeft, Pin, PinOff, RotateCcw, Shrink, User, X } from 'lucide-react';
import { reduce, type SceneState } from './officeState';
import { useEventFeed } from './useEventFeed';
import { OfficeEngine, shelfLabel, type Target } from './engine/Engine';
import type { GalleryItem } from './engine/props';
import './office.css';

const MAX_CHAT = 200;
/** The poster's story moment: the team at their desks, mid-plan. */
const POSTER_AT = 9;

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

const urlHas = (k: string) => typeof location !== 'undefined' && new URLSearchParams(location.search).has(k);

export interface OfficeProps {
  /** live: the signed-in workspace's office (you walk it). autoplay: the landing hero, a chrome-less spectator loop of the demo. */
  mode: 'live' | 'autoplay';
  feed?: OfficeEvent[];
  /** The signed-in user's workspace (contracts/api.md v3): every call and /ws carry ?ws=<id>; its name is the group's. */
  workspace?: Workspace;
  /** Any 401 (the session is gone): the app sends them to /login. */
  onUnauthorized?: () => void;
  /** The scripted demo story with the full HUD (never real chats). Also /office?demo when no workspace is given. */
  demo?: boolean;
  /** Autoplay camera: 'hero' (default) a tight cinematic shot of the middle of the floor; 'wide' the whole office. */
  framing?: 'wide' | 'hero';
  /** The world is built and has drawn its first frame (the landing crossfades from its poster). */
  onReady?: () => void;
}

export default function Office({ mode, feed, workspace, onUnauthorized, demo, framing, onReady }: OfficeProps) {
  // Dev only: /office?poster renders the hero shot at a fixed story moment, no bubbles, for capturing a poster PNG.
  const poster = import.meta.env.DEV && urlHas('poster');
  if (poster) mode = 'autoplay';
  const isDemo = mode === 'autoplay' || !!demo || (!workspace && urlHas('demo'));
  const [run, setRun] = useState(0); // demo: Replay restarts the story (a fresh array restarts the feed hook)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const demoFeed = useMemo(() => [...(feed ?? (saleDemo as OfficeEvent[]))], [run, feed]);
  const unauth = useRef(onUnauthorized);
  unauth.current = onUnauthorized;
  const onUnauth = useCallback(() => unauth.current?.(), []);
  api.configureApi(!isDemo, workspace?.id, onUnauth);
  setGroup(isDemo ? DEMO_GROUP : workspace?.name ?? 'Your Telegram group');
  const streamed = useEventFeed(isDemo, isDemo ? demoFeed : undefined, { ws: workspace?.id, onUnauthorized: onUnauth });
  const posterEvents = useMemo(() => (poster ? demoFeed.slice(0, POSTER_AT) : null), [poster, demoFeed]);
  const feedEvents = posterEvents ?? streamed;
  // Local echoes while the backend isn't there (mock command / hire / librarian): appended after the feed.
  const [extra, setExtra] = useState<OfficeEvent[]>([]);
  useEffect(() => { if (!feedEvents.length) setExtra([]); }, [feedEvents.length]);
  const events = useMemo(() => (extra.length ? [...feedEvents, ...extra] : feedEvents), [feedEvents, extra]);
  const echo = (e: Omit<OfficeEvent, 'id' | 't'>) =>
    setExtra((x) => [...x, { ...e, id: `local-${Date.now()}-${x.length}`, t: Math.max(feedEvents[feedEvents.length - 1]?.t ?? 0, x[x.length - 1]?.t ?? 0) + 1000 }]);
  const [peopleVer, setPeopleVer] = useState(0); // bumps when someone joins the roster
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scene = useMemo(() => {
    const s = reduce(events, ctx);
    if (poster) for (const p of Object.values(s.people)) p.bubble = undefined;
    return s;
  }, [events, peopleVer, poster]);
  // the live array never resets: chat UI, the hub wall and the phone only ever see the latest MAX_CHAT events
  const recent = useMemo(() => (events.length > MAX_CHAT ? events.slice(-MAX_CHAT) : events), [events]);
  const [walls, setWalls] = useState<{ url: string; title: string }[]>([]); // /api/gallery banners (live)
  useEffect(() => {
    if (!isDemo) api.getGallery().then((r) => setWalls(r.data.flatMap((g) => (galleryUrl(g.url) ? [{ url: g.url, title: g.title }] : []))), () => {});
  }, [isDemo, workspace?.id]);
  // The gallery wall: banners already in /gallery (live), then whatever the Designer pins as the story goes.
  const gallery = useMemo(() => {
    const pinned = events.flatMap((e) => {
      const url = e.type === 'artifact' ? galleryUrl(e.meta?.artifact_url) : null;
      return url ? [{ url, title: firstLine(e.text) }] : [];
    });
    return [...walls.filter((w) => !pinned.some((p) => p.url === w.url)), ...pinned];
  }, [events, walls]);
  const [focus, setFocus] = useState<Zone | null>(null);
  // stable handler for the memo'd Stage; always calls the latest pickZone
  const pickRef = useRef(pickZone);
  pickRef.current = pickZone;
  const onPick = useCallback((id: string | null) => pickRef.current(id ? zoneById[id] ?? null : null), []);

  // You (the founder) walk the office, or watch it all (spectator). The landing hero is always a spectator.
  const engine = useRef<OfficeEngine | null>(null);
  const [view, setView] = useState<'player' | 'spectator'>(() => (new URLSearchParams(location.search).has('spectator') ? 'spectator' : 'player'));
  const [target, setTarget] = useState<Target | null>(null);
  const hooks = useRef({ onTarget: setTarget, onWorldClick: () => {} });
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const hero = mode === 'autoplay' ? framing ?? 'hero' : null;
  const stage = <Stage interactive={mode === 'live'} hero={hero} scene={scene} events={recent} gallery={gallery} focus={focus?.id ?? null} onPick={onPick} engineRef={engine} hooks={hooks}
    view={mode === 'live' ? view : 'spectator'} onReady={() => readyRef.current?.()} />;

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
  hooks.current.onWorldClick = () => {
    if (!drawer.pinned) setDrawer((d) => ({ ...d, open: false }));
    if (!chat.pinned && narrow) setChat((c) => ({ ...c, open: false }));
  };
  const waiting = Object.entries(scene.people).find(([, p]) => p.beacon)?.[0];
  // ---- Office actions: command bar, hiring, the library ----
  const [cmd, setCmd] = useState<{ room: string; text?: string } | null>(null);
  const [hireAt, setHireAt] = useState<{ desk?: string; room: string } | null>(null);
  const [libAt, setLibAt] = useState<{ shelf?: ShelfId } | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);
  const [music, setMusic] = useState(false); // muted until asked
  const loadLibrary = useCallback(() => api.getLibrary().then((r) => setLibrary(r.data), () => {}), []);
  useEffect(() => { if (mode === 'live') void loadLibrary(); }, [mode, loadLibrary]);
  useEffect(() => engine.current?.setLibrary(library), [library]);
  // While the Librarian works, look again every few seconds (the real one moves books around).
  useEffect(() => {
    if (library?.librarian !== 'working' || library.updatedAt === -1) return; // -1: the demo run acted out locally, nothing to poll
    const id = setInterval(() => void loadLibrary(), 5000);
    return () => clearInterval(id);
  }, [library, loadLibrary]);
  /** People from /api/people (live) and anyone the feed says was hired: added to the office, the new ones walking in. */
  const joinPeople = useCallback((list: HiredPerson[], arrive: boolean) => {
    const fresh = new Set(list.filter((p) => addPerson(p)).map((p) => p.id));
    if (!fresh.size) return;
    engine.current?.addPeople(arrive ? fresh : new Set());
    setPeopleVer((v) => v + 1);
  }, []);
  useEffect(() => {
    if (mode === 'live') api.getPeople().then((r) => joinPeople(r.data, false), () => {});
  }, [mode, joinPeople]);
  const hiredSeen = useRef(new Set<string>());
  useEffect(() => {
    // A `hired` event for someone we don't know yet: ask /api/people who they are, and walk them in.
    const unknown = events.filter((e) => e.type === 'hired' && !personById[e.speaker] && !hiredSeen.current.has(e.id));
    if (!unknown.length) return;
    unknown.forEach((e) => hiredSeen.current.add(e.id));
    api.getPeople().then((r) => joinPeople(r.data, true), () => {});
  }, [events, joinPeople]);
  // The Librarian's run finishing: re-read the shelves.
  const lastLib = [...events].reverse().find((e) => e.speaker === 'librarian');
  useEffect(() => { if (lastLib?.type === 'done') void loadLibrary(); }, [lastLib?.id, lastLib?.type, loadLibrary]);

  const hereRoom = () => {
    const z = engine.current?.playerZone();
    return ROOMS.find((r) => r.zone === z)?.id ?? room;
  };
  const sendCommand = async (to: RoomId, text: string) => {
    const r = await api.sendCommand(to, text);
    if (r.mock) echo({ room: to, speaker: 'founder', type: 'message', text });
    return r;
  };
  const doHire = async (body: api.HireBody) => {
    const r = await api.hire(body, hireAt?.desk);
    const e = 'action' in r.data ? r.data.employee : r.data;
    joinPeople([{ id: e.id, name: e.name, emoji: e.emoji, kind: 'agent', zone: deskById[e.desk]?.zone ?? roomZone[e.room], color: e.color, desk: e.desk, room: e.room, role: e.role }], true);
    toast(`${e.name} is on the way to their desk`);
    if (r.mock) echo({ room: e.room, speaker: e.id, type: 'hired', text: `👋 **${e.name}** joined as ${e.role}` });
    return r;
  };
  const recategorize = async () => {
    const r = await api.categorize();
    if (r.mock) {
      // Act it out: the Librarian walks the shelves, then reports back.
      const n = library?.shelves.reduce((a, s) => a + s.books.length, 0) ?? 0;
      echo({ room: 'war_room', speaker: 'librarian', type: 'working', text: `📚 **Re-shelving the library**\nReading ${n} skills and sorting them by department…` });
      setLibrary((l) => (l ? { ...l, librarian: 'working', updatedAt: -1 } : l));
      setTimeout(() => {
        echo({ room: 'war_room', speaker: 'librarian', type: 'done', text: `📚 **Library re-shelved**\n${n} skills on 8 shelves` });
        setLibrary((l) => (l ? { ...l, librarian: 'idle', updatedAt: Date.now() } : l));
      }, 12000);
      return 'The Librarian is on it (demo: acted out locally).';
    }
    void loadLibrary();
    return 'The Librarian is on it: watch her walk the shelves.';
  };
  const modalOpen = help || !!cmd || !!hireAt || !!libAt;
  useEffect(() => engine.current?.setEnabled(!modalOpen), [modalOpen]);
  useEffect(() => engine.current?.setInsets(!narrow && drawer.open ? 332 : 0, !narrow && chat.open ? 402 : 0), [narrow, drawer.open, chat.open]);

  function jumpToWaiting() {
    if (!waiting) return;
    engine.current?.jumpTo(waiting);
    openRoom(ROOMS.find((r) => r.zone === personById[waiting]?.zone)?.id ?? 'war_room');
  }
  /** E: use what you face. */
  function interact(t: Target | null) {
    if (!t) return;
    if (t.kind === 'agent') {
      const p = personById[t.id];
      const r = (p as { room?: string })?.room ?? ROOMS.find((rm) => rm.zone === p?.zone)?.id ?? 'war_room';
      setRoom(r);
      setCmd({ room: r, text: `@${p?.name ?? t.id} ` });
    } else if (t.kind === 'desk') {
      const z = deskById[t.desk]?.zone;
      setHireAt({ desk: t.desk, room: ROOMS.find((r) => r.zone === z)?.id ?? 'war_room' });
    } else if (t.kind === 'library') setLibAt({ shelf: t.shelf });
    else if (t.kind === 'frame') window.open(t.url, '_blank', 'noopener');
    else if (t.kind === 'dog') engine.current?.pet();
    else if (t.kind === 'jukebox') setMusic(!!engine.current?.toggleMusic());
  }
  const hint = (t: Target | null): { title?: React.ReactNode; text: string } | null => {
    if (!t) return null;
    if (t.kind === 'desk') return { text: `Hire at this desk · ${zoneById[deskById[t.desk]?.zone]?.label ?? ''}` };
    if (t.kind === 'library') return { text: `Open the library · ${shelfLabel(t.shelf)} shelf`, title: <HintIcon dept={DEPT[t.shelf] ?? DEPT.general} /> };
    if (t.kind === 'agent') return { text: `Talk to ${personById[t.id]?.name ?? t.id}`, title: <HintIcon dept={personDept(personById[t.id])} /> };
    if (t.kind === 'dog') return { text: 'Pet the office dog', title: <HintIcon dept={{ ...DEPT.general, Icon: PawPrint }} /> };
    if (t.kind === 'jukebox') return { text: music ? 'Stop the music' : 'Play some lo-fi', title: <HintIcon dept={{ ...DEPT.general, Icon: Music }} /> };
    return { text: 'Open this banner', title: <HintIcon dept={DEPT.design} /> };
  };

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
      if (cmd) return setCmd(null);
      if (hireAt) return setHireAt(null);
      if (libAt) return setLibAt(null);
      if (narrow && (drawer.open || chat.open)) return (setDrawer((d) => ({ ...d, open: false })), setChat((c) => ({ ...c, open: false })));
      if (drawer.open && !drawer.pinned) return setDrawer((d) => ({ ...d, open: false }));
      if (chat.open && !chat.pinned) return setChat((c) => ({ ...c, open: false }));
      return setFocus(null);
    }
    if ((e.code === 'KeyK' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing && !modalOpen)) {
      e.preventDefault();
      return setCmd((c) => c ?? { room: hereRoom() });
    }
    if (typing || modalOpen || e.metaKey || e.ctrlKey || e.altKey) return;
    if (['KeyE', 'KeyN', 'KeyT', 'KeyF'].includes(e.code)) e.preventDefault(); // the key mustn't also type into the window it opens
    if (e.code === 'KeyE') interact(target);
    else if (e.code === 'KeyN') jumpToWaiting();
    else if (e.code === 'KeyT') setChat((c) => ({ ...c, open: true }));
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
      <div className={poster ? 'hq-root hq-full' : 'hq-root'} style={{ height: '100%', width: '100%' }}>
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
                {isDemo ? 'Kesar HQ' : workspace?.name ?? 'Your office'}
                <span className={`ao-pill ${isDemo ? 'replay' : 'live'}`}><i />{isDemo ? 'Demo' : 'Live'}</span>
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
            <button type="button" className="ao-btn tg" onClick={() => setCmd({ room: hereRoom() })} title="Command bar (/ or Ctrl K)">
              <Command /><span className="hidden sm:inline">Message</span>
            </button>
            <button type="button" className="ao-btn icon" onClick={() => { setFocus(null); setView((v) => (v === 'player' ? 'spectator' : 'player')); }}
              title={view === 'player' ? 'Spectator: watch the whole office' : 'Walk the office as the founder'} aria-label={view === 'player' ? 'Spectator view' : 'Walk as the founder'}>
              {view === 'player' ? <Eye /> : <User />}
            </button>
            <button type="button" className={`ao-btn icon !hidden sm:!inline-flex${music ? ' on' : ''}`} onClick={() => setMusic(!!engine.current?.toggleMusic())}
              title={music ? 'Stop the jukebox' : 'Play the jukebox (lo-fi)'} aria-label={music ? 'Stop the music' : 'Play music'} aria-pressed={music}>{music ? <Music /> : <VolumeX />}</button>
            {isDemo && <button type="button" className="ao-btn icon !hidden sm:!inline-flex" onClick={() => { setFocus(null); setSeen({}); setRun((r) => r + 1); }} title="Replay the demo story" aria-label="Replay the demo story"><RotateCcw /></button>}
            <button type="button" className="ao-btn icon !hidden sm:!inline-flex" onClick={toggleFull} title="Fullscreen (F)" aria-label="Fullscreen">{full ? <Shrink /> : <Expand />}</button>
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
            <ChatPane room={room} events={recent} scene={scene} className="border-l-0" onCompose={() => setCmd({ room })} actions={panelBtns(chat, setChat, 'chat')} />
          </div>
        )}
      </div>
      {!isDemo && events.length === 0 && (
        <div className="ao-panel ao-empty" role="status">
          <MessageCircle className="mx-auto size-8 text-[#3390EC]" strokeWidth={1.5} />
          <div className="text-[17px] font-black">Waiting for your first Telegram message…</div>
          <div className="text-[13.5px] font-bold text-[var(--muted)]">Say something in {workspace?.name ?? 'your group'}, or press <span className="ao-key">/</span> to write to a topic from here.</div>
        </div>
      )}
      {view === 'player' && !modalOpen && (() => {
        const h = hint(target);
        if (h) return <Hint title={h.title} text={h.text} onClick={() => interact(target)} />;
        if (waiting) return <Hint k="N" onClick={jumpToWaiting} text={`${personById[waiting]?.name ?? 'Someone'} is waiting on you`} red />;
        return null;
      })()}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      {cmd && (
        <CommandBar room0={cmd.room} text0={cmd.text} onClose={() => setCmd(null)} onSend={sendCommand}
          onHire={() => (setCmd(null), setHireAt({ room: cmd.room }))} onLibrary={() => (setCmd(null), setLibAt({}))} />
      )}
      {hireAt && <HireDialog desk={hireAt.desk} room0={hireAt.room} library={library} onClose={() => setHireAt(null)} onHire={doHire} />}
      {libAt && <LibraryWindow library={library} shelf0={libAt.shelf} onClose={() => setLibAt(null)} onRecategorize={recategorize} />}
    </div>
  );
}

/**
 * The 3D office: one imperative engine (engine/Engine.ts) mounted once into a div. React only pushes the
 * reducer's latest scene and the focused zone into it; the scene itself is never re-rendered by React.
 */
type Hooks = { onTarget: (t: Target | null) => void; onWorldClick: () => void };
const Stage = memo(function Stage({ interactive, hero, scene, events, gallery, focus, onPick, engineRef, hooks, view, onReady }: {
  interactive: boolean; hero: 'wide' | 'hero' | null; scene: SceneState; events: OfficeEvent[]; gallery: GalleryItem[]; focus: string | null; onPick: (id: string | null) => void;
  engineRef: React.MutableRefObject<OfficeEngine | null>; hooks: React.MutableRefObject<Hooks>; view: 'player' | 'spectator'; onReady: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const engine = engineRef;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    const e = (engine.current = new OfficeEngine(host.current!, {
      interactive, onPick, onTarget: (t) => hooks.current.onTarget(t), onWorldClick: () => hooks.current.onWorldClick(), hero, onReady: () => onReadyRef.current(),
    }));
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, [interactive, onPick, hero]);
  useEffect(() => engine.current?.apply(scene, events, gallery), [scene, events, gallery, interactive, onPick]);
  useEffect(() => engine.current?.focus(focus), [focus, interactive, onPick]);
  useEffect(() => engine.current?.setView(view), [view, interactive, onPick]);
  return <div ref={host} className="hq-stage" />;
});
