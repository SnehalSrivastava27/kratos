// Feed-driven props (PLAN §9.6 scene events table), in the toon style of the office around them.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneState } from './officeState';
import { C, DESK, roster, world, zoneById } from './data';
import { DESK_SIZE, MONITOR, PAL, WALL, monitorXs, wallBoard } from './Floor';
import { CITIES, FONT, bannerTex, drawWarScreen, indiaTex, paint, repaint, screenTex, uv } from './tex';
import { mesh, noOutline, roundedBox, toon, toonUnique } from './toon';
import { useAge } from './useAge';

const GW = 2.4, GH = 1.5;
const WALL_FACE = WALL.backZ + WALL.t / 2 + 0.06;
const lakh = (n: number) => `${n < 0 ? '−' : '+'}₹${(Math.abs(n) / 1e5).toFixed(2)}L`;
const popIn = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2);
const SCREEN: Record<string, string> = { idle: '#4a4e69', working: '#8ecae6', waiting: '#ff8fa3', done: '#95f2c3' };

/** Monitor faces: dim when idle, lit while working, mint when done, pink while blocked. */
function Screens({ scene }: { scene: SceneState }) {
  const tex = useMemo(() => screenTex(), []);
  const slots = useMemo(
    () => roster.filter((p) => DESK[p.zone]).flatMap((p) => monitorXs(p.zone).map((dx) => ({ id: p.id, pos: [...world(p.zone, DESK[p.zone])], dx }))),
    [],
  );
  return (
    <group>
      {slots.map(({ id, pos: [x, z], dx }) => (
        <mesh key={id + dx} position={[x + dx, MONITOR.y, z + MONITOR.z]}>
          <planeGeometry args={[MONITOR.w, MONITOR.h]} />
          <meshBasicMaterial map={tex} color={SCREEN[scene.people[id]?.state ?? 'idle']} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** War-room plan screen: checklist of every agent, EBITDA and the founder's sign-off, redrawn as the story moves. */
function WarScreen({ scene }: { scene: SceneState }) {
  const war = zoneById.war_room;
  const tex = useMemo(() => paint(1024, 512, () => {}), []);
  const board = useMemo(() => {
    const b = wallBoard(3.2, 1.6, PAL.ink, tex);
    b.position.set(war.x, 1.55, war.z - 2.15);
    noOutline(b);
    return b;
  }, [tex, war]);
  const shipped = !!scene.confettiId;
  const key = Object.values(scene.people).map((p) => p.state).join() + scene.ebitda + shipped;
  useEffect(() => repaint(tex, (g, W, H) => drawWarScreen(g, W, H, scene.people, scene.ebitda, shipped)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <primitive object={board} />;
}

/** Finance gauge on the back wall: red half, green half, a needle that swings with EBITDA. */
export function EbitdaMeter({ ebitda, glow }: { ebitda: number | null; glow: boolean }) {
  const z = zoneById.finance_cabin;
  const needle = useRef<THREE.Group>(null);
  const tex = useMemo(() => paint(512, 320, () => {}), []);
  const board = useMemo(() => {
    const b = wallBoard(GW, GH, PAL.trim, tex);
    noOutline(b);
    return b;
  }, [tex]);
  useEffect(
    () =>
      repaint(tex, (g, W, H) => {
        g.fillStyle = '#fffaf3'; g.fillRect(0, 0, W, H);
        const cx = W / 2, cy = 230, R = 160;
        g.lineWidth = 46;
        g.strokeStyle = C.red; g.beginPath(); g.arc(cx, cy, R, Math.PI, Math.PI * 1.5); g.stroke();
        g.strokeStyle = C.mint; g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.5, Math.PI * 2); g.stroke();
        g.lineWidth = 6; g.strokeStyle = PAL.ink; g.beginPath(); g.arc(cx, cy, R + 25, Math.PI, 0); g.stroke(); g.beginPath(); g.arc(cx, cy, R - 25, Math.PI, 0); g.stroke();
        g.textAlign = 'center'; g.fillStyle = PAL.ink; g.font = `900 30px ${FONT}`; g.fillText('EBITDA', cx, 40);
        g.font = `900 46px ${FONT}`; g.fillStyle = ebitda == null ? '#8d99ae' : ebitda < 0 ? C.red : '#1f9d63';
        g.fillText(ebitda == null ? '—' : lakh(ebitda), cx, 300);
      }),
    [ebitda, tex],
  );
  const target = ebitda == null ? 0 : -THREE.MathUtils.clamp(ebitda / 1.6e5, -1, 1) * 1.3;
  useFrame((_, dt) => {
    if (needle.current) needle.current.rotation.z += (target - needle.current.rotation.z) * Math.min(1, dt * 3);
  });
  // gauge centre on the board face: canvas (256, 230) of 512x320
  const gy = (0.5 - 230 / 320) * GH, k = GH / 1.2;
  return (
    <group>
      <group position={[z.x - 1.3, 1.5, WALL_FACE]}>
        <primitive object={board} />
        <group ref={needle} position={[0, gy, 0.12]} scale={k}>
          <mesh position-y={0.24} material={toon(PAL.ink)}>
            <boxGeometry args={[0.05, 0.5, 0.04]} />
          </mesh>
          <mesh material={toon(PAL.ink)}>
            <sphereGeometry args={[0.07, 12, 10]} />
          </mesh>
        </group>
      </group>
      {glow && <ApprovedGlow />}
    </group>
  );
}

/** Mint wash over the finance cabin's rug once the plan is approved. */
function ApprovedGlow() {
  const z = zoneById.finance_cabin;
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: C.mint, transparent: true, opacity: 0.4, depthWrite: false }), []);
  useFrame(({ clock }) => (mat.opacity = 0.28 + Math.sin(clock.elapsedTime * 3) * 0.12));
  return (
    <mesh rotation-x={-Math.PI / 2} position={[z.x, 0.05, z.z]} material={mat}>
      <planeGeometry args={[z.w - 0.5, z.d - 0.5]} />
    </mesh>
  );
}

/** Dispatch dock: India map on the left wall (pins pulse on a transfer, an arc Mumbai → Delhi) and a box riding the conveyor. */
export function DispatchDock({ pulseId, boxId }: { pulseId?: string; boxId?: string }) {
  const z = zoneById.dispatch_dock;
  const pins = useRef<THREE.Group>(null);
  const box = useRef<THREE.Group>(null);
  const pulseAge = useAge(pulseId), boxAge = useAge(boxId);
  const S = 1.7;
  const board = useMemo(() => {
    const b = wallBoard(S, S, PAL.wood, indiaTex());
    noOutline(b);
    return b;
  }, []);
  const at = (c: readonly [number, number]) => {
    const [u, v] = uv(c);
    return new THREE.Vector3((u - 0.5) * S, (v - 0.5) * S, 0.12);
  };
  const arc = useMemo(() => {
    const a = at(CITIES.Mumbai), b = at(CITIES.Delhi);
    const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(-0.25, 0, 0.35));
    return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 24, 0.025, 6);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const arcMat = useMemo(() => toonUnique(C.saffron, { emissive: '#b36b00' }), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime, pa = pulseAge(t);
    pins.current?.children.forEach((c, i) => {
      const k = pa < 6 ? 1 + Math.abs(Math.sin(t * 5 + i)) * 0.7 : 1;
      c.scale.setScalar(k);
    });
    const ba = boxAge(t);
    if (box.current) {
      box.current.visible = ba < 14;
      box.current.position.x = -1.4 + ((ba / 3.5) % 1) * 2.8;
    }
  });
  const pinMat = toon(C.red, { emissive: '#7a1418' });
  return (
    <group>
      <group position={[WALL.leftX + WALL.t / 2 + 0.06, 1.55, z.z - 0.2]} rotation-y={Math.PI / 2}>
        <primitive object={board} />
        <group ref={pins}>
          {Object.values(CITIES).map((c, i) => (
            <mesh key={i} position={at(c)} material={pinMat}>
              <sphereGeometry args={[0.065, 12, 10]} />
            </mesh>
          ))}
        </group>
        {pulseId && <mesh geometry={arc} material={arcMat} />}
      </group>
      <group ref={box} position={[z.x - 0.9, 0.63, z.z + 0.9]} visible={false}>
        <mesh position-y={0.17} material={toon('#d4a373')} castShadow>
          <primitive object={roundedBox(0.36, 0.32, 0.36, 0.03)} attach="geometry" />
        </mesh>
      </group>
    </group>
  );
}

/** Gallery wall: each saved banner pops onto the design studio's back wall; click to open it. */
export function GalleryWall({ items }: { items: { url: string; title: string }[] }) {
  const z = zoneById.design_studio;
  return (
    <group position={[z.x, 1.55, WALL_FACE]}>
      {items.slice(-4).map((it, i, a) => (
        <Frame key={it.url} {...it} i={i} x={(i - (a.length - 1) / 2) * 1.35} />
      ))}
    </group>
  );
}
function Frame({ url, title, i, x }: { url: string; title: string; i: number; x: number }) {
  const g = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  const obj = useMemo(() => {
    const o = new THREE.Group();
    o.add(mesh(roundedBox(1.08, 0.08, 1.32, 0.06).rotateX(Math.PI / 2), toon(PAL.wood)));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 1.15), new THREE.MeshBasicMaterial({ map: bannerTex(title, i), toneMapped: false }));
    face.position.z = 0.05;
    o.add(face);
    noOutline(o);
    return o;
  }, [title, i]);
  useFrame(({ clock }) => {
    born.current ??= clock.elapsedTime;
    g.current?.scale.setScalar(Math.max(0.001, popIn((clock.elapsedTime - born.current) / 0.5)));
  });
  return (
    <group ref={g} position-x={x}>
      <primitive
        object={obj}
        onClick={(e: { stopPropagation(): void }) => { e.stopPropagation(); window.open(url, '_blank'); }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      />
    </group>
  );
}

const N_CONFETTI = 180;
const dummy = new THREE.Object3D();
export function Confetti({ id }: { id?: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const age = useAge(id);
  const seeds = useMemo(
    () => Array.from({ length: N_CONFETTI }, () => ({ x: (Math.random() - 0.5) * 22, z: (Math.random() - 0.5) * 14, h: 6 + Math.random() * 6, s: 2 + Math.random() * 2, r: Math.random() * 6 })),
    [],
  );
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    m.userData.outlineParameters = { visible: false };
    return m;
  }, []);
  useLayoutEffect(() => {
    const cols = ['#F4A300', '#3CCB8B', '#E5484D', '#7C3AED', '#5bc0eb', '#ffd166'];
    seeds.forEach((_, i) => ref.current?.setColorAt(i, new THREE.Color(cols[i % cols.length])));
  }, [seeds]);
  useFrame(({ clock }) => {
    const m = ref.current;
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
    <instancedMesh ref={ref} args={[undefined, undefined, N_CONFETTI]} material={mat} visible={false} frustumCulled={false}>
      <planeGeometry args={[0.16, 0.24]} />
    </instancedMesh>
  );
}

export function ScenePropsLayer({ scene, gallery }: { scene: SceneState; gallery: { url: string; title: string }[] }) {
  return (
    <>
      <Screens scene={scene} />
      <WarScreen scene={scene} />
      <EbitdaMeter ebitda={scene.ebitda} glow={scene.financeGlow} />
      <DispatchDock pulseId={scene.pinPulseId} boxId={scene.boxId} />
      <GalleryWall items={gallery} />
      <Confetti id={scene.confettiId} />
    </>
  );
}

export { DESK_SIZE };
