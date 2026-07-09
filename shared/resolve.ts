// resolveTick: the authoritative, deterministic round resolver. Pure function —
// same (terrain, snapshot, votes, seed) always produces the same war. Imported
// by the server (authority) and the client (previews/replays).
//
// Phase order (design.md "Rounds"):
//   winning action per unit → mine → build → simultaneous moves → attacks
//   → deaths → territory paint → production → score tick
//
// Every event carries the winning voters' ids for the attribution ledger.

import { DIRS, gridSize, hexDist, idx, inBoard } from './hex';
import type {
  Action,
  Cell,
  Credits,
  Faction,
  SimEvent,
  Snapshot,
  StatKey,
  Terrain,
  TickResult,
  Unit,
  Vote,
} from './types';
import { base64ToBytes, bytesToBase64 } from './types';
import { FACTORY_BUILD_COST, MINE_YIELD, UNIT_STATS, canStand, canTraverse, findPath, produceCost } from './units';

interface Order {
  action: Action;
  voters: string[];
  rallyCreators: string[];
}

function addCredit(credits: Credits, playerId: string, stat: StatKey, amount: number): void {
  if (amount <= 0) return;
  const c = (credits[playerId] ??= {});
  c[stat] = (c[stat] ?? 0) + amount;
}

function creditAll(credits: Credits, voters: string[], stat: StatKey, amount: number): void {
  // full value to every winning voter — generosity scales participation
  for (const v of voters) addCredit(credits, v, stat, amount);
}

function actionKey(a: Action): string {
  switch (a.kind) {
    case 'hold':
      return 'hold';
    case 'mine':
      return 'mine';
    case 'move':
      return `move:${a.q},${a.r}`;
    case 'attack':
      return `attack:${a.q},${a.r}`;
    case 'build':
      return `build:${a.q},${a.r}`;
    case 'produce':
      return `produce:${a.unit}`;
  }
}

/** Cheap legality check against the pre-move world; pool costs are checked at
 *  execution and occupancy conflicts are resolved in the move phase. */
function isLegal(unit: Unit, action: Action, terrain: Terrain, oreGrid: Uint8Array): boolean {
  const stats = UNIT_STATS[unit.type];
  switch (action.kind) {
    case 'hold':
      return true;
    case 'move':
      return (
        stats.move > 0 &&
        inBoard(action.q, action.r, terrain.R) &&
        findPath(unit.type, terrain, unit.q, unit.r, action.q, action.r, stats.move) !== null
      );
    case 'attack':
      return stats.attack > 0 && inBoard(action.q, action.r, terrain.R) && hexDist(unit.q, unit.r, action.q, action.r) === 1;
    case 'mine':
      return unit.type === 'worker' && oreGrid[idx(unit.q, unit.r, terrain.R)] === 1;
    case 'build':
      return (
        unit.type === 'worker' &&
        hexDist(unit.q, unit.r, action.q, action.r) === 1 &&
        canStand('factory', terrain, action.q, action.r)
      );
    case 'produce':
      return unit.type === 'factory' || unit.type === 'capital';
  }
}

