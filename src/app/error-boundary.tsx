import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { CONDENSED, DISPLAY, Grain, POSTER, Stamp, Sunburst, TYPEWRITER } from './poster'

// Root route ErrorBoundary. React Router renders this in place of the layout
// when a loader/render throws OR when no route matches (a 404). It carries its
// own slim header so the page still looks intentional. The matching HTTP status
// is set server-side from `routerContext.statusCode` (see entry-server.tsx).
export function RouteErrorBoundary() {
  const error = useRouteError()
  const isNotFound = isRouteErrorResponse(error) && error.status === 404

  const title = isNotFound ? '404' : 'Something went wrong'
  const message = isNotFound
    ? "This page doesn't exist."
    : isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`
      : error instanceof Error
        ? error.message
        : 'An unexpected error occurred.'

  return (
    <div className="min-h-dvh" style={{ background: POSTER.paper }}>
      <header style={{ background: POSTER.paper, borderBottom: `3px solid ${POSTER.ink}` }}>
        <nav className="mx-auto flex max-w-5xl items-center px-5 py-3">
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
        </nav>
      </header>
      <main className="relative overflow-hidden">
        <Sunburst at="50% 10%" alpha={0.05} />
        <Grain opacity={0.12} />
        <div className="relative mx-auto flex max-w-5xl flex-col items-start gap-4 px-5 py-16">
          <Stamp rotate={-5}>Missing in action</Stamp>
          <h1
            className="text-7xl"
            style={{ fontFamily: DISPLAY, color: POSTER.ink, textShadow: `3px 3px 0 ${POSTER.gold}` }}
          >
            {title}
          </h1>
          <p style={{ fontFamily: TYPEWRITER, color: POSTER.inkSoft }}>{message}</p>
          {import.meta.env.DEV && error instanceof Error && error.stack && (
            <pre
              className="max-w-full overflow-auto p-4 text-xs"
              style={{
                background: POSTER.panel,
                border: `2px solid ${POSTER.line}`,
                borderRadius: 3,
                color: POSTER.inkSoft,
              }}
            >
              {error.stack}
            </pre>
          )}
          <Link to="/" className="poster-btn poster-btn--gold">
            Back to the front
          </Link>
          <p
            className="mt-2 text-xs uppercase"
            style={{ fontFamily: CONDENSED, letterSpacing: '0.25em', color: POSTER.inkSoft }}
          >
            The war office regrets the confusion
          </p>
        </div>
      </main>
    </div>
  )
}
