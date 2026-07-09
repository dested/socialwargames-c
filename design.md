# Social War Games — Design Document

*"TwitchPlaysPokemon, but tanks."* Three factions. Hundreds of players per side.
Nobody controls a unit — you vote on what each piece does, and at the end of every
round the winning action on each unit executes. Mobile-first; most players check in
from their phone a few times a day.

## The loop

1. You land, get dropped into the least-populated faction (guest auth — zero friction).
2. The map shows the war: territory paint, your faction's pieces, the front line.
3. Tap a piece → bottom sheet: its HP, what the faction is currently voting for it
   to do, and your action buttons. Casting a vote costs 1 energy.
4. Round ends (60s blitz / 15min campaign) → all votes tallied → every unit executes
   its winning action simultaneously → animated round flip.
5. Everything your winning votes caused (damage, kills, tiles, ore) is credited to
   you on the ledger. Leaderboards are the memory of the war.

Two wars run concurrently each season: **Blitz** (60s rounds, ~1 day) and
**Campaign** (15min rounds, ~2 weeks). Same account plays both.

## Factions

| | color | |
|---|---|---|
| **Verdant Compact** | green `#7fb43a` | native Kenney green tiles |
| **Dusk Covenant** | purple `#9a6fd0` | native Kenney purple tiles |
| **Ember Pact** | red `#d0603f` | hue-remap pipeline |

Three factions self-balance: the two trailing sides always share an enemy.

## The board

Hex-topology on axial coordinates `(q, r)`; neighbors `(±1,0) (0,±1) (+1,−1) (−1,+1)`.
Rendered on the fabletest-sketch isometric diamond engine (each cell one diamond).
Board is a hexagon of radius R: `max(|q|,|r|,|q+r|) ≤ R`. Blitz R=18 (~1k cells),
Campaign R=30 (~2.8k cells).

**Perfect fairness via 3-fold symmetry**: terrain is generated for one 120° wedge and
rotated twice (`rot(q,r) = (−q−r, q)`). Every faction's third of the map is identical.

**Terrain layers** (deterministic from seed, pure function — client regenerates
locally; snapshots never carry terrain):

- **Elevation** 0–4 terraces from FBM simplex + domain warp. Water = 0.
  Steps of 1 are walkable (slopes render automatically); steps of ≥2 are cliffs.
- **Navigability guarantee**: post-gen smoothing removes isolated spikes/pits, then a
  connectivity pass verifies ≥85% of land is reachable from every capital; the
  generator bumps a sub-seed and retries until it passes. Interesting ≠ maze.
- **Forests**: moisture blobs. Workers/Scouts pass through; Tanks cannot (flanking
  routes for raiders, walls for armor).
- **Mountains** (elev 4): impassable, ore-rich at their feet.
- **Ore nodes**: clustered near mountains + contested mid-map seams. Mining yield.
- **Capitals**: 3, at 120° apart, radius ≈ 0.6R, on flattened ground.

## Pieces

Communal ore pool per faction (the economy is social, like everything else).

| piece | HP | move | attack | special |
|---|---|---|---|---|
| **Worker** | 6 | 1 | — | Mine +3 ore on node · Build Factory (30 ore) |
| **Tank** | 12 | 1 | 4 (adjacent) | can't enter forest |
| **Scout** | 5 | 2 | 1 (adjacent) | passes forest · claims as it moves |
| **Factory** | 20 | — | — | Produce: Worker 10 / Scout 12 / Tank 20 ore |
| **Capital** | 40 | — | — | Factory at 25% discount · losing it is catastrophic |

**Territory**: every cell a unit ends the round on (plus the cell it fought over)
gets painted its faction. Paint persists until repainted. Score ticks each round:
+1 per 100 owned cells; capitals held ×5.

**Combat**: simultaneous. Attack declared on adjacent cell; if a target is there at
resolution, it takes damage. Units at 0 HP die at end of tick (mutual kills happen).
Damage onto a cell whose occupant moved away = miss (dodges are real and hilarious).

**Move conflicts**: two units entering the same cell → higher HP wins the cell,
other bounces (stays put); ties bounce both.

## Voting

- **Energy**: 5 per round, banked to a cap of 25. Costs 1 per vote. One vote per
  unit per player per round (spread influence, don't dump).
- **Resolution**: per unit, the action with the most weight wins; ties → Hold.
  Weight = 1 in v1 (schema carries a weight column for the influence system later).
- **Rally links** (the coordination weapon): any player composes a slate — a set of
  `unit → action` pairs — and gets a short shareable code/URL. Applying a rally casts
  your energy across its actions in one tap. The rally shows its creator and its
  applied count. This is how a faction Discord moves 80 tanks in one breath.
- **Attribution**: every executed action records its voters. Consequences (damage
  dealt, kills, tiles painted, ore mined, units built) are credited to every winning
  voter, full value each — generosity scales participation. Rally creators
  additionally bank `rally_moves` credit for every action their slate won.

## Stats & leaderboard (the memory)

Ledger events per player per round: `damage`, `kills`, `losses_caused`,
`tiles_painted`, `ore_mined`, `units_built`, `rounds_active`, `rally_moves`,
`votes_cast`. Leaderboards per war + all-time, per faction and global.
War Report: notable events feed ("Round 214 — Dusk breached the Ember bridge;
Ember lost 3 tanks"), the shareable artifact.

## Rounds — server resolution

```
every second: for each active game where roundEndsAt <= now:
  votes   = SELECT ... WHERE gameId, round
  next    = resolveTick(snapshot, terrain, votes, seed⊕round)   // pure, shared code
  INSERT Round(number+1, next.snapshot, next.events)
  UPDATE Game(roundNumber++, roundEndsAt = now + roundSeconds)
  upsert PlayerStats from next.credits
```

`resolveTick` lives in `shared/` and is imported by server (authority) and client
(optimistic previews, replays). Deterministic: same inputs → same war, forever.
Snapshots are small (units + territory bitmap + pools) — terrain is derived from
the seed on both sides.

## Mobile UX law

- Everything reachable with a thumb; touch targets ≥ 44px; safe-area insets.
- Tap unit → **bottom sheet**, never a floating tooltip: portrait, HP pips, live
  tally bars of the round's proposed actions, action buttons. Target-picking
  highlights legal hexes on the canvas.
- Round countdown always visible. Round flip is an animated moment (movement lerps,
  attack flashes, paint spread) — the dopamine of checking in.
- One-handed pan; pinch zoom; double-tap to zoom. No hover-dependent anything.

## v1 cut line

IN: everything above. OUT (later): fog of war, influence-weighted votes, navy/ships,
player hierarchy titles, push notifications, ads, seasons UI, spectator replay
scrubber (the event log already makes it possible).
