// One person in the office: walks their route round the furniture, sits and types at their desk, hops on
// done, folds their arms under a red beacon while waiting, dances when the team celebrates. Movement and
// turning ease with frame-rate-independent damping, as remote people do in agent-office's main loop.
// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs: src/client/main.ts
// (remote people: position/rotation easing, walk detection) and player.ts (turn toward travel).
import * as THREE from 'three';
import type { AgentState, Person as RosterPerson } from '../../shared/types';
import type { PersonState } from '../officeState';
import { C, clean, deskById, isSeat, readable, spot, zoneById } from '../data';
import { clock } from '../Telegram';
import { noOutline, toonUnique } from '../toon';
import { tgDom } from '../md';
import { iconSvg, personDept } from '../icons';
import { Person, type Look } from './person';
import type { NavGrid } from './nav';

const WALK = 2.0; // m/s: matches the walk cycle at pace 1, so feet don't slide
const HURRY = 3.0; // long trips (across the floor) at a jog
const ACCEL = 6;
const DECEL = 5;
const JUMP_S = 0.7;
const SEAT_HIPS = 0.56;
const BUBBLE_S = 5.2;
const HERO_BUBBLE_S = 3.4; // the landing hero: one short line at a time, in and out
const DANCE_S = 5;
const STOP_PAUSE = 0.75; // seconds at each desk on a tour (a tap on the shoulder)

/** Everyone gets their own face: skin tone, hair colour, hair style (indexes into person.ts tables). */
const LOOKS: Record<string, Look> = {
  founder: { skin: 3, hair: 0, style: 0 },
  'd2c-captain': { skin: 2, hair: 1, style: 2 },
  'd2c-analyst': { skin: 1, hair: 0, style: 5 },
  'd2c-ads': { skin: 4, hair: 0, style: 3 },
  'd2c-influencers': { skin: 2, hair: 7, style: 1 },
  'd2c-ops': { skin: 6, hair: 5, style: 6 },
  'd2c-design': { skin: 0, hair: 8, style: 4 },
  librarian: { skin: 5, hair: 9, style: 4 },
};
/** Anyone else (a hire) gets a look of their own, the same every load. */
const lookFor = (id: string): Look => {
  let h = 7;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { skin: h % 8, hair: (h >> 3) % 10, style: (h >> 7) % 7 };
};
const STATE_LABEL: Record<AgentState, string> = { idle: 'Idle', working: 'Working', walking: 'On the move', waiting: 'Waiting', done: 'Done' };

interface Waypoint { x: number; z: number; stop: boolean; zone: string }
const angleTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const v = new THREE.Vector3();

export class Agent {
  readonly person: Person;
  readonly el = document.createElement('div');
  readonly ring: THREE.Mesh;
  ps: PersonState;
  private over = document.createElement('div');
  private tag = document.createElement('div');
  private bubbleEl: HTMLElement | null = null;
  private bubbleId?: string;
  private bubbleT = -Infinity;
  private tagKey = '';
  private path: Waypoint[] = [];
  private routeId: string | undefined | null = null; // null: never synced
  private speed = 0;
  private maxSpeed = WALK;
  private pause = 0;
  private facing = 0;
  private jumpId?: string;
  private jumpT = -Infinity;
  private danceT = -Infinity;
  private dingT = -Infinity;
  private ox = NaN;
  private oy = NaN;
  /** Where the speaker of the moment stands, for listeners nearby to turn to. Set by the engine. */
  lookAt: { x: number; z: number; zone: string } | null = null;
  onDing: (() => void) | null = null;
  /** Set while the founder walks this person (engine/player.ts): routes from the feed wait until it lets go. */
  drive: { moving: boolean; speed: number; facing: number } | null = null;
  /** Wanders between these spots while working (the librarian between her shelves). */
  wander: [number, number][] | null = null;
  /** The landing hero: a small icon badge over the head and nothing else; bubbles come and go quicker. */
  hero = false;
  private wanderT = 0;

  constructor(readonly info: RosterPerson, ps: PersonState) {
    this.ps = ps;
    this.person = new Person(info.color, LOOKS[info.id] ?? lookFor(info.id));
    const [x, z] = spot(ps.zone, info.id);
    this.person.root.position.set(x, 0, z);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 32), toonUnique(C.red, { emissive: '#7a1418' }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.06;
    this.ring.visible = false;
    noOutline(this.ring);
    this.person.root.add(this.ring);
    this.el.className = 'hq-anchor';
    this.over.className = 'hq-over';
    this.over.append(this.tag);
    this.el.append(this.over);
  }

