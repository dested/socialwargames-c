// Propaganda-poster chrome primitives — the visual language for every
// non-canvas page (landing, war room, rally, auth). See ui.md "App chrome".
// The 3D diorama keeps its own palette in src/scene/palette.ts.

import type { CSSProperties, ReactNode } from 'react'

export const POSTER = {
  paper: '#eee3c6',
  paperDeep: '#e2d1a6',
  panel: '#f5ecd4',
  ink: '#28211a',
  inkSoft: '#6d5d40',
  line: '#c7b285',
  gold: '#cf9c3c',
  goldDeep: '#6b5116',
  stamp: '#a03723',
} as const

export const DISPLAY = "'Alfa Slab One', Rockwell, 'Roboto Slab', serif"
export const CONDENSED = "'Oswald Variable', Oswald, 'Arial Narrow', sans-serif"
export const TYPEWRITER = "'Special Elite', 'Courier New', monospace"

/** SVG film-grain, tiled. Layer over paper/images at low opacity. */
export const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")"

/** Full-bleed overlay: paper grain + subtle vignette. Parent must be relative. */
export function Grain({ opacity = 0.16 }: { opacity?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ backgroundImage: GRAIN_URI, opacity, mixBlendMode: 'multiply' }}
    />
  )
}

/** Radiating sunburst backdrop, period-correct. Parent must be relative. */
export function Sunburst({ at = '50% 32%', alpha = 0.05 }: { at?: string; alpha?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background: `repeating-conic-gradient(from 0deg at ${at}, rgba(40,33,26,${alpha}) 0deg 5deg, transparent 5deg 11deg)`,
      }}
    />
  )
}

export function Stars({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`tracking-[0.5em] ${className}`} style={{ color: POSTER.gold }}>
      ★★★
    </span>
  )
}

/** Rotated rubber-stamp label. */
export function Stamp({
  children,
  color = POSTER.stamp,
  rotate = -6,
  className = '',
  style,
}: {
  children: ReactNode
  color?: string
  rotate?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={`inline-block border-[3px] px-3 py-1 text-sm font-bold uppercase ${className}`}
      style={{
        fontFamily: CONDENSED,
        letterSpacing: '0.22em',
        color,
        borderColor: color,
        transform: `rotate(${rotate}deg)`,
        borderRadius: 4,
        // double-struck ink look
        boxShadow: `inset 0 0 0 1px ${POSTER.panel}, inset 0 0 0 2px ${color}`,
        opacity: 0.92,
        ...style,
      }}
    >
      {children}
    </span>
  )
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`text-xs font-semibold uppercase ${className}`}
      style={{ fontFamily: CONDENSED, letterSpacing: '0.3em', color: POSTER.goldDeep }}
    >
      {children}
    </div>
  )
}

/** Hard-edged panel with the poster shadow. */
export function Panel({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`relative ${className}`}
      style={{
        background: POSTER.panel,
        border: `3px solid ${POSTER.ink}`,
        borderRadius: 4,
        boxShadow: '6px 6px 0 rgba(40,33,26,0.85)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Shared page container for chrome pages (war room, auth, dashboard). */
export function PageShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-5xl px-5 py-8 ${className}`}>{children}</div>
}
