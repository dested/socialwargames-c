// Deterministic 3-fold-symmetric map generation. Pure function of (seed, R):
// client and server both call generateMap and get bit-identical terrain.
//
// Symmetry technique: every noise field is averaged over the cell's three 120°
// rotations — symmetric by construction AND continuous (no seam cliffs at wedge
// boundaries, unlike sampling only the canonical representative). Terrace and
// forest cutoffs are picked by quantile VALUE, so equal heights always land on
// the same side — rotated copies can never diverge.

import { DIRS, canonical, cellCount, forEachCell, fromIdx, gridSize, hexDist, idx, inBoard, rot120 } from './hex';
import { Fbm, hash32, rand01, smoothstep } from './noise';
import type { Cell, Faction, Terrain } from './types';
import { canStand, canTraverse } from './units';

const MAX_ATTEMPTS = 20;
const REACHABILITY_GATE = 0.85;

// cumulative quantiles over all cells: water | elev1 | elev2 | elev3 | mountain
const Q_WATER = 0.18;
const Q_ELEV1 = 0.48;
const Q_ELEV2 = 0.74;
const Q_ELEV3 = 0.92;
/** fraction of land cells that become forest */
const FOREST_FRAC = 0.22;

const SQRT3_2 = Math.sqrt(3) / 2;

interface Fields {
  elev: Fbm;
  moist: Fbm;
  warpX: Fbm;
  warpY: Fbm;
}

/** 3-fold-symmetric fbm sample with domain warp, in [0, 1].
 *  The three rotation samples are sorted before summing: float addition is not
 *  order-independent, and every member of an orbit must produce the IDENTICAL
 *  value or cells straddling a terrace cutoff would break the symmetry. */
function symSample(field: Fbm, f: Fields, q: number, r: number, freq: number): number {
  const samples: number[] = [];
  let cq = q;
  let cr = r;
  for (let k = 0; k < 3; k++) {
    // isotropic plane embedding of axial coords
    const x = (cq + cr / 2) * freq;
    const y = cr * SQRT3_2 * freq;
    const wx = x + 0.5 * f.warpX.at(x * 0.7, y * 0.7);
    const wy = y + 0.5 * f.warpY.at(x * 0.7, y * 0.7);
    samples.push(field.at01(wx, wy));
    [cq, cr] = rot120(cq, cr);
  }
  samples.sort((a, b) => a - b);
  return (samples[0] + samples[1] + samples[2]) / 3;
}

/** Threshold by quantile VALUE (ties always resolve identically → symmetry-safe). */
function quantileValue(values: number[], frac: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(frac * sorted.length))];
}

