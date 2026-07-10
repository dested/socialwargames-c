// Bottom sheet for unit interaction (mobile UX law: bottom sheet, never
// floating tooltips). 3D-rendered portrait + HP pips + live tally bars + big
// legal action buttons; Move/Attack/Build collapse into target-picking on the
// board. Dark glass over the bright diorama.

import { useEffect, useState } from 'react'
import type { Action, Snapshot, Terrain, Unit } from '../../shared/types'
import { UNIT_STATS, produceCost } from '../../shared/units'
import { idx } from '../../shared/hex'
import { FACTIONS, FACTION_NAMES, UI } from '~/scene/palette'

export interface TallyEntry {
  action: Action
  weight: number
}

interface UnitSheetProps {
  unit: Unit
  terrain: Terrain
  snapshot: Snapshot
  mine: boolean
  energy: number
  myVote: Action | null
  tally: TallyEntry[]
  onAction: (action: Action) => void
  onPickTarget: (kind: 'move' | 'attack' | 'build') => void
  onShareRally: () => void
  shareState: 'idle' | 'copied' | 'sharing'
  onClose: () => void
}

/** screen-relative arrow for the six hex directions */
export function arrowFor(dq: number, dr: number): string {
  if (dq > 0 && dr < 0) return '→'
  if (dq < 0 && dr > 0) return '←'
  if (dq > 0) return '↘'
  if (dr > 0) return '↙'
  if (dq < 0) return '↖'
  return '↗'
}

export function actionLabel(unit: Unit, action: Action): string {
  switch (action.kind) {
    case 'hold':
      return 'Hold'
    case 'mine':
      return 'Mine +3 ore'
    case 'move': {
      const d = Math.max(Math.abs(action.q - unit.q), Math.abs(action.r - unit.r), Math.abs(action.q + action.r - unit.q - unit.r))
      return `Move ${arrowFor(action.q - unit.q, action.r - unit.r)}${d > 1 ? d : ''}`
    }
    case 'attack':
      return `Attack ${arrowFor(action.q - unit.q, action.r - unit.r)}`
    case 'build':
      return `Build Factory ${arrowFor(action.q - unit.q, action.r - unit.r)}`
    case 'produce':
      return `Produce ${action.unit[0].toUpperCase()}${action.unit.slice(1)}`
  }
}

function Portrait({ unit }: { unit: Unit }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    // scene code is heavyweight — load it lazily so the sheet opens instantly
    void import('~/scene/portrait').then(({ portraitOf }) => {
      if (alive) setSrc(portraitOf(unit.type, unit.faction))
    })
    return () => {
      alive = false
    }
  }, [unit.type, unit.faction])
  return src ? (
    <img src={src} width={84} height={84} style={{ width: 84, height: 84 }} alt="" aria-hidden />
  ) : (
    <div style={{ width: 84, height: 84 }} />
  )
}

function HpPips({ unit }: { unit: Unit }) {
  const max = UNIT_STATS[unit.type].hp
  const pipCount = Math.min(12, max)
  const filled = Math.round((unit.hp / max) * pipCount)
  const glow = FACTIONS[unit.faction].glow
  return (
    <div className="flex items-center gap-1" title={`${unit.hp}/${max} HP`}>
      {Array.from({ length: pipCount }, (_, i) => (
        <span
          key={i}
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{
            background: i < filled ? glow : 'transparent',
            border: `2px solid ${i < filled ? glow : UI.inkFaint}`,
          }}
        />
      ))}
      <span className="ml-1 text-xs font-semibold" style={{ color: UI.inkSoft, fontVariantNumeric: 'tabular-nums' }}>
        {unit.hp}/{max}
      </span>
    </div>
  )
}

const BTN: React.CSSProperties = {
  minHeight: 46,
  borderRadius: 12,
  border: `1px solid ${UI.panelBorder}`,
  background: 'rgba(255,255,255,0.06)',
  color: UI.ink,
  fontWeight: 700,
  fontSize: 14,
  padding: '0 14px',
}

