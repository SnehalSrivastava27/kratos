// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/world/toon.ts: toon materials with the 3-step ramp, cheap rounded boxes, merging by colour.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let gradient: THREE.DataTexture | null = null;

/** Three-step ramp that gives MeshToonMaterial its flat cartoon banding. */
function gradientMap(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 185, 185, 185, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: THREE.ColorRepresentation, opts: { emissive?: THREE.ColorRepresentation; transparent?: boolean; opacity?: number } = {}): THREE.MeshToonMaterial {
  const key = `${new THREE.Color(color).getHexString()}|${opts.emissive ?? ''}|${opts.opacity ?? 1}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() });
  if (opts.emissive !== undefined) m.emissive = new THREE.Color(opts.emissive);
  if (opts.transparent || (opts.opacity ?? 1) < 1) {
    m.transparent = true;
    m.opacity = opts.opacity ?? 1;
  }
  cache.set(key, m);
  return m;
}

/** A fresh (uncached) toon material, for things whose color animates. */
export function toonUnique(color: THREE.ColorRepresentation, opts: { emissive?: THREE.ColorRepresentation; map?: THREE.Texture } = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), map: opts.map ?? null });
  if (opts.emissive !== undefined) m.emissive = new THREE.Color(opts.emissive);
  return m;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

export function roundedBox(w: number, h: number, d: number, r = 0.06): THREE.BufferGeometry {
  // Cheap rounded box: an extruded rounded rectangle, centered.
  const shape = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r);
  shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d);
  shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 4 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -h / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Frees what a built tree owns on the GPU: every geometry, and every textured material with its texture
 * (canvas signs, screens). Untextured toon materials are shared through the cache, so they stay.
 */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of [m.material].flat() as THREE.MeshBasicMaterial[]) {
      if (!mat.map) continue;
      mat.map.dispose();
      mat.dispose();
    }
  });
}

/** Nothing flat (a sign, a screen, a board's face) and nothing unlit under `obj` gets the toon outline. */
export const noOutline = (obj: THREE.Object3D) =>
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry;
    const flat = geo instanceof THREE.PlaneGeometry || geo instanceof THREE.CircleGeometry;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) if (flat || mat instanceof THREE.MeshBasicMaterial) mat.userData.outlineParameters = { visible: false };
  });

/**
 * Merges every (untextured) mesh under `root` into one per material, keeping which ones cast
 * shadows: a few draw calls instead of dozens, for things that never move on their own.
 */
export function mergeByMaterial(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const byKey = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    const keep = (m.material as THREE.MeshToonMaterial).map ? ['position', 'normal', 'uv'] : ['position', 'normal'];
    for (const k of Object.keys(geo.attributes)) if (!keep.includes(k)) geo.deleteAttribute(k);
    geo.morphAttributes = {};
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const mat = m.material as THREE.Material;
    const key = `${mat.uuid}${m.castShadow ? '+' : '-'}`;
    if (!byKey.has(key)) byKey.set(key, { mat, cast: m.castShadow, geos: [] });
    byKey.get(key)!.geos.push(geo);
  });
  const out = new THREE.Group();
  for (const { mat, cast, geos } of byKey.values()) {
    out.add(mesh(mergeGeometries(geos)!, mat, 0, 0, 0, cast));
    for (const geo of geos) geo.dispose();
  }
  return out;
}

let painted: THREE.MeshToonMaterial | null = null;

/**
 * Like mergeByMaterial, but every plain toon mesh under `root` (one color, no texture, no glow, not
 * see-through) goes into one mesh whatever its color, the colors kept in its vertices.
 */
export function mergeByColor(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const geos = { cast: [] as THREE.BufferGeometry[], still: [] as THREE.BufferGeometry[] };
  const other = new THREE.Group();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const mat = m.material as THREE.Material;
    const plain = mat instanceof THREE.MeshToonMaterial && !mat.map && !mat.transparent && !mat.vertexColors && mat.emissive.getHex() === 0 && mat.side === THREE.FrontSide;
    if (!plain) {
      const copy = new THREE.Mesh(m.geometry, mat);
      copy.applyMatrix4(rel);
      copy.castShadow = m.castShadow;
      copy.receiveShadow = true;
      other.add(copy);
      return;
    }
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    geo.morphAttributes = {};
    geo.applyMatrix4(rel);
    const n = geo.attributes.position.count;
    const c = mat.color;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (m.castShadow ? geos.cast : geos.still).push(geo);
  });
  const out = other.children.length ? mergeByMaterial(other) : new THREE.Group();
  painted ??= new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() });
  for (const [list, cast] of [
    [geos.cast, true],
    [geos.still, false],
  ] as const) {
    if (!list.length) continue;
    out.add(mesh(mergeGeometries(list)!, painted, 0, 0, 0, cast));
    for (const geo of list) geo.dispose();
  }
  return out;
}
