# UI — Social War Games visual language

The game is a **miniature war diorama with a holographic command layer**: a warm,
sunlit low-poly hex island (Three.js, real 3D) with toy-like pieces standing on
faction-colored base pucks — and every piece of *data* (votes, territory,
targets, selection, damage) rendered as glowing unlit light floating above the
physical world. **Mobile is the primary platform.** The whole board fits on one
phone screen (blitz R=9).

**The visual law: terrain never glows, data always does.** If a player needs to
read it to play, it's holographic (emissive, unlit, floating); if it's just the
world, it's physical (lit, shadowed, matte). Never mix the two.

The starter's original shadcn baseline doc is archived at `docs/starter-ui.md`.
All tokens live in `src/scene/palette.ts` — sample from there, never invent.

## The three layers

1. **Diorama** (`WORLD` tokens): sage grass terraces (`grass1..3`), sand shores,
   earth flanks, stone mountains with snow caps, pine forests, gold ore
   crystals, translucent teal ocean over a deep floor. Warm key light
   (`#fff3dc`, strong shadows) + cool hemisphere fill; ACES tone mapping;
   soft sky fog (`WORLD.sky #b7d3de`). Per-cell lightness jitter (`cellHash`)
   so the board reads handmade. Flat shading everywhere — no textures, ever.
2. **Holo layer** (faction `glow` colors + `UI.accent`): territory = translucent
   hex fills on top faces; votes = arced tube arrows (attack = `UI.danger` red
   + reticle rings on the target); non-directional votes = floating chip
   sprites ("+ tank", "⛏ mine"); legal targets = pulsing gold hex rings;
   selection = faction-glow ring + vertical light beam; damage = HP pip
   sprites (only when hurt). All `MeshBasicMaterial` (unlit), depthWrite off.
3. **Chrome — PROPAGANDA POSTER (2026-08-09, supersedes dark glass)**: every
   HUD panel, sheet, and page is war-office paper pinned over the diorama.
   Tokens + primitives in `src/app/poster.tsx` (`POSTER` palette, `Stamp`,
   `Panel`, `Grain`, `Sunburst`, `Eyebrow`, `PageShell`) and component classes
   in `src/styles/app.css` (`.poster-btn[--gold|--ink]`, `.ticker`,
   `.poster-tilt-*`, `.rise`, `.blink-dot`). The scene `UI` tokens in
   `palette.ts` are legacy — don't use them for new chrome. `.dark` is OFF;
   the app is light everywhere (a sunlit board deserves daylight chrome).

## Factions

Verdant Compact `#7fb43a` · Dusk Covenant `#9a6fd0` · Ember Pact `#d0603f`.
Derived per faction (see `palette.ts` `mk()`): `light`/`dark` for material
planes, `line` (L×.42) for outlines on light surfaces, **`glow`** (brightened,
saturated) for the holo layer and dark chrome. Ownership = the base puck under
every piece + the banner/roof color; no hue-remapped assets anymore.

## The piece language (procedural miniatures)

Every unit is a `THREE.Group` of primitives (`src/scene/pieces3d.ts`), cached
per (type, faction) and cloned. Rules:

1. **Base puck first** — every piece stands on a faction `mid` cylinder like a
   board-game miniature. That's the ownership signal at any zoom.
2. Strong one-glance silhouettes: Worker = round body + cream head + yellow
   hardhat + pickaxe; Scout = wedge hull + tall pennant antenna; Tank = treads
   + hull + turret + barrel; Factory = stone box + faction sawtooth roof +
   smokestack; Capital = stone keep + crenellations + faction cone roof +
   banner (the landmark — 3× taller than units).
3. Faction `mid` for the body, `dark`/`light` for secondary planes, shared
   stone/charcoal/cream for neutral parts. Flags use `glow` (unlit).
4. Sheet portraits are the real 3D miniature rendered by a shared offscreen
   GL studio (`src/scene/portrait.ts`) — never a 2D redraw.

## Board & camera conventions

- Axial (q,r) → world: `x = q + r/2`, `z = r·√3/2` (spacing 1); hex corners at
  30°+60k so flats face the 6 neighbors (`src/scene/hex3d.ts`).
- Terraces: `topY(e) = e·0.34`; ocean surface y=0.15; turf bevel wraps the rim.
- The land is ONE merged mesh with baked vertex colors — do NOT convert it to
  InstancedMesh: instanced shadow *receiving* is broken (three r185), and the
  merged mesh is a single draw call anyway. Trees/ore/rocks stay instanced
  (they only cast).
- Camera rig (`scene.ts cam`): target/yaw/pitch/dist. One-finger pan,
  pinch+twist, wheel zoom, right-drag orbit, double-tap dive. On join the
  camera frames the whole island with YOUR capital toward the viewer
  (`focusFaction`). Pitch clamped 24°–77° so the board never degenerates.
- Picking: raycast pieces first (tall capitals tappable anywhere on the body),
  then terrain intersection point → `worldToCell`.
- Round flip: movement lerps along event paths (positions map in fractional
  axial coords), attack flashes as additive white bursts; vote overlay hides
  during the flip. `prefers-reduced-motion` freezes pulses and snaps moves.

## Mobile UX law (unchanged)

Bottom sheet for unit interaction — never floating tooltips. 44px minimum
targets. Safe-area insets everywhere. One-glance legibility: every mechanic
ships with its on-board indicator + labeled HUD + hint text.

## App chrome (non-game pages) — the recruitment poster

Landing, war room, rally, auth, 404 are WWII propaganda posters: aged paper
(`#eee3c6`), 3px ink (`#28211a`) borders, hard offset shadows (`4px 4px 0`),
rotated rubber stamps (stamp red `#a03723`), sunburst conic backdrops, SVG
grain overlays, `★★★` dividers, gold `#cf9c3c` CTAs.

- Type: display `Alfa Slab One` · labels/buttons `Oswald` (condensed caps,
  wide tracking) · flavor/numbers `Special Elite` (typewriter, tabular) ·
  body serif Georgia stack. All @fontsource, imported in app.css.
- Poster art: AI-generated (GPT Image 2) silkscreen posters in
  `public/posters/*.webp` — three faction recruitment portraits + the hero
  battlefield (`hero-og.jpg` for og:image). Regenerate via the openai-image
  skill with the "vintage 1940s propaganda, silkscreen lithograph, no text"
  prompt family; type is ALWAYS set in CSS, never baked into the image.
- Landing shows LIVE war state (round, countdown, tricolor front-line bar)
  via `game.state` with a 15s refetch + 1s local countdown tick.
- In-game chrome (play HUD, hint telegram, target bar, unit sheet) is the
  same paper language at ~95% opacity over the board; faction dots/chips use
  faction `mid` colors with ink borders (glow colors stay on the holo layer).
- Motion: `.rise` staggered entrances, slogan ticker, blink-dot — all
  disabled under `prefers-reduced-motion`.
