// The war-table canvas renderer: static board draw list + dynamic unit layer
// merged in painter order, territory tints, selection/target/arrow overlays.
// Camera + DPR handling included; input/gestures live in the play route.

import { idx } from '../../shared/hex';
import type { Terrain, Unit } from '../../shared/types';
import { buildBoardDrawList } from './board';
import {
  ANCHOR_X,
  ANCHOR_Y,
  DIR_N,
  HALF_H,
  HALF_W,
  IMG_H,
  IMG_W,
  LEVEL,
  SUFFIX,
  sortKey,
  type Placed,
} from './iso';
import { BOARD, FACTIONS, GOLD, GOLD_LINE, INK, emberize, territoryTint } from './palette';
import { PIECE_DRAWERS } from './pieces';
import { UNIT_STATS } from '../../shared/units';

export interface Camera {
  x: number; // cell-space center
  y: number;
  zoom: number;
}

export interface CellRef {
  q: number;
  r: number;
}

export interface RenderView {
  units: Unit[];
  territory: Uint8Array;
  /** fractional position overrides for round-flip lerps: unitId → cell coords */
  positions?: Map<number, { x: number; y: number }>;
  selected?: CellRef | null;
  /** legal target cells while picking a move/attack target */
  targets?: CellRef[];
  /** order arrows: from → to (cell coords); color = faction line, bold = selected */
  arrows?: { from: CellRef; to: CellRef; kind: 'move' | 'attack'; color?: string; bold?: boolean }[];
  /** vote badges above cells for non-directional leading actions (mine/build/produce) */
  badges?: { q: number; r: number; label: string; color: string; lift?: number }[];
  /** cells flashing from an attack this frame (alpha 0..1) */
  flashes?: { q: number; r: number; alpha: number }[];
}

class TileStore {
  private images = new Map<string, HTMLImageElement>();
  private emberCache = new Map<string, HTMLCanvasElement>();
  private missing = new Set<string>();
  onload?: () => void;

  get(pack: string, name: string, dir: number, ember = false): CanvasImageSource | null {
    const k = `${pack}/${name}_${SUFFIX[dir as 0 | 1 | 2 | 3]}`;
    if (this.missing.has(k)) return null;
    let img = this.images.get(k);
    if (!img) {
      img = new Image();
      img.src = `/tiles/${k}.png`;
      img.onload = () => this.onload?.();
      img.onerror = () => this.missing.add(k);
      this.images.set(k, img);
    }
    if (!(img.complete && img.naturalWidth > 0)) return null;
    if (!ember) return img;
    let ec = this.emberCache.get(k);
    if (!ec) {
      ec = emberize(img);
      this.emberCache.set(k, ec);
    }
    return ec;
  }
}

interface DynamicOp {
  key: number;
  draw: () => void;
}

/** capital / factory tile recipes per faction (faction 2 = ember hue-remap) */
const CAPITAL_TILE = ['castle_towerGreen', 'castle_towerPurple', 'castle_towerGreen'];
const FACTORY_ROOF = ['roof_pointGreen', 'roof_pointPurple', 'roof_pointGreen'];

export class WarRenderer {
  readonly cam: Camera;
  tiles = new TileStore();
  private board: Placed[];
  private terrain: Terrain;

  constructor(terrain: Terrain) {
    this.terrain = terrain;
    this.board = buildBoardDrawList(terrain);
    this.cam = { x: 0, y: 0, zoom: 0.28 };
  }

  elevationAt(q: number, r: number): number {
    return this.terrain.elevation[idx(q, r, this.terrain.R)];
  }

  /** screen position of a cell's top-face center (pieces' feet) in canvas px */
  cellToScreen(q: number, r: number, w: number, h: number): { x: number; y: number } {
    const z = this.cam.zoom;
    const plane = Math.max(this.elevationAt(q, r), 1) + 1;
    const sx = (q - r) * HALF_W;
    const sy = (q + r) * HALF_H - plane * LEVEL + HALF_H;
    return {
      x: (sx - (this.cam.x - this.cam.y) * HALF_W) * z + w / 2,
      y: (sy - (this.cam.x + this.cam.y) * HALF_H) * z + h / 2,
    };
  }

