// Procedural board-game pieces, ported from the art proof (docs/art-proof.html
// is the reference implementation — keep the recipes in sync with it).
// All pieces draw with their FEET at (fx, fy); s is the piece size in px.

import { GOLD, GOLD_LINE, type FactionColors } from './palette';

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], close = true): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  if (close) ctx.closePath();
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.2): void {
  ctx.fillStyle = `rgba(60,42,20,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function stroked(ctx: CanvasRenderingContext2D, w: number, col: string, fn: () => void): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = w;
  ctx.strokeStyle = col;
  fn();
  ctx.stroke();
}

export function drawTank(ctx: CanvasRenderingContext2D, fx: number, fy: number, s: number, F: FactionColors): void {
  const u = s / 100;
  shadow(ctx, fx, fy + 5 * u, 50 * u, 17 * u, 0.22);
  // treads
  ctx.beginPath();
  ctx.roundRect(fx - 46 * u, fy - 27 * u, 92 * u, 27 * u, 12 * u);
  ctx.fillStyle = '#5a4c3a';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#6f6049';
  ctx.fillRect(fx - 46 * u, fy - 27 * u, 46 * u, 27 * u);
  ctx.restore();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4.5 * u;
  ctx.strokeStyle = '#3a3122';
  ctx.beginPath();
  ctx.roundRect(fx - 46 * u, fy - 27 * u, 92 * u, 27 * u, 12 * u);
  ctx.stroke();
  // hull
  ctx.beginPath();
  ctx.roundRect(fx - 37 * u, fy - 47 * u, 74 * u, 25 * u, 8 * u);
  ctx.fillStyle = F.mid;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = F.light;
  ctx.fillRect(fx - 37 * u, fy - 47 * u, 74 * u, 10 * u);
  ctx.fillStyle = F.dark;
  ctx.fillRect(fx + 14 * u, fy - 47 * u, 23 * u, 25 * u);
  ctx.restore();
  ctx.lineWidth = 4.5 * u;
  ctx.strokeStyle = F.line;
  ctx.beginPath();
  ctx.roundRect(fx - 37 * u, fy - 47 * u, 74 * u, 25 * u, 8 * u);
  ctx.stroke();
  // barrel
  ctx.lineCap = 'round';
  ctx.lineWidth = 13 * u;
  ctx.strokeStyle = F.line;
  ctx.beginPath();
  ctx.moveTo(fx + 6 * u, fy - 56 * u);
  ctx.lineTo(fx + 46 * u, fy - 50 * u);
  ctx.stroke();
  ctx.lineWidth = 7.5 * u;
  ctx.strokeStyle = F.dark;
  ctx.beginPath();
  ctx.moveTo(fx + 6 * u, fy - 56 * u);
  ctx.lineTo(fx + 44 * u, fy - 50.5 * u);
  ctx.stroke();
  ctx.fillStyle = F.line;
  ctx.beginPath();
  ctx.arc(fx + 46 * u, fy - 50 * u, 4.8 * u, 0, Math.PI * 2);
  ctx.fill();
  // turret dome
  const tx = fx - 6 * u,
    ty = fy - 57 * u,
    tr = 17 * u;
  ctx.beginPath();
  ctx.arc(tx, ty, tr, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = F.mid;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = F.dark;
  ctx.fillRect(tx + 3 * u, ty - tr, tr, tr);
  ctx.fillStyle = F.light;
  ctx.beginPath();
  ctx.arc(tx - 5 * u, ty - 2 * u, tr * 0.62, Math.PI, Math.PI * 1.6);
  ctx.lineTo(tx - 5 * u, ty - 2 * u);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 4.5 * u;
  ctx.strokeStyle = F.line;
  ctx.beginPath();
  ctx.arc(tx, ty, tr, Math.PI, 0);
  ctx.closePath();
  ctx.stroke();
}

export function drawWorker(ctx: CanvasRenderingContext2D, fx: number, fy: number, s: number, F: FactionColors): void {
  const u = s / 100;
  shadow(ctx, fx, fy + 3 * u, 26 * u, 10 * u);
  // pickaxe behind body
  ctx.lineCap = 'round';
  ctx.lineWidth = 10 * u;
  ctx.strokeStyle = '#5d4526';
  ctx.beginPath();
  ctx.moveTo(fx + 22 * u, fy - 4 * u);
  ctx.lineTo(fx - 20 * u, fy - 80 * u);
  ctx.stroke();
  ctx.lineWidth = 6 * u;
  ctx.strokeStyle = '#96713f';
  ctx.beginPath();
  ctx.moveTo(fx + 22 * u, fy - 4 * u);
  ctx.lineTo(fx - 20 * u, fy - 80 * u);
  ctx.stroke();
  ctx.lineWidth = 13 * u;
  ctx.strokeStyle = '#46525f';
  ctx.beginPath();
  ctx.arc(fx - 20 * u, fy - 64 * u, 17 * u, Math.PI * 1.15, Math.PI * 1.95);
  ctx.stroke();
  ctx.lineWidth = 7 * u;
  ctx.strokeStyle = '#8195a5';
  ctx.beginPath();
  ctx.arc(fx - 20 * u, fy - 64 * u, 17 * u, Math.PI * 1.15, Math.PI * 1.95);
  ctx.stroke();
  // cloak
  const cl: [number, number][] = [
    [fx, fy - 84 * u],
    [fx + 19 * u, fy - 68 * u],
    [fx + 27 * u, fy - 2 * u],
    [fx - 27 * u, fy - 2 * u],
    [fx - 19 * u, fy - 68 * u],
  ];
  poly(ctx, cl);
  ctx.fillStyle = F.mid;
  ctx.fill();
  ctx.save();
  poly(ctx, cl);
  ctx.clip();
  ctx.fillStyle = F.dark;
  ctx.fillRect(fx + 2 * u, fy - 90 * u, 40 * u, 95 * u);
  ctx.restore();
  stroked(ctx, 5 * u, F.line, () => poly(ctx, cl));
  // head + hood
  ctx.beginPath();
  ctx.arc(fx, fy - 64 * u, 12.5 * u, 0, Math.PI * 2);
  ctx.fillStyle = '#ecd2a4';
  ctx.fill();
  ctx.lineWidth = 4 * u;
  ctx.strokeStyle = '#96713f';
  ctx.stroke();
  ctx.lineWidth = 9 * u;
  ctx.strokeStyle = F.dark;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(fx, fy - 64 * u, 14 * u, Math.PI * 1.02, Math.PI * 1.98);
  ctx.stroke();
}

export function drawScout(ctx: CanvasRenderingContext2D, fx: number, fy: number, s: number, F: FactionColors): void {
  const u = s / 100;
  shadow(ctx, fx, fy + 3 * u, 24 * u, 9 * u);
  // pennant pole
  ctx.lineCap = 'round';
  ctx.lineWidth = 5 * u;
  ctx.strokeStyle = '#5d4526';
  ctx.beginPath();
  ctx.moveTo(fx + 15 * u, fy - 2 * u);
  ctx.lineTo(fx + 15 * u, fy - 104 * u);
  ctx.stroke();
  const flag: [number, number][] = [
    [fx + 15 * u, fy - 104 * u],
    [fx + 52 * u, fy - 94 * u],
    [fx + 15 * u, fy - 82 * u],
  ];
  poly(ctx, flag);
  ctx.fillStyle = F.mid;
  ctx.fill();
  ctx.save();
  poly(ctx, flag);
  ctx.clip();
  ctx.fillStyle = F.light;
  ctx.fillRect(fx + 15 * u, fy - 104 * u, 37 * u, 8 * u);
  ctx.restore();
  stroked(ctx, 4 * u, F.line, () => poly(ctx, flag));
  ctx.fillStyle = F.line;
  ctx.beginPath();
  ctx.arc(fx + 15 * u, fy - 106 * u, 3.6 * u, 0, Math.PI * 2);
  ctx.fill();
  // lean-forward slim cloak
  const cl: [number, number][] = [
    [fx + 6 * u, fy - 78 * u],
    [fx + 18 * u, fy - 60 * u],
    [fx + 20 * u, fy - 2 * u],
    [fx - 20 * u, fy - 2 * u],
    [fx - 11 * u, fy - 62 * u],
  ];
  poly(ctx, cl);
  ctx.fillStyle = F.mid;
  ctx.fill();
  ctx.save();
  poly(ctx, cl);
  ctx.clip();
  ctx.fillStyle = F.dark;
  ctx.fillRect(fx + 4 * u, fy - 84 * u, 30 * u, 92 * u);
  ctx.restore();
  stroked(ctx, 5 * u, F.line, () => poly(ctx, cl));
  // satchel
  ctx.beginPath();
  ctx.roundRect(fx - 16 * u, fy - 34 * u, 14 * u, 11 * u, 3.5 * u);
  ctx.fillStyle = '#b98d54';
  ctx.fill();
  ctx.lineWidth = 3.4 * u;
  ctx.strokeStyle = '#6b4d24';
  ctx.stroke();
  // head + hood
  ctx.beginPath();
  ctx.arc(fx + 4 * u, fy - 60 * u, 11.5 * u, 0, Math.PI * 2);
  ctx.fillStyle = '#ecd2a4';
  ctx.fill();
  ctx.lineWidth = 4 * u;
  ctx.strokeStyle = '#96713f';
  ctx.stroke();
  ctx.lineWidth = 8.5 * u;
  ctx.strokeStyle = F.dark;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(fx + 4 * u, fy - 60 * u, 13 * u, Math.PI * 1.06, Math.PI * 2.02);
  ctx.stroke();
}

/** stone-based swallowtail banner — used as the rally/landmark marker */
export function drawBanner(ctx: CanvasRenderingContext2D, fx: number, fy: number, s: number, F: FactionColors): void {
  const u = s / 100;
  shadow(ctx, fx, fy + 3 * u, 26 * u, 10 * u);
  // stone base
  ctx.beginPath();
  ctx.roundRect(fx - 20 * u, fy - 13 * u, 40 * u, 14 * u, 6 * u);
  ctx.fillStyle = '#93a7b6';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#b4c5d1';
  ctx.fillRect(fx - 20 * u, fy - 13 * u, 20 * u, 14 * u);
  ctx.restore();
  ctx.lineWidth = 4 * u;
  ctx.strokeStyle = '#4f6172';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(fx - 20 * u, fy - 13 * u, 40 * u, 14 * u, 6 * u);
  ctx.stroke();
  // pole + finial
  ctx.lineCap = 'round';
  ctx.lineWidth = 6 * u;
  ctx.strokeStyle = '#5d4526';
  ctx.beginPath();
  ctx.moveTo(fx, fy - 10 * u);
  ctx.lineTo(fx, fy - 118 * u);
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(fx, fy - 121 * u, 5 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3 * u;
  ctx.strokeStyle = GOLD_LINE;
  ctx.stroke();
  // swallowtail flag
  const fl: [number, number][] = [
    [fx + 3 * u, fy - 114 * u],
    [fx + 56 * u, fy - 106 * u],
    [fx + 42 * u, fy - 91 * u],
    [fx + 56 * u, fy - 76 * u],
    [fx + 3 * u, fy - 70 * u],
  ];
  poly(ctx, fl);
  ctx.fillStyle = F.mid;
  ctx.fill();
  ctx.save();
  poly(ctx, fl);
  ctx.clip();
  ctx.fillStyle = F.light;
  ctx.fillRect(fx + 3 * u, fy - 114 * u, 53 * u, 12 * u);
  ctx.fillStyle = F.dark;
  ctx.fillRect(fx + 3 * u, fy - 80 * u, 53 * u, 10 * u);
  ctx.restore();
  stroked(ctx, 4.5 * u, F.line, () => poly(ctx, fl));
  ctx.fillStyle = F.light;
  ctx.beginPath();
  ctx.arc(fx + 22 * u, fy - 92 * u, 8 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3.2 * u;
  ctx.strokeStyle = F.line;
  ctx.stroke();
}

export type PieceDrawFn = (
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  s: number,
  F: FactionColors,
) => void;

export const PIECE_DRAWERS: Record<'worker' | 'tank' | 'scout', PieceDrawFn> = {
  worker: drawWorker,
  tank: drawTank,
  scout: drawScout,
};
