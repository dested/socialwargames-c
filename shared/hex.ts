// Axial hex coordinates on a hexagonal board of radius R: max(|q|,|r|,|q+r|) <= R.
// Storage grids are flat (2R+1)^2 arrays indexed by idx(); off-board slots are unused.

/** The 6 axial neighbors, in counter-clockwise ring order starting at (+q).
 *  Note: rot120 of DIRS[i] is DIRS[(i+2) % 6] — the set is rotation-covariant. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

export function inBoard(q: number, r: number, R: number): boolean {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= R;
}

export function hexDist(aq: number, ar: number, bq: number, br: number): number {
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Rotate 120° around the origin. Applying it three times is the identity.
 *  (+0 keeps rot120(0,0) from producing -0, which breaks deep equality.) */
export function rot120(q: number, r: number): [number, number] {
  return [-q - r + 0, q];
}

/** Flat-array index for (q, r) on a radius-R board. */
export function idx(q: number, r: number, R: number): number {
  return (r + R) * (2 * R + 1) + (q + R);
}

export function fromIdx(i: number, R: number): [number, number] {
  const w = 2 * R + 1;
  return [(i % w) - R, Math.floor(i / w) - R];
}

/** Flat-array length for a radius-R board. */
export function gridSize(R: number): number {
  const w = 2 * R + 1;
  return w * w;
}

/** Number of actual cells on the board (3R² + 3R + 1). */
export function cellCount(R: number): number {
  return 3 * R * R + 3 * R + 1;
}

/** Canonical representative of a cell's 3-rotation orbit:
 *  the lexicographically smallest (q, then r) of the three rotations. */
export function canonical(q: number, r: number): [number, number] {
  let bq = q;
  let br = r;
  let cq = q;
  let cr = r;
  for (let k = 0; k < 2; k++) {
    [cq, cr] = rot120(cq, cr);
    if (cq < bq || (cq === bq && cr < br)) {
      bq = cq;
      br = cr;
    }
  }
  return [bq, br];
}

export function forEachCell(R: number, fn: (q: number, r: number, i: number) => void): void {
  for (let r = -R; r <= R; r++) {
    for (let q = -R; q <= R; q++) {
      if (inBoard(q, r, R)) fn(q, r, idx(q, r, R));
    }
  }
}
