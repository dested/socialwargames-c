// Shared sim types. Everything here is JSON-safe (snapshots go over the wire
// and into Postgres Json columns); typed arrays are base64-encoded.

export type Faction = 0 | 1 | 2;

export type UnitType = 'worker' | 'tank' | 'scout' | 'factory' | 'capital';

export interface Cell {
  q: number;
  r: number;
}

export interface Unit {
  id: number;
  type: UnitType;
  faction: Faction;
  q: number;
  r: number;
  hp: number;
}

/** Derived deterministically from (seed, R) on both sides — never serialized. */
export interface Terrain {
  seed: number;
  R: number;
  /** 0 = water, 1–3 = walkable terraces, 4 = mountain (impassable). gridSize(R) long. */
  elevation: Uint8Array;
  /** 1 = forest (workers/scouts pass, tanks blocked). */
  forest: Uint8Array;
  /** 1 = ore node (workers mine while standing on it). */
  ore: Uint8Array;
  /** Capital cell per faction (index = faction). */
  capitals: [Cell, Cell, Cell];
  /** Cells with elevation 1–3. */
  landCells: number;
  /** Fraction of land reachable by a worker from every capital (gate metric). */
  reachability: number;
  /** How many sub-seeds were tried before the gate passed (diagnostics). */
  attempts: number;
}

export type Action =
  | { kind: 'hold' }
  | { kind: 'move'; q: number; r: number }
  | { kind: 'attack'; q: number; r: number }
  | { kind: 'mine' }
  | { kind: 'build'; q: number; r: number }
  | { kind: 'produce'; unit: 'worker' | 'scout' | 'tank' };

export interface Vote {
  playerId: string;
  unitId: number;
  action: Action;
  weight: number;
  /** Set when this vote was cast by applying a rally — credits rally_moves to its creator. */
  rallyCreatorId?: string;
}

export interface Snapshot {
  round: number;
  nextUnitId: number;
  units: Unit[];
  /** base64 of a gridSize(R) Uint8Array: 0 = unclaimed, faction + 1 otherwise. */
  territory: string;
  /** Communal ore pool per faction. */
  pools: [number, number, number];
  scores: [number, number, number];
}

export type SimEvent =
  | { type: 'mine'; unitId: number; faction: Faction; at: Cell; amount: number; voters: string[] }
  | { type: 'build'; unitId: number; faction: Faction; newUnitId: number; at: Cell; voters: string[] }
  | { type: 'move'; unitId: number; faction: Faction; from: Cell; to: Cell; path: Cell[]; voters: string[] }
  | { type: 'bounce'; unitId: number; faction: Faction; at: Cell; attempted: Cell; voters: string[] }
  | {
      type: 'attack';
      unitId: number;
      faction: Faction;
      from: Cell;
      target: Cell;
      /** null = swung at an empty cell (dodges are real). */
      hitUnitId: number | null;
      damage: number;
      voters: string[];
    }
  | { type: 'death'; unitId: number; faction: Faction; unitType: UnitType; at: Cell; killerVoters: string[] }
  | { type: 'produce'; unitId: number; faction: Faction; newUnitId: number; unitType: UnitType; at: Cell; voters: string[] };

export type StatKey =
  | 'damage'
  | 'kills'
  | 'tiles_painted'
  | 'ore_mined'
  | 'units_built'
  | 'rally_moves'
  | 'votes_cast'
  | 'rounds_active';

/** playerId → stat → amount earned this tick. */
export type Credits = Record<string, Partial<Record<StatKey, number>>>;

export interface TickResult {
  snapshot: Snapshot;
  events: SimEvent[];
  credits: Credits;
}

// ---- base64 (dependency-free; works in Bun and browsers alike) ----

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV: Record<string, number> = {};
for (let i = 0; i < 64; i++) B64_REV[B64[i]] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >>> 18) & 63];
    out += B64[(n >>> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >>> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function base64ToBytes(s: string): Uint8Array {
  let len = s.length;
  while (len > 0 && s[len - 1] === '=') len--;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    acc = (acc << 6) | B64_REV[s[i]];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 255;
    }
  }
  return out;
}
