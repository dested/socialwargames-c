// /war/:mode — the war room: faction scores, the attribution leaderboard, and
// the war report (deaths and capital falls, round by round).

import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTRPC } from '~/lib/trpc'
import { FACTION_BASE, FACTION_NAMES, GOLD_LINE, INK, INK_SOFT, LINE, PANEL } from '~/game/palette'

const SLAB = "Rockwell, 'Roboto Slab', serif"
const STAT_COLUMNS = [
  ['kills', 'Kills'],
  ['damage', 'Damage'],
  ['tiles_painted', 'Tiles'],
  ['ore_mined', 'Ore'],
  ['units_built', 'Built'],
  ['rally_moves', 'Rallied'],
] as const

export function WarPage() {
  const { mode = 'blitz' } = useParams()
  const trpc = useTRPC()
  const stateQuery = useQuery(trpc.game.state.queryOptions({ mode: mode as 'blitz' | 'campaign' }))
  const gameId = stateQuery.data?.game.id
  const leaderboardQuery = useQuery(
    trpc.game.leaderboard.queryOptions({ gameId: gameId ?? '' }, { enabled: !!gameId }),
  )
  const reportQuery = useQuery(
    trpc.game.warReport.queryOptions({ gameId: gameId ?? '' }, { enabled: !!gameId }),
  )
  const state = stateQuery.data

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD_LINE }}>
            War room
          </div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: SLAB, color: INK }}>
            {mode === 'blitz' ? 'Blitz War' : 'Campaign War'}
            {state ? ` · round ${state.game.roundNumber}` : ''}
          </h1>
        </div>
        <Link
          to={`/play/${mode}`}
          className="rounded-xl px-5 py-3 text-sm font-bold"
          style={{ background: '#cf9c3c', color: '#3d2f0c', border: `2px solid ${GOLD_LINE}`, minHeight: 44 }}
        >
          To the front
        </Link>
      </section>

      {state && (
        <section className="flex flex-wrap gap-3">
          {state.snapshot.scores.map((s, f) => (
            <div
              key={f}
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold"
              style={{ background: PANEL, border: `2px solid ${LINE}`, color: INK, fontVariantNumeric: 'tabular-nums' }}
            >
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: FACTION_BASE[f] }} />
              {FACTION_NAMES[f]} — {s}
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-bold" style={{ fontFamily: SLAB, color: INK }}>
          Leaderboard
        </h2>
        <div className="overflow-x-auto rounded-2xl" style={{ background: PANEL, border: `2px solid ${LINE}` }}>
          <table className="w-full text-sm" style={{ color: INK }}>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider" style={{ color: INK_SOFT }}>
                <th className="px-4 py-3">Player</th>
                {STAT_COLUMNS.map(([k, label]) => (
                  <th key={k} className="px-3 py-3 text-right">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
              {(leaderboardQuery.data ?? []).map((p, i) => (
                <tr key={p.playerId} style={{ borderTop: `1px solid ${LINE}` }}>
                  <td className="px-4 py-2 font-semibold">
                    {i + 1}. {p.name}
                  </td>
                  {STAT_COLUMNS.map(([k]) => (
                    <td key={k} className="px-3 py-2 text-right">
                      {p.stats[k] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
              {leaderboardQuery.data?.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-sm" colSpan={7} style={{ color: INK_SOFT }}>
                    No deeds recorded yet. Be the first on the ledger.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 pb-8">
        <h2 className="text-xl font-bold" style={{ fontFamily: SLAB, color: INK }}>
          War report
        </h2>
        <div className="space-y-2">
          {(reportQuery.data ?? []).map((r) => (
            <div key={r.round} className="rounded-xl px-4 py-3 text-sm" style={{ background: PANEL, border: `2px solid ${LINE}` }}>
              <span className="font-bold" style={{ color: INK, fontVariantNumeric: 'tabular-nums' }}>
                Round {r.round}
              </span>{' '}
              <span style={{ color: INK_SOFT }}>
                {r.deaths
                  .map(
                    (d) =>
                      `${FACTION_NAMES[d.faction].split(' ')[0]} lost a ${d.unitType}${d.unitType === 'capital' ? ' — THE CAPITAL FELL' : ''}`,
                  )
                  .join(' · ')}
              </span>
            </div>
          ))}
          {reportQuery.data?.length === 0 && (
            <p className="text-sm" style={{ color: INK_SOFT }}>
              No blood spilled yet. The quiet before the war.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
