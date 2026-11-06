import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { AgentState, Person as RosterPerson } from '../shared/types';
import type { PersonState } from './officeState';
import { C, DESK, clean, isSeat, spot } from './data';
import { Person, type Look } from './person';
import { noOutline, toonUnique } from './toon';
import { useAge } from './useAge';
import { clock } from './Telegram';

const SPEED = 3.4; // m/s
const JUMP_S = 0.7;
const BUBBLE_MS = 5200;
const SEAT_HIPS = 0.56;

/** Everyone gets their own face: skin tone, hair colour, hair style (indexes into person.ts tables). */
const LOOKS: Record<string, Look> = {
  founder: { skin: 3, hair: 0, style: 0 },
  'd2c-captain': { skin: 2, hair: 1, style: 2 },
  'd2c-analyst': { skin: 1, hair: 0, style: 5 },
  'd2c-ads': { skin: 4, hair: 0, style: 3 },
  'd2c-influencers': { skin: 2, hair: 7, style: 1 },
  'd2c-ops': { skin: 6, hair: 5, style: 6 },
  'd2c-design': { skin: 0, hair: 8, style: 4 },
};
const v = new THREE.Vector3();
/** Project like drei's Html, but keep the overlay `pad` px inside the canvas so bubbles near an edge aren't cut off. */
const clampTo = (pad: number) => (el: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number }) => {
  v.setFromMatrixPosition(el.matrixWorld).project(camera);
  const x = (v.x * 0.5 + 0.5) * size.width, y = (-v.y * 0.5 + 0.5) * size.height;
  return [Math.min(Math.max(x, pad), size.width - pad), Math.max(y, pad * 0.9)];
};
const STATE_LABEL: Record<AgentState, string> = { idle: 'Idle', working: 'Working', walking: 'On the move', waiting: 'Waiting', done: 'Done' };

export default function Character({ person, ps, celebrateId }: { person: RosterPerson; ps: PersonState; celebrateId?: string }) {
  const p = useMemo(() => {
    const q = new Person(person.color, LOOKS[person.id] ?? { skin: 1, hair: 0, style: 0 });
    const [x, z] = spot(ps.zone, person.id);
    q.root.position.set(x, 0, z);
    return q;
  }, [person.id, person.color]); // eslint-disable-line react-hooks/exhaustive-deps
  const ring = useMemo(() => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 32), toonUnique(C.red, { emissive: '#7a1418' }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.06;
    noOutline(m);
    return m;
  }, []);
  const waypoints = useRef<[number, number][]>([]);
  const jumpAge = useAge(ps.jumpId);
  const partyAge = useAge(celebrateId);
  const [walking, setWalking] = useState(false);
  const [bubble, setBubble] = useState<{ id: string; text: string; t: number }>();

  useEffect(() => {
    if (!ps.bubble) return;
    setBubble(ps.bubble);
    const id = window.setTimeout(() => setBubble(undefined), BUBBLE_MS);
    return () => clearTimeout(id);
  }, [ps.bubble?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    waypoints.current = ps.route.map((z) => spot(z, person.id));
    if (!ps.routeId) {
      const [x, z] = spot(ps.zone, person.id); // feed reset: snap home
      p.root.position.set(x, 0, z);
    }
  }, [ps.routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock }, dt) => {
    dt = Math.min(dt, 0.1);
    const g = p.root;
    const t = clock.elapsedTime;
    const wp = waypoints.current[0];
    let moving = false;
    let face: number | null = null;
    if (wp) {
      const dx = wp[0] - g.position.x, dz = wp[1] - g.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.03) waypoints.current.shift();
      else {
        const step = Math.min(dist, SPEED * dt);
        g.position.x += (dx / dist) * step;
        g.position.z += (dz / dist) * step;
        face = Math.atan2(dx, dz);
        moving = true;
      }
    }
    if (moving !== walking) setWalking(moving);
    const seated = !moving && isSeat(person.id, g.position.x, g.position.z);
    const party = partyAge(t);
    let jp = jumpAge(t) / JUMP_S;
    if (party < 4.5) jp = (party % 0.9) / JUMP_S; // celebrate: everyone bounces for a few seconds
    const airborne = jp < 1;
    g.position.y = airborne ? Math.sin(jp * Math.PI) * 0.75 : 0;
    const chair = seated && !!DESK[person.zone];
    p.sit(chair && !airborne ? SEAT_HIPS : null);
    p.typing = seated && ps.state === 'working';
    p.waiting = ps.state === 'waiting';
    if (face === null) face = seated ? Math.PI : 0; // at the desk: face the screen; elsewhere: face the room
    let d = face - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * Math.min(1, dt * (moving ? 12 : 5));
    p.update(dt, t, moving, airborne, 1.5);
    ring.visible = !!ps.beacon;
    if (ring.visible) ring.scale.setScalar(1 + Math.sin(t * 6) * 0.12);
  });

  const shown: AgentState = walking ? 'walking' : ps.state;
  const talking = !!bubble && ps.bubble?.id === bubble.id;
  return (
    <primitive object={p.root}>
      <primitive object={ring} />
      <Html position={[0, 1.95, 0]} zIndexRange={talking ? [40, 30] : [10, 0]} style={{ pointerEvents: 'none' }} calculatePosition={clampTo(talking ? 132 : 64)}>
        <div className="hq-over">
          {talking && (
            <div key={bubble.id} className="hq-bubble">
              <div className="hq-bubble-who" style={{ color: person.color }}>{person.emoji} {person.name}</div>
              <div className="hq-bubble-text">{clean(bubble.text)}<span className="hq-bubble-time">{clock(bubble.t)}</span></div>
            </div>
          )}
          <div className={`hq-tag hq-tag-${shown}`}>
            {!talking && <span className="hq-tag-name">{person.emoji} {person.name}</span>}
            {shown !== 'idle' && shown !== 'walking' && <span className="hq-tag-state">{ps.beacon && !walking ? 'Needs a reply' : STATE_LABEL[shown]}</span>}
          </div>
        </div>
      </Html>
    </primitive>
  );
}
