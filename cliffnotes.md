# CLIFFNOTES — Social War Games

**"TwitchPlaysPokemon, but tanks."** Three factions, hundreds of players each; nobody
owns a unit — you vote on each piece's action, rounds resolve on a timer, winning
actions execute. Mobile-first. Open source. Full game spec: **`design.md`**.
Visual language: **`ui.md`**. Art-direction proof (open in browser): **`docs/art-proof.html`**.

## Status (2026-07-09) — ALL 5 build steps done; the game is playable end-to-end

The core loop works and is verified: guest opens `/play/blitz` → anonymous
session + auto-join → tap a piece → bottom sheet (portrait, HP pips, live tally,
action buttons) → vote (target-picking on canvas) → 60s tick resolves → round
flip animates → ledger credits → leaderboard. Rally links work across users.
`bun run test:e2e` (5 specs) + `bun test shared` (22) + typecheck + prod build
all green. Next: playtesting/balance, paint ripple animation, client-nav
prefetch, deploy target (user deprioritized Render — wants cheap).

Readability pass (user feedback, 2026-07-09): renderer x-ray ghost pass —
after the painter walk, all units redraw at 0.4 alpha on top, so pieces behind
mountains stay visible (opaque-over-self is a no-op, only occluded pixels
change). Board-wide vote overlay: every unit's LEADING tally action renders as
a faction-colored arrow (move) / red arrow + crosshair ring (attack) / floating
chip badge (mine, build, produce) — hidden during round flips. HUD shows
"round N · m:ss" and "⚡ n/25 votes"; a dismissible first-visit hint banner
(localStorage `swg.hint`) explains the loop and auto-dismisses on first vote.

## Routes

- `/` landing (war cards) · `/war/:mode` war room (leaderboard + report)
- `/play/:mode` the war table (mode = blitz | campaign); debug camera via
  `?q=&r=&z=`; dev-only `window.__war` handle for e2e taps
- `/rally/:code` rally landing → one-tap apply → redirects into the war
- starter: `/sign-in` `/sign-up` `/dashboard` `/healthz` `/api/trpc` `/api/auth`

Done:
- **Step 3 (renderer)**: `src/game/` — `iso.ts` (fabletest geometry + calibrated
  orientation tables), `board.ts` (terrain→draw list: shores, cliffs, slope
  skirts, forests, ore glints, cast shadows), `pieces.ts` (art-proof recipes),
  `renderer.ts` (painter-order merge of board + units, territory tints,
  capital/factory tiles with Ember runtime hue-remap, HP pips, overlays,
  screen↔cell math). Verified via headless mobile screenshots.
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
- `design.md` (complete game spec: factions, board, pieces, voting, resolution),
  `ui.md` (palette, procedural piece recipes, mobile UX law), art proof preserved.
- Kenney tile assets copied to `public/tiles/{town,exp,desert}` (828 PNGs) from
  fabletest-sketch.

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
- Hex topology on the iso diamond renderer (axial coords; 6 neighbors).
- Art: Kenney Sketch world + procedural pieces (docs/art-proof.html). No new asset
  packs; faction 3 = hue-remap.
- Stack: sal-starter monolith; snapshots as CDN-cacheable JSON; no serverless.
- Terrain must be interesting AND navigable (chokepoints from water/cliffs/forests,
  but the ≥85% reachability gate is a hard invariant).
- Unit interaction = bottom sheet (user explicitly rejected floating chips).
- 100% mobile friendly — primary platform.

## Environment & gotchas

- Windows; Bun ≥1.3; Postgres 18 local (also a PG17 install exists; 5432 = PG18).
  psql not on PATH: `"/c/Program Files/PostgreSQL/18/bin/psql"`.
- fabletest-sketch repo (`G:\code\fabletest-sketch`) is the engine donor — its
  `CLIFFNOTES.md` documents tile geometry, walkability, painter order, and the
  hard-won orientation tables. Read it before porting renderer code.
- Kenney site search is JS-only; per-pack sample sheets live at
  `kenney.nl/media/pages/assets/<slug>/<hash>/sample.png` (grep the asset page HTML).
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
