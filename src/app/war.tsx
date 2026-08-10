// /war/:mode — the war room: faction scores, the attribution leaderboard
// ("roll of honor"), and the war report (dispatches, round by round).
// Propaganda-poster chrome per ui.md; primitives in ./poster.tsx.

import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTRPC } from '~/lib/trpc'
import { FACTION_BASE, FACTION_NAMES } from '~/scene/palette'
import { CONDENSED, DISPLAY, Eyebrow, Grain, POSTER, PageShell, Panel, Stars, TYPEWRITER } from './poster'

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
    <div className="relative" style={{ background: POSTER.paper }}>
      <Grain opacity={0.1} />
      <PageShell className="relative space-y-10">
        <section className="flex flex-wrap items-end justify-between gap-4 pt-2">
          <div>
            <Eyebrow>War room</Eyebrow>
            <h1 className="mt-1 text-4xl" style={{ fontFamily: DISPLAY, color: POSTER.ink }}>
              {mode === 'blitz' ? 'Blitz War' : 'Campaign War'}
              {state ? ` · round ${state.game.roundNumber}` : ''}
            </h1>
          </div>
          <Link to={`/play/${mode}`} className="poster-btn poster-btn--gold">
            To the front
          </Link>
        </section>

        {state && (
          <section className="flex flex-wrap gap-3">
            {state.snapshot.scores.map((s, f) => (
              <div
                key={f}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold"
                style={{
                  background: POSTER.panel,
                  border: `3px solid ${POSTER.ink}`,
                  borderRadius: 3,
                  boxShadow: '3px 3px 0 rgba(40,33,26,0.85)',
                  color: POSTER.ink,
                  fontFamily: CONDENSED,
                  letterSpacing: '0.08em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span
                  className="inline-block h-3 w-3"
                  style={{ background: FACTION_BASE[f], border: `2px solid ${POSTER.ink}` }}
                />
                {FACTION_NAMES[f]} — {s}
              </div>
            ))}
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl" style={{ fontFamily: DISPLAY, color: POSTER.ink }}>
              Roll of honor
            </h2>
            <Stars className="text-xs" />
          </div>
          <Panel className="overflow-x-auto">
            <table className="w-full text-sm" style={{ color: POSTER.ink }}>
              <thead>
                <tr
                  className="text-left text-xs uppercase"
                  style={{
                    fontFamily: CONDENSED,
                    letterSpacing: '0.15em',
                    color: POSTER.paper,
                    background: POSTER.ink,
                  }}
                >
                  <th className="px-4 py-3 font-semibold">Player</th>
                  {STAT_COLUMNS.map(([k, label]) => (
                    <th key={k} className="px-3 py-3 text-right font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: 'tabular-nums', fontFamily: TYPEWRITER }}>
                {(leaderboardQuery.data ?? []).map((p, i) => (
                  <tr key={p.playerId} style={{ borderTop: `1px solid ${POSTER.line}` }}>
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
                    <td className="px-4 py-4 text-sm" colSpan={7} style={{ color: POSTER.inkSoft }}>
                      No deeds recorded yet. Be the first on the ledger.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </section>

        <section className="space-y-4 pb-8">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl" style={{ fontFamily: DISPLAY, color: POSTER.ink }}>
              Dispatches
            </h2>
            <Stars className="text-xs" />
          </div>
          <div className="space-y-3">
            {(reportQuery.data ?? []).map((r) => (
              <div
                key={r.round}
                className="px-4 py-3 text-sm"
                style={{
                  background: POSTER.panel,
                  border: `2px solid ${POSTER.ink}`,
                  borderRadius: 3,
                  boxShadow: '3px 3px 0 rgba(40,33,26,0.6)',
                  fontFamily: TYPEWRITER,
                }}
              >
                <span style={{ color: POSTER.stamp, fontVariantNumeric: 'tabular-nums' }}>
                  ROUND {r.round} —
                </span>{' '}
                <span style={{ color: POSTER.ink }}>
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
              <p className="text-sm" style={{ fontFamily: TYPEWRITER, color: POSTER.inkSoft }}>
                No blood spilled yet. The quiet before the war.
              </p>
            )}
          </div>
        </section>
      </PageShell>
    </div>
  )
}