export function resolveTick(terrain: Terrain, snap: Snapshot, votes: Vote[], _seed: number): TickResult {
  const R = terrain.R;
  const units: Unit[] = snap.units.map((u) => ({ ...u })).sort((a, b) => a.id - b.id);
  const byId = new Map(units.map((u) => [u.id, u]));
  const occ = new Map<number, Unit>(); // cell idx → occupant
  for (const u of units) occ.set(idx(u.q, u.r, R), u);
  const territory = base64ToBytes(snap.territory);
  if (territory.length !== gridSize(R)) throw new Error('territory/board size mismatch');
  const pools: [number, number, number] = [...snap.pools];
  const scores: [number, number, number] = [...snap.scores];
  const events: SimEvent[] = [];
  const credits: Credits = {};
  let nextUnitId = snap.nextUnitId;

  // ---- 1. tally votes → winning order per unit (max weight; ties → hold) ----
  const votesByUnit = new Map<number, Vote[]>();
  const activePlayers = new Set<string>();
  for (const v of votes) {
    if (!byId.has(v.unitId)) continue;
    addCredit(credits, v.playerId, 'votes_cast', 1);
    activePlayers.add(v.playerId);
    let list = votesByUnit.get(v.unitId);
    if (!list) votesByUnit.set(v.unitId, (list = []));
    list.push(v);
  }
  for (const p of activePlayers) addCredit(credits, p, 'rounds_active', 1);

  const orders = new Map<number, Order>();
  for (const [unitId, unitVotes] of votesByUnit) {
    const unit = byId.get(unitId)!;
    const tally = new Map<string, { action: Action; weight: number; voters: string[]; rallyCreators: string[] }>();
    for (const v of unitVotes) {
      if (!isLegal(unit, v.action, terrain, terrain.ore)) continue;
      const key = actionKey(v.action);
      let t = tally.get(key);
      if (!t) tally.set(key, (t = { action: v.action, weight: 0, voters: [], rallyCreators: [] }));
      t.weight += v.weight;
      t.voters.push(v.playerId);
      if (v.rallyCreatorId) t.rallyCreators.push(v.rallyCreatorId);
    }
    let best: Order | null = null;
    let bestWeight = 0;
    let tied = false;
    for (const t of tally.values()) {
      if (t.weight > bestWeight) {
        bestWeight = t.weight;
        best = t;
        tied = false;
      } else if (t.weight === bestWeight && bestWeight > 0) {
        tied = true;
      }
    }
    if (best && !tied && best.action.kind !== 'hold') {
      orders.set(unitId, best);
      creditAll(credits, best.rallyCreators, 'rally_moves', 1);
    }
  }

  const cellOf = (u: Unit): Cell => ({ q: u.q, r: u.r });

  // ---- 2. mine ----
  for (const u of units) {
    const o = orders.get(u.id);
    if (!o || o.action.kind !== 'mine') continue;
    pools[u.faction] += MINE_YIELD;
    events.push({ type: 'mine', unitId: u.id, faction: u.faction, at: cellOf(u), amount: MINE_YIELD, voters: o.voters });
    creditAll(credits, o.voters, 'ore_mined', MINE_YIELD);
  }

  // ---- 3. build (unit-id order; pool and cell contention resolved here) ----
  for (const u of units.slice()) {
    const o = orders.get(u.id);
    if (!o || o.action.kind !== 'build') continue;
    const { q, r } = o.action;
    const ci = idx(q, r, R);
    if (pools[u.faction] < FACTORY_BUILD_COST || occ.has(ci)) continue;
    pools[u.faction] -= FACTORY_BUILD_COST;
    const factory: Unit = { id: nextUnitId++, type: 'factory', faction: u.faction, q, r, hp: UNIT_STATS.factory.hp };
    units.push(factory);
    byId.set(factory.id, factory);
    occ.set(ci, factory);
    events.push({ type: 'build', unitId: u.id, faction: u.faction, newUnitId: factory.id, at: { q, r }, voters: o.voters });
    creditAll(credits, o.voters, 'units_built', 1);
  }

  // ---- 4. simultaneous moves ----
  // same target: higher HP wins, others bounce; ties bounce all; swaps bounce
  // both; iterate until stable (a bounced unit blocks the cell it stayed on).
  interface Mover {
    unit: Unit;
    dest: number;
    path: Cell[];
    order: Order;
  }
  const movers = new Map<number, Mover>(); // unitId → mover
  for (const u of units) {
    const o = orders.get(u.id);
    if (!o || o.action.kind !== 'move') continue;
    const path = findPath(u.type, terrain, u.q, u.r, o.action.q, o.action.r, UNIT_STATS[u.type].move);
    if (!path) continue;
    movers.set(u.id, { unit: u, dest: idx(o.action.q, o.action.r, R), path, order: o });
  }
  const bounced: Mover[] = [];
  const bounce = (m: Mover) => {
    movers.delete(m.unit.id);
    bounced.push(m);
  };
  for (;;) {
    let changed = false;
    // swaps bounce both
    for (const m of [...movers.values()]) {
      if (!movers.has(m.unit.id)) continue;
      const other = occ.get(m.dest);
      if (other && other.id !== m.unit.id) {
        const om = movers.get(other.id);
        if (om && om.dest === idx(m.unit.q, m.unit.r, R)) {
          bounce(m);
          bounce(om);
          changed = true;
        }
      }
    }
    // stationary occupants hold their cell; contested cells go to highest HP
    const claims = new Map<number, Mover[]>();
    for (const m of movers.values()) {
      let list = claims.get(m.dest);
      if (!list) claims.set(m.dest, (list = []));
      list.push(m);
    }
    for (const [dest, list] of claims) {
      const occupant = occ.get(dest);
      if (occupant && !movers.has(occupant.id)) {
        for (const m of list) bounce(m);
        changed = true;
        continue;
      }
      if (list.length > 1) {
        let maxHp = 0;
        for (const m of list) maxHp = Math.max(maxHp, m.unit.hp);
        const top = list.filter((m) => m.unit.hp === maxHp);
        const losers = top.length > 1 ? list : list.filter((m) => m.unit.hp < maxHp);
        if (losers.length) {
          for (const m of losers) bounce(m);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  // execute surviving moves simultaneously
  const moving = [...movers.values()].sort((a, b) => a.unit.id - b.unit.id);
  for (const m of moving) occ.delete(idx(m.unit.q, m.unit.r, R));
  const scoutPaths: { faction: Faction; path: Cell[]; voters: string[] }[] = [];
  for (const m of moving) {
    const from = cellOf(m.unit);
    const to = m.path[m.path.length - 1];
    m.unit.q = to.q;
    m.unit.r = to.r;
    occ.set(m.dest, m.unit);
    events.push({
      type: 'move',
      unitId: m.unit.id,
      faction: m.unit.faction,
      from,
      to,
      path: m.path,
      voters: m.order.voters,
    });
    if (m.unit.type === 'scout') scoutPaths.push({ faction: m.unit.faction, path: m.path, voters: m.order.voters });
  }
  for (const m of bounced.sort((a, b) => a.unit.id - b.unit.id)) {
    const [aq, ar] = [(m.dest % (2 * R + 1)) - R, Math.floor(m.dest / (2 * R + 1)) - R];
    events.push({
      type: 'bounce',
      unitId: m.unit.id,
      faction: m.unit.faction,
      at: cellOf(m.unit),
      attempted: { q: aq, r: ar },
      voters: m.order.voters,
    });
  }

  // ---- 5. attacks hit whatever occupies the target cell AFTER moves ----
  const damageTaken = new Map<number, { total: number; voters: string[] }>();
  const attackedCells: { i: number; faction: Faction; voters: string[] }[] = [];
  for (const u of units) {
    const o = orders.get(u.id);
    if (!o || o.action.kind !== 'attack') continue;
    const { q, r } = o.action;
    const ci = idx(q, r, R);
    const target = occ.get(ci);
    const dmg = UNIT_STATS[u.type].attack;
    attackedCells.push({ i: ci, faction: u.faction, voters: o.voters });
    if (target) {
      let dt = damageTaken.get(target.id);
      if (!dt) damageTaken.set(target.id, (dt = { total: 0, voters: [] }));
      dt.total += dmg;
      dt.voters.push(...o.voters);
      creditAll(credits, o.voters, 'damage', dmg);
    }
    events.push({
      type: 'attack',
      unitId: u.id,
      faction: u.faction,
      from: cellOf(u),
      target: { q, r },
      hitUnitId: target ? target.id : null, // null = dodged; dodges are real
      damage: target ? dmg : 0,
      voters: o.voters,
    });
  }

  // ---- 6. deaths (simultaneous; mutual kills happen) ----
  const dead: Unit[] = [];
  for (const [unitId, dt] of damageTaken) {
    const u = byId.get(unitId)!;
    u.hp -= dt.total;
    if (u.hp <= 0) dead.push(u);
  }
  dead.sort((a, b) => a.id - b.id);
  for (const u of dead) {
    byId.delete(u.id);
    occ.delete(idx(u.q, u.r, R));
    units.splice(units.indexOf(u), 1);
    const killerVoters = damageTaken.get(u.id)!.voters;
    events.push({ type: 'death', unitId: u.id, faction: u.faction, unitType: u.type, at: cellOf(u), killerVoters });
    for (const v of new Set(killerVoters)) addCredit(credits, v, 'kills', 1);
  }

  // ---- 7. territory paint: end cells + scout paths + conquered attack cells ----
  const paint = (i: number, faction: Faction, voters: string[]) => {
    if (territory[i] === faction + 1) return;
    territory[i] = faction + 1;
    creditAll(credits, voters, 'tiles_painted', 1);
  };
  for (const u of units) {
    paint(idx(u.q, u.r, R), u.faction, orders.get(u.id)?.voters ?? []);
  }
  for (const s of scoutPaths) {
    for (const c of s.path) paint(idx(c.q, c.r, R), s.faction, s.voters);
  }
  for (const a of attackedCells) {
    if (!occ.has(a.i)) paint(a.i, a.faction, a.voters); // fought-over ground, now empty
  }

  // ---- 8. production spawns into free neighbors (pool deducted in unit-id order) ----
  for (const u of units.slice()) {
    const o = orders.get(u.id);
    if (!o || o.action.kind !== 'produce') continue;
    if (u.type !== 'factory' && u.type !== 'capital') continue;
    if (u.hp <= 0 || !byId.has(u.id)) continue;
    const type = o.action.unit;
    const cost = produceCost(type, u.type);
    if (pools[u.faction] < cost) continue;
    let spawned: Unit | null = null;
    for (const [dq, dr] of DIRS) {
      const q = u.q + dq;
      const r = u.r + dr;
      if (!canStand(type, terrain, q, r)) continue;
      if (!canTraverse(terrain, u.q, u.r, q, r)) continue;
      if (occ.has(idx(q, r, R))) continue;
      spawned = { id: nextUnitId++, type, faction: u.faction, q, r, hp: UNIT_STATS[type].hp };
      break;
    }
    if (!spawned) continue;
    pools[u.faction] -= cost;
    units.push(spawned);
    byId.set(spawned.id, spawned);
    occ.set(idx(spawned.q, spawned.r, R), spawned);
    paint(idx(spawned.q, spawned.r, R), spawned.faction, o.voters);
    events.push({
      type: 'produce',
      unitId: u.id,
      faction: u.faction,
      newUnitId: spawned.id,
      unitType: type,
      at: cellOf(spawned),
      voters: o.voters,
    });
    creditAll(credits, o.voters, 'units_built', 1);
  }

  // ---- 9. score tick: +1 per 100 owned cells; +5 per capital still standing ----
  const owned = [0, 0, 0];
  for (let i = 0; i < territory.length; i++) {
    if (territory[i] > 0) owned[territory[i] - 1]++;
  }
  for (let f = 0; f < 3; f++) {
    const capitalsHeld = units.filter((u) => u.type === 'capital' && u.faction === f).length;
    scores[f] += Math.floor(owned[f] / 100) + 5 * capitalsHeld;
  }

  units.sort((a, b) => a.id - b.id);
  return {
    snapshot: {
      round: snap.round + 1,
      nextUnitId,
      units,
      territory: bytesToBase64(territory),
      pools,
      scores,
    },
    events,
    credits,
  };
}
