# CLIFFNOTES — Social War Games

**"TwitchPlaysPokemon, but tanks."** Three factions, hundreds of players each; nobody
owns a unit — you vote on each piece's action, rounds resolve on a timer, winning
actions execute. Mobile-first. Open source. Full game spec: **`design.md`**.
Visual language: **`ui.md`**. Art-direction proof (open in browser): **`docs/art-proof.html`**.

## Status (2026-07-09) — scaffolded, docs done, game not yet built

Done:
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
