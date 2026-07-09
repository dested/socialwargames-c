// The war-table palette (ui.md) + faction color math from the art proof.

export const PAPER = '#f6efdc';
export const BOARD = '#f2e7cb';
export const PANEL = '#fdf8ea';
export const INK = '#443a26';
export const INK_SOFT = '#71634a';
export const LINE = '#d9cca9';
export const GOLD = '#cf9c3c';
export const GOLD_LINE = '#6b5116';

export interface FactionColors {
  mid: string;
  light: string;
  dark: string;
  line: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r: number, g: number, b: number;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function adj(hex: string, dl: number, ds = 0): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [r2, g2, b2] = hslToRgb(h, Math.min(1, Math.max(0, s + ds)), Math.min(1, Math.max(0, l + dl)));
  return `rgb(${r2},${g2},${b2})`;
}

/** rule 3 of the piece language: outline = fill at L×.42, S×1.2 (never black) */
function outlineOf(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [r2, g2, b2] = hslToRgb(h, Math.min(1, s * 1.2), l * 0.42);
  return `rgb(${r2},${g2},${b2})`;
}

function mk(base: string): FactionColors {
  return { mid: base, light: adj(base, 0.16), dark: adj(base, -0.13, 0.04), line: outlineOf(base) };
}

export const FACTION_BASE = ['#7fb43a', '#9a6fd0', '#d0603f'] as const;
export const FACTION_NAMES = ['Verdant Compact', 'Dusk Covenant', 'Ember Pact'] as const;
export const FACTIONS: FactionColors[] = FACTION_BASE.map(mk);

/** territory tint over tile top faces: faction color at ~13% alpha */
export function territoryTint(faction: number): string {
  const [r, g, b] = hexToRgb(FACTION_BASE[faction]);
  return `rgba(${r},${g},${b},0.14)`;
}

/** Ember hue-remap (ui.md): sat>.16 && hue∈[52°,155°] → hue 12°, sat×1.08, lum×.96 */
export function emberize(img: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    if (d.data[i + 3] < 8) continue;
    const [h, s, l] = rgbToHsl(d.data[i], d.data[i + 1], d.data[i + 2]);
    if (s > 0.16 && h >= 52 && h <= 155) {
      const [r, gg, b] = hslToRgb(12, Math.min(1, s * 1.08), l * 0.96);
      d.data[i] = r;
      d.data[i + 1] = gg;
      d.data[i + 2] = b;
    }
  }
  g.putImageData(d, 0, 0);
  return c;
}
