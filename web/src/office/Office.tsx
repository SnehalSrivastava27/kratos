import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import type { OfficeEvent, Zone } from '../shared/types';
import saleDemo from '../../../demo/feeds/sale-demo.json';
import Floor from './Floor';
import Character from './Character';
import { ZONE_EMOJI, caption, ctx, firstLine, roster, zoneById, zones } from './data';
import SidePanel from './SidePanel';
import { reduce } from './officeState';
import { ScenePropsLayer } from './SceneProps';
import { useEventFeed } from './useEventFeed';
import './office.css';

export default function Office({ mode, feed }: { mode: 'live' | 'autoplay'; feed?: OfficeEvent[] }) {
  // Replay (live): run the story again locally from the top, as a fresh array so the feed hook restarts.
  const [replay, setReplay] = useState(0);
  const replayFeed = useMemo(() => (replay ? [...(feed ?? (saleDemo as OfficeEvent[]))] : undefined), [replay, feed]);
  const events = useEventFeed(replay ? 'autoplay' : mode, replayFeed ?? feed);
  const scene = useMemo(() => reduce(events, ctx), [events]);
  const gallery = useMemo(
    () => events.filter((e) => e.type === 'artifact' && e.meta?.artifact_url).map((e) => ({ url: e.meta!.artifact_url!, title: firstLine(e.text) })),
    [events],
  );
  const cap = caption(events, scene);
  const [focus, setFocus] = useState<Zone | null>(null);
  const live = mode === 'live';
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFocus(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  return (
    // live = full page with top bar + side panel; autoplay fills its parent (e.g. the landing hero box).
    <div className={live ? 'hq-root hq-live' : 'hq-root'} style={{ height: live ? '100vh' : '100%' }}>
      <div className="hq-stage">
        <Canvas dpr={[1, 2]} flat shadows={{ type: THREE.PCFShadowMap }} gl={{ alpha: true, antialias: true }} camera={{ fov: 32, near: 0.5, far: 200 }}>
          <hemisphereLight args={['#fff5e6', '#c9a27a', 1.5]} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[-8, 18, 10]} intensity={2.2} color="#fff1d6" castShadow shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-bias={-0.0008} shadow-normalBias={0.03} />
          <Suspense fallback={null}>
            <Floor onPick={(z) => live && setFocus((f) => (z && f?.id !== z.id ? z : null))} />
          </Suspense>
          <ScenePropsLayer scene={scene} gallery={gallery} />
          {roster.map((p) => <Character key={p.id} person={p} ps={scene.people[p.id]} celebrateId={scene.confettiId} />)}
          {zones.map((z) => (
            <Html key={z.id} position={[z.x - z.w / 2 + 0.45, 0.05, z.z + z.d / 2 - 0.35]} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
              <div className="hq-zone">{ZONE_EMOJI[z.id]} {z.label}</div>
            </Html>
          ))}
          <CameraRig focus={focus} />
          <Outlines />
        </Canvas>
      </div>
      {live ? (
        <>
          <div className="hq-top">
            <div className="hq-brand"><i className="hq-live-dot" />Kesar HQ <small>· Live office</small></div>
            <div className={`hq-caption hq-caption-${cap.tone}`}><span>{cap.tone === 'red' ? '🔴 ' : ''}{cap.text}</span></div>
            <button className="hq-btn" onClick={() => { setFocus(null); setReplay((r) => r + 1); }}>↻ Replay</button>
          </div>
          <SidePanel events={events} scene={scene} onSelect={(id) => setFocus(zoneById[scene.people[id].zone] ?? null)} />
        </>
      ) : (
        <div className={`hq-chip-caption hq-caption-${cap.tone}`}>{cap.tone === 'red' ? '🔴 ' : ''}{cap.text}</div>
      )}
    </div>
  );
}

/** Ink outlines round everything solid (core/scene.ts in agent-office uses the same OutlineEffect). */
function Outlines() {
  const { gl, scene, camera } = useThree();
  const fx = useMemo(() => new OutlineEffect(gl, { defaultThickness: 0.0035, defaultColor: [0.17, 0.18, 0.26] }), [gl]);
  useFrame(() => fx.render(scene, camera), 1);
  return null;
}

// Tilted 3/4 view from the front-right, so both walls read and the floor fills the frame.
const AZ = 0.38, EL = 0.9;
const FIT_PTS = [
  [-12.4, 0, 8.4], [12.4, 0, 8.4], [12.4, 0, -8.2], [-12.4, 2.6, -8.2], [12.4, 2.6, -8.2], [-12.4, 2.6, 8.4],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

/** Distance + aim so the whole floor fits the canvas (a little cropped on narrow screens). */
function fitHome(cam: THREE.PerspectiveCamera, aspect: number) {
  const c = cam.clone();
  c.aspect = aspect;
  c.updateProjectionMatrix();
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
    const crop = aspect < 1 ? 0.62 : 0.94; // portrait: let the sides run off rather than shrink everything
    d *= Math.max((y1 - y0) / 2, ((x1 - x0) / 2) * crop) / 0.96;
  }
  return { pos: c.position.clone(), tgt };
}

/** Home view with a slow drift; click a zone → fly there; click it again / Esc / empty floor → back home. */
function CameraRig({ focus }: { focus: Zone | null }) {
  const { camera, size } = useThree();
  const home = useMemo(() => fitHome(camera as THREE.PerspectiveCamera, size.width / size.height), [camera, size.width, size.height]);
  const cur = useRef<{ pos: THREE.Vector3; tgt: THREE.Vector3 } | null>(null);
  const goal = useMemo(() => ({ pos: new THREE.Vector3(), tgt: new THREE.Vector3() }), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (focus) {
      goal.tgt.set(focus.x, 0.8, focus.z);
      goal.pos.copy(goal.tgt).add(new THREE.Vector3(Math.sin(AZ) * 7, 9, Math.cos(AZ) * 7 + 1));
    } else {
      // gentle orbit around the floor centre
      const off = home.pos.clone().sub(home.tgt).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 0.07) * 0.05);
      goal.tgt.copy(home.tgt);
      goal.pos.copy(home.tgt).add(off);
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
