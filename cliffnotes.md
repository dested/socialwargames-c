# CLIFFNOTES — Social War Games

**"TwitchPlaysPokemon, but tanks."** Three factions, hundreds of players each; nobody
owns a unit — you vote on each piece's action, rounds resolve on a timer, winning
actions execute. Mobile-first. Open source. Full game spec: **`design.md`**.
Visual language (3D diorama + holo layer): **`ui.md`**.

## Status (2026-07-10, branch `rebuild/3d`) — full 3D rebuild, playable end-to-end

User verdict on the 2D sketch version: "I hate how this looks, the scale the
scope all feels wrong." Rebuilt from scratch per his choices (diorama + holo
overlay, shrink + retune, Three.js):

- **The sketch era is deleted** — `src/game/` (iso canvas renderer), the 828
  Kenney tile PNGs, `docs/art-proof.html`. Do not resurrect them.
- **`src/scene/` is the renderer now** (Three.js r185): `palette.ts` (faction +
  WORLD + UI dark-glass tokens, dep-free), `hex3d.ts` (axial→world, beveled hex
  prism math, `cellHash` jitter), `terrain3d.ts` (ONE merged land mesh with
  baked vertex colors + instanced trees/ore/mountain-caps + ocean discs),
  `pieces3d.ts` (toy miniatures on faction base pucks, cached templates),
  `holo.ts` (arced vote arrows, attack reticles, chip/HP sprites, rings,
  selection beam), `scene.ts` (WarScene: camera rig, gestures, picking,
  per-frame diff sync), `portrait.ts` (shared offscreen GL studio for sheet
  portraits).
- **Scale retuned**: blitz R=9/45s rounds (271 cells), campaign R=13/900s
  (547 cells) — the whole war fits one phone screen. Old numbers (R=18/R=30,
  60s) are gone from `server/game.ts`, sim tests, and design.md.
- **Dark glass chrome everywhere**: play HUD (+ round progress bar), unit
  sheet, home/war/rally, and `.dark` on `<html>` so starter pages match.
- Loop verified end-to-end in 3D (desktop + iPhone viewports, screenshots):
  join → tap capital (raycast) → sheet with 3D portrait → produce/move votes →
  arrows/chips/territory/targets/selection all render. `bun run test:e2e`
  (5 specs, baselines regenerated for dark theme) + `bun test shared` (22) +
  typecheck + prod build all green.
- Next: playtesting/balance; maybe code-split the play route (three puts the
  client chunk >500kB, vite warns); cheap deploy target (Render deprioritized).

Legibility carry-overs from the 2D feedback (all live in 3D): board-wide vote
overlay (leading tally action per unit — faction-glow arc for move, red arc +
reticle for attack, floating chip for mine/build/produce — hidden during round
flips), labeled HUD ("round N · m:ss", "⚡ n/25 votes"), first-visit hint banner
(localStorage `swg.hint`, auto-dismisses on first vote). Occlusion is a
non-issue in 3D (camera orbits; pieces raycast-pickable through terrain gaps).

## Routes

- `/` landing (war cards) · `/war/:mode` war room (leaderboard + report)
- `/play/:mode` the war table (mode = blitz | campaign); debug camera via
  `?q=&r=&z=`; dev-only `window.__war` handle for e2e taps
- `/rally/:code` rally landing → one-tap apply → redirects into the war
- starter: `/sign-in` `/sign-up` `/dashboard` `/healthz` `/api/trpc` `/api/auth`

Done:
- **Step 3 (renderer)**: originally the `src/game/` sketch-canvas port —
  REPLACED 2026-07-10 by the Three.js `src/scene/` diorama (see Status).
- **Step 4 (mobile UX)**: `unit-sheet.tsx` bottom sheet per ui.md; play route
  votes via tap-on-hex with legal-target highlights; order arrows (tally leader
  + your vote); round-flip movement lerps + attack flashes (reduced-motion
  snaps); rally share/apply pages; landing + war room pages.
