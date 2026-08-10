// Landing page — the recruitment poster. Sunburst hero, live front reports,
// AI-painted faction posters (public/posters/*), field doctrine. Theme
// primitives live in ./poster.tsx; see ui.md "App chrome".

import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTRPC } from '~/lib/trpc'
import { FACTION_BASE, FACTION_NAMES } from '~/scene/palette'
import { CONDENSED, DISPLAY, Eyebrow, Grain, POSTER, Panel, Stamp, Stars, Sunburst, TYPEWRITER } from './poster'

type Mode = 'blitz' | 'campaign'

const WARS: { mode: Mode; title: string; cadence: string; blurb: string }[] = [
  {
    mode: 'blitz',
    title: 'Blitz War',
    cadence: '45-second rounds · a war a day',
    blurb: 'Fast fronts, instant dopamine. Check in, swing a battle, tell your friends.',
  },
  {
    mode: 'campaign',
    title: 'Campaign War',
    cadence: '15-minute rounds · the long grind',
    blurb: 'Vote from the bus, rally your faction at dinner, wake up to a new front line.',
  },
]

function useNowSecond() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function fmtClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Tricolor front-line bar: territory scores as proportional segments. */
function FrontLine({ scores }: { scores: number[] }) {
  const total = scores.reduce((a, b) => a + b, 0) || 1
  return (
    <div>
      <div
        className="flex h-4 w-full overflow-hidden"
        style={{ border: `2px solid ${POSTER.ink}`, borderRadius: 2 }}
      >
        {scores.map((s, f) => (
          <div
            key={f}
            style={{ width: `${Math.max(2, (s / total) * 100)}%`, background: FACTION_BASE[f] }}
          />
        ))}
      </div>
      <div
        className="mt-1.5 flex justify-between text-[11px] font-semibold uppercase"
        style={{ fontFamily: CONDENSED, letterSpacing: '0.08em', color: POSTER.inkSoft, fontVariantNumeric: 'tabular-nums' }}
      >
        {scores.map((s, f) => (
          <span key={f}>
            <span aria-hidden style={{ color: FACTION_BASE[f] }}>
              ■
            </span>{' '}
            {FACTION_NAMES[f].split(' ')[0]} {s}
          </span>
        ))}
      </div>
    </div>
  )
}

function WarCard({ mode, title, cadence, blurb, delay }: (typeof WARS)[number] & { delay: number }) {
  const trpc = useTRPC()
  const now = useNowSecond()
  const stateQuery = useQuery(trpc.game.state.queryOptions({ mode }, { refetchInterval: 15000 }))
  const state = stateQuery.data
  const secondsLeft = state
    ? Math.max(0, Math.round((Date.parse(state.game.roundEndsAt) - now) / 1000))
    : null

  return (
    <Panel className="rise p-6" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl" style={{ fontFamily: DISPLAY, color: POSTER.ink }}>
            {title}
          </h2>
          <div
            className="mt-1 text-xs font-semibold uppercase"
            style={{ fontFamily: CONDENSED, letterSpacing: '0.2em', color: POSTER.goldDeep }}
          >
            {cadence}
          </div>
        </div>
        <span
          className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase"
          style={{ fontFamily: CONDENSED, letterSpacing: '0.18em', color: POSTER.stamp }}
        >
          <span className="blink-dot inline-block h-2 w-2 rounded-full" style={{ background: POSTER.stamp }} />
          Live
        </span>
      </div>

      <div
        className="mt-4 text-sm"
        style={{ fontFamily: TYPEWRITER, color: POSTER.ink, fontVariantNumeric: 'tabular-nums' }}
      >
        {state && secondsLeft !== null
          ? `ROUND ${state.game.roundNumber} — NEXT RESOLUTION IN ${fmtClock(secondsLeft)}`
          : 'ESTABLISHING FIELD TELEGRAPH…'}
      </div>

      {state && (
        <div className="mt-3">
          <FrontLine scores={[...state.snapshot.scores]} />
        </div>
      )}

      <p className="mt-4 text-sm leading-relaxed" style={{ color: POSTER.inkSoft }}>
        {blurb}
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link to={`/play/${mode}`} className="poster-btn poster-btn--gold">
          Join the war
        </Link>
        <Link to={`/war/${mode}`} className="poster-btn">
          War room
        </Link>
      </div>
    </Panel>
  )
}

