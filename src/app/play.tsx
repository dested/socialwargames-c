// /play/:mode — the war table. Full-viewport 3D diorama (100dvh): one-finger
// pan, pinch zoom + twist rotate, right-drag orbit, tap to select → bottom
// sheet → vote. Round flips animate (movement lerps, attack flashes);
// prefers-reduced-motion snaps.

import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DIRS, hexDist, inBoard } from '../../shared/hex'
import { generateMap } from '../../shared/mapgen'
import type { Action, Cell, SimEvent, Snapshot, Unit } from '../../shared/types'
import { base64ToBytes } from '../../shared/types'
import { UNIT_STATS, canStand, canTraverse, findPath } from '../../shared/units'
import { authClient } from '~/lib/auth-client'
import { useTRPC } from '~/lib/trpc'
import { WarScene, type SceneView } from '~/scene/scene'
import { FACTIONS, FACTION_BASE, FACTION_NAMES, UI } from '~/scene/palette'
import { UnitSheet } from './unit-sheet'

type Mode = 'blitz' | 'campaign'
type TargetKind = 'move' | 'attack' | 'build'

const FLIP_MS = 550

export function PlayPage() {
  const { mode = 'blitz' } = useParams()
  const trpc = useTRPC()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<WarScene | null>(null)
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
      renderer: sceneRef.current,
      latest,
      myFaction,
    }
  }

  // scene lifecycle: one WarScene per (game, terrain)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!terrain || !canvas) return
    const scene = new WarScene(canvas, terrain)
    sceneRef.current = scene
    scene.focusFaction(((state?.me?.faction ?? 0) as 0 | 1 | 2))
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('q') && sp.get('r')) scene.centerOn(Number(sp.get('q')), Number(sp.get('r')))
    if (sp.get('z')) scene.cam.dist = Number(sp.get('z'))
    scene.onTap = (cell) => tapRef.current?.(cell)
    return () => {
      if (sceneRef.current === scene) sceneRef.current = null
      scene.dispose()
    }
  }, [terrain])

  // once the join lands, swing the camera behind YOUR capital (unless deep-linked)
  const centeredRef = useRef(false)
  useEffect(() => {
    if (!sceneRef.current || state?.me == null || centeredRef.current) return
    if (new URLSearchParams(window.location.search).get('q')) return
    centeredRef.current = true
    sceneRef.current.focusFaction(state.me.faction as 0 | 1 | 2)
  }, [terrain, state?.me?.faction])

  // ---- draw loop ----
  useEffect(() => {
    let raf = 0
    let disposed = false

    const resize = () => sceneRef.current?.resize()
    window.addEventListener('resize', resize)

    const ease = (t: number) => t * t * (3 - 2 * t)

    const frame = () => {
      if (disposed) return
      const scene = sceneRef.current
      if (scene && latest.snapshot && latest.territory) {
        const view: SceneView = {
          units: latest.snapshot.units,
          territory: latest.territory,
          selected: latest.selected
            ? { q: latest.selected.q, r: latest.selected.r, faction: latest.selected.faction }
            : null,
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
        // glance — faction-glow arcs for move/attack, chips for the rest.
        // Hidden during the round flip so the animation reads clean.
        if (!flipRef.current) {
          const arrows: NonNullable<SceneView['arrows']> = []
          const badges: NonNullable<SceneView['badges']> = []
          const byId = new Map(view.units.map((u) => [u.id, u]))
          for (const t of latest.tally) {
            const u = byId.get(t.unitId)
            const lead = t.actions[0]?.action
            if (!u || !lead) continue
            const color = FACTIONS[u.faction].glow
            const bold = latest.selected?.id === u.id
            if (lead.kind === 'move' || lead.kind === 'attack') {
              arrows.push({ from: { q: u.q, r: u.r }, to: { q: lead.q, r: lead.r }, kind: lead.kind, color, bold })
            } else if (lead.kind === 'mine') {
              badges.push({ q: u.q, r: u.r, label: '⛏ mine', color, lift: 0.75 })
            } else if (lead.kind === 'build') {
              badges.push({ q: lead.q, r: lead.r, label: '⚒ build', color, lift: 0.35 })
            } else if (lead.kind === 'produce') {
              const tall = u.type === 'capital' || u.type === 'factory'
              badges.push({ q: u.q, r: u.r, label: `+ ${lead.unit}`, color, lift: tall ? 1.75 : 0.9 })
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

        scene.render(view, performance.now())
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
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
  const roundFrac = state ? Math.min(1, Math.max(0, secondsLeft / state.game.roundSeconds)) : 0

  return (
    <div className="fixed inset-0 flex flex-col" style={{ height: '100dvh', background: '#8fb6c6' }}>
      <canvas ref={canvasRef} className="h-full w-full touch-none" style={{ display: 'block' }} />

      {/* floating glass HUD */}
      <div
        className="absolute inset-x-2 top-0 z-10"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}
      >
        <div
          className="flex items-center justify-between rounded-2xl px-3 text-sm"
          style={{
            background: UI.panel,
            border: `1px solid ${UI.panelBorder}`,
            color: UI.ink,
            minHeight: 46,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
          }}
        >
          <div className="flex items-center gap-2.5 font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {state?.snapshot.scores.map((s, f) => (
              <span key={f} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{
                    background: FACTIONS[f].glow,
                    boxShadow: f === myFaction ? `0 0 0 2px ${UI.ink}` : `0 0 6px ${FACTIONS[f].glow}`,
                  }}
                />
                {s}
              </span>
            ))}
          </div>
          <div className="font-bold" style={{ fontVariantNumeric: 'tabular-nums', color: UI.accent }}>
            <span className="text-xs font-semibold" style={{ color: UI.inkSoft }}>
              round {state?.game.roundNumber ?? '—'} ·{' '}
            </span>
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </div>
          <div
            className="text-xs font-semibold"
            style={{ color: UI.inkSoft, fontVariantNumeric: 'tabular-nums' }}
            title="Vote energy — each new order costs 1, +5 back every round"
          >
            {state?.me ? `⚡ ${state.me.energy}/25 votes` : 'joining…'}
          </div>
        </div>
        {/* round progress */}
        <div className="mx-3 h-0.5 overflow-hidden rounded-b" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full"
            style={{ width: `${roundFrac * 100}%`, background: UI.accent, opacity: 0.8, transition: 'width 0.5s linear' }}
          />
        </div>
      </div>

      {/* first-visit hint — top banner so it never blocks board taps */}
      {!hintDismissed && state?.me && myFaction >= 0 && (
        <div
          className="absolute inset-x-3 z-10 mx-auto rounded-2xl px-4 py-3 text-sm"
          style={{
            top: 'calc(env(safe-area-inset-top) + 64px)',
            maxWidth: 560,
            background: UI.panel,
            border: `1px solid ${UI.panelBorder}`,
            color: UI.ink,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.3)',
          }}
        >
          <span className="font-bold" style={{ color: FACTIONS[myFaction].glow }}>
            You command the {FACTION_NAMES[myFaction]}.
          </span>{' '}
          Tap one of your pieces and vote its next order — when the timer hits zero, the most-voted
          order per piece executes. Glowing arcs and chips show what every side is voting right now.
          ⚡ is your vote energy: each new order costs 1, and you get 5 back every round.
          <button
            onClick={dismissHint}
            className="mt-2.5 block w-full rounded-xl py-2 font-bold"
            style={{ border: `1px solid ${UI.accentLine}`, color: UI.accent, minHeight: 40 }}
          >
            Got it
          </button>
        </div>
      )}

      {/* target-picking prompt bar (sheet collapses while aiming) */}
      {targetKind && selected && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-4 py-3 text-sm font-bold"
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
            background: UI.panel,
            borderTop: `1px solid ${UI.accentLine}`,
            color: UI.ink,
            backdropFilter: 'blur(10px)',
          }}
        >
          <span>
            Tap a glowing hex to {targetKind} {targetKind === 'build' ? 'the factory' : ''}
          </span>
          <button
            onClick={() => setTargetKind(null)}
            className="rounded-xl px-4 py-2"
            style={{ border: `1px solid ${UI.panelBorder}`, minHeight: 44 }}
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
