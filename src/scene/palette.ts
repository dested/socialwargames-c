// The color language of the 3D war diorama + its holographic command layer.
// Dep-free (no three import) so React pages can pull tokens without weight.
//
// Two worlds, one screen:
//  - the DIORAMA: a warm, sunlit miniature island (muted sage/earth/sand)
//  - the HOLO layer: saturated glowing faction light for every piece of DATA
//    (votes, territory, selection, targets) — data always glows, terrain never does
//  - the CHROME: dark glass HUD floating over the bright world

export const FACTION_BASE = ['#7fb43a', '#9a6fd0', '#d0603f'] as const;
export const FACTION_NAMES = ['Verdant Compact', 'Dusk Covenant', 'Ember Pact'] as const;

export interface FactionColors {
  /** primary piece color */
  mid: string;
  light: string;
  dark: string;
  /** dark outline variant — readable on LIGHT backgrounds */
  line: string;
  /** bright emissive variant — the holo/glow color, readable on the board and dark chrome */
  glow: string;
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

function shift(hex: string, dl: number, ds = 0): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [r2, g2, b2] = hslToRgb(h, Math.min(1, Math.max(0, s + ds)), Math.min(1, Math.max(0, l + dl)));
  return `rgb(${r2},${g2},${b2})`;
}

function outlineOf(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [r2, g2, b2] = hslToRgb(h, Math.min(1, s * 1.2), l * 0.42);
  return `rgb(${r2},${g2},${b2})`;
}

function glowOf(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [r2, g2, b2] = hslToRgb(h, Math.min(1, s * 1.15 + 0.1), Math.min(0.72, l + 0.18));
  return `rgb(${r2},${g2},${b2})`;
}

function mk(base: string): FactionColors {
  return { mid: base, light: shift(base, 0.16), dark: shift(base, -0.13, 0.04), line: outlineOf(base), glow: glowOf(base) };
}

export const FACTIONS: FactionColors[] = FACTION_BASE.map(mk);

// ---- dark glass chrome (HUD, sheets, pages) ----

export const UI = {
  /** page background for non-board routes */
  bg: '#0e1319',
  bgRaise: '#151c25',
  /** floating glass panel over the board */
  panel: 'rgba(13,18,24,0.86)',
  panelSolid: '#121820',
  panelBorder: 'rgba(255,255,255,0.10)',
  ink: '#eef3f7',
  inkSoft: '#94a6b5',
  inkFaint: '#5d6d7a',
  /** command gold — CTAs, timers, rally */
  accent: '#ffd76a',
  accentInk: '#3d2f0d',
  accentLine: 'rgba(255,215,106,0.45)',
  danger: '#ff6752',
  ok: '#7fdc8a',
} as const;

// ---- diorama material colors (consumed by the scene modules) ----

export const WORLD = {
  sky: '#b7d3de',
  oceanDeep: '#20536e',
  ocean: '#2f7396',
  oceanEdge: '#5fa8c4',
  sand: '#dbc489',
  grass1: '#a9c274', // lowland meadow
  grass2: '#8fb160', // mid terrace
  grass3: '#7f9a55', // highland
  forestFloor: '#6f9150',
  earth: '#8c6f4e', // column sides
  earthDeep: '#6d543a',
  stone: '#9aa0a4',
  snow: '#e9edef',
  treeTrunk: '#7a5b3d',
  tree1: '#4f7d46',
  tree2: '#5e8f4c',
  ore: '#ffc94d',
  oreDeep: '#c78d1e',
  wallStone: '#d9d0bb', // capital masonry
  smokestack: '#5b6066',
} as const;