  get pos() {
    return this.person.root.position;
  }
  get moving() {
    return this.speed > 0.05;
  }

  /** Takes the reducer's view of this person and turns any change into motion. */
  private navRef: NavGrid | null = null;
  sync(ps: PersonState, nav: NavGrid, t: number) {
    this.navRef = nav;
    const first = this.routeId === null;
    if (ps.routeId !== this.routeId && !this.drive) {
      this.routeId = ps.routeId;
      // A new walk (or a feed reset: stroll back to the start, never teleport, except on the very first sync).
      if (first && !ps.routeId) this.snap(ps.zone);
      else this.plan(ps.routeId ? ps.route : [ps.zone], nav);
    }
    if (ps.jumpId && ps.jumpId !== this.jumpId) {
      this.jumpT = t;
      if (ps.state === 'done') {
        this.dingT = t;
        this.onDing?.();
      }
    }
    this.jumpId = ps.jumpId;
    if (ps.bubble?.id !== this.bubbleId) {
      this.bubbleId = ps.bubble?.id;
      this.bubbleEl?.remove();
      this.bubbleEl = null;
      if (ps.bubble) {
        this.bubbleT = t;
        this.bubbleEl = this.makeBubble(ps.bubble.text, ps.bubble.t);
        this.over.prepend(this.bubbleEl);
      }
    }
    this.ps = ps;
  }

  dance(t: number) {
    this.danceT = t;
  }

  private snap(zone: string) {
    const [x, z] = spot(zone, this.info.id);
    this.pos.set(x, 0, z);
    this.path = [];
    this.speed = 0;
  }

  /** Let go by the player: walk back to where the feed says they belong. */
  release(nav: NavGrid) {
    this.drive = null;
    this.plan([this.ps.zone], nav);
  }

  /** A new hire: appears at the door and walks to their desk. */
  walkIn(door: [number, number], nav: NavGrid) {
    this.pos.set(door[0], 0, door[1]);
    this.facing = Math.PI;
    this.routeId = undefined; // synced: the first apply() mustn't snap them to the desk
    this.plan([this.ps.zone], nav);
  }

  /** Off to another shelf (or back to the desk) every few seconds, while working. */
  roam(nav: NavGrid, t: number) {
    if (!this.wander || this.drive || this.path.length || this.pause > 0) return;
    if (this.ps.state !== 'working') return;
    if (t < this.wanderT) return;
    this.wanderT = t + 2.5 + Math.random() * 2;
    const [x, z] = this.wander[Math.floor(Math.random() * this.wander.length)];
    this.path = nav.path(this.pos.x, this.pos.z, x, z).map(([wx, wz], k, a) => ({ x: wx, z: wz, stop: k === a.length - 1, zone: this.ps.zone }));
    this.maxSpeed = WALK;
  }

  /** Waypoints through every zone of the route, each leg round the furniture. */
  private plan(route: string[], nav: NavGrid) {
    this.path = [];
    let [x, z] = [this.pos.x, this.pos.z];
    let length = 0;
    route.forEach((zone, i) => {
      const [sx, sz] = spot(zone, this.info.id);
      const legs = nav.path(x, z, sx, sz);
      legs.forEach(([wx, wz], k) => {
        length += Math.hypot(wx - x, wz - z);
        [x, z] = [wx, wz];
        this.path.push({ x: wx, z: wz, stop: k === legs.length - 1 && i < route.length - 1, zone });
      });
    });
    this.maxSpeed = length > 12 ? HURRY : WALK;
    this.pause = 0;
  }

