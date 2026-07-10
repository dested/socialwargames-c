// Hex board ↔ 3D world math + the beveled hex-prism geometry the diorama is
// built from. Axial (q, r) → world (x, z) uses the same isotropic embedding as
// shared/mapgen.ts, scaled so adjacent cell centers are exactly 1 unit apart.

import * as THREE from 'three';

/** center-to-center spacing between adjacent cells (world units) */
export const HEX_SPACING = 1;
/** center-to-corner radius of a cell's hexagon (spacing/√3 → edges touch) */
export const HEX_A = HEX_SPACING / Math.sqrt(3);
/** vertical size of one elevation terrace */
export const TERRACE_H = 0.34;
/** columns extend below the ocean so island flanks disappear into water */
export const BASE_Y = -0.4;
/** ocean surface height (between water=0 and the first terrace) */
export const OCEAN_Y = 0.15;
/** bevel: the grass wraps over the top edge like turf */
const BEVEL_IN = 0.085; // fraction of HEX_A inset on the top face
const BEVEL_DROP = 0.075;

const SQRT3_2 = Math.sqrt(3) / 2;

export function cellToWorld(q: number, r: number): { x: number; z: number } {
  return { x: (q + r / 2) * HEX_SPACING, z: r * SQRT3_2 * HEX_SPACING };
}

/** Inverse of cellToWorld, rounded to the nearest hex (cube rounding). */
export function worldToCell(x: number, z: number): { q: number; r: number } {
  const rf = z / (SQRT3_2 * HEX_SPACING);
  const qf = x / HEX_SPACING - rf / 2;
  // cube round
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

/** Top-face height of a column at elevation e (e ≥ 1). */
export function topY(e: number): number {
  return e * TERRACE_H;
}

/** Hexagon corner k (0–5) at the given radius; corners at 30°+k·60° so flats
 *  face the 6 neighbor directions. Returns [x, z]. */
export function hexCorner(k: number, radius: number): [number, number] {
  const a = ((30 + 60 * k) * Math.PI) / 180;
  return [Math.cos(a) * radius, Math.sin(a) * radius];
}

function pushTri(pos: number[], a: number[], b: number[], c: number[]): void {
  pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

/** Top cap of a column: inset hexagon + turf bevel ring down to the full rim.
 *  Winding is CCW viewed from above (+y normals). */
export function buildTopGeometry(e: number): THREE.BufferGeometry {
  const y = topY(e);
  const rIn = HEX_A * (1 - BEVEL_IN);
  const rOut = HEX_A;
  const pos: number[] = [];
  for (let k = 0; k < 6; k++) {
    const [x0, z0] = hexCorner(k, rIn);
    const [x1, z1] = hexCorner(k + 1, rIn);
    // top fan (viewed from +y, x-z plane: CCW in world = corners in DEcreasing angle
    // order because +z is "down" on screen — use (center, next, cur) to face up)
    pushTri(pos, [0, y, 0], [x1, y, z1], [x0, y, z0]);
    // bevel quad from inner rim down/out to outer rim
    const [ox0, oz0] = hexCorner(k, rOut);
    const [ox1, oz1] = hexCorner(k + 1, rOut);
    const yb = y - BEVEL_DROP;
    pushTri(pos, [x0, y, z0], [x1, y, z1], [ox1, yb, oz1]);
    pushTri(pos, [x0, y, z0], [ox1, yb, oz1], [ox0, yb, oz0]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Column flanks from just under the bevel down to BASE_Y. */
export function buildSideGeometry(e: number): THREE.BufferGeometry {
  const yTop = topY(e) - BEVEL_DROP;
  const pos: number[] = [];
  for (let k = 0; k < 6; k++) {
    const [x0, z0] = hexCorner(k, HEX_A);
    const [x1, z1] = hexCorner(k + 1, HEX_A);
    pushTri(pos, [x0, yTop, z0], [x1, yTop, z1], [x1, BASE_Y, z1]);
    pushTri(pos, [x0, yTop, z0], [x1, BASE_Y, z1], [x0, BASE_Y, z0]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Flat hexagon lying in the xz-plane (territory fills, highlights). */
export function buildFlatHexGeometry(radius: number): THREE.BufferGeometry {
  const geo = new THREE.CircleGeometry(radius, 6, Math.PI / 6);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Flat hexagonal ring in the xz-plane (target cells, selection). */
export function buildHexRingGeometry(inner: number, outer: number): THREE.BufferGeometry {
  const geo = new THREE.RingGeometry(inner, outer, 6, 1, Math.PI / 6);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Deterministic per-cell jitter in [0, 1) — stable across sessions/devices. */
export function cellHash(q: number, r: number, salt: number): number {
  let h = (q * 374761393 + r * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
