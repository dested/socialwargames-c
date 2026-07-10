// /war/:mode — the war room: faction scores, the attribution leaderboard, and
// the war report (deaths and capital falls, round by round).

import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTRPC } from '~/lib/trpc'
import { FACTIONS, FACTION_NAMES, UI } from '~/scene/palette'

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
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: UI.accent }}>
            War room
          </div>
          <h1 className="text-3xl font-bold" style={{ color: UI.ink }}>
            {mode === 'blitz' ? 'Blitz War' : 'Campaign War'}
            {state ? ` · round ${state.game.roundNumber}` : ''}
          </h1>
        </div>
        <Link
          to={`/play/${mode}`}
          className="rounded-xl px-5 py-3 text-sm font-bold"
          style={{ background: UI.accent, color: UI.accentInk, minHeight: 44 }}
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
              style={{
                background: UI.bgRaise,
                border: `1px solid ${UI.panelBorder}`,
                color: UI.ink,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: FACTIONS[f].glow, boxShadow: `0 0 6px ${FACTIONS[f].glow}` }}
              />
              {FACTION_NAMES[f]} — {s}
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-bold" style={{ color: UI.ink }}>
          Leaderboard
        </h2>
        <div
          className="overflow-x-auto rounded-2xl"
          style={{ background: UI.bgRaise, border: `1px solid ${UI.panelBorder}` }}
        >
          <table className="w-full text-sm" style={{ color: UI.ink }}>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider" style={{ color: UI.inkSoft }}>
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
                <tr key={p.playerId} style={{ borderTop: `1px solid ${UI.panelBorder}` }}>
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
                  <td className="px-4 py-4 text-sm" colSpan={7} style={{ color: UI.inkSoft }}>
                    No deeds recorded yet. Be the first on the ledger.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 pb-8">
        <h2 className="text-xl font-bold" style={{ color: UI.ink }}>
          War report
        </h2>
        <div className="space-y-2">
          {(reportQuery.data ?? []).map((r) => (
            <div
              key={r.round}
              className="rounded-xl px-4 py-3 text-sm"
              style={{ background: UI.bgRaise, border: `1px solid ${UI.panelBorder}` }}
            >
              <span className="font-bold" style={{ color: UI.ink, fontVariantNumeric: 'tabular-nums' }}>
                Round {r.round}
              </span>{' '}
              <span style={{ color: UI.inkSoft }}>
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
            <p className="text-sm" style={{ color: UI.inkSoft }}>
              No blood spilled yet. The quiet before the war.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
