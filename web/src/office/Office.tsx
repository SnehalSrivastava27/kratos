/// <reference types="vite/client" />
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import type { OfficeEvent, Zone } from '../shared/types';
import saleDemo from '../../../demo/feeds/sale-demo.json';
import Floor from './Floor';
import Character from './Character';
import { caption, ctx, firstLine, galleryUrl, roomZone, roster, zoneById } from './data';
import { ChatList, ChatPane, ROOMS } from './Telegram';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Maximize2, RotateCcw } from 'lucide-react';
import { reduce } from './officeState';
import { ScenePropsLayer } from './SceneProps';
import { useEventFeed } from './useEventFeed';
import './office.css';

export default function Office({ mode, feed }: { mode: 'live' | 'autoplay'; feed?: OfficeEvent[] }) {
  // Replay (live): run the story again locally from the top, as a fresh array so the feed hook restarts.
  const [replay, setReplay] = useState(() => (mode === 'live' && new URLSearchParams(location.search).has('demo') ? 1 : 0)); // /office?demo = local story, no server
  const replayFeed = useMemo(() => (replay ? [...(feed ?? (saleDemo as OfficeEvent[]))] : undefined), [replay, feed]);
  const events = useEventFeed(replay ? 'autoplay' : mode, replayFeed ?? feed);
  const scene = useMemo(() => reduce(events, ctx), [events]);
  const gallery = useMemo(
    () => events.flatMap((e) => {
      const url = e.type === 'artifact' ? galleryUrl(e.meta?.artifact_url) : null;
      return url ? [{ url, title: firstLine(e.text) }] : [];
    }),
    [events],
  );
  const [focus, setFocus] = useState<Zone | null>(null);
  // stable handler for the memo'd Floor; always calls the latest pickZone
  const pickRef = useRef(pickZone);
  pickRef.current = pickZone;
  const onPick = useCallback((z: Zone | null) => mode === 'live' && pickRef.current(z), [mode]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  const stage = (
    <Canvas dpr={[1, 2]} flat shadows={{ type: THREE.PCFShadowMap }} gl={{ alpha: true, antialias: true }} camera={{ fov: 32, near: 0.5, far: 200 }}>
      <hemisphereLight args={['#fff5e6', '#c9a27a', 1.5]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[-8, 18, 10]} intensity={2.2} color="#fff1d6" castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-bias={-0.0008} shadow-normalBias={0.03} />
      <Suspense fallback={null}>
        <Floor onPick={onPick} />
      </Suspense>
      <ScenePropsLayer scene={scene} gallery={gallery} events={events} />
      {roster.map((p) => <Character key={p.id} person={p} ps={scene.people[p.id]} celebrateId={scene.confettiId} />)}
      <CameraRig focus={focus} />
      <Outlines />
    </Canvas>
  );

  // Telegram side: which group is open, unread counts, phone list → chat navigation.
  const [room, setRoom] = useState('war_room'); // the founder's main group is open to start, like their Telegram
  const [mView, setMView] = useState<'list' | 'chat'>('list');
  const [seen, setSeen] = useState<Record<string, number>>({});
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.room] = (c[e.room] ?? 0) + 1;
    return c;
  }, [events]);
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
        <div className="hq-stage">{stage}</div>
      </div>
    );
  }
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-[#F1F1F4] font-sans text-black antialiased">
      <header className="z-10 flex h-12 shrink-0 items-center gap-3 border-b border-black/[0.06] bg-white px-3 md:px-4">
        <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-[#F4A300] to-[#E07A00] text-sm font-bold text-white">K</div>
        <div className="text-[15px] font-semibold">Kesar HQ</div>
        <span className={cn('flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold', replay ? 'bg-[#3390EC]/10 text-[#1A6FB5]' : 'bg-[#3CCB8B]/15 text-[#0F7A4F]')}>
          <span className={cn('size-1.5 rounded-full', replay ? 'bg-[#3390EC]' : 'animate-pulse bg-[#3CCB8B]')} />
          {replay ? 'Replay' : 'Live'}
        </span>
        <div className={cn('hidden min-w-0 flex-1 truncate text-sm md:block', cap.tone === 'red' ? 'text-[#C8303A]' : cap.tone === 'mint' ? 'text-[#0F7A4F]' : 'text-[#707579]')}>
          {cap.text}
        </div>
        <Button variant="outline" size="sm" className="ml-auto md:ml-0" onClick={() => { overview(); setSeen({}); setReplay((r) => r + 1); }}>
          <RotateCcw /> Replay
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <ChatList events={events} scene={scene} selected={room} unread={unread} onSelect={openRoom}
          className={cn('md:flex md:w-[300px] lg:w-[330px]', mView === 'list' ? 'flex flex-1 md:flex-none' : 'hidden')} />
        <div className="hq-root order-first h-[34svh] shrink-0 md:order-none md:h-auto md:min-w-0 md:flex-1">
          <div className="hq-stage">{stage}</div>
          {focus && (
            <Button variant="outline" size="sm" className="absolute top-3 left-3 bg-white/90 shadow-sm" onClick={overview}>
              <Maximize2 /> Whole office
            </Button>
          )}
        </div>
        <ChatPane room={room} events={events} scene={scene} onBack={() => setMView('list')}
          className={cn('md:flex md:w-[360px] lg:w-[400px]', mView === 'chat' ? 'flex flex-1 md:flex-none' : 'hidden')} />
      </div>
    </div>
  );
}

