# UI — Social War Games visual language

The game is a **war table**: a beautiful Kenney-Sketch isometric world used as the
board, with procedurally-drawn board-game pieces standing on it. The proof of the
entire art direction (real tiles + code-drawn units, verified indistinguishable) is
`docs/art-proof.html` — open it in a browser; its canvas code is the reference
implementation for every piece. **Mobile is the primary platform.**

The starter's original shadcn baseline doc is archived at `docs/starter-ui.md`
(still relevant for form primitives and the token plumbing in `src/styles/app.css`).

## Palette

Derived from the Kenney Sketch tiles themselves — never invent adjacent colors,
sample these.

| token | value | source |
|---|---|---|
| paper | `#f6efdc` | app background (drafting table) |
| board | `#f2e7cb` | canvas backdrop behind the map |
| panel | `#fdf8ea` | cards / sheets |
| ink | `#443a26` | text, arrows, dark UI |
| ink-soft | `#71634a` | secondary text |
| line | `#d9cca9` | borders, dividers |
| gold | `#cf9c3c` / line `#6b5116` | rally pins, targets, accents |
| grass top | `#a9d16b` light / `#98c058` shade | tile top faces |
| dirt sides | `#dd8961` left / `#c1684a` right | tile side faces |
| grass outline | `#5d7a2b` · dirt outline `#7a4a30` | tile edges |
| stone | `#cfdde8` / `#9fb4c4` / `#7d93a6`, line `#4f6172` | castles, banner bases |
| skin | `#ecd2a4`, line `#96713f` | piece heads |

**Factions** (mid tone; light = +.16 L, dark = −.13 L +.04 S, outline = L×.42 S×1.2):

- Verdant Compact `#7fb43a` · Dusk Covenant `#9a6fd0` · Ember Pact `#d0603f`
- Territory tint on tiles: faction color at 13–14% alpha over the top face.
- Ember tile variants (keeps, roofs) come from the pixel hue-remap: pixels with
  `sat > .16 && hue ∈ [52°,155°]` → hue 12°, sat ×1.08, lum ×.96.

Dark theme: page chrome darkens (`#211b10` paper, `#f0e7cd` ink); the board canvas
**stays light** — a lit game table in a dark room. That's a committed choice.

## The piece language (procedural units)

Four rules, applied to everything (exact code in `docs/art-proof.html`):

1. Chunky rounded silhouettes (roundRect + round joins), slight organic wobble.
2. 2–3 flat value planes, lit upper-left: top lightest, left mid, right dark.
3. One thick outline per shape: the fill color at L×.42, S×1.2 (never pure black).
4. Soft contact shadow: `rgba(60,42,20,.20)` ellipse at the feet.

Pieces: **Worker** (cloaked figure + pickaxe), **Tank** (treads `#5a4c3a`/`#6f6049`,
faction hull, dome turret, stub barrel), **Scout** (slim leaning cloak + pennant
pole), **Banner** (stone base, pole, swallowtail flag). Factories/capitals are real
Kenney castle/building tiles in the faction's color variant.

HP pips, veterancy marks, selection rings: same language — gold for selection,
faction colors for state, ink for chrome.

## Canvas / board conventions

- Tile geometry (fabletest): cell diamond 232×110, `screenX=(q−r)·116`,
  `screenY=(q+r)·55 − z·110`. Tile PNGs 256×352 anchored at (−128,−236) from the
  cell's base vertex; a piece's feet center = anchor − 55 in Y.
- Painter order `(q+r)·64 + z`, ties by q; pieces draw immediately after their tile.
- Keeps/towers sit raised one level (anchor Y −346) so their base reads proud.
- Selection: gold dashed diamond on the cell; legal move targets: gold dashed
  outline diamonds + 12% gold fill; order arrows: ink dashed quadratic with a solid
  arrowhead (see proof hero scene).
- DPR-aware rendering; round flip animates: position lerps (~400ms ease), attack
  flash, paint spread ripple. `prefers-reduced-motion` → snap, no lerps.

## Mobile UX law (non-negotiable)

- **Bottom sheet, never floating tooltips/popovers**, for unit interaction.
  Tap piece → sheet slides up ~40% height (drag to expand):
  - Header: piece portrait (procedural, drawn big), "Verdant Tank №7", faction chip,
    HP pips.
  - **Live tally**: top 3 proposed actions this round as horizontal bars with vote
    counts and the current leader marked ("Move E — 12 ▸ winning").
  - Action row: big buttons (Move / Attack / Mine / Build / Produce / Hold) — only
    legal ones. Tapping Move/Attack enters target mode: sheet collapses to a slim
    prompt bar, canvas highlights legal hexes, tap to cast.
  - After casting: "✓ your vote: Move E · energy 4/25" + **Share rally** button.
- Touch targets ≥ 44px. Thumb zone: all primary actions in the bottom third.
- Safe areas: `env(safe-area-inset-*)` on HUD and sheet. `100dvh`, never `100vh`.
- Top HUD (slim, one line): round countdown center, faction score strip, energy
  pill right. Everything else lives behind the sheet or a drawer.
- Gestures: one-finger pan, pinch zoom, double-tap zoom-in, tap select. No hover.
- Text: system-ui stack; titles `Rockwell, 'Roboto Slab', serif` (board-game manual
  flavor); numbers `font-variant-numeric: tabular-nums`.

## App chrome (non-game pages)

Landing/leaderboard/war-report follow the art-proof page style: paper background,
slab-serif display headings, panel cards with 2px `line` borders and 12px radius,
uppercase letter-spaced eyebrows in gold. Keep the starter's shadcn primitives for
forms; restyle tokens toward this palette in `src/styles/app.css`.
