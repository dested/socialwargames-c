// Unit stats (design.md "Pieces") + passability rules + initial snapshot.

import { DIRS, gridSize, hexDist, idx, inBoard } from './hex';
import type { Faction, Snapshot, Terrain, Unit, UnitType } from './types';
import { bytesToBase64 } from './types';

export interface UnitStats {
  hp: number;
  move: number;
  attack: number;
  /** Ore cost at a Factory (Capital produces at 25% off). 0 = not producible. */
  cost: number;
}

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  worker: { hp: 6, move: 1, attack: 0, cost: 10 },
  scout: { hp: 5, move: 2, attack: 1, cost: 12 },
  tank: { hp: 12, move: 1, attack: 4, cost: 20 },
  factory: { hp: 20, move: 0, attack: 0, cost: 0 },
  capital: { hp: 40, move: 0, attack: 0, cost: 0 },
};

export const MINE_YIELD = 3;
export const FACTORY_BUILD_COST = 30;
/** Capital production multiplier (25% discount, rounded up). */
export const CAPITAL_DISCOUNT = 0.75;
export const ENERGY_REGEN = 5;
export const ENERGY_CAP = 25;
export const STARTING_POOL = 20;
export const PRODUCIBLE: ReadonlyArray<'worker' | 'scout' | 'tank'> = ['worker', 'scout', 'tank'];

export function produceCost(unit: 'worker' | 'scout' | 'tank', by: 'factory' | 'capital'): number {
  const base = UNIT_STATS[unit].cost;
  return by === 'capital' ? Math.ceil(base * CAPITAL_DISCOUNT) : base;
}

/** Terrain-only check: can a unit of this type occupy (q, r)?
 *  Water (0) and mountains (4) block everyone; forest blocks tanks and buildings. */
export function canStand(type: UnitType, terrain: Terrain, q: number, r: number): boolean {
  if (!inBoard(q, r, terrain.R)) return false;
  const i = idx(q, r, terrain.R);
  const e = terrain.elevation[i];
  if (e < 1 || e > 3) return false;
  if (terrain.forest[i] && type !== 'worker' && type !== 'scout') return false;
  return true;
}

/** Edge check: elevation steps of 1 are walkable slopes, ≥2 are cliffs. */
export function canTraverse(terrain: Terrain, aq: number, ar: number, bq: number, br: number): boolean {
  const ea = terrain.elevation[idx(aq, ar, terrain.R)];
  const eb = terrain.elevation[idx(bq, br, terrain.R)];
  return Math.abs(ea - eb) <= 1;
}

/** Shortest path (≤ maxSteps) over terrain for a unit type, ignoring occupancy.
 *  Returns cells after the origin (ending at target), or null if unreachable.
 *  Deterministic: BFS expands neighbors in DIRS order. */
export function findPath(
  type: UnitType,
  terrain: Terrain,
  fromQ: number,
  fromR: number,
  toQ: number,
  toR: number,
  maxSteps: number,
): { q: number; r: number }[] | null {
  if (fromQ === toQ && fromR === toR) return null;
  if (hexDist(fromQ, fromR, toQ, toR) > maxSteps) return null;
  if (!canStand(type, terrain, toQ, toR)) return null;
  const R = terrain.R;
  const start = idx(fromQ, fromR, R);
  const goal = idx(toQ, toR, R);
  const prev = new Map<number, number>([[start, -1]]);
  let frontier = [start];
  for (let step = 0; step < maxSteps && frontier.length; step++) {
    const next: number[] = [];
    for (const ci of frontier) {
      const [cq, cr] = [(ci % (2 * R + 1)) - R, Math.floor(ci / (2 * R + 1)) - R];
      for (const [dq, dr] of DIRS) {
        const nq = cq + dq;
        const nr = cr + dr;
        if (!canStand(type, terrain, nq, nr)) continue;
        if (!canTraverse(terrain, cq, cr, nq, nr)) continue;
        const ni = idx(nq, nr, R);
        if (prev.has(ni)) continue;
        prev.set(ni, ci);
        if (ni === goal) {
          const path: { q: number; r: number }[] = [];
          let cur = ni;
          while (cur !== start) {
            path.unshift({ q: (cur % (2 * R + 1)) - R, r: Math.floor(cur / (2 * R + 1)) - R });
            cur = prev.get(cur)!;
          }
          return path;
        }
        next.push(ni);
      }
    }
    frontier = next;
  }
  return null;
}

/** Starting forces per faction: capital + 2 workers + 1 scout + 1 tank on the
 *  plateau ring, rotated per faction so all three starts are exact 120° copies. */
export function createInitialSnapshot(terrain: Terrain): Snapshot {
  const R = terrain.R;
  const territory = new Uint8Array(gridSize(R));
  const units: Unit[] = [];
  let nextUnitId = 1;
  const starters: UnitType[] = ['worker', 'worker', 'scout', 'tank'];

  for (let f = 0 as Faction; f < 3; f++) {
    const cap = terrain.capitals[f];
    units.push({ id: nextUnitId++, type: 'capital', faction: f as Faction, q: cap.q, r: cap.r, hp: UNIT_STATS.capital.hp });
    territory[idx(cap.q, cap.r, R)] = f + 1;
    let placed = 0;
    for (let i = 0; i < 6 && placed < starters.length; i++) {
      // rotate the spawn ring by faction (rot120 shifts DIRS by 2) for exact symmetry
      const [dq, dr] = DIRS[(i + 2 * f) % 6];
      const q = cap.q + dq;
      const r = cap.r + dr;
      const type = starters[placed];
      if (!canStand(type, terrain, q, r)) continue;
      if (units.some((u) => u.q === q && u.r === r)) continue;
      units.push({ id: nextUnitId++, type, faction: f as Faction, q, r, hp: UNIT_STATS[type].hp });
      territory[idx(q, r, R)] = f + 1;
      placed++;
    }
  }

  return {
    round: 0,
    nextUnitId,
    units,
    territory: bytesToBase64(territory),
    pools: [STARTING_POOL, STARTING_POOL, STARTING_POOL],
    scores: [0, 0, 0],
  };
}