function generateAttempt(seed: number, R: number, attempt: number): Terrain {
  const sub = hash32(attempt, R, seed, 0x5157) | 0;
  const fields: Fields = {
    elev: new Fbm(sub ^ 0x1a2b3c, 4),
    moist: new Fbm(sub ^ 0x4d5e6f, 3),
    warpX: new Fbm(sub ^ 0x70819a, 2),
    warpY: new Fbm(sub ^ 0xabcdef, 2),
  };
  const size = gridSize(R);
  const elevation = new Uint8Array(size);
  const forest = new Uint8Array(size);
  const ore = new Uint8Array(size);
  const freq = 1.6 / R;

  // 1. continuous height = symmetric fbm × radial island falloff
  const height = new Float64Array(size);
  const heights: number[] = [];
  forEachCell(R, (q, r, i) => {
    const d = hexDist(0, 0, q, r) / R;
    const island = smoothstep(1.02, 0.6, d);
    const h = symSample(fields.elev, fields, q, r, freq) * island;
    height[i] = h;
    heights.push(h);
  });

  // 2. terrace by quantiles → stable water/terrace/mountain proportions on any seed
  const tw = quantileValue(heights, Q_WATER);
  const t1 = quantileValue(heights, Q_ELEV1);
  const t2 = quantileValue(heights, Q_ELEV2);
  const t3 = quantileValue(heights, Q_ELEV3);
  forEachCell(R, (_q, _r, i) => {
    const h = height[i];
    elevation[i] = h <= tw ? 0 : h <= t1 ? 1 : h <= t2 ? 2 : h <= t3 ? 3 : 4;
  });

  // 3. smoothing: kill lone spikes/pits (no neighbor within 1 terrace → mean of neighbors)
  for (let pass = 0; pass < 2; pass++) {
    const next = elevation.slice();
    forEachCell(R, (q, r, i) => {
      let sum = 0;
      let n = 0;
      let near = false;
      for (const [dq, dr] of DIRS) {
        if (!inBoard(q + dq, r + dr, R)) continue;
        const e = elevation[idx(q + dq, r + dr, R)];
        sum += e;
        n++;
        if (Math.abs(e - elevation[i]) <= 1) near = true;
      }
      if (n > 0 && !near) next[i] = Math.round(sum / n);
    });
    elevation.set(next);
  }

  // 4. capitals at 120° apart, radius ≈ 0.6R, on flattened elev-2 plateaus
  const c = Math.round(0.6 * R);
  const capitals: [Cell, Cell, Cell] = [
    { q: c, r: 0 },
    { q: -c, r: c },
    { q: 0, r: -c },
  ];
  for (const cap of capitals) {
    forEachCell(R, (q, r, i) => {
      const d = hexDist(cap.q, cap.r, q, r);
      if (d <= 1) elevation[i] = 2;
      else if (d === 2) elevation[i] = Math.min(3, Math.max(1, elevation[i]));
    });
  }

  // 5. forests: symmetric moisture blobs on land, cleared around capitals
  const landMoist: number[] = [];
  const moist = new Float64Array(size);
  forEachCell(R, (q, r, i) => {
    if (elevation[i] < 1 || elevation[i] > 3) return;
    moist[i] = symSample(fields.moist, fields, q, r, 2.2 / R);
    landMoist.push(moist[i]);
  });
  const tf = quantileValue(landMoist, 1 - FOREST_FRAC);
  forEachCell(R, (q, r, i) => {
    if (elevation[i] < 1 || elevation[i] > 3) return;
    if (moist[i] > tf && capitals.every((cap) => hexDist(cap.q, cap.r, q, r) > 2)) forest[i] = 1;
  });

  // 6. ore nodes: score wedge representatives, pick greedily with spacing ≥ 3,
  //    stamp all three rotations. One starter node is guaranteed near each capital.
  const perWedge = Math.max(5, Math.round(R / 3));
  const candidates: { q: number; r: number; score: number; i: number }[] = [];
  forEachCell(R, (q, r, i) => {
    const [cq, cr] = canonical(q, r);
    if (cq !== q || cr !== r) return; // one representative per orbit
    if (elevation[i] < 1 || elevation[i] > 3) return;
    if (capitals.some((cap) => hexDist(cap.q, cap.r, q, r) <= 1)) return;
    let score = rand01(q, r, sub, 0x09e) * 0.5;
    for (const [dq, dr] of DIRS) {
      if (inBoard(q + dq, r + dr, R) && elevation[idx(q + dq, r + dr, R)] === 4) score += 3; // mountain feet
    }
    const d = hexDist(0, 0, q, r) / R;
    if (d > 0.2 && d < 0.55) score += 1.5; // contested mid-map seam
    candidates.push({ q, r, score, i });
  });
  candidates.sort((a, b) => b.score - a.score || a.i - b.i);

  const placed: Cell[] = [];
  const place = (q: number, r: number) => {
    let cq = q;
    let cr = r;
    for (let k = 0; k < 3; k++) {
      const i = idx(cq, cr, R);
      ore[i] = 1;
      forest[i] = 0;
      placed.push({ q: cq, r: cr });
      [cq, cr] = rot120(cq, cr);
    }
  };
  const farEnough = (q: number, r: number) => placed.every((p) => hexDist(p.q, p.r, q, r) >= 3);

  // starter node: best candidate 2–4 cells from a capital (rotations cover the others)
  const starter = candidates.find((cand) =>
    capitals.some((cap) => {
      const d = hexDist(cap.q, cap.r, cand.q, cand.r);
      return d >= 2 && d <= 4;
    }),
  );
  if (starter) place(starter.q, starter.r);
  for (const cand of candidates) {
    if (placed.length >= perWedge * 3) break;
    if (!farEnough(cand.q, cand.r)) continue;
    place(cand.q, cand.r);
  }

  // 7. reachability gate metric: worker-flood from each capital must cover the land
  const terrain: Terrain = {
    seed,
    R,
    elevation,
    forest,
    ore,
    capitals,
    landCells: 0,
    reachability: 0,
    attempts: attempt + 1,
  };
  let land = 0;
  forEachCell(R, (_q, _r, i) => {
    if (elevation[i] >= 1 && elevation[i] <= 3) land++;
  });
  terrain.landCells = land;

  let minReach = 1;
  for (let f = 0; f < 3; f++) {
    const visited = floodFromCapital(terrain, f as Faction);
    // every capital must also reach the other two, or the war can't happen
    const capsOk = capitals.every((cap) => visited.has(idx(cap.q, cap.r, R)));
    const reach = capsOk ? visited.size / land : 0;
    if (reach < minReach) minReach = reach;
  }
  terrain.reachability = minReach;
  return terrain;
}

/** Worker-passable flood fill from a faction's capital. */
export function floodFromCapital(terrain: Terrain, faction: Faction): Set<number> {
  const R = terrain.R;
  const cap = terrain.capitals[faction];
  const start = idx(cap.q, cap.r, R);
  const visited = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    const [q, r] = fromIdx(i, R);
    for (const [dq, dr] of DIRS) {
      const nq = q + dq;
      const nr = r + dr;
      if (!canStand('worker', terrain, nq, nr)) continue;
      if (!canTraverse(terrain, q, r, nq, nr)) continue;
      const ni = idx(nq, nr, R);
      if (visited.has(ni)) continue;
      visited.add(ni);
      stack.push(ni);
    }
  }
  return visited;
}

/** Generate the map for (seed, R). Retries sub-seeds until the ≥85% reachability
 *  gate passes (hard invariant: interesting ≠ maze); caps at 20 attempts and
 *  returns the most-navigable attempt if none pass (never expected in practice). */
export function generateMap(seed: number, R: number): Terrain {
  let best: Terrain | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const t = generateAttempt(seed, R, attempt);
    if (t.reachability >= REACHABILITY_GATE) return t;
    if (!best || t.reachability > best.reachability) best = t;
  }
  return best!;
}

/** Diagnostics for tuning/tests: terrain composition as fractions of all cells. */
export function terrainStats(terrain: Terrain): {
  water: number;
  land: number;
  mountain: number;
  forest: number;
  ore: number;
} {
  const total = cellCount(terrain.R);
  let water = 0;
  let mountain = 0;
  let forests = 0;
  let ores = 0;
  forEachCell(terrain.R, (_q, _r, i) => {
    const e = terrain.elevation[i];
    if (e === 0) water++;
    else if (e === 4) mountain++;
    if (terrain.forest[i]) forests++;
    if (terrain.ore[i]) ores++;
  });
  return {
    water: water / total,
    land: terrain.landCells / total,
    mountain: mountain / total,
    forest: forests / total,
    ore: ores / total,
  };
}
