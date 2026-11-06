import { Html } from '@react-three/drei';
import type { Person } from '../shared/types';
import { homeOf } from './data';

export default function Character({ person }: { person: Person }) {
  const [x, z] = homeOf(person);
  return (
    <group position={[x, 0, z]}>
      <mesh position-y={0.55}>
        <capsuleGeometry args={[0.25, 0.5, 4, 12]} />
        <meshStandardMaterial color={person.color} />
      </mesh>
      <mesh position-y={1.15}>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshStandardMaterial color="#f1c27d" />
      </mesh>
      <Html position={[0, 1.6, 0]} center style={{ pointerEvents: 'none', fontSize: 18 }}>
        {person.emoji}
      </Html>
    </group>
  );
}
