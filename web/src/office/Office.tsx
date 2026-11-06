import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OfficeEvent } from '../shared/types';
import Floor from './Floor';
import Character from './Character';
import { useMemo } from 'react';
import { ctx, roster } from './data';
import { reduce } from './officeState';
import { ScenePropsLayer } from './SceneProps';
import { useEventFeed } from './useEventFeed';

export default function Office({ mode, feed }: { mode: 'live' | 'autoplay'; feed?: OfficeEvent[] }) {
  const events = useEventFeed(mode, feed);
  const scene = useMemo(() => reduce(events, ctx), [events]);
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 19, 17], fov: 42 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 14, 6]} intensity={1.2} />
        <Floor />
        <ScenePropsLayer scene={scene} />
        {roster.map((p) => <Character key={p.id} person={p} ps={scene.people[p.id]} />)}
        <OrbitControls target={[0, 0, 0]} maxPolarAngle={1.2} />
      </Canvas>
      <style>{CSS}</style>
      <div className="hq-banners">
        {Object.values(scene.people).filter((p) => p.beacon).map((p) => (
          <div key={p.beacon} className="hq-banner">🔴 {p.beacon}</div>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.hq-chip { color: #fff; font: 700 12px system-ui; padding: 3px 8px; border-radius: 999px; white-space: nowrap; transition: background .4s }
.hq-state { font: 600 10px system-ui; color: #1E1328; opacity: .7 }
.hq-bubble { width: max-content; max-width: 220px; white-space: pre-line; background: #fff; color: #1E1328;
  font: 12px/1.35 system-ui; padding: 6px 9px; border-radius: 12px; box-shadow: 0 4px 14px rgba(30,19,40,.18) }
.hq-banners { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); display: grid; gap: 6px; pointer-events: none }
.hq-banner { background: #E5484D; color: #fff; font: 600 14px system-ui; padding: 8px 14px; border-radius: 999px;
  box-shadow: 0 6px 18px rgba(229,72,77,.35); animation: hq-pulse 1.2s ease-in-out infinite }
@keyframes hq-pulse { 50% { transform: scale(1.04) } }
`;
