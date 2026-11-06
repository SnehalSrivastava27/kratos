import { useMemo } from 'react';
import { Html, RoundedBox } from '@react-three/drei';
import { Color } from 'three';
import type { Zone } from '../shared/types';
import type { SceneState } from './officeState';
import { roster, spot, zoneById, zones } from './data';

export const C = { saffron: '#F4A300', cream: '#FFF6E5', plum: '#1E1328', mint: '#3CCB8B', red: '#E5484D' };
const ZONE_EMOJI: Record<string, string> = {
  design_studio: '🎨', data_wall: '📊', finance_cabin: '💰', creator_studio: '⭐', war_room: '🎯',
  growth_pod: '📣', dispatch_dock: '📦', dark_store: '⚡', chai_pantry: '☕', founder_desk: '👑',
};
const owner = (zoneId: string) => roster.find((p) => p.zone === zoneId);
const at = (z: Zone, dx: number, dz: number) => [z.x + dx, 0, z.z + dz] as [number, number, number];

function ZoneTile({ z, onPick }: { z: Zone; onPick: (z: Zone) => void }) {
  const tint = useMemo(() => '#' + new Color(C.cream).lerp(new Color(owner(z.id)?.color ?? C.saffron), 0.16).getHexString(), [z.id]);
  return (
    <group position={[z.x, 0, z.z]}>
      <RoundedBox args={[z.w - 0.3, 0.06, z.d - 0.3]} radius={0.03} smoothness={2} position-y={0.01} receiveShadow
        onClick={(e) => { e.stopPropagation(); onPick(z); }}>
        <meshStandardMaterial color={tint} />
      </RoundedBox>
      <Html position={[0, 0.06, z.d / 2 - 0.35]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="hq-zone">{ZONE_EMOJI[z.id]} {z.label}</div>
      </Html>
    </group>
  );
}

/** Desk + monitor behind each person's home spot; monitor glows saffron while they're working. */
function Desk({ personId, glow }: { personId: string; glow: boolean }) {
  const p = roster.find((r) => r.id === personId)!;
  const [x, z] = spot(p.zone, p.id);
  return (
    <group position={[x, 0, z - 0.75]}>
      <RoundedBox args={[1.3, 0.7, 0.6]} radius={0.08} smoothness={2} position-y={0.35} castShadow receiveShadow>
        <meshStandardMaterial color="#E9D3B0" />
      </RoundedBox>
      <mesh position={[0, 1.0, -0.1]} castShadow>
        <boxGeometry args={[0.7, 0.45, 0.05]} />
        <meshStandardMaterial color={C.plum} emissive={glow ? C.saffron : '#000'} emissiveIntensity={glow ? 0.9 : 0} />
      </mesh>
    </group>
  );
}

function Furniture({ scene }: { scene: SceneState }) {
  const war = zoneById.war_room, data = zoneById.data_wall, cr = zoneById.creator_studio;
  const dark = zoneById.dark_store, chai = zoneById.chai_pantry, dock = zoneById.dispatch_dock, fd = zoneById.founder_desk;
  return (
    <group>
      {roster.filter((p) => p.id !== 'd2c-captain').map((p) => (
        <Desk key={p.id} personId={p.id} glow={scene.people[p.id]?.state === 'working'} />
      ))}
      {/* War room: glass cabin, table, big screen */}
      <RoundedBox args={[3, 0.5, 1.4]} radius={0.15} smoothness={3} position={[war.x, 0.25, war.z + 0.1]} castShadow receiveShadow>
        <meshStandardMaterial color="#FFFFFF" />
      </RoundedBox>
      <mesh position={[war.x, 1.4, war.z - war.d / 2 + 0.2]}>
        <boxGeometry args={[3.2, 1.4, 0.08]} />
        <meshStandardMaterial color={C.plum} emissive={C.saffron} emissiveIntensity={0.25} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[war.x + (s * war.w) / 2 - s * 0.15, 0.9, war.z]}>
          <boxGeometry args={[0.05, 1.8, war.d - 0.3]} />
          <meshStandardMaterial color="#BFE6FF" transparent opacity={0.25} />
        </mesh>
      ))}
      {/* Data wall: three chart screens */}
      {[-1.8, 0, 1.8].map((dx, i) => (
        <mesh key={dx} position={[data.x + dx, 1.5, data.z - data.d / 2 + 0.15]}>
          <boxGeometry args={[1.5, 0.95, 0.06]} />
          <meshStandardMaterial color={C.plum} emissive={['#2563EB', C.mint, C.saffron][i]} emissiveIntensity={0.35} />
        </mesh>
      ))}
      {/* Creator studio: ring light on a tripod */}
      <mesh position={at(cr, 2, -0.6).map((v, i) => (i === 1 ? 1.5 : v)) as [number, number, number]}>
        <torusGeometry args={[0.35, 0.05, 8, 24]} />
        <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[cr.x + 2, 0.6, cr.z - 0.6]} castShadow>
        <cylinderGeometry args={[0.03, 0.05, 1.2, 6]} />
        <meshStandardMaterial color={C.plum} />
      </mesh>
      {/* Dark-store rack */}
      <RoundedBox args={[1.6, 1.4, 0.5]} radius={0.06} smoothness={2} position={[dark.x, 0.7, dark.z - 0.6]} castShadow>
        <meshStandardMaterial color="#7C6F8A" />
      </RoundedBox>
      <Html position={[dark.x, 1.65, dark.z - 0.6]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="hq-chip" style={{ background: C.saffron }}>⚡ 10-min delivery</div>
      </Html>
      {/* Chai pantry: counter + beanbags */}
      <RoundedBox args={[2.4, 0.9, 0.6]} radius={0.12} smoothness={2} position={[chai.x, 0.45, chai.z - 1]} castShadow>
        <meshStandardMaterial color={C.saffron} />
      </RoundedBox>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[chai.x + s * 1.3, 0.25, chai.z + 0.8]} scale={[1, 0.6, 1]} castShadow>
          <sphereGeometry args={[0.45, 16, 12]} />
          <meshStandardMaterial color={s < 0 ? '#DB2777' : C.mint} />
        </mesh>
      ))}
      {/* Dispatch dock: stacked boxes */}
      {[0, 1].map((i) => (
        <mesh key={i} position={[dock.x + 2.2, 0.25 + i * 0.5, dock.z - 0.9]} rotation-y={i * 0.4} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color="#C8935A" />
        </mesh>
      ))}
      {/* Founder's phone (Telegram) */}
      <mesh position={[fd.x + 0.2, 0.75, fd.z - 0.05]} rotation-x={-0.9}>
        <boxGeometry args={[0.2, 0.36, 0.03]} />
        <meshStandardMaterial color="#229ED9" emissive="#229ED9" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

export default function Floor({ scene, onPick }: { scene: SceneState; onPick: (z: Zone | null) => void }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow onClick={() => onPick(null)}>
        <planeGeometry args={[25, 17]} />
        <meshStandardMaterial color="#FBEFD9" />
      </mesh>
      {/* back + left walls */}
      <mesh position={[0, 1.2, -8.5]} receiveShadow>
        <boxGeometry args={[25, 2.4, 0.2]} />
        <meshStandardMaterial color="#FBE3B6" />
      </mesh>
      <mesh position={[-12.5, 1.2, 0]} receiveShadow>
        <boxGeometry args={[0.2, 2.4, 17]} />
        <meshStandardMaterial color="#F8D99A" />
      </mesh>
      {zones.map((z) => <ZoneTile key={z.id} z={z} onPick={onPick} />)}
      <Furniture scene={scene} />
    </group>
  );
}