  update(dt: number, t: number) {
    const p = this.person;
    const g = this.pos;
    const ps = this.ps;
    // Get up before setting off.
    if ((this.path.length || this.drive) && p.seated) p.sit(null);
    let moving = false;
    if (this.drive) {
      this.path = [];
      this.speed = this.drive.speed;
      moving = this.drive.moving;
      this.facing = this.drive.facing;
    } else if (this.path.length && !p.seated) {
      if (this.pause > 0) {
        this.pause -= dt;
      } else {
        // Arrive: brake in time for the next stop; speed up gently from rest.
        let left = 0;
        let [px, pz] = [g.x, g.z];
        for (const w of this.path) {
          left += Math.hypot(w.x - px, w.z - pz);
          [px, pz] = [w.x, w.z];
          if (w.stop) break;
        }
        const want = Math.min(this.maxSpeed, Math.sqrt(2 * DECEL * left) + 0.15);
        this.speed += THREE.MathUtils.clamp(want - this.speed, -DECEL * dt, ACCEL * dt);
        let step = this.speed * dt;
        while (step > 0 && this.path.length) {
          const w = this.path[0];
          const dx = w.x - g.x, dz = w.z - g.z;
          const d = Math.hypot(dx, dz);
          // Round the corners: within a step of a bend, head for the next point already (no snapping).
          if (!w.stop && this.path.length > 1 && d < 0.3) {
            this.path.shift();
            continue;
          }
          if (d <= step) {
            g.x = w.x;
            g.z = w.z;
            step -= d;
            this.path.shift();
            if (w.stop) {
              this.pause = STOP_PAUSE;
              this.speed = 0;
              p.reach();
              this.facing = this.faceZone(w.zone, this.facing);
              break;
            }
            continue;
          }
          g.x += (dx / d) * step;
          g.z += (dz / d) * step;
          this.facing += angleTo(this.facing, Math.atan2(dx, dz)) * (1 - Math.exp(-dt * 10));
          step = 0;
        }
        moving = this.path.length > 0 && this.pause <= 0;
        if (!this.path.length) this.speed = 0;
      }
    } else this.speed = 0;
    moving = moving && this.speed > 0.05;
    // Back at the desk after a wander: when the work is done, home again.
    if (this.wander && !this.drive && !this.path.length && this.ps.state !== 'working' && !isSeat(this.info.id, g.x, g.z) && this.pause <= 0 && this.routeId !== null) {
      const [sx, sz] = spot(this.ps.zone, this.info.id);
      if (Math.hypot(sx - g.x, sz - g.z) > 0.2) this.plan([this.ps.zone], this.navRef!);
    }

    // Hop on done (out of the chair and back), dance when the team celebrates.
    const dancing = t - this.danceT < DANCE_S;
    let jp = (t - this.jumpT) / JUMP_S;
    if (t - this.danceT < 2.7) jp = ((t - this.danceT) % 0.9) / JUMP_S; // three hops, then dance
    const airborne = jp >= 0 && jp < 1 && !moving;
    g.y = airborne ? Math.sin(jp * Math.PI) * 0.6 : 0;

    const atSeat = !this.drive && !moving && !this.path.length && isSeat(this.info.id, g.x, g.z);
    p.sit(atSeat && !airborne && !dancing ? SEAT_HIPS : null);
    p.holdMug(!moving && ps.state === 'idle' && ps.zone === 'chai_pantry');

    // Facing: along the way while walking; at the desk the screen; else the speaker, the zone's owner or the room.
    if (!moving && !this.path.length && !this.drive) {
      let want = atSeat ? Math.PI : this.faceZone(ps.zone, 0);
      const s = this.lookAt;
      if (!atSeat && s && s.zone === ps.zone && (s.x !== g.x || s.z !== g.z)) want = Math.atan2(s.x - g.x, s.z - g.z);
      if (dancing) want += (t - this.danceT) * 3; // spin
      this.facing += angleTo(this.facing, want) * (1 - Math.exp(-dt * 5));
    }
    p.root.rotation.y = this.facing;

    const talk = t - this.bubbleT < Math.min(2.8, 0.8 + (this.ps.bubble?.text.length ?? 0) * 0.04) && !!this.bubbleEl;
    p.update(dt, t, {
      moving,
      airborne,
      pace: this.speed / WALK,
      typing: atSeat && ps.state === 'working',
      waiting: ps.state === 'waiting',
      dancing: dancing && !airborne,
      voice: talk ? 1 : 0,
    });
    this.ring.visible = !!ps.beacon;
    if (this.ring.visible) this.ring.scale.setScalar(1 + Math.sin(t * 6) * 0.12);
    if (this.bubbleEl) {
      const age = t - this.bubbleT;
      const life = this.hero ? HERO_BUBBLE_S : BUBBLE_S;
      if (age > life) {
        this.bubbleEl.remove();
        this.bubbleEl = null;
      } else if (age > life - 0.4) this.bubbleEl.classList.add('hq-out');
    }
    this.drawTag(moving || this.path.length > 0, t);
  }

  /** A visitor faces the zone's owner when they're at their desk; otherwise the room (the camera). */
  private faceZone(zone: string, fallback: number) {
    const z = zoneById[zone];
    if (!z || !deskById[`${zone}#0`] || zone === this.info.zone) return fallback;
    return Math.atan2(z.x - this.pos.x, z.z - this.pos.z);
  }