export function UnitSheet(props: UnitSheetProps) {
  const { unit, terrain, snapshot, mine, energy, myVote, tally } = props
  const stats = UNIT_STATS[unit.type]
  const onOre = terrain.ore[idx(unit.q, unit.r, terrain.R)] === 1
  const pool = snapshot.pools[unit.faction]
  const isBuilding = unit.type === 'factory' || unit.type === 'capital'
  const top3 = tally.slice(0, 3)
  const maxWeight = top3[0]?.weight ?? 0
  const glow = FACTIONS[unit.faction].glow

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 px-4 pt-3"
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)',
        background: UI.panel,
        borderTop: `1px solid ${UI.panelBorder}`,
        borderRadius: '18px 18px 0 0',
        boxShadow: '0 -8px 30px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(14px)',
        maxHeight: '46dvh',
        overflowY: 'auto',
        color: UI.ink,
      }}
    >
      {/* grab handle + close */}
      <div className="flex items-center justify-center pt-1">
        <div style={{ width: 44, height: 5, borderRadius: 3, background: UI.inkFaint }} />
        <button
          onClick={props.onClose}
          aria-label="Close"
          className="absolute right-2 top-1 px-3 py-2 text-lg font-bold"
          style={{ color: UI.inkSoft, minWidth: 44, minHeight: 44 }}
        >
          ✕
        </button>
      </div>

      {/* header */}
      <div className="flex items-center gap-3">
        <div
          className="shrink-0 overflow-hidden rounded-xl"
          style={{ border: `1px solid ${UI.panelBorder}`, background: 'rgba(255,255,255,0.05)', width: 88, height: 88 }}
        >
          <Portrait unit={unit} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="truncate text-base font-bold" style={{ color: UI.ink }}>
            {FACTION_NAMES[unit.faction].split(' ')[0]} {unit.type[0].toUpperCase() + unit.type.slice(1)} №{unit.id}
          </div>
          <span
            className="w-fit rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
            style={{ background: 'rgba(255,255,255,0.06)', color: glow, border: `1px solid ${glow}` }}
          >
            {FACTION_NAMES[unit.faction]}
          </span>
          <HpPips unit={unit} />
        </div>
      </div>

      {/* live tally */}
      {top3.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {top3.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-semibold" style={{ color: UI.ink }}>
              <div className="h-4 flex-1 overflow-hidden rounded" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.max(8, (t.weight / maxWeight) * 100)}%`,
                    background: i === 0 ? glow : UI.inkFaint,
                    boxShadow: i === 0 ? `0 0 8px ${glow}` : 'none',
                  }}
                />
              </div>
              <span className="w-32 truncate" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {actionLabel(unit, t.action)} — {t.weight}
                {i === 0 ? ' ▸ winning' : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* action row (only your own faction's pieces take orders) */}
      {mine ? (
        <>
          <div className="flex flex-wrap gap-2">
            {stats.move > 0 && (
              <button style={BTN} onClick={() => props.onPickTarget('move')}>
                Move
              </button>
            )}
            {stats.attack > 0 && (
              <button style={BTN} onClick={() => props.onPickTarget('attack')}>
                Attack {stats.attack}
              </button>
            )}
            {unit.type === 'worker' && onOre && (
              <button style={BTN} onClick={() => props.onAction({ kind: 'mine' })}>
                Mine +3
              </button>
            )}
            {unit.type === 'worker' && (
              <button style={BTN} disabled={pool < 30} onClick={() => props.onPickTarget('build')}>
                Build Factory (30)
              </button>
            )}
            {isBuilding &&
              (['worker', 'scout', 'tank'] as const).map((t) => {
                const cost = produceCost(t, unit.type as 'factory' | 'capital')
                return (
                  <button key={t} style={{ ...BTN, opacity: pool < cost ? 0.45 : 1 }} disabled={pool < cost} onClick={() => props.onAction({ kind: 'produce', unit: t })}>
                    {t[0].toUpperCase() + t.slice(1)} ({cost})
                  </button>
                )
              })}
            <button style={BTN} onClick={() => props.onAction({ kind: 'hold' })}>
              Hold
            </button>
          </div>

          {/* vote status + rally */}
          <div className="flex items-center justify-between gap-2 text-xs font-semibold" style={{ color: UI.inkSoft }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {myVote ? `✓ your vote: ${actionLabel(unit, myVote)} · ` : ''}⚡ {energy}/25
            </span>
            <button
              style={{ ...BTN, minHeight: 40, borderColor: UI.accentLine, color: UI.accent }}
              onClick={props.onShareRally}
              disabled={props.shareState === 'sharing'}
            >
              {props.shareState === 'copied' ? '✓ Link copied' : 'Share rally'}
            </button>
          </div>
        </>
      ) : (
        <div className="pb-1 text-xs font-semibold" style={{ color: UI.inkSoft }}>
          Enemy piece — you can only direct your own faction.
        </div>
      )}
    </div>
  )
}
