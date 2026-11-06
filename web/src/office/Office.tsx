import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OfficeEvent } from '../shared/types';
import Floor from './Floor';
import Character from './Character';
import { useMemo } from 'react';
import { ctx, roster } from './data';
import { reduce } from './officeState';
import { useEventFeed } from './useEventFeed';

export default function Office({ mode, feed }: { mode: 'live' | 'autoplay'; feed?: OfficeEvent[] }) {
  const events = useEventFeed(mode, feed);
  const scene = useMemo(() => reduce(events, ctx), [events]);
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 14, 16], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 14, 6]} intensity={1.2} />
        <Floor />
        {roster.map((p) => <Character key={p.id} person={p} ps={scene.people[p.id]} />)}
        <OrbitControls target={[0, 0, 0]} maxPolarAngle={1.2} />
      </Canvas>
      <div style={{ position: 'absolute', left: 12, bottom: 12, font: '12px system-ui' }}>
        {mode} · {events.length} events · {events[events.length - 1]?.text.slice(0, 60)}
      </div>
    </div>
  );
}
