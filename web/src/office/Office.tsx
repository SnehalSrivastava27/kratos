import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3, type Camera } from 'three';
import type { OfficeEvent, Zone } from '../shared/types';
import Floor from './Floor';
import Character from './Character';
import { ctx, roster, zoneById } from './data';
import SidePanel, { PANEL_CSS } from './SidePanel';
import { reduce } from './officeState';
import { ScenePropsLayer } from './SceneProps';
import { useEventFeed } from './useEventFeed';

export default function Office({ mode, feed }: { mode: 'live' | 'autoplay'; feed?: OfficeEvent[] }) {
  const events = useEventFeed(mode, feed);
  const scene = useMemo(() => reduce(events, ctx), [events]);
  const [focus, setFocus] = useState<Zone | null>(null);
  return (
    // live = full page with side panel; autoplay fills its parent (e.g. the landing hero box).
    <div style={{ position: 'relative', width: '100%', height: mode === 'live' ? '100vh' : '100%', overflow: 'hidden' }}>
      <div className={mode === 'live' ? 'hq-stage hq-stage-panel' : 'hq-stage'}>
      <Canvas dpr={[1, 2]} shadows camera={{ position: HOME_CAM, fov: 42 }}>
        <color attach="background" args={['#FFF6E5']} />
        <hemisphereLight args={['#FFFFFF', '#F4C27A', 1.25]} />
        <directionalLight position={[6, 16, 8]} intensity={1.3} castShadow shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-radius={4} />
        <Floor scene={scene} onPick={setFocus} />
        <CameraRig focus={focus} />
        <ScenePropsLayer scene={scene} />
        {roster.map((p) => <Character key={p.id} person={p} ps={scene.people[p.id]} />)}
        <OrbitControls makeDefault target={[0, 0, 0.5]} maxPolarAngle={1.2} minDistance={5} maxDistance={40} />
      </Canvas>
      </div>
      <style>{CSS + PANEL_CSS}</style>
      {mode === 'live' && (
        <SidePanel events={events} scene={scene} onSelect={(id) => setFocus(zoneById[scene.people[id].zone] ?? null)} />
      )}
      <div className="hq-banners">
        {Object.values(scene.people).filter((p) => p.beacon).map((p) => (
          <div key={p.beacon} className="hq-banner">🔴 {p.beacon}</div>
        ))}
      </div>
    </div>
  );
}

const HOME_CAM: [number, number, number] = [0, 21, 19];

/** Click a zone → fly there; click empty floor → fly home. Only animates while flying so user orbiting isn't fought. */
function CameraRig({ focus }: { focus: Zone | null }) {
  const { camera, controls } = useThree() as unknown as { camera: Camera; controls: { target: Vector3; update(): void } | null };
  const flying = useRef(false);
  const last = useRef<Zone | null>(null);
  const goal = useMemo(() => ({ pos: new Vector3(), tgt: new Vector3() }), []);
  useFrame((_, dt) => {
    if (!controls) return;
    if (last.current !== focus) {
      last.current = focus;
      flying.current = true;
      if (focus) { goal.tgt.set(focus.x, 0, focus.z); goal.pos.set(focus.x, 8, focus.z + 8); }
      else { goal.tgt.set(0, 0, 0.5); goal.pos.set(...HOME_CAM); }
    }
    if (!flying.current) return;
    const k = Math.min(1, dt * 3);
    camera.position.lerp(goal.pos, k);
    controls.target.lerp(goal.tgt, k);
    controls.update();
    if (camera.position.distanceTo(goal.pos) < 0.05) flying.current = false;
  });
  return null;
}

const CSS = `
.hq-stage { position: absolute; inset: 0 } .hq-stage-panel { right: 314px }
@media (max-width: 700px) { .hq-stage-panel { right: 0; bottom: calc(38vh + 12px) } }
.hq-zone { font: 700 12px ui-rounded, 'SF Pro Rounded', system-ui; color: #1E1328; background: rgba(255,246,229,.85);
  padding: 3px 9px; border-radius: 999px; white-space: nowrap; box-shadow: 0 2px 8px rgba(30,19,40,.1) }
.hq-chip { color: #fff; font: 700 12px system-ui; padding: 3px 8px; border-radius: 999px; white-space: nowrap; transition: background .4s }
.hq-state { font: 600 10px system-ui; color: #1E1328; opacity: .7 }
.hq-bubble { width: max-content; max-width: 220px; white-space: pre-line; background: #fff; color: #1E1328;
  font: 12px/1.35 system-ui; padding: 6px 9px; border-radius: 12px; box-shadow: 0 4px 14px rgba(30,19,40,.18) }
.hq-banners { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); display: grid; gap: 6px; pointer-events: none; z-index: 100 }
.hq-banner { background: #E5484D; color: #fff; font: 600 14px system-ui; padding: 8px 14px; border-radius: 999px;
  box-shadow: 0 6px 18px rgba(229,72,77,.35); animation: hq-pulse 1.2s ease-in-out infinite }
@keyframes hq-pulse { 50% { transform: scale(1.04) } }
`;
