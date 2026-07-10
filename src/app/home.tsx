// Landing page — war-table chrome per ui.md: paper background, slab-serif
// display, gold eyebrows, panel cards.

import { Link } from 'react-router-dom'
import { FACTION_BASE, FACTION_NAMES, GOLD_LINE, INK, INK_SOFT, LINE, PANEL } from '~/game/palette'

const SLAB = "Rockwell, 'Roboto Slab', serif"

const wars = [
  {
    mode: 'blitz',
    title: 'Blitz War',
    cadence: '60-second rounds · a war a day',
    blurb: 'Fast fronts, instant dopamine. Check in, swing a battle, tell your friends.',
  },
  {
    mode: 'campaign',
    title: 'Campaign War',
    cadence: '15-minute rounds · two-week grind',
    blurb: 'The long game. Vote from the bus, rally your faction at dinner, wake up to a new front line.',
  },
]

export function HomePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3 pt-4">
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD_LINE }}>
          TwitchPlaysPokemon, but tanks
        </div>
        <h1 className="text-4xl font-bold tracking-tight" style={{ fontFamily: SLAB, color: INK }}>
          Social War Games
        </h1>
        <p className="max-w-xl" style={{ color: INK_SOFT }}>
          Three factions. Hundreds of players a side. Nobody owns a unit — you vote on what every
          piece does, rounds resolve on a timer, and the ledger remembers exactly what your votes
          destroyed. Drop in as a guest; no signup.
        </p>
        <div className="flex items-center gap-2 pt-1">
          {FACTION_NAMES.map((n, f) => (
            <span
              key={n}
              className="rounded-full px-3 py-1 text-xs font-bold text-white"
              style={{ background: FACTION_BASE[f] }}
            >
              {n}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {wars.map((w) => (
          <div key={w.mode} className="rounded-2xl p-6" style={{ background: PANEL, border: `2px solid ${LINE}` }}>
            <h2 className="text-2xl font-bold" style={{ fontFamily: SLAB, color: INK }}>
              {w.title}
            </h2>
            <div className="mt-1 text-xs font-bold uppercase tracking-wider" style={{ color: GOLD_LINE }}>
              {w.cadence}
            </div>
            <p className="mt-3 text-sm" style={{ color: INK_SOFT }}>
              {w.blurb}
            </p>
            <div className="mt-5 flex gap-3">
              <Link
                to={`/play/${w.mode}`}
                className="rounded-xl px-5 py-3 text-sm font-bold"
                style={{ background: '#cf9c3c', color: '#3d2f0c', border: `2px solid ${GOLD_LINE}`, minHeight: 44 }}
              >
                Join the war
              </Link>
              <Link
                to={`/war/${w.mode}`}
                className="rounded-xl px-5 py-3 text-sm font-bold"
                style={{ color: INK, border: `2px solid ${LINE}`, minHeight: 44 }}
              >
                War room
              </Link>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
