// Unit tests for the shared deterministic sim. Run with: bun test shared
import { describe, expect, test } from 'bun:test';

import { DIRS, canonical, fromIdx, forEachCell, gridSize, hexDist, idx, inBoard, rot120 } from './hex';
import { generateMap, terrainStats } from './mapgen';
import { rng } from './noise';
import { resolveTick } from './resolve';
import type { Action, Snapshot, Terrain, Unit, Vote } from './types';
import { base64ToBytes, bytesToBase64 } from './types';
import { UNIT_STATS, createInitialSnapshot, produceCost } from './units';

describe('hex', () => {
  test('rot120 applied three times is the identity', () => {
    for (const [q, r] of [
      [0, 0],
      [3, -1],
      [-5, 2],
      [7, 7],
    ]) {
      let [cq, cr] = [q, r];
      for (let k = 0; k < 3; k++) [cq, cr] = rot120(cq, cr);
      expect([cq, cr]).toEqual([q, r]);
    }
  });

  test('canonical is identical for every member of an orbit', () => {
    for (let q = -6; q <= 6; q++) {
      for (let r = -6; r <= 6; r++) {
        const c0 = canonical(q, r);
        const [q1, r1] = rot120(q, r);
        const [q2, r2] = rot120(q1, r1);
        expect(canonical(q1, r1)).toEqual(c0);
        expect(canonical(q2, r2)).toEqual(c0);
      }
    }
  });

  test('idx/fromIdx round-trip', () => {
    const R = 7;
    forEachCell(R, (q, r, i) => {
      expect(fromIdx(i, R)).toEqual([q, r]);
    });
  });

  test('rotation stays on the board', () => {
    const R = 5;
    forEachCell(R, (q, r) => {
      const [q1, r1] = rot120(q, r);
      expect(inBoard(q1, r1, R)).toBe(true);
    });
  });
});