  /** inverse: canvas px → cell coords (walk down candidate elevations) */
  screenToCell(px: number, py: number, w: number, h: number): CellRef | null {
    const z = this.cam.zoom;
    const su = (px - w / 2) / z + (this.cam.x - this.cam.y) * HALF_W;
    const sv = (py - h / 2) / z + (this.cam.x + this.cam.y) * HALF_H;
    // try elevations high→low so tall columns win over the cell hidden behind
    for (let e = 4; e >= 0; e--) {
      const plane = Math.max(e, 1) + 1;
      const vv = sv + plane * LEVEL - HALF_H;
      const q = Math.round((vv / HALF_H + su / HALF_W) / 2);
      const r = Math.round((vv / HALF_H - su / HALF_W) / 2);
      const R = this.terrain.R;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) > R) continue;
      if (this.terrain.elevation[idx(q, r, R)] === e) return { q, r };
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D, view: RenderView, w: number, h: number): void {
    ctx.fillStyle = BOARD;
    ctx.fillRect(0, 0, w, h);

    const z = this.cam.zoom;
    const camSX = (this.cam.x - this.cam.y) * HALF_W;
    const camSY = (this.cam.x + this.cam.y) * HALF_H;
    const tsx = (sx: number) => (sx - camSX) * z + w / 2;
    const tsy = (sy: number) => (sy - camSY) * z + h / 2;
    const dw = IMG_W * z;
    const dh = IMG_H * z;

    // ---- dynamic ops: units (pieces + building tiles) ----
    const ops: DynamicOp[] = [];
    for (const u of view.units) {
      const pos = view.positions?.get(u.id) ?? { x: u.q, y: u.r };
      const cellH = this.elevationAt(Math.round(pos.x), Math.round(pos.y));
      const plane = Math.max(cellH, 1) + 1;
      const F = FACTIONS[u.faction];
      if (u.type === 'capital' || u.type === 'factory') {
        const bx = tsx((u.q - u.r) * HALF_W + ANCHOR_X);
        const drawTileAt = (name: string, zLevel: number) => {
          const img = this.tiles.get('town', name, DIR_N, u.faction === 2);
          if (img) ctx.drawImage(img, bx, tsy((u.q + u.r) * HALF_H - zLevel * LEVEL + ANCHOR_Y), dw, dh);
        };
        ops.push({
          key: sortKey(u.q, u.r, cellH + 1) + 0.25,
          draw: () => {
            if (u.type === 'capital') {
              drawTileAt(CAPITAL_TILE[u.faction], cellH + 1);
            } else {
              drawTileAt('building_door', cellH + 1);
              drawTileAt(FACTORY_ROOF[u.faction], cellH + 2);
            }
            this.drawHpPips(ctx, u, tsx, tsy, z, plane);
          },
        });
      } else {
        const fx = tsx((pos.x - pos.y) * HALF_W);
        const fy = tsy((pos.x + pos.y) * HALF_H - plane * LEVEL + HALF_H);
        const size = (u.type === 'tank' ? 132 : 96) * z;
        ops.push({
          key: Math.ceil(pos.x + pos.y - 1e-6) * 64 + plane + 0.49,
          draw: () => {
            PIECE_DRAWERS[u.type as 'worker' | 'tank' | 'scout'](ctx, fx, fy, size, F);
            this.drawHpPips(ctx, u, tsx, tsy, z, plane, pos);
          },
        });
      }
    }
    ops.sort((a, b) => a.key - b.key);

    // ---- merged painter-order walk ----
    let oi = 0;
    for (const t of this.board) {
      const tk = sortKey(t.x, t.y, t.z);
      while (oi < ops.length && ops[oi].key <= tk) ops[oi++].draw();

      if (t.name === '__shade') {
        this.fillCellDiamond(ctx, t.x, t.y, t.z + 1, `rgba(46,38,80,${t.alpha ?? 0.18})`, tsx, tsy);
        continue;
      }
      if (t.name === '__ore') {
        this.drawOreGlint(ctx, t, tsx, tsy, z);
        continue;
      }
      const img = this.tiles.get(t.pack, t.name, t.dir, t.ember);
      if (img) {
        const sx = tsx((t.x - t.y) * HALF_W + ANCHOR_X);
        const sy = tsy((t.x + t.y) * HALF_H - t.z * LEVEL + ANCHOR_Y);
        if (sx <= w && sy <= h && sx + dw >= 0 && sy + dh >= 0) ctx.drawImage(img, sx, sy, dw, dh);
      }
      if (t.top) {
        const owner = view.territory[idx(t.x, t.y, this.terrain.R)];
        if (owner > 0 && t.name !== 'water_center') {
          this.fillCellDiamond(ctx, t.x, t.y, t.z + 1, territoryTint(owner - 1), tsx, tsy);
        }
      }
    }
    while (oi < ops.length) ops[oi++].draw();

    // ---- x-ray pass: redraw every unit at partial alpha ON TOP of the board,
    // so pieces tucked behind mountains stay readable as ghosts. Where a piece
    // was already fully visible this composites its own pixels over themselves,
    // which is a no-op for opaque paint — only occluded pieces change. ----
    ctx.save();
    ctx.globalAlpha = 0.4;
    for (const op of ops) op.draw();
    ctx.restore();

    // ---- overlays ----
    if (view.flashes) {
      for (const f of view.flashes) {
        const plane = Math.max(this.elevationAt(f.q, f.r), 1) + 1;
        this.fillCellDiamond(ctx, f.q, f.r, plane, `rgba(208,96,63,${0.45 * f.alpha})`, tsx, tsy);
      }
    }
    if (view.targets) {
      for (const c of view.targets) this.strokeCellDiamond(ctx, c.q, c.r, tsx, tsy, z, GOLD, true);
    }
    if (view.selected) {
      this.strokeCellDiamond(ctx, view.selected.q, view.selected.r, tsx, tsy, z, GOLD_LINE, false);
    }
    if (view.arrows) {
      for (const a of view.arrows) this.drawArrow(ctx, a, z, w, h);
    }
    if (view.badges) {
      for (const b of view.badges) this.drawBadge(ctx, b, z, w, h);
    }
  }

  private planeOf(q: number, r: number): number {
    return Math.max(this.elevationAt(q, r), 1) + 1;
  }

  private fillCellDiamond(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    plane: number,
    fill: string,
    tsx: (n: number) => number,
    tsy: (n: number) => number,
  ): void {
    const cx = (x - y) * HALF_W;
    const cy = (x + y) * HALF_H - plane * LEVEL;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(tsx(cx), tsy(cy));
    ctx.lineTo(tsx(cx + HALF_W), tsy(cy + HALF_H));
    ctx.lineTo(tsx(cx), tsy(cy + HALF_H * 2));
    ctx.lineTo(tsx(cx - HALF_W), tsy(cy + HALF_H));
    ctx.closePath();
    ctx.fill();
  }

  private strokeCellDiamond(
    ctx: CanvasRenderingContext2D,
    q: number,
    r: number,
    tsx: (n: number) => number,
    tsy: (n: number) => number,
    zoom: number,
    color: string,
    fillToo: boolean,
  ): void {
    const plane = this.planeOf(q, r);
    const cx = (q - r) * HALF_W;
    const cy = (q + r) * HALF_H - plane * LEVEL;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tsx(cx), tsy(cy));
    ctx.lineTo(tsx(cx + HALF_W), tsy(cy + HALF_H));
    ctx.lineTo(tsx(cx), tsy(cy + HALF_H * 2));
    ctx.lineTo(tsx(cx - HALF_W), tsy(cy + HALF_H));
    ctx.closePath();
    if (fillToo) {
      ctx.fillStyle = 'rgba(207,156,60,0.12)';
      ctx.fill();
    }
    ctx.setLineDash([10 * zoom * 4, 7 * zoom * 4]);
    ctx.lineWidth = Math.max(1.5, 5 * zoom);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  private drawArrow(
    ctx: CanvasRenderingContext2D,
    a: { from: CellRef; to: CellRef; kind: 'move' | 'attack'; color?: string; bold?: boolean },
    zoom: number,
    w: number,
    h: number,
  ): void {
    const p0 = this.cellToScreen(a.from.q, a.from.r, w, h);
    const p1 = this.cellToScreen(a.to.q, a.to.r, w, h);
    const mx = (p0.x + p1.x) / 2;
    const my = (p0.y + p1.y) / 2 - 46 * zoom * 2.2;
    const col = a.kind === 'attack' ? '#a4402a' : (a.color ?? INK);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = Math.max(1.5, (a.bold ? 9 : 6) * zoom);
    ctx.setLineDash([12 * zoom * 3, 9 * zoom * 3]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(mx, my, p1.x, p1.y);
    ctx.stroke();
    // arrowhead along the curve's end tangent
    const ang = Math.atan2(p1.y - my, p1.x - mx);
    const ah = Math.max(6, 26 * zoom);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p1.x - ah * Math.cos(ang - 0.42), p1.y - ah * Math.sin(ang - 0.42));
    ctx.lineTo(p1.x - ah * Math.cos(ang + 0.42), p1.y - ah * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fill();
    // attack arrows get a crosshair ring on the target so they never read as
    // moves (Ember's move color is itself a dark red)
    if (a.kind === 'attack') {
      const rr = Math.max(5, 30 * zoom);
      ctx.lineWidth = Math.max(1.5, 5 * zoom);
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** small labeled chip floating above a cell — the "what's being voted" glance layer */
  private drawBadge(
    ctx: CanvasRenderingContext2D,
    b: { q: number; r: number; label: string; color: string; lift?: number },
    zoom: number,
    w: number,
    h: number,
  ): void {
    const p = this.cellToScreen(b.q, b.r, w, h);
    const y = p.y - (b.lift ?? 170) * zoom;
    if (p.x < -80 || p.x > w + 80 || y < -40 || y > h + 40) return;
    const fs = Math.max(10, Math.min(14, 44 * zoom));
    ctx.save();
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    const tw = ctx.measureText(b.label).width;
    const padX = fs * 0.45;
    const hh = fs * 0.78;
    ctx.fillStyle = 'rgba(253,248,234,0.94)';
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(p.x - tw / 2 - padX, y - hh, tw + padX * 2, hh * 2, hh);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.label, p.x, y + fs * 0.06);
    ctx.restore();
  }

  private drawOreGlint(
    ctx: CanvasRenderingContext2D,
    t: Placed,
    tsx: (n: number) => number,
    tsy: (n: number) => number,
    zoom: number,
  ): void {
    const cx = tsx((t.x - t.y) * HALF_W);
    const cy = tsy((t.x + t.y) * HALF_H - t.z * LEVEL + HALF_H);
    ctx.save();
    ctx.fillStyle = GOLD;
    ctx.strokeStyle = GOLD_LINE;
    ctx.lineWidth = Math.max(1, 3 * zoom);
    for (const [ox, oy, rr] of [
      [-26, 2, 9],
      [18, -8, 7],
      [4, 14, 6],
    ]) {
      ctx.beginPath();
      ctx.arc(cx + ox * zoom, cy + oy * zoom, Math.max(1.5, rr * zoom), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHpPips(
    ctx: CanvasRenderingContext2D,
    u: Unit,
    tsx: (n: number) => number,
    tsy: (n: number) => number,
    zoom: number,
    plane: number,
    pos?: { x: number; y: number },
  ): void {
    const max = UNIT_STATS[u.type].hp;
    if (u.hp >= max) return; // pristine pieces stay clean
    const x = pos?.x ?? u.q;
    const y = pos?.y ?? u.r;
    const cx = tsx((x - y) * HALF_W);
    const cy = tsy((x + y) * HALF_H - plane * LEVEL + HALF_H);
    const wpx = 74 * zoom;
    const hpx = Math.max(3, 10 * zoom);
    const top = cy - (u.type === 'tank' ? 92 : u.type === 'capital' ? 240 : u.type === 'factory' ? 200 : 130) * zoom;
    ctx.save();
    ctx.fillStyle = 'rgba(68,58,38,0.85)';
    ctx.beginPath();
    ctx.roundRect(cx - wpx / 2 - 2, top - 2, wpx + 4, hpx + 4, 3);
    ctx.fill();
    const frac = Math.max(0, u.hp / max);
    ctx.fillStyle = frac > 0.5 ? FACTIONS[u.faction].mid : frac > 0.25 ? GOLD : '#c14b32';
    ctx.beginPath();
    ctx.roundRect(cx - wpx / 2, top, wpx * frac, hpx, 2);
    ctx.fill();
    ctx.restore();
  }
}
