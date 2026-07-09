// /play/:mode — the war table. Full-viewport canvas (100dvh), one-finger pan,
// pinch/double-tap zoom, tap to select. Step-4 work (bottom sheet, voting,
// round-flip animation) builds on top of this page.

import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { generateMap } from '../../shared/mapgen'
import type { Snapshot, Unit } from '../../shared/types'
import { base64ToBytes } from '../../shared/types'
import { authClient } from '~/lib/auth-client'
import { useTRPC } from '~/lib/trpc'
import { WarRenderer } from '~/game/renderer'
import { FACTION_BASE, FACTION_NAMES } from '~/game/palette'

type Mode = 'blitz' | 'campaign'

export function PlayPage() {
  const { mode = 'blitz' } = useParams()
  const trpc = useTRPC()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<WarRenderer | null>(null)
  const selRef = useRef<Unit | null>(null)
  // rAF loop reads these without re-subscribing
  const latest = useRef({ snapshot: null as Snapshot | null, territory: null as Uint8Array | null }).current
  const [selected, setSelected] = useState<Unit | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const stateQuery = useQuery(
    trpc.game.state.queryOptions({ mode: mode as Mode }, { refetchInterval: 3000 }),
  )
  const state = stateQuery.data
  const joinMutation = useMutation(trpc.game.join.mutationOptions())

  // deterministic local terrain — snapshots never carry it
  const terrain = useMemo(
    () => (state ? generateMap(state.game.seed, state.game.mapRadius) : null),
    [state?.game.seed, state?.game.mapRadius],
  )

  const territory = useMemo(
    () => (state ? base64ToBytes(state.snapshot.territory) : null),
    [state?.snapshot.territory],
  )
  latest.snapshot = state?.snapshot ?? null
  latest.territory = territory

  // guest drop-in: anonymous session + join the war, once per page
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
      joinedRef.current = false // retry on next state poll
    })
  }, [state])

  // countdown ticker
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])

  // renderer lifecycle: rebuild when the war (seed) changes
  useEffect(() => {
    if (!terrain) return
    const renderer = new WarRenderer(terrain)
    rendererRef.current = renderer
    const cap = terrain.capitals[state?.me?.faction ?? 0]
    renderer.cam.x = cap.q
    renderer.cam.y = cap.r
    renderer.cam.zoom = 0.3
    // debug/deep-link camera: /play/blitz?q=-11&r=11&z=0.6
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('q')) renderer.cam.x = Number(sp.get('q'))
    if (sp.get('r')) renderer.cam.y = Number(sp.get('r'))
    if (sp.get('z')) renderer.cam.zoom = Number(sp.get('z'))
    return () => {
      if (rendererRef.current === renderer) rendererRef.current = null
    }
  }, [terrain])

  // draw loop + input
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

    const frame = () => {
      if (disposed) return
      const renderer = rendererRef.current
      if (renderer && latest.snapshot && latest.territory) {
        const d = dpr()
        ctx.save()
        ctx.scale(d, d)
        const w = canvas.width / d
        const h = canvas.height / d
        renderer.draw(
          ctx,
          {
            units: latest.snapshot.units,
            territory: latest.territory,
            selected: selRef.current ? { q: selRef.current.q, r: selRef.current.r } : null,
          },
          w,
          h,
        )
        ctx.restore()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    // ---- gestures: pan / pinch / double-tap / tap ----
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
        // invert screen delta into cell-space pan
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
      const unit = cell ? (latest.snapshot?.units.find((u) => u.q === cell.q && u.r === cell.r) ?? null) : null
      selRef.current = unit
      setSelected(unit)
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
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: FACTION_BASE[f] }} />
              {s}
            </span>
          ))}
        </div>
        <div className="font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </div>
        <div className="text-xs" style={{ color: '#71634a' }}>
          {state?.me ? `⚡ ${state.me.energy}/25` : 'joining…'}
        </div>
      </div>

      <canvas ref={canvasRef} className="h-full w-full touch-none" style={{ display: 'block' }} />

      {/* selection stub (replaced by the bottom sheet in step 4) */}
      {selected && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 px-4 py-3 text-sm font-semibold"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
            background: '#fdf8ea',
            borderTop: '2px solid #d9cca9',
            color: '#443a26',
          }}
        >
          {FACTION_NAMES[selected.faction]} {selected.type} №{selected.id} · HP {selected.hp}
        </div>
      )}
    </div>
  )
}

function clampZoom(z: number): number {
  return Math.min(1.2, Math.max(0.08, z))
}
