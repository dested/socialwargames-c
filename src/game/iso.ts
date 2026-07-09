// Iso screen geometry + orientation tables, ported from fabletest-sketch
// (tileset.ts + the needed subset of orient.ts). The orientation mappings were
// CALIBRATED by pixel analysis over there — do not "simplify" them.
//
// Grid axes (x=q, y=r): +x toward screen lower-right, +y toward lower-left.
// Render dirs: N=+y, E=+x, S=-y, W=-x. Hex gameplay adds the two horizontal
// diagonals (+1,-1) and (-1,+1); tiles autotile on the 4 cardinals only.

export type Pack = 'town' | 'exp' | 'desert';
export type Dir = 0 | 1 | 2 | 3; // N, E, S, W

export const DIR_N: Dir = 0;
export const DIR_E: Dir = 1;
export const DIR_S: Dir = 2;
export const DIR_W: Dir = 3;

export const SUFFIX = ['N', 'E', 'S', 'W'] as const;

/** grid delta for each render direction */
export const DX = [0, 1, 0, -1];
export const DY = [1, 0, -1, 0];

export interface Placed {
  pack: Pack;
  name: string;
  dir: Dir;
  x: number;
  y: number;
  z: number;
  /** top surface of its cell — territory tint (and shade) draws right after it */
  top?: boolean;
  /** '__shade' pseudo-tile opacity */
  alpha?: number;
  /** recolor greens → ember (faction 2 buildings) */
  ember?: boolean;
}

// Iso screen geometry (full-res pixels)
export const HALF_W = 116; // half of cell diamond width (232)
export const HALF_H = 55; // half of cell diamond height (110)
export const LEVEL = 110; // vertical px per height level
export const IMG_W = 256;
export const IMG_H = 352;
export const ANCHOR_X = -128; // img top-left relative to cell top vertex
export const ANCHOR_Y = -236;

export function screenX(x: number, y: number): number {
  return (x - y) * HALF_W;
}
export function screenY(x: number, y: number, z: number): number {
  return (x + y) * HALF_H - z * LEVEL;
}
/** painter's order key: back-to-front, then bottom-to-top */
export function sortKey(x: number, y: number, z: number): number {
  return (x + y) * 64 + z;
}

// ---- calibrated orientation helpers (verbatim logic from orient.ts) ----

const CORNER_T = 0,
  CORNER_R = 1,
  CORNER_B = 2,
  CORNER_L = 3;

/** corner of the cell that points toward the diagonal between adjacent dirs a,b */
export function cornerToward(a: Dir, b: Dir): number {
  const m = (1 << a) | (1 << b);
  if (m === ((1 << DIR_N) | (1 << DIR_E))) return CORNER_B;
  if (m === ((1 << DIR_E) | (1 << DIR_S))) return CORNER_R;
  if (m === ((1 << DIR_S) | (1 << DIR_W))) return CORNER_T;
  return CORNER_L; // W,N
}

/** grass_slope_X descends toward X^1; wedge sits ON the low cell at z = lowH+1 */
export function slopeSuffix(descDir: Dir): Dir {
  return (descDir ^ 1) as Dir;
}

const CONVEX_BY_HIGH_CORNER: Dir[] = [DIR_N, DIR_E, DIR_S, DIR_W]; // corner T,R,B,L
export function convexSuffix(hiDirA: Dir, hiDirB: Dir): Dir {
  return CONVEX_BY_HIGH_CORNER[cornerToward(hiDirA, hiDirB)];
}

const CONCAVE_BY_LOW_CORNER: Dir[] = [DIR_S, DIR_W, DIR_N, DIR_E]; // corner T,R,B,L
export function concaveSuffix(hiDirA: Dir, hiDirB: Dir): Dir {
  const dip = cornerToward(((hiDirA + 2) & 3) as Dir, ((hiDirB + 2) & 3) as Dir);
  return CONCAVE_BY_LOW_CORNER[dip];
}

/** grass_water_X lip edge: suffix = (2 - lip) & 3 (self-inverse) */
export function waterLipSuffix(lipEdge: Dir): Dir {
  return ((2 - lipEdge) & 3) as Dir;
}
const WATERCORNER: Dir[] = [DIR_N, DIR_E, DIR_S, DIR_W]; // corner T,R,B,L
export function waterConcaveSuffix(landDirA: Dir, landDirB: Dir): Dir {
  return WATERCORNER[cornerToward(landDirA, landDirB)];
}
export function waterConvexSuffix(diagDirA: Dir, diagDirB: Dir): Dir {
  return WATERCORNER[cornerToward(diagDirA, diagDirB)];
}

// linear water channels (straits between land): grass_river family
const N = 1,
  E = 2,
  S = 4,
  W = 8;
export function linearVariant(base: string, mask: number): { name: string; dir: Dir } {
  switch (mask) {
    case E | W:
      return { name: base, dir: DIR_N };
    case N | S:
      return { name: base, dir: DIR_E };
    case N | E:
      return { name: `${base}Bend`, dir: DIR_N };
    case N | W:
      return { name: `${base}Bend`, dir: DIR_E };
    case S | W:
      return { name: `${base}Bend`, dir: DIR_S };
    case E | S:
      return { name: `${base}Bend`, dir: DIR_W };
    case N | E | S:
      return { name: `${base}Split`, dir: DIR_N };
    case N | E | W:
      return { name: `${base}Split`, dir: DIR_E };
    case N | S | W:
      return { name: `${base}Split`, dir: DIR_S };
    case E | S | W:
      return { name: `${base}Split`, dir: DIR_W };
    case N | E | S | W:
      return { name: `${base}Crossing`, dir: DIR_N };
    case E:
      return { name: `${base}End`, dir: DIR_N };
    case N:
      return { name: `${base}End`, dir: DIR_E };
    case W:
      return { name: `${base}End`, dir: DIR_S };
    case S:
      return { name: `${base}End`, dir: DIR_W };
    default:
      return { name: `${base}EndSquare`, dir: DIR_N };
  }
}