describe('base64', () => {
  test('round-trips arbitrary bytes', () => {
    const r = rng(42);
    for (const len of [0, 1, 2, 3, 4, 100, 1369]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = Math.floor(r() * 256);
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });
});

describe('mapgen', () => {
  const seeds = [1, 2, 3, 4, 5];

  test('deterministic: same (seed, R) → identical terrain', () => {
    const a = generateMap(7, 12);
    const b = generateMap(7, 12);
    expect(b.elevation).toEqual(a.elevation);
    expect(b.forest).toEqual(a.forest);
    expect(b.ore).toEqual(a.ore);
    expect(b.capitals).toEqual(a.capitals);
  });

  for (const seed of seeds) {
    test(`seed ${seed}: gate, symmetry, capitals, composition (R=9, blitz size)`, () => {
      const t = generateMap(seed, 9);
      const R = t.R;

      // hard invariant: ≥85% of land reachable from every capital
      expect(t.reachability).toBeGreaterThanOrEqual(0.85);

      // perfect 3-fold symmetry of every layer
      forEachCell(R, (q, r, i) => {
        const [q1, r1] = rot120(q, r);
        const j = idx(q1, r1, R);
        expect(t.elevation[j]).toBe(t.elevation[i]);
        expect(t.forest[j]).toBe(t.forest[i]);
        expect(t.ore[j]).toBe(t.ore[i]);
      });

      // capitals: elev-2 plateau, 120° apart, ~0.6R out
      for (const cap of t.capitals) {
        expect(t.elevation[idx(cap.q, cap.r, R)]).toBe(2);
        expect(hexDist(0, 0, cap.q, cap.r)).toBeGreaterThanOrEqual(Math.floor(0.5 * R));
      }
      const [a, b, c] = t.capitals;
      expect([rot120(a.q, a.r), rot120(b.q, b.r)]).toEqual([
        [b.q, b.r],
        [c.q, c.r],
      ]);

      // composition sanity
      const stats = terrainStats(t);
      expect(stats.water).toBeGreaterThan(0.08);
      expect(stats.water).toBeLessThan(0.35);
      expect(stats.forest).toBeGreaterThan(0.05);
      expect(stats.forest).toBeLessThan(0.35);
      expect(stats.ore).toBeGreaterThan(0);

      // every capital has an ore node within reach of its starting workers
      for (const cap of t.capitals) {
        let near = false;
        forEachCell(R, (q, r, i) => {
          if (t.ore[i] && hexDist(cap.q, cap.r, q, r) <= 5) near = true;
        });
        expect(near).toBe(true);
      }
    });
  }

  test('campaign size (R=13) passes the gate too', () => {
    const t = generateMap(99, 13);
    expect(t.reachability).toBeGreaterThanOrEqual(0.85);
  });
});

describe('initial snapshot', () => {
  test('3 capitals + starters, all on distinct legal cells', () => {
    const t = generateMap(3, 9);
    const s = createInitialSnapshot(t);
    const caps = s.units.filter((u) => u.type === 'capital');
    expect(caps.length).toBe(3);
    expect(s.units.length).toBe(15); // capital + 2 workers + scout + tank, ×3
    const cells = new Set(s.units.map((u) => `${u.q},${u.r}`));
    expect(cells.size).toBe(s.units.length);
    expect(s.pools).toEqual([20, 20, 20]);
  });
});

// ---- handcrafted flat terrain for surgical resolve tests ----

function flatTerrain(R = 4): Terrain {
  const size = gridSize(R);
  return {
    seed: 0,
    R,
    elevation: new Uint8Array(size).fill(2),
    forest: new Uint8Array(size),
    ore: new Uint8Array(size),
    capitals: [
      { q: 2, r: 0 },
      { q: -2, r: 2 },
      { q: 0, r: -2 },
    ],
    landCells: 0,
    reachability: 1,
    attempts: 1,
  };
}

function snap(units: Unit[], pools: [number, number, number] = [100, 100, 100]): Snapshot {
  return {
    round: 0,
    nextUnitId: Math.max(0, ...units.map((u) => u.id)) + 1,
    units,
    territory: bytesToBase64(new Uint8Array(gridSize(4))),
    pools,
    scores: [0, 0, 0],
  };
}

const vote = (playerId: string, unitId: number, action: Action): Vote => ({ playerId, unitId, action, weight: 1 });

describe('resolveTick', () => {
  test('winning action executes; majority beats minority', () => {
    const t = flatTerrain();
    const u: Unit = { id: 1, type: 'tank', faction: 0, q: 0, r: 0, hp: 12 };
    const r = resolveTick(
      t,
      snap([u]),
      [
        vote('a', 1, { kind: 'move', q: 1, r: 0 }),
        vote('b', 1, { kind: 'move', q: 1, r: 0 }),
        vote('c', 1, { kind: 'move', q: 0, r: 1 }),
      ],
      0,
    );
    const moved = r.snapshot.units[0];
    expect([moved.q, moved.r]).toEqual([1, 0]);
    const ev = r.events.find((e) => e.type === 'move')!;
    expect(ev.type === 'move' && ev.voters.sort()).toEqual(['a', 'b']);
    expect(r.credits['a']?.tiles_painted).toBe(1);
    expect(r.credits['c']?.votes_cast).toBe(1);
  });

  test('vote tie → hold', () => {
    const t = flatTerrain();
    const u: Unit = { id: 1, type: 'tank', faction: 0, q: 0, r: 0, hp: 12 };
    const r = resolveTick(
      t,
      snap([u]),
      [vote('a', 1, { kind: 'move', q: 1, r: 0 }), vote('b', 1, { kind: 'move', q: 0, r: 1 })],
      0,
    );
    expect([r.snapshot.units[0].q, r.snapshot.units[0].r]).toEqual([0, 0]);
    expect(r.events.filter((e) => e.type === 'move').length).toBe(0);
  });

  test('move conflict: higher HP wins the cell, other bounces', () => {
    const t = flatTerrain();
    const tank: Unit = { id: 1, type: 'tank', faction: 0, q: -1, r: 0, hp: 12 };
    const scout: Unit = { id: 2, type: 'scout', faction: 1, q: 1, r: 0, hp: 5 };
    const r = resolveTick(
      t,
      snap([tank, scout]),
      [vote('a', 1, { kind: 'move', q: 0, r: 0 }), vote('b', 2, { kind: 'move', q: 0, r: 0 })],
      0,
    );
    const t2 = r.snapshot.units.find((u) => u.id === 1)!;
    const s2 = r.snapshot.units.find((u) => u.id === 2)!;
    expect([t2.q, t2.r]).toEqual([0, 0]);
    expect([s2.q, s2.r]).toEqual([1, 0]);
    expect(r.events.some((e) => e.type === 'bounce' && e.unitId === 2)).toBe(true);
  });

  test('equal-HP conflict bounces both; swap bounces both', () => {
    const t = flatTerrain();
    const a: Unit = { id: 1, type: 'tank', faction: 0, q: -1, r: 0, hp: 12 };
    const b: Unit = { id: 2, type: 'tank', faction: 1, q: 1, r: 0, hp: 12 };
    const r1 = resolveTick(
      t,
      snap([a, b]),
      [vote('a', 1, { kind: 'move', q: 0, r: 0 }), vote('b', 2, { kind: 'move', q: 0, r: 0 })],
      0,
    );
    expect(r1.snapshot.units.map((u) => [u.q, u.r])).toEqual([
      [-1, 0],
      [1, 0],
    ]);

    const c: Unit = { id: 1, type: 'tank', faction: 0, q: 0, r: 0, hp: 12 };
    const d: Unit = { id: 2, type: 'tank', faction: 1, q: 1, r: 0, hp: 12 };
    const r2 = resolveTick(
      t,
      snap([c, d]),
      [vote('a', 1, { kind: 'move', q: 1, r: 0 }), vote('b', 2, { kind: 'move', q: 0, r: 0 })],
      0,
    );
    expect(r2.snapshot.units.map((u) => [u.q, u.r])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(r2.events.filter((e) => e.type === 'bounce').length).toBe(2);
  });

  test('attack hits post-move occupant; dodge is a miss; mutual kills happen', () => {
    const t = flatTerrain();
    // dodge: tank attacks scout's cell, scout moves away
    const tank: Unit = { id: 1, type: 'tank', faction: 0, q: 0, r: 0, hp: 12 };
    const scout: Unit = { id: 2, type: 'scout', faction: 1, q: 1, r: 0, hp: 5 };
    const r1 = resolveTick(
      t,
      snap([tank, scout]),
      [vote('a', 1, { kind: 'attack', q: 1, r: 0 }), vote('b', 2, { kind: 'move', q: 1, r: 1 })],
      0,
    );
    const atk = r1.events.find((e) => e.type === 'attack')!;
    expect(atk.type === 'attack' && atk.hitUnitId).toBeNull();
    expect(r1.snapshot.units.find((u) => u.id === 2)!.hp).toBe(5);
    // the dodged cell was fought over and is empty → painted by the attacker
    const terr = base64ToBytes(r1.snapshot.territory);
    expect(terr[idx(1, 0, 4)]).toBe(1); // faction 0 + 1

    // mutual kill: two 4-hp-remaining tanks attack each other
    const x: Unit = { id: 1, type: 'tank', faction: 0, q: 0, r: 0, hp: 4 };
    const y: Unit = { id: 2, type: 'tank', faction: 1, q: 1, r: 0, hp: 4 };
    const r2 = resolveTick(
      t,
      snap([x, y]),
      [vote('a', 1, { kind: 'attack', q: 1, r: 0 }), vote('b', 2, { kind: 'attack', q: 0, r: 0 })],
      0,
    );
    expect(r2.snapshot.units.length).toBe(0);
    expect(r2.events.filter((e) => e.type === 'death').length).toBe(2);
    expect(r2.credits['a']?.kills).toBe(1);
    expect(r2.credits['b']?.kills).toBe(1);
    expect(r2.credits['a']?.damage).toBe(4);
  });

  test('mine, build, produce (with capital discount)', () => {
    const t = flatTerrain();
    t.ore[idx(0, 0, 4)] = 1;
    const worker: Unit = { id: 1, type: 'worker', faction: 0, q: 0, r: 0, hp: 6 };
    const builder: Unit = { id: 2, type: 'worker', faction: 0, q: 2, r: 0, hp: 6 };
    const capital: Unit = { id: 3, type: 'capital', faction: 1, q: -2, r: 2, hp: 40 };
    const r = resolveTick(
      t,
      snap([worker, builder, capital], [40, 40, 40]),
      [
        vote('a', 1, { kind: 'mine' }),
        vote('b', 2, { kind: 'build', q: 3, r: 0 }),
        vote('c', 3, { kind: 'produce', unit: 'tank' }),
      ],
      0,
    );
    expect(r.snapshot.pools[0]).toBe(40 + 3 - 30);
    expect(r.snapshot.pools[1]).toBe(40 - produceCost('tank', 'capital'));
    expect(produceCost('tank', 'capital')).toBe(15);
    const factory = r.snapshot.units.find((u) => u.type === 'factory')!;
    expect([factory.q, factory.r, factory.hp]).toEqual([3, 0, UNIT_STATS.factory.hp]);
    const tank = r.snapshot.units.find((u) => u.type === 'tank')!;
    expect(tank.faction).toBe(1);
    expect(hexDist(tank.q, tank.r, -2, 2)).toBe(1);
    expect(r.credits['a']?.ore_mined).toBe(3);
    expect(r.credits['b']?.units_built).toBe(1);
    expect(r.credits['c']?.units_built).toBe(1);
  });

  test('scout moves 2 and paints its path', () => {
    const t = flatTerrain();
    const scout: Unit = { id: 1, type: 'scout', faction: 2, q: 0, r: 0, hp: 5 };
    const r = resolveTick(t, snap([scout]), [vote('a', 1, { kind: 'move', q: 2, r: 0 })], 0);
    expect([r.snapshot.units[0].q, r.snapshot.units[0].r]).toEqual([2, 0]);
    const terr = base64ToBytes(r.snapshot.territory);
    expect(terr[idx(1, 0, 4)]).toBe(3); // intermediate path cell painted faction 2
    expect(terr[idx(2, 0, 4)]).toBe(3);
    expect(r.credits['a']?.tiles_painted).toBe(2);
  });

  test('deterministic: identical inputs → identical result', () => {
    const t = generateMap(11, 9);
    const s = createInitialSnapshot(t);
    const votes: Vote[] = s.units
      .filter((u) => UNIT_STATS[u.type].move > 0)
      .map((u, i) => vote(`p${i % 4}`, u.id, { kind: 'move', q: u.q + DIRS[i % 6][0], r: u.r + DIRS[i % 6][1] }));
    const a = resolveTick(t, s, votes, 123);
    const b = resolveTick(t, s, votes, 123);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  test('fuzz 40 rounds: occupancy unique, pools non-negative, snapshot JSON-safe', () => {
    const t = generateMap(21, 9);
    let s = createInitialSnapshot(t);
    const r = rng(777);
    for (let round = 0; round < 40; round++) {
      const votes: Vote[] = [];
      for (const u of s.units) {
        if (r() < 0.3) continue;
        const [dq, dr] = DIRS[Math.floor(r() * 6)];
        const kinds: Action[] = [
          { kind: 'move', q: u.q + dq, r: u.r + dr },
          { kind: 'attack', q: u.q + dq, r: u.r + dr },
          { kind: 'mine' },
          { kind: 'build', q: u.q + dq, r: u.r + dr },
          { kind: 'produce', unit: (['worker', 'scout', 'tank'] as const)[Math.floor(r() * 3)] },
          { kind: 'hold' },
        ];
        const action = kinds[Math.floor(r() * kinds.length)];
        const nVoters = 1 + Math.floor(r() * 3);
        for (let v = 0; v < nVoters; v++) votes.push(vote(`p${Math.floor(r() * 12)}`, u.id, action));
      }
      const result = resolveTick(t, s, votes, round);
      s = result.snapshot;

      const cells = new Set(s.units.map((u) => `${u.q},${u.r}`));
      expect(cells.size).toBe(s.units.length);
      for (const p of s.pools) expect(p).toBeGreaterThanOrEqual(0);
      for (const u of s.units) {
        expect(u.hp).toBeGreaterThan(0);
        expect(u.hp).toBeLessThanOrEqual(UNIT_STATS[u.type].hp);
        expect(inBoard(u.q, u.r, t.R)).toBe(true);
      }
      // snapshot survives a JSON round-trip unchanged (goes into a Json column)
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    }
    expect(s.round).toBe(40);
  });
});
