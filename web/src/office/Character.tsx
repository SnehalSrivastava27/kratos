import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group, Mesh } from 'three';
import type { AgentState, Person } from '../shared/types';
import type { PersonState } from './officeState';
import { spot } from './data';
import { useAge } from './useAge';

const SPEED = 5; // m/s
const JUMP_S = 0.7;
const BUBBLE_MS = 5000;
const xz = ([x, z]: [number, number]) => [x, 0, z] as const;

export default function Character({ person, ps }: { person: Person; ps: PersonState }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const waypoints = useRef<[number, number][]>([]);
  const jumpAge = useAge(ps.jumpId);
  const [walking, setWalking] = useState(false);
  const [start] = useState(() => spot(ps.zone, person.id));
  const beacon = useRef<Mesh>(null);
  const [bubble, setBubble] = useState<string>();
  useEffect(() => {
    setBubble(ps.bubble?.text);
    const id = window.setTimeout(() => setBubble(undefined), BUBBLE_MS);
    return () => clearTimeout(id);
  }, [ps.bubble?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    waypoints.current = ps.route.map((z) => spot(z, person.id));
    if (!ps.routeId && root.current) root.current.position.set(...xz(spot(ps.zone, person.id))); // feed reset: snap home
  }, [ps.routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock }, dt) => {
    const g = root.current, b = body.current;
    if (!g || !b) return;
    const t = clock.elapsedTime;
    const wp = waypoints.current[0];
    let moving = false;
    if (wp) {
      const dx = wp[0] - g.position.x, dz = wp[1] - g.position.z;
      const dist = Math.hypot(dx, dz);
      const step = Math.min(dist, SPEED * dt);
      if (dist < 0.02) waypoints.current.shift();
      else {
        g.position.x += (dx / dist) * step;
        g.position.z += (dz / dist) * step;
        g.rotation.y = Math.atan2(dx, dz);
        moving = true;
      }
    }
    if (moving !== walking) setWalking(moving);
    const jp = jumpAge(t) / JUMP_S;

    b.position.y = 0;
    b.rotation.z = 0;
    if (moving) b.position.y = Math.abs(Math.sin(t * 12)) * 0.12;
    else if (jp < 1) b.position.y = Math.sin(jp * Math.PI) * 0.9;
    else if (ps.state === 'working') b.position.y = Math.abs(Math.sin(t * 18)) * 0.03;
    else if (ps.state === 'waiting') b.scale.setScalar(1 + Math.sin(t * 6) * 0.04);
    else if (ps.state === 'idle') b.rotation.z = Math.sin(t * 1.5) * 0.06;
    if (ps.state !== 'waiting') b.scale.setScalar(1);
    if (beacon.current) beacon.current.scale.setScalar(1 + Math.sin(t * 8) * 0.25);
  });

  const shown: AgentState = walking ? 'walking' : ps.state;
  return (
    <group ref={root} position={[start[0], 0, start[1]]}>
      <group ref={body}>
        <mesh position-y={0.55} castShadow>
          <capsuleGeometry args={[0.25, 0.5, 4, 12]} />
          <meshStandardMaterial color={person.color} />
        </mesh>
        <mesh position-y={1.15} castShadow>
          <sphereGeometry args={[0.2, 16, 12]} />
          <meshStandardMaterial color="#E0AC69" roughness={0.6} />
        </mesh>
      </group>
      {ps.beacon && (
        <mesh ref={beacon} position-y={2.35}>
          <sphereGeometry args={[0.14, 12, 8]} />
          <meshBasicMaterial color="#E5484D" />
        </mesh>
      )}
      <Html position={[0, 1.85, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none', textAlign: 'center' }}>
        <div style={{ fontSize: 18 }}>{person.emoji}{ps.state === 'done' && !walking ? '✅' : ''}</div>
        <div className="hq-state">{shown}</div>
      </Html>
      {bubble && (
        <Html position={[0, 2.9, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
          <div className="hq-bubble">{bubble}</div>
        </Html>
      )}
    </group>
  );
}
