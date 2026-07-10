// Landing page — dark command-console chrome: glass cards over the void,
// faction glow accents, command-gold CTAs.

import { Link } from 'react-router-dom'
import { FACTIONS, FACTION_NAMES, UI } from '~/scene/palette'

const wars = [
  {
    mode: 'blitz',
    title: 'Blitz War',
    cadence: '45-second rounds · a war a day',
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
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: UI.accent }}>
          TwitchPlaysPokemon, but tanks
        </div>
        <h1 className="text-4xl font-bold tracking-tight" style={{ color: UI.ink }}>
          Social War Games
        </h1>
        <p className="max-w-xl" style={{ color: UI.inkSoft }}>
          Three factions. Hundreds of players a side. Nobody owns a unit — you vote on what every
          piece does, rounds resolve on a timer, and the ledger remembers exactly what your votes
          destroyed. Drop in as a guest; no signup.
        </p>
        <div className="flex items-center gap-2 pt-1">
          {FACTION_NAMES.map((n, f) => (
            <span
              key={n}
              className="rounded-full px-3 py-1 text-xs font-bold"
              style={{
                color: FACTIONS[f].glow,
                border: `1px solid ${FACTIONS[f].glow}`,
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              {n}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {wars.map((w) => (
          <div
            key={w.mode}
            className="rounded-2xl p-6"
            style={{ background: UI.bgRaise, border: `1px solid ${UI.panelBorder}` }}
          >
            <h2 className="text-2xl font-bold" style={{ color: UI.ink }}>
              {w.title}
            </h2>
            <div className="mt-1 text-xs font-bold uppercase tracking-wider" style={{ color: UI.accent }}>
              {w.cadence}
            </div>
            <p className="mt-3 text-sm" style={{ color: UI.inkSoft }}>
              {w.blurb}
            </p>
            <div className="mt-5 flex gap-3">
              <Link
                to={`/play/${w.mode}`}
                className="rounded-xl px-5 py-3 text-sm font-bold"
                style={{ background: UI.accent, color: UI.accentInk, minHeight: 44 }}
              >
                Join the war
              </Link>
              <Link
                to={`/war/${w.mode}`}
                className="rounded-xl px-5 py-3 text-sm font-bold"
                style={{ color: UI.ink, border: `1px solid ${UI.panelBorder}`, minHeight: 44 }}
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
