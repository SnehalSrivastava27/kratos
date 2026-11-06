import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OfficeEvent } from '../shared/types';
import Floor from './Floor';
import Character from './Character';
import { roster } from './data';

export default function Office({ mode }: { mode: 'live' | 'autoplay'; feed?: OfficeEvent[] }) {
  return (
    <div style={{ width: '100vw', height: '100vh' }} data-mode={mode}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 14, 16], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 14, 6]} intensity={1.2} />
        <Floor />
        {roster.map((p) => <Character key={p.id} person={p} />)}
        <OrbitControls target={[0, 0, 0]} maxPolarAngle={1.2} />
      </Canvas>
    </div>
  );
}
