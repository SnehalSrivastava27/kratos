// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/world/models.ts + office/props.ts: the Blender-modelled props. Every material in the .glb
// files is only a name; we paint each name with a toon colour.
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { toon } from './toon';

export const MODEL_URLS = ['/models/plants.glb', '/models/desk_props.glb', '/models/lounge.glb', '/models/kitchen.glb'] as const;
MODEL_URLS.forEach((u) => useGLTF.preload(u));

export type Models = Record<'plants' | 'desk_props' | 'lounge' | 'kitchen', THREE.Object3D>;

/** All four model scenes (suspends until loaded). */
export function useModels(): Models {
  const [plants, desk_props, lounge, kitchen] = useGLTF(MODEL_URLS as unknown as string[]) as unknown as { scene: THREE.Object3D }[];
  return { plants: plants.scene, desk_props: desk_props.scene, lounge: lounge.scene, kitchen: kitchen.scene };
}

const PALETTE = { plant: '#5fb760', plantDark: '#3f8f45', pot: '#e76f51', wood: '#c98b5a', deskLeg: '#3d405b' };
const COLORS: Record<string, string> = {
  // plants.glb
  Pot: PALETTE.pot, Glaze: '#8ecae6', Soil: '#6b4226', Bark: '#8a5a3b', Leaf: PALETTE.plant, LeafDark: PALETTE.plantDark,
  // desk_props.glb
  CoverRed: '#e63946', CoverBlue: '#457b9d', CoverOrange: '#f4a261', Pages: '#f3ead8', Coffee: '#6f4518', Mug: '#ffffff',
  // lounge.glb
  Sofa: '#5b8def', WoodDark: '#8a5a3b', Wood: PALETTE.wood, Frame: PALETTE.deskLeg, Cloth: '#ffd166',
  // kitchen.glb
  Cabinet: '#8ecae6', Chrome: '#adb5bd', Dark: '#343a40', White: '#ffffff', Fridge: '#f8f9fa', Note: '#ffd166', Memo: '#bde0fe', Red: '#ef476f',
};

/**
 * A painted copy of the object called `part` in a model (or the whole scene when no part), positioned by the caller.
 * `colors` overrides a material name's colour (a pillow's Cloth, a mug's body).
 */
export function piece(src: THREE.Object3D, part?: string, colors: Record<string, string> = {}): THREE.Object3D {
  const found = part ? src.getObjectByName(part) : src;
  if (!found) return new THREE.Group();
  const copy = found.clone();
  copy.position.set(0, 0, 0); // pieces are placed by whoever asks for them
  copy.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const name = (m.material as THREE.Material).name;
    m.material = name === 'Glow' ? toon('#ef476f', { emissive: '#ef476f' }) : toon(colors[name] ?? COLORS[name] ?? '#ff00ff');
    m.castShadow = true;
    m.receiveShadow = true;
  });
  const g = new THREE.Group();
  g.add(copy);
  return g;
}

export type PlantSpecies = 'monstera' | 'snake_plant' | 'ficus' | 'succulent';
export const plant = (m: Models, species: PlantSpecies, scale = 1) => {
  const g = piece(m.plants, species);
  g.scale.setScalar(scale);
  return g;
};
