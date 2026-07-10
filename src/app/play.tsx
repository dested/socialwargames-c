// /play/:mode — the war table. Full-viewport canvas (100dvh), one-finger pan,
// pinch/double-tap zoom, tap to select → bottom sheet → vote. Round flips
// animate (movement lerps, attack flashes); prefers-reduced-motion snaps.

import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DIRS, hexDist, idx, inBoard } from '../../shared/hex'
import { generateMap } from '../../shared/mapgen'
import type { Action, Cell, SimEvent, Snapshot, Unit } from '../../shared/types'
import { base64ToBytes } from '../../shared/types'
import { UNIT_STATS, canStand, canTraverse, findPath } from '../../shared/units'
import { authClient } from '~/lib/auth-client'
import { useTRPC } from '~/lib/trpc'
import { WarRenderer, type RenderView } from '~/game/renderer'
import { FACTIONS, FACTION_BASE, FACTION_NAMES } from '~/game/palette'
import { UnitSheet } from './unit-sheet'

type Mode = 'blitz' | 'campaign'
type TargetKind = 'move' | 'attack' | 'build'

const FLIP_MS = 550

export function PlayPage() {
  const { mode = 'blitz' } = useParams()
  const trpc = useTRPC()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<WarRenderer | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [targetKind, setTargetKind] = useState<TargetKind | null>(null)
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'sharing'>('idle')
  const [now, setNow] = useState(() => Date.now())

  // first-visit hint (SSR-safe: read localStorage after mount)
  const [hintDismissed, setHintDismissed] = useState(true)
  useEffect(() => {
    setHintDismissed(localStorage.getItem('swg.hint') === '1')
  }, [])
  const dismissHint = () => {
    localStorage.setItem('swg.hint', '1')
    setHintDismissed(true)
  }

  const stateQuery = useQuery(
    trpc.game.state.queryOptions({ mode: mode as Mode }, { refetchInterval: 2500 }),
  )
  const state = stateQuery.data
  const gameId = state?.game.id
  const joinMutation = useMutation(trpc.game.join.mutationOptions())
  const castMutation = useMutation(trpc.game.castVotes.mutationOptions())
  const rallyCreate = useMutation(trpc.game.rally.create.mutationOptions())

  const tallyQuery = useQuery(
    trpc.game.tally.queryOptions(
      { gameId: gameId ?? '' },
      { enabled: !!gameId, refetchInterval: 2500 },
    ),
  )

  const terrain = useMemo(
    () => (state ? generateMap(state.game.seed, state.game.mapRadius) : null),
    [state?.game.seed, state?.game.mapRadius],
  )
  const territory = useMemo(
    () => (state ? base64ToBytes(state.snapshot.territory) : null),
    [state?.snapshot.territory],
  )

  const selected = selectedId != null ? (state?.snapshot.units.find((u) => u.id === selectedId) ?? null) : null
  const myFaction = state?.me?.faction ?? -1
  const myVotes = state?.me?.votes ?? []
  const myVoteFor = (unitId: number): Action | null => myVotes.find((v) => v.unitId === unitId)?.action ?? null

  // ---- legal target cells while picking ----
  const targets: Cell[] = useMemo(() => {
    if (!selected || !targetKind || !terrain || !state) return []
    const out: Cell[] = []
    if (targetKind === 'attack') {
      for (const [dq, dr] of DIRS) {
        const q = selected.q + dq
        const r = selected.r + dr
        if (inBoard(q, r, terrain.R)) out.push({ q, r })
      }
    } else if (targetKind === 'build') {
      const occupied = new Set(state.snapshot.units.map((u) => `${u.q},${u.r}`))
      for (const [dq, dr] of DIRS) {
        const q = selected.q + dq
        const r = selected.r + dr
        if (canStand('factory', terrain, q, r) && canTraverse(terrain, selected.q, selected.r, q, r) && !occupied.has(`${q},${r}`))
          out.push({ q, r })
      }
    } else {
      const range = UNIT_STATS[selected.type].move
      for (let dq = -range; dq <= range; dq++) {
        for (let dr = -range; dr <= range; dr++) {
          const q = selected.q + dq
          const r = selected.r + dr
          if ((dq === 0 && dr === 0) || hexDist(selected.q, selected.r, q, r) > range) continue
          if (!inBoard(q, r, terrain.R)) continue
          if (findPath(selected.type, terrain, selected.q, selected.r, q, r, range)) out.push({ q, r })
        }
      }
    }
    return out
  }, [selected?.id, selected?.q, selected?.r, targetKind, terrain, state?.snapshot])

  // ---- casting ----
  const castVote = async (unitId: number, action: Action) => {
    if (!gameId) return
    setTargetKind(null)
    dismissHint() // first vote cast → the loop clicked; stop explaining it
    try {
      await castMutation.mutateAsync({ gameId, votes: [{ unitId, action }] })
      await Promise.all([stateQuery.refetch(), tallyQuery.refetch()])
    } catch {
      // energy or round raced out — state refetch shows the truth
      await stateQuery.refetch()
    }
  }

  const shareRally = async () => {
    if (!gameId || myVotes.length === 0) return
    setShareState('sharing')
    try {
      const { shortCode } = await rallyCreate.mutateAsync({ gameId, slate: myVotes })
      const url = `${window.location.origin}/rally/${shortCode}`
      if (navigator.share) {
        await navigator.share({ title: 'Rally your faction', url }).catch(() => {})
      } else {
        await navigator.clipboard.writeText(url)
      }
      setShareState('copied')
      setTimeout(() => setShareState('idle'), 2500)
    } catch {
      setShareState('idle')
    }
  }

  // ---- guest drop-in: anonymous session + join, once per page ----
  const joinedRef = useRef(false)
  useEffect(() => {
    if (!state || state.me || joinedRef.current) return
    joinedRef.current = true
    ;(async () => {
      const session = await authClient.getSession()
      if (!session.data) await authClient.signIn.anonymous()
      await joinMutation.mutateAsync({ mode: mode as Mode })
      await stateQuery.refetch()
    })().catch(() => {
      joinedRef.current = false
    })
  }, [state])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])

  // ---- round-flip animation state ----
  const flipRef = useRef<{ events: SimEvent[]; start: number } | null>(null)
  const prevRoundRef = useRef<number | null>(null)
  useEffect(() => {
    if (!state) return
    if (prevRoundRef.current !== null && state.game.roundNumber > prevRoundRef.current) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!reduced && state.events.length) flipRef.current = { events: state.events, start: performance.now() }
    }
    prevRoundRef.current = state.game.roundNumber
  }, [state?.game.roundNumber])

  // rAF loop reads through refs
  const latest = useRef({
    snapshot: null as Snapshot | null,
    territory: null as Uint8Array | null,
    selected: null as Unit | null,
    targets: [] as Cell[],
    myVote: null as Action | null,
    tally: [] as { unitId: number; actions: { action: Action; weight: number }[] }[],
  }).current
  latest.snapshot = state?.snapshot ?? null
  latest.territory = territory
  latest.selected = selected
  latest.targets = targets
  latest.myVote = selected ? myVoteFor(selected.id) : null
  latest.tally = tallyQuery.data ?? []

  // dev/e2e handle: lets tests find exact screen coords of cells
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).__war = {
      renderer: rendererRef.current,
      latest,
      myFaction,
    }
  }

  // center the camera on a cell's TOP FACE (the camera lives on the z=0 plane,
  // so tall cells need a back-shift of (plane·LEVEL − HALF_H) / (2·HALF_H))
  const centerOn = (q: number, r: number) => {
    const renderer = rendererRef.current
    if (!renderer || !terrain) return
    const plane = Math.max(terrain.elevation[idx(q, r, terrain.R)], 1) + 1
    const shift = (plane * 110 - 55) / 110
    renderer.cam.x = q - shift
    renderer.cam.y = r - shift
  }

  // once the join lands, center on YOUR capital (unless deep-linked)
  const centeredRef = useRef(false)
  useEffect(() => {
    if (!terrain || !rendererRef.current || state?.me == null || centeredRef.current) return
    if (new URLSearchParams(window.location.search).get('q')) return
    centeredRef.current = true
    const cap = terrain.capitals[state.me.faction as 0 | 1 | 2]
    centerOn(cap.q, cap.r)
  }, [terrain, state?.me?.faction])

  // renderer lifecycle
  useEffect(() => {
    if (!terrain) return
    const renderer = new WarRenderer(terrain)
    rendererRef.current = renderer
    const cap = terrain.capitals[(state?.me?.faction ?? 0) as 0 | 1 | 2]
    renderer.cam.x = cap.q - 2.5
    renderer.cam.y = cap.r - 2.5
    renderer.cam.zoom = 0.3
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('q')) renderer.cam.x = Number(sp.get('q'))
    if (sp.get('r')) renderer.cam.y = Number(sp.get('r'))
    if (sp.get('z')) renderer.cam.zoom = Number(sp.get('z'))
    return () => {
      if (rendererRef.current === renderer) rendererRef.current = null
    }
  }, [terrain])

  // ---- draw loop + input ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let disposed = false

    const dpr = () => Math.min(2.5, window.devicePixelRatio || 1)
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.round(rect.width * dpr())
      canvas.height = Math.round(rect.height * dpr())
    }
    resize()
    window.addEventListener('resize', resize)

    const ease = (t: number) => t * t * (3 - 2 * t)

    const frame = () => {
      if (disposed) return
      const renderer = rendererRef.current
      if (renderer && latest.snapshot && latest.territory) {
        const d = dpr()
        ctx.save()
        ctx.scale(d, d)
        const w = canvas.width / d
        const h = canvas.height / d

        const view: RenderView = {
          units: latest.snapshot.units,
          territory: latest.territory,
          selected: latest.selected ? { q: latest.selected.q, r: latest.selected.r } : null,
          targets: latest.targets,
        }

        // round-flip: lerp movers along their paths, flash struck cells
        const flip = flipRef.current
        if (flip) {
          const t = (performance.now() - flip.start) / FLIP_MS
          if (t >= 1) {
            flipRef.current = null
          } else {
            const positions = new Map<number, { x: number; y: number }>()
            const flashes: { q: number; r: number; alpha: number }[] = []
            for (const e of flip.events) {
              if (e.type === 'move') {
                const pts = [e.from, ...e.path]
                const ft = ease(Math.min(1, t)) * (pts.length - 1)
                const i = Math.min(pts.length - 2, Math.floor(ft))
                const f = ft - i
                positions.set(e.unitId, {
                  x: pts[i].q + (pts[i + 1].q - pts[i].q) * f,
                  y: pts[i].r + (pts[i + 1].r - pts[i].r) * f,
                })
              } else if (e.type === 'attack' && e.damage > 0 && t > 0.4) {
                flashes.push({ q: e.target.q, r: e.target.r, alpha: 1 - (t - 0.4) / 0.6 })
              }
            }
            view.positions = positions
            view.flashes = flashes
          }
        }

        // board-wide vote overlay: every unit's LEADING voted action, at a
        // glance — faction-colored arrows for move/attack, chips for the rest.
        // Hidden during the round flip so the animation reads clean.
        if (!flipRef.current) {
          const arrows: NonNullable<RenderView['arrows']> = []
          const badges: NonNullable<RenderView['badges']> = []
          const byId = new Map(view.units.map((u) => [u.id, u]))
          for (const t of latest.tally) {
            const u = byId.get(t.unitId)
            const lead = t.actions[0]?.action
            if (!u || !lead) continue
            const color = FACTIONS[u.faction].line
            const bold = latest.selected?.id === u.id
            if (lead.kind === 'move' || lead.kind === 'attack') {
              arrows.push({ from: { q: u.q, r: u.r }, to: { q: lead.q, r: lead.r }, kind: lead.kind, color, bold })
            } else if (lead.kind === 'mine') {
              badges.push({ q: u.q, r: u.r, label: '⛏ mine', color })
            } else if (lead.kind === 'build') {
              badges.push({ q: lead.q, r: lead.r, label: '⚒ build', color, lift: 60 })
            } else if (lead.kind === 'produce') {
              const tall = u.type === 'capital' || u.type === 'factory'
              badges.push({ q: u.q, r: u.r, label: `+ ${lead.unit}`, color, lift: tall ? 290 : 170 })
            }
          }
          // your own pending vote on the selected piece, even if it's not leading
          const sel = latest.selected
          const mv = latest.myVote
          if (sel && mv && (mv.kind === 'move' || mv.kind === 'attack')) {
            arrows.push({ from: { q: sel.q, r: sel.r }, to: { q: mv.q, r: mv.r }, kind: mv.kind, bold: true })
          }
          view.arrows = arrows
          view.badges = badges
        }

        renderer.draw(ctx, view, w, h)
        ctx.restore()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    // ---- gestures ----
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchDist = 0
    let downPos: { x: number; y: number } | null = null
    let moved = false
    let lastTap = 0

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
      }
      downPos = { x: e.clientX, y: e.clientY }
      moved = false
    }
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      const renderer = rendererRef.current
      if (!renderer) return
      const cur = { x: e.clientX, y: e.clientY }
      if (pointers.size === 1) {
        const dx = cur.x - prev.x
        const dy = cur.y - prev.y
        if (Math.abs(cur.x - (downPos?.x ?? 0)) + Math.abs(cur.y - (downPos?.y ?? 0)) > 8) moved = true
        const z = renderer.cam.zoom
        const du = dx / z
        const dv = dy / z
        renderer.cam.x -= (du / 116 + dv / 55) / 2
        renderer.cam.y -= (dv / 55 - du / 116) / 2
      }
      pointers.set(e.pointerId, cur)
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const d2 = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchDist > 0) renderer.cam.zoom = clampZoom(renderer.cam.zoom * (d2 / pinchDist))
        pinchDist = d2
        moved = true
      }
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      pinchDist = 0
      const renderer = rendererRef.current
      if (!renderer || moved || pointers.size > 0) return
      const rect = canvas.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const nowMs = performance.now()
      if (nowMs - lastTap < 300) {
        renderer.cam.zoom = clampZoom(renderer.cam.zoom * 1.6)
        lastTap = 0
        return
      }
      lastTap = nowMs
      const cell = renderer.screenToCell(px, py, rect.width, rect.height)
      tapRef.current?.(cell)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const renderer = rendererRef.current
      if (renderer) renderer.cam.zoom = clampZoom(renderer.cam.zoom * (e.deltaY < 0 ? 1.12 : 0.9))
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [])

  // tap handling lives outside the effect so it always sees fresh state
  const tapRef = useRef<((cell: { q: number; r: number } | null) => void) | null>(null)
  tapRef.current = (cell) => {
    if (!cell) {
      setTargetKind(null)
      setSelectedId(null)
      return
    }
    if (targetKind && selected) {
      const hit = targets.some((t) => t.q === cell.q && t.r === cell.r)
      if (hit) {
        const action: Action =
          targetKind === 'move'
            ? { kind: 'move', q: cell.q, r: cell.r }
            : targetKind === 'attack'
              ? { kind: 'attack', q: cell.q, r: cell.r }
              : { kind: 'build', q: cell.q, r: cell.r }
        void castVote(selected.id, action)
      } else {
        setTargetKind(null)
      }
      return
    }
    const unit = state?.snapshot.units.find((u) => u.q === cell.q && u.r === cell.r) ?? null
    setSelectedId(unit?.id ?? null)
  }

  const secondsLeft = state ? Math.max(0, Math.round((Date.parse(state.game.roundEndsAt) - now) / 1000)) : 0

  return (
    <div className="fixed inset-0 flex flex-col" style={{ height: '100dvh', background: '#f2e7cb' }}>
      {/* slim top HUD */}
      <div
        className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 text-sm"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          background: 'rgba(253,248,234,0.92)',
          borderBottom: '2px solid #d9cca9',
          color: '#443a26',
          minHeight: 44,
        }}
      >
        <div className="flex items-center gap-2 font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {state?.snapshot.scores.map((s, f) => (
            <span key={f} className="flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: FACTION_BASE[f], outline: f === myFaction ? '2px solid #443a26' : 'none' }}
              />
              {s}
            </span>
          ))}
        </div>
        <div className="font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <span className="text-xs font-semibold" style={{ color: '#71634a' }}>
            round {state?.game.roundNumber ?? '—'} ·{' '}
          </span>
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </div>
        <div
          className="text-xs font-semibold"
          style={{ color: '#71634a', fontVariantNumeric: 'tabular-nums' }}
          title="Vote energy — each new order costs 1, +5 back every round"
        >
          {state?.me ? `⚡ ${state.me.energy}/25 votes` : 'joining…'}
        </div>
      </div>

      {/* first-visit hint — top banner so it never blocks board taps */}
      {!hintDismissed && state?.me && myFaction >= 0 && (
        <div
          className="absolute inset-x-3 z-10 rounded-xl px-3 py-2 text-sm shadow-sm"
          style={{
            top: 'calc(env(safe-area-inset-top) + 52px)',
            background: '#fdf8ea',
            border: '2px solid #d9cca9',
            color: '#443a26',
          }}
        >
          <span className="font-bold" style={{ color: FACTIONS[myFaction].line }}>
            You command the {FACTION_NAMES[myFaction]}.
          </span>{' '}
          Tap one of your pieces and vote its next order — when the timer hits zero, the most-voted
          order per piece executes. Arrows and chips show what every side is voting right now. ⚡ is
          your vote energy: each new order costs 1, and you get 5 back every round.
          <button
            onClick={dismissHint}
            className="mt-2 block w-full rounded-lg py-2 font-bold"
            style={{ border: '2px solid #cf9c3c', color: '#6b5116', minHeight: 40 }}
          >
            Got it
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="h-full w-full touch-none" style={{ display: 'block' }} />

      {/* target-picking prompt bar (sheet collapses while aiming) */}
      {targetKind && selected && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-4 py-3 text-sm font-bold"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
            background: '#fdf8ea',
            borderTop: '2px solid #cf9c3c',
            color: '#443a26',
          }}
        >
          <span>
            Tap a highlighted hex to {targetKind} {targetKind === 'build' ? 'the factory' : ''}
          </span>
          <button
            onClick={() => setTargetKind(null)}
            className="rounded-xl px-4 py-2"
            style={{ border: '2px solid #d9cca9', minHeight: 44 }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* bottom sheet */}
      {selected && !targetKind && state && terrain && (
        <UnitSheet
          unit={selected}
          terrain={terrain}
          snapshot={state.snapshot}
          mine={selected.faction === myFaction}
          energy={state.me?.energy ?? 0}
          myVote={myVoteFor(selected.id)}
          tally={tallyQuery.data?.find((t) => t.unitId === selected.id)?.actions ?? []}
          onAction={(action) => void castVote(selected.id, action)}
          onPickTarget={(kind) => setTargetKind(kind)}
          onShareRally={() => void shareRally()}
          shareState={shareState}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

function clampZoom(z: number): number {
  return Math.min(1.2, Math.max(0.08, z))
}