/** Ink outlines round everything solid (core/scene.ts in agent-office uses the same OutlineEffect). */
function Outlines() {
  const { gl, scene, camera } = useThree();
  const fx = useMemo(() => new OutlineEffect(gl, { defaultThickness: 0.0035, defaultColor: [0.17, 0.18, 0.26] }), [gl]);
  useFrame(() => fx.render(scene, camera), 1);
  if (import.meta.env.DEV) {
    // dev probe for the screenshot loop: meshes in the scene and draw calls in the last frame
    (window as unknown as { __hqInfo: () => object }).__hqInfo = () => {
      let meshes = 0;
      scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) meshes++; });
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return { meshes, calls: gl.info.render.calls, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, heapMB: mem ? Math.round(mem.usedJSHeapSize / 1e6) : null };
    };
  }
  return null;
}

// Tilted 3/4 view from the front-right, so both walls read and the floor fills the frame.
const AZ = 0.12;
const elevation = (aspect: number) => THREE.MathUtils.clamp(1.25 - 0.3 * aspect, 0.86, 1.02); // portrait panes look down more
const FIT_PTS = [
  [-12.4, 0, 8.4], [12.4, 0, 8.4], [12.4, 0, -8.2], [-12.4, 2.6, -8.2], [12.4, 2.6, -8.2], [-12.4, 2.6, 8.4],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

/** Distance + aim so the whole floor fits the canvas (a little cropped on narrow screens). */
function fitHome(cam: THREE.PerspectiveCamera, aspect: number, narrow: boolean) {
  const c = cam.clone();
  c.aspect = aspect;
  c.updateProjectionMatrix();
  const EL = elevation(aspect);
  const dir = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
  const tgt = new THREE.Vector3(0, 0, 0.5);
  const v = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  let d = 40;
  for (let it = 0; it < 10; it++) {
    c.position.copy(tgt).addScaledVector(dir, d);
    c.lookAt(tgt);
    c.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of FIT_PTS) {
      v.copy(p).project(c);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    const half = Math.tan(THREE.MathUtils.degToRad(c.fov / 2)) * d;
    right.setFromMatrixColumn(c.matrixWorld, 0);
    up.setFromMatrixColumn(c.matrixWorld, 1);
    tgt.addScaledVector(right, ((x0 + x1) / 2) * half * aspect).addScaledVector(up, ((y0 + y1) / 2) * half);
    const crop = narrow ? 0.66 : THREE.MathUtils.clamp(0.25 + 0.45 * aspect, 0.6, 0.9); // phones: zoom in, let the sides run off // portrait: let the sides run off rather than shrink everything
    d *= Math.max((y1 - y0) / 2, ((x1 - x0) / 2) * crop) / 0.96;
  }
  return { pos: c.position.clone(), tgt };
}

/** Home view with a slow drift; click a zone → fly there; click it again / Esc / empty floor → back home. */
// scratch vectors: the rig runs every frame, so it allocates nothing
const ZOOM_OFF = new THREE.Vector3(Math.sin(AZ) * 8.5, 10.5, Math.cos(AZ) * 8.5 + 1);
const UP = new THREE.Vector3(0, 1, 0);
const OFF = new THREE.Vector3();
function CameraRig({ focus }: { focus: Zone | null }) {
  const { camera, size } = useThree();
  const home = useMemo(() => fitHome(camera as THREE.PerspectiveCamera, size.width / size.height, size.width < 520), [camera, size.width, size.height]);
  const cur = useRef<{ pos: THREE.Vector3; tgt: THREE.Vector3 } | null>(null);
  const goal = useMemo(() => ({ pos: new THREE.Vector3(), tgt: new THREE.Vector3() }), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (focus) {
      goal.tgt.set(focus.x, 0.8, focus.z);
      goal.pos.copy(goal.tgt).add(ZOOM_OFF);
    } else {
      // gentle orbit around the floor centre
      OFF.copy(home.pos).sub(home.tgt).applyAxisAngle(UP, Math.sin(t * 0.07) * 0.05);
      goal.tgt.copy(home.tgt);
      goal.pos.copy(home.tgt).add(OFF);
    }
    if (!cur.current) cur.current = { pos: goal.pos.clone(), tgt: goal.tgt.clone() };
    const k = 1 - Math.exp(-dt * 2.5);
    cur.current.pos.lerp(goal.pos, k);
    cur.current.tgt.lerp(goal.tgt, k);
    camera.position.copy(cur.current.pos);
    camera.lookAt(cur.current.tgt);
  });
  return null;
}
