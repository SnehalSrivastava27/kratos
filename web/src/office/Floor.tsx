import { Html } from '@react-three/drei';
import { zones } from './data';

export default function Floor() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <planeGeometry args={[24, 16]} />
        <meshStandardMaterial color="#bbbbbb" />
      </mesh>
      {zones.map((z) => (
        <group key={z.id} position={[z.x, 0, z.z]}>
          <mesh rotation-x={-Math.PI / 2}>
            <planeGeometry args={[z.w - 0.2, z.d - 0.2]} />
            <meshStandardMaterial color="#999999" />
          </mesh>
          <Html position={[0, 0.05, -z.d / 2 + 0.3]} center style={{ pointerEvents: 'none', whiteSpace: 'nowrap', font: '600 12px system-ui' }}>
            {z.label}
          </Html>
        </group>
      ))}
    </group>
  );
}