- **Step 5 (verify)**: `e2e/war.spec.ts` (join→tap capital→vote→energy→war
  room) + updated starter smoke; e2e DB URL now derived from `.env` (see
  gotchas). Interaction was also verified on iPhone-13 viewport incl. a second
  guest applying a rally link.
- **Build step 2 complete**: server layer.
  - Prisma models `Game/GamePlayer/Round/Vote/Rally/PlayerStat` (+ `User.isAnonymous`
    for better-auth's `anonymous` plugin — guests drop in with zero friction).
  - `server/game.ts`: mode configs (blitz 60s/1440 rounds, campaign 900s/1344),
    terrain cache, `ensureActiveGames`, `castVotesForPlayer` (lazy energy regen
    +5/cap 25; re-voting a unit is free; rallies cast what's affordable),
    `resolveDueGames` 1s tick loop (started in `server.ts` on listen).
  - tRPC `game.*`: join (least-populated faction), state (snapshot + events + me),
    tally, castVotes, rally.create/get/**cast** (NOT `apply` — tRPC reserves
    Function.prototype words as procedure names), leaderboard, warReport.
  - Verified over HTTP end-to-end: anonymous sign-in → join → castVotes → tally
    → rally roundtrip → tick advanced rounds live → PlayerStat ledger rows.
- **Build step 1 complete**: `shared/` deterministic sim — `hex.ts`, `noise.ts`
  (verbatim fabletest copy), `types.ts` (+ dep-free base64), `units.ts` (stats,
  passability, pathfinding, initial snapshot), `mapgen.ts`, `resolve.ts`.
  22 bun tests in `shared/sim.test.ts` (`bun test shared`): symmetry, gate,
  determinism, combat/bounce/dodge scenarios, 40-round fuzz. All 20 tested seeds
  pass the ≥85% gate on attempt 1 (worst reach 0.997).
  - Symmetry technique: noise is **averaged over the 3 rotations** (continuous,
    no wedge-seam cliffs — better than canonical-rep sampling); samples are
    **sorted before summing** (float addition isn't order-independent) and
    terrace/forest cutoffs are quantile *values*, so orbits never diverge.
  - `rot120(0,0)` normalizes `-0` → `0` (deep-equality trap).
- Scaffolded from **dested/sal-starter** (Bun + Express 5 + Vite SSR + React Router 7
  + tRPC v11 + Prisma 7/Postgres + better-auth + Tailwind 4/shadcn + Playwright).
  Starter architecture reference: `docs/starter-cliffnotes.md` (read it before
  touching server/SSR plumbing — hard rules like "server-only code stays in
  `server/`" live there and in `CLAUDE.md`).
- Local DB: Postgres 18 @ localhost:5432, db `social_war_games` (creds in `.env`,
  gitignored). `bun run db:push` synced. `bun run dev` → :3000 works.
- **portless** ([vercel-labs/portless](https://github.com/vercel-labs/portless)):
  named `.localhost` URL for the dev server. `portless.json` = `{name: swg}`;
  `bun run dev:portless` (= `portless swg bun run dev`) → **https://swg.localhost**.
  Portless injects `PORT` (server.ts already honors it) + `PORTLESS_URL`;
  `server/auth.ts` prefers `PORTLESS_URL` for better-auth `baseURL`/`trustedOrigins`
  so guest auth works at the named HTTPS origin (no-op without portless).
  Verified live: `/`, `/healthz`, `/play/blitz` all 200 through the proxy; OS
  trust store has portless's CA so browsers show a valid padlock. NB: `portless
  doctor` warns "Node 24+ required" (box has Node 22) but running under Bun
  bypasses that gate — it works. Vite HMR ws is on :24678 and isn't proxied
  through the HTTPS origin, so expect full reloads (or `--no-tls`) not hot patches.
- `design.md` (complete game spec: factions, board, pieces, voting, resolution),
  `ui.md` (3D diorama + holo visual language, mobile UX law).

Not started: everything below ("Build plan").

## Build plan (execute in order)

1. **`shared/` deterministic sim** — pure TS, zero deps, imported by BOTH server
   (authority) and client (preview/replay). Files:
   - `hex.ts` — axial coords on hexagon board `max(|q|,|r|,|q+r|) ≤ R`; neighbors
     `(±1,0)(0,±1)(+1,−1)(−1,+1)`; `rot120(q,r)=(−q−r,q)`; index packing
     `idx=(r+R)*(2R+1)+(q+R)`.
   - `noise.ts` — copy from `G:\code\fabletest-sketch\src\engine\noise.ts` (hash32,
     mulberry32 rng, simplex, fbm, warp — proven, keep as-is).
   - `mapgen.ts` — `generateMap(seed, R)`: 3-fold symmetric terrain (compute each
     cell from its canonical wedge representative = lexicographically-smallest of 3
     rotations). Elevation 0–4 terraces (fbm + radial island falloff; water=0);
     smoothing pass kills lone spikes/pits; forests (moisture blobs, elev 1–3);
     ore nodes (top-scoring cells per wedge, spacing ≥3); capitals at 120° apart
     r≈0.6R on flattened elev-2 plateaus. **Navigability gate**: BFS from each
     capital over worker-passable cells must reach ≥85% of land, else bump sub-seed
     and regenerate (cap 20 tries). Blitz R=18, campaign R=30.
   - `types.ts` / `units.ts` — stats table from design.md; snapshot
     `{round, nextUnitId, units[], territory: Uint8Array→base64, pools[3], scores[3]}`.
     Buildings (factory/capital) are immobile units.
   - `resolve.ts` — `resolveTick(terrain, snapshot, votes, seed)` →
     `{snapshot, events, credits}`. Phase order (design.md "Rounds"): pick winning
     action per unit (max weight, tie→hold) → mine → build → **simultaneous moves**
     (same-target: higher HP wins, others bounce; swaps bounce both; iterate until
     stable) → attacks hit post-move occupant of target cell (dodges real) →
     deaths (mutual OK) → territory paint (end cells + scout path) → production
     spawns into free neighbors (pool deducted in unit-id order) → score tick.
     Every event carries winning-voter ids for attribution.
2. **Server** — Prisma models: `Game(mode, seed, mapRadius, roundNumber,
   roundEndsAt, roundSeconds, status)`, `GamePlayer(gameId, userId, faction,
   voteEnergy, energyRound — regen +5/round cap 25 computed lazily)`,
   `Round(gameId, number, snapshot Json, events Json)` unique(gameId,number),
   `Vote(gameId, round, playerId, unitId, action Json, weight, rallyId?)`
   unique(gameId,round,playerId,unitId), `Rally(shortCode, gameId, creatorId,
   slate Json, applies)`, `PlayerStat(playerId, gameId, stat, total)` upserted at
   resolve. tRPC: `join` (assign least-populated faction), `state` (round snapshot
   + endsAt; cacheable), `castVotes`, `rally.create/get/apply`, `leaderboard`,
   `warReport`. Tick loop: 1s interval, resolve due games (both concurrent wars).
   **Guest auth**: better-auth `anonymous` plugin — players drop in with zero
   friction; can link email later.
3. **Client renderer** — port from `G:\code\fabletest-sketch` (`src/render/renderer.ts`,
   `src/engine/{tileset,orient}.ts`): finite board (no chunks needed — precompute
   whole draw list, re-sort on camera quanta like fabletest), terrain cubes +
   auto-slopes + water + trees + rocks, capital castle stamps (faction color
   variants; Ember via hue-remap recipe in ui.md), territory tints, procedural
   pieces (port drawing code from `docs/art-proof.html`), selection/target/arrow
   overlays. Geometry constants in ui.md. **Orientation tables in fabletest's
   `orient.ts` are calibrated — copy verbatim, never "simplify".**
4. **Client UX** — `/play/:mode` route. Full-viewport canvas (100dvh), pan/pinch/
   double-tap/tap (pointer events), top HUD (countdown · faction scores · energy),
   **bottom sheet** unit panel per ui.md (tap piece → portrait, HP pips, live vote
   tally bars, action buttons, target-picking mode, share rally). Round flip
   animation (lerp moves, attack flashes, paint ripple). Landing page + leaderboard
   + war report. 44px targets, safe-area insets everywhere.
5. **Verify** — headless chromium (playwright cache:
   `~/AppData/Local/ms-playwright/chromium_headless_shell-*/…/chrome-headless-shell.exe
   --headless --screenshot=out.png --window-size=390,844 --virtual-time-budget=5000 <url>`)
   at mobile viewport: join → map renders → tap unit → sheet → vote → tick → piece
   moved. Starter e2e: port 3100, isolated db `social_war_games_test`.

## Locked decisions (do not re-litigate)

- Two concurrent wars: 60s-round blitz + 15min-round campaign; one account plays both.
- Voting: raw votes + **rally links** (shareable slates) — NOT proposal/endorse.
- Sim: minimal-deep (Worker/Tank/Scout/Factory/Capital, one communal ore pool per
  faction). Numbers in design.md.
- Hex topology (axial coords; 6 neighbors), rendered as true-3D hexes (Three.js).
- Art (2026-07-10): warm low-poly diorama + holographic data layer — "terrain
  never glows, data always does" (ui.md). All geometry procedural primitives;
  no asset packs, no textures. Small boards are a feature (one-screen war).
- Stack: sal-starter monolith; snapshots as CDN-cacheable JSON; no serverless.
- Terrain must be interesting AND navigable (chokepoints from water/cliffs/forests,
  but the ≥85% reachability gate is a hard invariant).
- Unit interaction = bottom sheet (user explicitly rejected floating chips).
- 100% mobile friendly — primary platform.

## Environment & gotchas

- Windows; Bun ≥1.3; Postgres 18 local (also a PG17 install exists; 5432 = PG18).
  psql not on PATH: `"/c/Program Files/PostgreSQL/18/bin/psql"`.
- **three r185 traps** (cost a debugging session): InstancedMesh does NOT
  receive shadows (casting is fine) — that's why the land is one merged mesh
  with vertex colors; PCFSoftShadowMap is deprecated (auto-downgrades to PCF
  with a warning); resizing a DirectionalLight shadow camera needs an explicit
  `shadow.camera.updateProjectionMatrix()`.
- Headless chromium uses SwiftShader (fine for screenshots); to test on the
  real GPU: `chromium.launch({ args: ['--use-gl=angle', '--use-angle=d3d11',
  '--enable-gpu'] })`.
- Dev handle `window.__war = { renderer: WarScene, latest, myFaction }`;
  `renderer.cellToScreen(q, r)` is the e2e tap contract. Fake-tally injection
  for overlay screenshots must re-inject on an interval — a React re-render
  (500ms clock tick) resets `latest.tally` from the query cache.
- Starter rules: Express 5 required; server-only code never imported from `src/`
  (except `import type`); `~/*` alias = `src/*` client-only; `shared/` is the new
  both-sides layer (pure, no deps).
- The user's password for local Postgres is in `.env` only — never commit/echo it.
- **e2e DB**: `social_war_games_test` was created with the `.env` credentials
  (NOT postgres/postgres). `playwright.config.ts` + `e2e/global-setup.ts` derive
  the test URL from `.env` at runtime; CI should set `E2E_DATABASE_URL`. After
  schema changes, push to the test DB too (DATABASE_URL override + `db push`).
- **Playwright cannot be driven by Bun** (launch pipe handshake times out on
  Windows) — run ad-hoc automation scripts with `node` (`createRequire` into the
  repo's node_modules); `bun run test:e2e` is fine (the CLI shells out to node).
- **tRPC reserves Function.prototype words** (`apply`, `call`, `bind`...) as
  procedure names — that's why the rally procedure is `rally.cast`.
- Sim symmetry traps (already encoded in shared/, don't regress): float sums
  must be order-independent (sort the 3 rotation samples before averaging);
  `rot120(0,0)` must normalize `-0`; terrace cutoffs compare by quantile VALUE.
- Tick loop self-heals: if <2 active games, `ensureActiveGames` runs (needed
  because e2e truncates the DB after the server boots).
