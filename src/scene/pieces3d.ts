// Toy-miniature unit pieces, built from primitives — every unit stands on a
// faction-colored base puck like a board-game figure, so ownership reads at
// any zoom. Templates are cached per (type, faction) and cloned per unit
// (clones share geometry + materials).

import * as THREE from 'three';
import type { Faction, UnitType } from '../../shared/types';
import { FACTIONS, WORLD } from './palette';

interface FactionMats {
  mid: THREE.MeshStandardMaterial;
  light: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
}

const std = (color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.05, flatShading: true, ...opts });

const factionMats: FactionMats[] = FACTIONS.map((f) => ({
  mid: std(f.mid),
  light: std(f.light),
  dark: std(f.dark),
  glow: std(f.glow, { emissive: new THREE.Color(f.glow), emissiveIntensity: 0.35 }),
}));

const sharedMats = {
  cream: std('#efe3c8'),
  charcoal: std('#3c4046'),
  stoneWall: std(WORLD.wallStone),
  smokestack: std(WORLD.smokestack),
  hat: std('#f4c542'),
};

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Miniature base puck — the ownership signal. */
function basePuck(f: Faction, radius = 0.3): THREE.Mesh {
  const m = mesh(new THREE.CylinderGeometry(radius, radius * 1.12, 0.07, 24), factionMats[f].mid, 0, 0.035, 0);
  m.receiveShadow = true;
  return m;
}

function buildWorker(f: Faction): THREE.Group {
  const g = new THREE.Group();
  const M = factionMats[f];
  g.add(basePuck(f, 0.24));
  const body = mesh(new THREE.SphereGeometry(0.13, 12, 10), M.mid, 0, 0.21, 0);
  body.scale.y = 1.3;
  g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.085, 12, 10), sharedMats.cream, 0, 0.40, 0));
  const hat = mesh(new THREE.SphereGeometry(0.095, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), sharedMats.hat, 0, 0.415, 0);
  g.add(hat);
  // shouldered pick-axe: handle + head
  const handle = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 5), sharedMats.charcoal, 0.13, 0.33, 0.02);
  handle.rotation.z = -0.5;
  g.add(handle);
  g.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), sharedMats.charcoal, 0.2, 0.45, 0.02));
  return g;
}

function buildScout(f: Faction): THREE.Group {
  const g = new THREE.Group();
  const M = factionMats[f];
  g.add(basePuck(f, 0.26));
  // sleek wedge hull pointing +x
  const hull = mesh(new THREE.ConeGeometry(0.11, 0.42, 6), M.mid, 0.04, 0.16, 0);
  hull.rotation.z = -Math.PI / 2;
  g.add(hull);
  g.add(mesh(new THREE.SphereGeometry(0.065, 10, 8), M.light, -0.03, 0.24, 0));
  const fin = mesh(new THREE.BoxGeometry(0.14, 0.12, 0.02), M.dark, -0.15, 0.24, 0);
  fin.rotation.z = 0.4;
  g.add(fin);
  // tall pennant antenna — the scout's read-from-anywhere silhouette
  g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 4), sharedMats.charcoal, -0.14, 0.45, 0));
  const flagShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.16, 0.045), new THREE.Vector2(0, 0.09)]);
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), new THREE.MeshBasicMaterial({ color: FACTIONS[f].glow, side: THREE.DoubleSide }));
  flag.position.set(-0.14, 0.55, 0);
  g.add(flag);
  return g;
}

function buildTank(f: Faction): THREE.Group {
  const g = new THREE.Group();
  const M = factionMats[f];
  g.add(basePuck(f, 0.3));
  g.add(mesh(new THREE.BoxGeometry(0.46, 0.15, 0.13), sharedMats.charcoal, 0, 0.14, 0.16));
  g.add(mesh(new THREE.BoxGeometry(0.46, 0.15, 0.13), sharedMats.charcoal, 0, 0.14, -0.16));
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.13, 0.3), M.mid, 0, 0.25, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.145, 0.12, 12), M.light, -0.03, 0.37, 0));
  const barrel = mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.36, 8), M.dark, 0.16, 0.38, 0);
  barrel.rotation.z = -Math.PI / 2 + 0.06;
  g.add(barrel);
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 8), M.dark, -0.08, 0.45, 0));
  return g;
}

function buildFactory(f: Faction): THREE.Group {
  const g = new THREE.Group();
  const M = factionMats[f];
  g.add(basePuck(f, 0.34));
  g.add(mesh(new THREE.BoxGeometry(0.52, 0.3, 0.4), sharedMats.stoneWall, 0, 0.22, 0));
  // sawtooth roof: three tilted prisms in faction color
  for (let k = 0; k < 3; k++) {
    const tooth = mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.38, 3, 1), M.mid, -0.17 + k * 0.17, 0.435, 0);
    tooth.rotation.x = Math.PI / 2;
    tooth.rotation.y = Math.PI; // flat face down onto the box
    g.add(tooth);
  }
  const stack = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.34, 8), sharedMats.smokestack, 0.18, 0.5, -0.12);
  g.add(stack);
  g.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 8), M.glow, 0.18, 0.68, -0.12));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.16, 0.02), M.dark, 0, 0.15, 0.2));
  return g;
}

function buildCapital(f: Faction): THREE.Group {
  const g = new THREE.Group();
  const M = factionMats[f];
  g.add(basePuck(f, 0.38));
  g.add(mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.14, 6), sharedMats.stoneWall, 0, 0.13, 0));
  const keep = mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.5, 6), sharedMats.stoneWall, 0, 0.42, 0);
  g.add(keep);
  // crenellations on the keep rim
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    g.add(mesh(new THREE.BoxGeometry(0.09, 0.07, 0.05), sharedMats.stoneWall, Math.cos(a) * 0.22, 0.7, Math.sin(a) * 0.22));
  }
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.3, 6), sharedMats.stoneWall, 0, 0.85, 0));
  g.add(mesh(new THREE.ConeGeometry(0.19, 0.26, 6), M.mid, 0, 1.11, 0));
  // banner
  g.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 4), sharedMats.charcoal, 0, 1.35, 0));
  const flagShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.24, 0.06), new THREE.Vector2(0, 0.13)]);
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), new THREE.MeshBasicMaterial({ color: FACTIONS[f].glow, side: THREE.DoubleSide }));
  flag.position.set(0.01, 1.36, 0);
  g.add(flag);
  // gate
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.14, 0.03), M.dark, 0, 0.12, 0.36));
  return g;
}

const builders: Record<UnitType, (f: Faction) => THREE.Group> = {
  worker: buildWorker,
  scout: buildScout,
  tank: buildTank,
  factory: buildFactory,
  capital: buildCapital,
};

/** Rough visual height per type — where holo badges/HP float. */
export const PIECE_HEIGHT: Record<UnitType, number> = {
  worker: 0.55,
  scout: 0.7,
  tank: 0.55,
  factory: 0.8,
  capital: 1.55,
};

const templates = new Map<string, THREE.Group>();

export function buildPiece(type: UnitType, faction: Faction): THREE.Group {
  const key = `${type}:${faction}`;
  let tpl = templates.get(key);
  if (!tpl) {
    tpl = builders[type](faction);
    templates.set(key, tpl);
  }
  const clone = tpl.clone(true);
  clone.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
    }
  });
  return clone;
}
