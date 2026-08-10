// App chrome — propaganda-poster masthead (slogan ticker, slab brand, stamped
// nav) and manifesto footer. Pages own their containers; /play escapes via
// fixed positioning and paints over all of this.

import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useRevalidator,
  useRouteLoaderData,
} from 'react-router-dom'
import { authClient } from '~/lib/auth-client'
import { CONDENSED, DISPLAY, POSTER } from './poster'
import type { RootLoaderData } from './routes'

const SLOGANS = [
  'THREE FACTIONS',
  'ONE BOARD',
  'NOBODY OWNS A UNIT',
  'YOUR VOTE IS AMMUNITION',
  'ROUNDS RESOLVE ON THE TIMER',
  'THE LEDGER REMEMBERS',
  'NO SIGN-UP — WALK IN',
]

function TickerBar() {
  const run = SLOGANS.map((s) => `${s}  ★  `).join('')
  return (
    <div className="ticker" style={{ background: POSTER.ink, color: POSTER.paper }} aria-hidden>
      <div
        className="ticker-track py-1 text-[11px] font-semibold"
        style={{ fontFamily: CONDENSED, letterSpacing: '0.28em' }}
      >
        <span>{run}</span>
        <span>{run}</span>
      </div>
    </div>
  )
}

export function Layout() {
  const data = useRouteLoaderData('root') as RootLoaderData | undefined
  const session = data?.session ?? null
  const navigate = useNavigate()
  const revalidator = useRevalidator()

  async function signOut() {
    await authClient.signOut()
    // Land on home first, then re-run loaders so the cleared session is
    // reflected (mirrors the revalidate in the sign-in/up flows).
    navigate('/', { replace: true })
    revalidator.revalidate()
  }

  return (
    <>
      <TickerBar />
      <header style={{ background: POSTER.paper, borderBottom: `3px solid ${POSTER.ink}` }}>
        <nav className="mx-auto flex max-w-5xl items-center gap-5 px-5 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-lg leading-none"
            style={{ fontFamily: DISPLAY, color: POSTER.ink }}
          >
            <span aria-hidden style={{ color: POSTER.stamp }}>
              ★
            </span>
            Social War Games
          </Link>
          {session && (
            <NavLink
              to="/dashboard"
              className="text-sm"
              style={({ isActive }) => ({
                fontFamily: CONDENSED,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: isActive ? POSTER.ink : POSTER.inkSoft,
              })}
            >
              Dashboard
            </NavLink>
          )}
          <div
            className="ml-auto flex items-center gap-4 text-sm"
            style={{ fontFamily: CONDENSED, letterSpacing: '0.1em' }}
          >
            {session ? (
              <>
                <span className="hidden sm:inline" style={{ color: POSTER.inkSoft }}>
                  {session.user.isAnonymous ? 'guest conscript' : session.user.email}
                </span>
                <button
                  type="button"
                  className="hover:underline"
                  style={{ color: POSTER.ink }}
                  onClick={signOut}
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/sign-in" className="hover:underline" style={{ color: POSTER.ink }}>
                  Sign in
                </Link>
                <Link to="/sign-up" className="hover:underline" style={{ color: POSTER.ink }}>
                  Sign up
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <footer style={{ background: POSTER.ink, color: POSTER.paper }}>
        <div className="mx-auto max-w-5xl px-5 py-10 text-center">
          <div aria-hidden className="tracking-[0.5em]" style={{ color: POSTER.gold }}>
            ★★★
          </div>
          <p className="mt-3 text-xl" style={{ fontFamily: DISPLAY }}>
            No unit is owned. Every order is a ballot.
            <br />
            The ledger remembers.
          </p>
          <p
            className="mt-4 text-xs uppercase"
            style={{ fontFamily: CONDENSED, letterSpacing: '0.25em', color: '#b3a37f' }}
          >
            Social War Games · open source · mobile-first · conscription is instant
          </p>
        </div>
      </footer>
    </>
  )
}