const FACTION_POSTERS = [
  {
    img: '/posters/verdant.webp',
    name: 'Verdant Compact',
    color: FACTION_BASE[0],
    line: 'The fields feed the war. The Compact provides — and takes.',
    tilt: 'poster-tilt-l',
  },
  {
    img: '/posters/dusk.webp',
    name: 'Dusk Covenant',
    color: FACTION_BASE[1],
    line: 'They move at night and vote in silence. The moon counts ballots.',
    tilt: 'poster-tilt-0',
  },
  {
    img: '/posters/ember.webp',
    name: 'Ember Pact',
    color: FACTION_BASE[2],
    line: 'Steel is a promise. The forges never sleep.',
    tilt: 'poster-tilt-r',
  },
]

const DOCTRINE = [
  {
    n: '01',
    title: 'Vote',
    body: 'Every piece on the board belongs to everyone. Tap a unit, propose its next order, spend a point of energy.',
  },
  {
    n: '02',
    title: 'Resolve',
    body: 'The timer fires. Each unit executes its winning order — hundreds of ballots become one simultaneous turn.',
  },
  {
    n: '03',
    title: 'Remember',
    body: 'Every kill, tile, and ore is credited to the voters who ordered it. The ledger is public and permanent.',
  },
]

export function HomePage() {
  return (
    <div style={{ background: POSTER.paper }}>
      {/* ————— HERO ————— */}
      <section className="relative overflow-hidden">
        <Sunburst at="50% 20%" alpha={0.06} />
        <Grain opacity={0.12} />
        <div className="relative mx-auto max-w-5xl px-5 pb-14 pt-10 text-center">
          <div className="rise" style={{ animationDelay: '0ms' }}>
            <Stamp rotate={-7} className="text-base">
              ★ Enlist today ★
            </Stamp>
          </div>
          <h1
            className="rise mx-auto mt-6 leading-[0.92]"
            style={{
              animationDelay: '80ms',
              fontFamily: DISPLAY,
              color: POSTER.ink,
              fontSize: 'clamp(3.2rem, 13vw, 7.5rem)',
              textShadow: `4px 4px 0 ${POSTER.gold}`,
            }}
          >
            Social
            <br />
            War Games
          </h1>
          <p
            className="rise mx-auto mt-6 max-w-xl text-sm leading-relaxed sm:text-base"
            style={{ animationDelay: '160ms', fontFamily: TYPEWRITER, color: POSTER.ink }}
          >
            “TwitchPlaysPokemon, but tanks.” Three factions. Hundreds of players a side. Nobody
            owns a unit — you vote on what every piece does, and the timer turns the mob into an
            army.
          </p>
          <div
            className="rise mt-8 flex flex-wrap items-center justify-center gap-4"
            style={{ animationDelay: '240ms' }}
          >
            <Link to="/play/blitz" className="poster-btn poster-btn--gold px-8 text-base">
              Answer the call
            </Link>
            <Link to="/war/blitz" className="poster-btn">
              Inspect the front
            </Link>
          </div>
          <p
            className="rise mt-4 text-xs uppercase"
            style={{
              animationDelay: '300ms',
              fontFamily: CONDENSED,
              letterSpacing: '0.25em',
              color: POSTER.inkSoft,
            }}
          >
            No sign-up · conscription is instant
          </p>

          <div className="rise relative mx-auto mt-10 max-w-3xl" style={{ animationDelay: '380ms' }}>
            <div
              className="relative overflow-hidden"
              style={{
                border: `3px solid ${POSTER.ink}`,
                borderRadius: 4,
                boxShadow: '8px 8px 0 rgba(40,33,26,0.85)',
                transform: 'rotate(-0.6deg)',
              }}
            >
              <img
                src="/posters/hero.webp"
                alt="Three toy armies — green, violet, and ember — converge on a hexagonal island battlefield"
                className="block w-full"
                width={1536}
                height={1024}
              />
              <Grain opacity={0.18} />
            </div>
            <div
              className="absolute -right-2 -top-5 sm:-right-5"
              style={{ transform: 'rotate(7deg)' }}
            >
              <Stamp
                color={POSTER.goldDeep}
                rotate={0}
                className="text-xs"
                style={{ background: POSTER.panel }}
              >
                The front · today
              </Stamp>
            </div>
          </div>
        </div>
      </section>

      {/* ————— ACTIVE FRONTS ————— */}
      <section id="fronts" className="relative" style={{ background: POSTER.paperDeep }}>
        <Grain opacity={0.1} />
        <div className="relative mx-auto max-w-5xl px-5 py-14">
          <div className="text-center">
            <Eyebrow>Field report</Eyebrow>
            <h2 className="mt-2 text-4xl" style={{ fontFamily: DISPLAY, color: POSTER.ink }}>
              Active fronts
            </h2>
            <div className="mt-2">
              <Stars />
            </div>
          </div>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            {WARS.map((w, i) => (
              <WarCard key={w.mode} {...w} delay={i * 120} />
            ))}
          </div>
        </div>
      </section>

      {/* ————— FACTIONS ————— */}
      <section className="relative overflow-hidden">
        <Sunburst at="50% 110%" alpha={0.04} />
        <Grain opacity={0.12} />
        <div className="relative mx-auto max-w-5xl px-5 py-14">
          <div className="text-center">
            <Eyebrow>Know your banners</Eyebrow>
            <h2 className="mt-2 text-4xl" style={{ fontFamily: DISPLAY, color: POSTER.ink }}>
              Three factions
            </h2>
            <p
              className="mx-auto mt-3 max-w-md text-sm"
              style={{ fontFamily: TYPEWRITER, color: POSTER.inkSoft }}
            >
              You don't pick a side. The War Office posts you to the thinnest front — loyalty
              follows.
            </p>
          </div>
          <div className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-5">
            {FACTION_POSTERS.map((f, i) => (
              <Link
                key={f.name}
                to="/play/blitz"
                className={`${f.tilt} rise group block`}
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <div
                  className="relative overflow-hidden"
                  style={{
                    border: `3px solid ${POSTER.ink}`,
                    borderRadius: 4,
                    boxShadow: '6px 6px 0 rgba(40,33,26,0.85)',
                  }}
                >
                  <img
                    src={f.img}
                    alt={`${f.name} recruitment poster`}
                    className="block aspect-[2/3] w-full object-cover"
                    width={1024}
                    height={1536}
                    loading="lazy"
                  />
                  <Grain opacity={0.15} />
                  <div
                    className="absolute inset-x-0 bottom-0 px-3 py-2 text-center text-sm font-bold uppercase text-white"
                    style={{
                      fontFamily: CONDENSED,
                      letterSpacing: '0.22em',
                      background: f.color,
                      borderTop: `3px solid ${POSTER.ink}`,
                    }}
                  >
                    {f.name}
                  </div>
                </div>
                <p
                  className="mt-3 px-1 text-center text-xs leading-relaxed"
                  style={{ fontFamily: TYPEWRITER, color: POSTER.inkSoft }}
                >
                  {f.line}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ————— DOCTRINE ————— */}
      <section className="relative" style={{ background: POSTER.ink, color: POSTER.paper }}>
        <div className="relative mx-auto max-w-5xl px-5 py-14">
          <div className="text-center">
            <div
              className="text-xs font-semibold uppercase"
              style={{ fontFamily: CONDENSED, letterSpacing: '0.3em', color: POSTER.gold }}
            >
              Field doctrine
            </div>
            <h2 className="mt-2 text-4xl" style={{ fontFamily: DISPLAY }}>
              How a mob moves steel
            </h2>
          </div>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {DOCTRINE.map((d) => (
              <div key={d.n} className="text-center sm:text-left">
                <div
                  className="text-5xl"
                  style={{ fontFamily: DISPLAY, color: POSTER.gold, opacity: 0.9 }}
                >
                  {d.n}
                </div>
                <h3
                  className="mt-2 text-lg font-bold uppercase"
                  style={{ fontFamily: CONDENSED, letterSpacing: '0.2em' }}
                >
                  {d.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: '#cfc3a2' }}>
                  {d.body}
                </p>
              </div>
            ))}
          </div>
          <p
            className="mt-10 text-center text-xs"
            style={{ fontFamily: TYPEWRITER, color: '#b3a37f' }}
          >
            P.S. — Rally links let you publish a whole battle plan. Comrades apply it in one tap.
          </p>
        </div>
      </section>
    </div>
  )
}
