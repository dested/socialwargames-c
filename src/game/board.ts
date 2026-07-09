// Static board draw list: terrain → Placed[] once per game (the board never
// changes). Ported from fabletest's chunkgen, minus rivers/paths/settlements,
// over the finite hexagon board (x=q, y=r; off-board reads as water).

import { forEachCell, idx, inBoard } from '../../shared/hex';
import { rand01 } from '../../shared/noise';
import type { Terrain } from '../../shared/types';
import {
  DIR_N,
  DX,
  DY,
  concaveSuffix,
  convexSuffix,
  linearVariant,
  slopeSuffix,
  sortKey,
  waterConcaveSuffix,
  waterConvexSuffix,
  waterLipSuffix,
  type Dir,
  type Placed,
} from './iso';

export function buildBoardDrawList(terrain: Terrain): Placed[] {
  const R = terrain.R;
  const placed: Placed[] = [];
  const heightAt = (x: number, y: number): number =>
    inBoard(x, y, R) ? terrain.elevation[idx(x, y, R)] : 0;

  const put = (name: string, dir: Dir, x: number, y: number, z: number, extra?: Partial<Placed>) =>
    placed.push({ pack: 'town', name, dir, x, y, z, ...extra });

  // terrain-cast shadow: taller ground toward (-x,-y) shades this cell
  const putShade = (x: number, y: number, surfZ: number) => {
    let excess = 0;
    for (let k = 1; k <= 5; k++) {
      excess = Math.max(excess, heightAt(x - k, y - k) - surfZ - k * 0.9);
    }
    if (excess > 0) {
      placed.push({
        pack: 'town',
        name: '__shade',
        dir: DIR_N,
        x,
        y,
        z: surfZ,
        alpha: Math.min(0.3, 0.1 + 0.07 * excess),
      });
    }
  };

  forEachCell(R, (x, y, i) => {
    const h = terrain.elevation[i];
    const nbrH = [0, 0, 0, 0];
    for (let d = 0; d < 4; d++) nbrH[d] = heightAt(x + DX[d], y + DY[d]);

    // ================= WATER =================
    if (h === 0) {
      const land: Dir[] = [];
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) if (nbrH[d] > 0) land.push(d);
      if (land.length === 1) {
        put('grass_water', waterLipSuffix(land[0]), x, y, 1, { top: true });
      } else if (land.length === 2 && (((land[0] + 1) & 3) === land[1] || ((land[1] + 1) & 3) === land[0])) {
        put('grass_waterConcave', waterConcaveSuffix(land[0], land[1]), x, y, 1, { top: true });
      } else if (land.length >= 2) {
        // strait / cove: river channel family, open toward the water dirs
        let mask = 0;
        for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) if (nbrH[d] === 0) mask |= 1 << d;
        const v = linearVariant('grass_river', mask);
        put(v.name, v.dir, x, y, 1, { top: true });
      } else {
        // open water: grass nub if land touches diagonally
        let nub: Dir | -1 = -1;
        for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
          const d2 = ((d + 1) & 3) as Dir;
          if (heightAt(x + DX[d] + DX[d2], y + DY[d] + DY[d2]) > 0) {
            nub = d;
            break;
          }
        }
        if (nub >= 0) {
          put('grass_waterConvex', waterConvexSuffix(nub as Dir, ((nub + 1) & 3) as Dir), x, y, 1, { top: true });
        } else {
          put('water_center', DIR_N, x, y, 1, { top: true });
        }
      }
      return;
    }

    // ================= LAND =================
    let minNbr = h;
    for (let d = 0; d < 4; d++) minNbr = Math.min(minNbr, nbrH[d]);
    for (let z = Math.max(1, minNbr + 1); z < h; z++) put('dirt_center', DIR_N, x, y, z);

    put('grass_center', DIR_N, x, y, h, { top: true });
    putShade(x, y, h);

    // ---- slope skirt ----
    const hi: Dir[] = [];
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) if (nbrH[d] === h + 1) hi.push(d);
    if (hi.length === 1) {
      put('grass_slope', slopeSuffix(((hi[0] + 2) & 3) as Dir), x, y, h + 1);
    } else if (hi.length === 2 && (((hi[0] + 1) & 3) === hi[1] || ((hi[1] + 1) & 3) === hi[0])) {
      put('grass_slopeConcave', concaveSuffix(hi[0], hi[1]), x, y, h + 1);
    } else if (hi.length === 0) {
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        const d2 = ((d + 1) & 3) as Dir;
        if (heightAt(x + DX[d] + DX[d2], y + DY[d] + DY[d2]) === h + 1) {
          put('grass_slopeConvex', convexSuffix(d, d2), x, y, h + 1);
          break;
        }
      }
    }

    // ---- forest / ore decor (capitals & factories draw in the unit layer) ----
    if (terrain.forest[i]) {
      const r = rand01(x, y, terrain.seed, 0x7ee);
      const name = h >= 3 ? (r < 0.6 ? 'tree_pine' : 'tree_pineLarge') : r < 0.55 ? 'tree_single' : 'tree_multiple';
      placed.push({
        pack: name.startsWith('tree_pine') ? 'exp' : 'town',
        name,
        dir: DIR_N,
        x,
        y,
        z: h + 1,
      });
    } else if (terrain.ore[i]) {
      put('rocks_grass', DIR_N, x, y, h + 1);
      placed.push({ pack: 'town', name: '__ore', dir: DIR_N, x, y, z: h + 1 });
    }
  });

  placed.sort((a, b) => sortKey(a.x, a.y, a.z) - sortKey(b.x, b.y, b.z) || a.x - b.x);
  return placed;
}
