// Feed-driven props (PLAN §9.6 scene events table).
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Color, Object3D, type Group, type InstancedMesh, type Mesh, type MeshStandardMaterial } from 'three';
import type { SceneState } from './officeState';
import { zoneById } from './data';
import { useAge } from './useAge';

const RED = '#E5484D', MINT = '#3CCB8B';
const lakh = (n: number) => `${n < 0 ? '−' : '+'}₹${(Math.abs(n) / 1e5).toFixed(2)}L`;

export function EbitdaMeter({ ebitda, glow }: { ebitda: number | null; glow: boolean }) {
  const z = zoneById.finance_cabin;
  const needle = useRef<Group>(null);
  const face = useRef<MeshStandardMaterial>(null);
  const target = ebitda == null ? 0 : ebitda < 0 ? 1 : -1; // swing left = red, right = green
  const col = ebitda == null ? '#cfc6b8' : ebitda < 0 ? RED : MINT;
  useFrame((_, dt) => {
    if (needle.current) needle.current.rotation.z += (target - needle.current.rotation.z) * Math.min(1, dt * 4);
    face.current?.color.lerp(new Color(col), Math.min(1, dt * 4));
  });
  return (
    <group>
      <group position={[z.x + 1.5, 1.2, z.z - z.d / 2 + 0.25]}>
        <mesh>
          <circleGeometry args={[0.8, 24, 0, Math.PI]} />
          <meshStandardMaterial ref={face} color="#cfc6b8" />
        </mesh>
        <group ref={needle} position-z={0.02}>
          <mesh position-y={0.35}>
            <boxGeometry args={[0.06, 0.7, 0.02]} />
            <meshStandardMaterial color="#1E1328" />
          </mesh>
        </group>
        <Html position={[0, -0.25, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="hq-chip" style={{ background: col }}>EBITDA {ebitda == null ? '—' : lakh(ebitda)}</div>
        </Html>
      </group>
      {glow && (
        <mesh rotation-x={-Math.PI / 2} position={[z.x, 0.02, z.z]}>
          <planeGeometry args={[z.w - 0.2, z.d - 0.2]} />
          <meshBasicMaterial color={MINT} transparent opacity={0.35} />
        </mesh>
      )}
    </group>
  );
}

// Rough spots on a 1.6 x 1.2 map board: Delhi, Mumbai, Bengaluru.
const PINS: [number, number][] = [[-0.15, 0.35], [-0.4, -0.05], [-0.1, -0.4]];

export function DispatchDock({ pulseId, boxId }: { pulseId?: string; boxId?: string }) {
  const z = zoneById.dispatch_dock;
  const pins = useRef<Group>(null);
  const box = useRef<Mesh>(null);
  const pulseAge = useAge(pulseId), boxAge = useAge(boxId);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pa = pulseAge(t);
    pins.current?.children.forEach((c, i) => c.scale.setScalar(pa < 4 ? 1 + Math.abs(Math.sin(t * 6 + i)) * 0.8 : 1));
    const ba = boxAge(t); // slides once along the belt over 3s
    if (box.current) box.current.position.x = -1.8 + Math.min(1, ba / 3) * 3.6 * (ba === Infinity ? 0 : 1);
  });
  return (
    <group position={[z.x, 0, z.z]}>
      {/* India map board */}
      <group position={[-1.6, 1.2, -z.d / 2 + 0.25]}>
        <mesh>
          <planeGeometry args={[1.6, 1.2]} />
          <meshStandardMaterial color="#FFE3B0" />
        </mesh>
        <group ref={pins}>
          {PINS.map(([x, y], i) => (
            <mesh key={i} position={[x, y, 0.05]}>
              <sphereGeometry args={[0.07, 10, 8]} />
              <meshStandardMaterial color={RED} emissive={RED} emissiveIntensity={0.4} />
            </mesh>
          ))}
        </group>
      </group>
      {/* Conveyor + sliding box */}
      <mesh position={[0, 0.25, 1.2]}>
        <boxGeometry args={[4, 0.1, 0.6]} />
        <meshStandardMaterial color="#5b5566" />
      </mesh>
      <mesh ref={box} position={[-1.8, 0.48, 1.2]}>
        <boxGeometry args={[0.4, 0.36, 0.4]} />
        <meshStandardMaterial color="#C8935A" />
      </mesh>
    </group>
  );
}

export function GalleryWall({ urls }: { urls: string[] }) {
  const z = zoneById.design_studio;
  return (
    <group position={[z.x, 1.3, z.z - z.d / 2 + 0.2]}>
      <mesh position-z={-0.05}>
        <boxGeometry args={[z.w - 0.6, 1.6, 0.08]} />
        <meshStandardMaterial color="#FFF6E5" />
      </mesh>
      {urls.slice(-4).map((u, i) => (
        <mesh
          key={u + i}
          position={[-1.8 + i * 1.2, 0, 0.02]}
          onClick={(e) => { e.stopPropagation(); window.open(u, '_blank'); }}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <planeGeometry args={[0.9, 1.1]} />
          <meshStandardMaterial color={['#F4A300', '#DB2777', '#9333EA', '#2563EB'][i % 4]} />
        </mesh>
      ))}
    </group>
  );
}

const N_CONFETTI = 140;
const dummy = new Object3D();

export function Confetti({ id }: { id?: string }) {
  const mesh = useRef<InstancedMesh>(null);
  const age = useAge(id);
  const seeds = useMemo(
    () => Array.from({ length: N_CONFETTI }, () => ({ x: (Math.random() - 0.5) * 22, z: (Math.random() - 0.5) * 14, h: 6 + Math.random() * 6, s: 2 + Math.random() * 2, r: Math.random() * 6 })),
    [],
  );
  useLayoutEffect(() => {
    const cols = ['#F4A300', '#3CCB8B', '#E5484D', '#7C3AED', '#2563EB', '#FFF6E5'];
    seeds.forEach((_, i) => mesh.current?.setColorAt(i, new Color(cols[i % cols.length])));
  }, [seeds]);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const a = age(clock.elapsedTime);
    m.visible = a < 6;
    if (!m.visible) return;
    seeds.forEach((p, i) => {
      dummy.position.set(p.x + Math.sin(a * 2 + p.r) * 0.3, Math.max(0.02, p.h - a * p.s), p.z);
      dummy.rotation.set(a * 3 + p.r, a * 2, p.r);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, N_CONFETTI]} visible={false} frustumCulled={false}>
      <planeGeometry args={[0.14, 0.22]} />
      <meshBasicMaterial side={2} />
    </instancedMesh>
  );
}

export function ScenePropsLayer({ scene }: { scene: SceneState }) {
  return (
    <>
      <EbitdaMeter ebitda={scene.ebitda} glow={scene.financeGlow} />
      <DispatchDock pulseId={scene.pinPulseId} boxId={scene.boxId} />
      <GalleryWall urls={scene.gallery} />
      <Confetti id={scene.confettiId} />
    </>
  );
}