  private drawTag(walking: boolean, t: number) {
    const ps = this.ps;
    const shown: AgentState = walking ? 'walking' : ps.state;
    const talking = !!this.bubbleEl;
    const ding = t - this.dingT < 1.6;
    const key = `${shown}|${!!ps.beacon}|${talking}|${ding}|${!!this.drive}`;
    if (key === this.tagKey) return;
    this.tagKey = key;
    const { name } = this.info;
    this.tag.className = `hq-tag hq-tag-${shown}`;
    this.tag.replaceChildren();
    const span = (cls: string, text: string, icon = false) => {
      const s = document.createElement('span');
      s.className = cls;
      if (icon) s.append(iconSvg(personDept(this.info), this.hero ? 17 : 14));
      if (text) s.append(text);
      this.tag.append(s);
    };
    if (this.hero) {
      if (!talking) span('hq-tag-name hq-tag-badge', '', true); // the hero: just the badge
      this.el.style.zIndex = talking ? '40' : '10';
      return;
    }
    if (ding) span('hq-ding', '✓');
    const you = !!this.drive; // the founder you're walking
    if (!talking) span(you ? 'hq-tag-name hq-tag-you' : shown === 'idle' ? 'hq-tag-name hq-tag-badge' : 'hq-tag-name', you ? 'You' : shown === 'idle' ? '' : name, true);
    if (shown !== 'idle' && shown !== 'walking') span('hq-tag-state', ps.beacon && !walking ? 'Needs a reply' : STATE_LABEL[shown]);
    this.el.style.zIndex = talking ? '40' : ps.beacon ? '20' : '10';
  }

  private makeBubble(text: string, at: number) {
    const b = document.createElement('div');
    b.className = 'hq-bubble';
    const who = document.createElement('div');
    who.className = 'hq-bubble-who';
    who.style.color = readable(this.info.color);
    who.append(iconSvg(personDept(this.info), 13), ` ${this.info.name}`);
    const body = document.createElement('div');
    body.className = 'hq-bubble-text';
    body.append(tgDom(clean(text), 2)); // the bold title and the first fact
    const time = document.createElement('span');
    time.className = 'hq-bubble-time';
    time.textContent = clock(at);
    body.append(time);
    b.append(who, body);
    return b;
  }

  /** Screen position of the head this frame (before de-overlap), and how wide the tag is, roughly. */
  sx = 0;
  sy = 0;
  wide = 0;
  tall = 24;
  hidden = false;
  /** Lift (px) to clear an overlapping tag: wanted, and eased toward so tags slide rather than jump. */
  lift = 0;
  private liftShown = 0;

  get talking() {
    return !!this.bubbleEl;
  }
  private box = { w: 0, h: 0, id: '' };
  /** The bubble's size on screen (measured once per bubble). */
  bubbleBox() {
    if (this.bubbleEl && this.box.id !== this.bubbleId) this.box = { w: this.bubbleEl.offsetWidth, h: this.bubbleEl.offsetHeight, id: this.bubbleId ?? '' };
    return this.box;
  }

  /** Projects the head to the canvas; kept `pad` px inside it so a bubble near an edge isn't cut off. */
  project(camera: THREE.Camera, w: number, h: number) {
    v.setFromMatrixPosition(this.person.tagAnchor.matrixWorld).project(camera);
    const rx = (v.x * 0.5 + 0.5) * w, ry = (-v.y * 0.5 + 0.5) * h;
    // Off the canvas (zoomed in on another zone): no tag. Near an edge: nudged inside so it reads.
    this.hidden = v.z > 1 || rx < -30 || rx > w + 30 || ry < -30 || ry > h + 60;
    const pad = this.bubbleEl ? Math.min(132, w / 3) : 64;
    this.sx = Math.min(Math.max(rx, pad), w - pad);
    this.sy = Math.max(ry, this.bubbleEl ? pad * 0.9 : 0);
    const walking = this.moving || this.path.length > 0;
    this.wide = this.bubbleEl ? 0 : this.hero || (this.ps.state === 'idle' && !walking) ? 30 : 112;
    this.tall = walking || this.ps.state === 'idle' ? 24 : 44; // name pill, plus the state chip under it
    this.lift = 0;
  }

  place(dt: number) {
    if (this.hidden) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = '';
    this.liftShown += (this.lift - this.liftShown) * (1 - Math.exp(-dt * 12));
    const x = Math.round(this.sx), y = Math.round(this.sy - this.liftShown);
    if (x === this.ox && y === this.oy) return;
    this.ox = x;
    this.oy = y;
    this.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  dispose() {
    this.person.dispose();
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
    this.el.remove();
  }
}
