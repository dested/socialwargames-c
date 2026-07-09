// Game service: keeps the two concurrent wars alive, casts votes, and runs the
// authoritative tick loop. All sim math lives in shared/ — this file is only
// persistence + orchestration.

import type { Prisma } from '@prisma/client'
import { generateMap } from '../shared/mapgen'
import { resolveTick } from '../shared/resolve'
import type { Action, Faction, Snapshot, StatKey, Terrain, Vote as SimVote } from '../shared/types'
import { ENERGY_CAP, ENERGY_REGEN, createInitialSnapshot } from '../shared/units'
import { log, formatError } from './logger'
import { prisma } from './prisma'

export type GameMode = 'blitz' | 'campaign'

export const GAME_MODES: Record<GameMode, { mapRadius: number; roundSeconds: number; maxRounds: number }> = {
  blitz: { mapRadius: 18, roundSeconds: 60, maxRounds: 60 * 24 }, // ~1 day
  campaign: { mapRadius: 30, roundSeconds: 900, maxRounds: 4 * 24 * 14 }, // ~2 weeks
}

// Terrain is a pure function of (seed, R) — cache per game, it never changes.
const terrainCache = new Map<string, Terrain>()
export function terrainFor(seed: number, mapRadius: number): Terrain {
  const key = `${seed}:${mapRadius}`
  let t = terrainCache.get(key)
  if (!t) {
    t = generateMap(seed, mapRadius)
    terrainCache.set(key, t)
  }
  return t
}

/** Ensure one active game per mode exists; called at startup and by the tick loop. */
export async function ensureActiveGames(): Promise<void> {
  for (const mode of Object.keys(GAME_MODES) as GameMode[]) {
    const existing = await prisma.game.findFirst({ where: { mode, status: 'active' } })
    if (existing) continue
    const cfg = GAME_MODES[mode]
    const seed = Math.floor(Math.random() * 2 ** 31)
    const terrain = terrainFor(seed, cfg.mapRadius)
    const snapshot = createInitialSnapshot(terrain)
    const game = await prisma.game.create({
      data: {
        mode,
        seed,
        mapRadius: cfg.mapRadius,
        roundSeconds: cfg.roundSeconds,
        roundEndsAt: new Date(Date.now() + cfg.roundSeconds * 1000),
        rounds: {
          create: { number: 0, snapshot: snapshot as unknown as Prisma.InputJsonValue, events: [] },
        },
      },
    })
    log.success(`new ${mode} war ${game.id} (seed ${seed}, R=${cfg.mapRadius})`)
  }
}

export async function latestRound(gameId: string, roundNumber: number) {
  const round = await prisma.round.findUnique({
    where: { gameId_number: { gameId, number: roundNumber } },
  })
  if (!round) throw new Error(`round ${roundNumber} missing for game ${gameId}`)
  return { snapshot: round.snapshot as unknown as Snapshot, events: round.events }
}

/** Lazily-regenerated vote energy (+5/round, cap 25) without a per-round cron. */
export function effectiveEnergy(voteEnergy: number, energyRound: number, currentRound: number): number {
  const regen = Math.max(0, currentRound - energyRound) * ENERGY_REGEN
  return Math.min(ENERGY_CAP, voteEnergy + regen)
}

export interface CastEntry {
  unitId: number
  action: Action
}

/** Shared path for castVotes and rally.apply. Replacing an existing vote on a
 *  unit is free; each NEW unit voted on costs 1 energy. Returns what stuck. */
export async function castVotesForPlayer(
  gameId: string,
  userId: string,
  entries: CastEntry[],
  rallyId?: string,
): Promise<{ cast: number; skipped: number; energy: number }> {
  const game = await prisma.game.findUnique({ where: { id: gameId } })
  if (!game || game.status !== 'active') throw new Error('game not active')
  const player = await prisma.gamePlayer.findUnique({
    where: { gameId_userId: { gameId, userId } },
  })
  if (!player) throw new Error('join the war first')

  const { snapshot } = await latestRound(gameId, game.roundNumber)
  const unitFaction = new Map(snapshot.units.map((u) => [u.id, u.faction]))

  // one vote per unit per player per round: keep the last entry per unit
  const byUnit = new Map<number, CastEntry>()
  for (const e of entries) {
    if (unitFaction.get(e.unitId) === (player.faction as Faction)) byUnit.set(e.unitId, e)
  }
  const valid = [...byUnit.values()]
  const skipped = entries.length - valid.length

  const existing = await prisma.vote.findMany({
    where: { gameId, round: game.roundNumber, playerId: userId, unitId: { in: valid.map((e) => e.unitId) } },
    select: { unitId: true },
  })
  const already = new Set(existing.map((v) => v.unitId))
  const newCount = valid.filter((e) => !already.has(e.unitId)).length

  let energy = effectiveEnergy(player.voteEnergy, player.energyRound, game.roundNumber)
  // rally slates cast as much as the player can afford instead of failing whole
  const affordable: CastEntry[] = []
  let cost = 0
  for (const e of valid) {
    if (already.has(e.unitId)) {
      affordable.push(e)
    } else if (cost < energy) {
      affordable.push(e)
      cost++
    }
  }
  if (!rallyId && cost < newCount) throw new Error('not enough energy')

  await prisma.$transaction([
    ...affordable.map((e) =>
      prisma.vote.upsert({
        where: {
          gameId_round_playerId_unitId: {
            gameId,
            round: game.roundNumber,
            playerId: userId,
            unitId: e.unitId,
          },
        },
        create: {
          gameId,
          round: game.roundNumber,
          playerId: userId,
          unitId: e.unitId,
          action: e.action as unknown as Prisma.InputJsonValue,
          rallyId,
        },
        update: { action: e.action as unknown as Prisma.InputJsonValue, rallyId: rallyId ?? null },
      }),
    ),
    prisma.gamePlayer.update({
      where: { id: player.id },
      data: { voteEnergy: energy - cost, energyRound: game.roundNumber },
    }),
  ])

  return { cast: affordable.length, skipped: skipped + (valid.length - affordable.length), energy: energy - cost }
}

let ticking = false

/** Resolve every game whose round timer expired. Runs on a 1s interval. */
export async function resolveDueGames(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const due = await prisma.game.findMany({
      where: { status: 'active', roundEndsAt: { lte: new Date() } },
    })
    for (const game of due) {
      try {
        await resolveGameRound(game.id)
      } catch (e) {
        log.error(`tick failed for game ${game.id}: ${formatError(e)}`)
      }
    }
    if (due.length) await ensureActiveGames()
  } finally {
    ticking = false
  }
}

async function resolveGameRound(gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({ where: { id: gameId } })
  if (!game || game.status !== 'active') return
  const terrain = terrainFor(game.seed, game.mapRadius)
  const { snapshot } = await latestRound(gameId, game.roundNumber)

  const dbVotes = await prisma.vote.findMany({
    where: { gameId, round: game.roundNumber },
    include: { rally: { select: { creatorId: true } } },
  })
  const votes: SimVote[] = dbVotes.map((v) => ({
    playerId: v.playerId,
    unitId: v.unitId,
    action: v.action as unknown as Action,
    weight: v.weight,
    rallyCreatorId: v.rally?.creatorId,
  }))

  const result = resolveTick(terrain, snapshot, votes, (game.seed ^ game.roundNumber) | 0)
  const nextNumber = game.roundNumber + 1
  const cfg = GAME_MODES[game.mode as GameMode]
  const finished = nextNumber >= cfg.maxRounds
  const winner = finished
    ? result.snapshot.scores.indexOf(Math.max(...result.snapshot.scores))
    : null

  await prisma.$transaction([
    prisma.round.create({
      data: {
        gameId,
        number: nextNumber,
        snapshot: result.snapshot as unknown as Prisma.InputJsonValue,
        events: result.events as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.game.update({
      where: { id: gameId },
      data: {
        roundNumber: nextNumber,
        roundEndsAt: new Date(Date.now() + game.roundSeconds * 1000),
        ...(finished ? { status: 'finished', winnerFaction: winner } : {}),
      },
    }),
  ])

  // attribution ledger: fold this tick's credits into per-game totals
  const upserts = []
  for (const [playerId, stats] of Object.entries(result.credits)) {
    for (const [stat, amount] of Object.entries(stats) as [StatKey, number][]) {
      upserts.push(
        prisma.playerStat.upsert({
          where: { playerId_gameId_stat: { playerId, gameId, stat } },
          create: { playerId, gameId, stat, total: amount },
          update: { total: { increment: amount } },
        }),
      )
    }
  }
  if (upserts.length) await prisma.$transaction(upserts)

  if (finished) log.success(`${game.mode} war ${gameId} finished — faction ${winner} wins`)
}

export function startTickLoop(): void {
  ensureActiveGames().catch((e) => log.error(`ensureActiveGames failed: ${formatError(e)}`))
  setInterval(() => {
    resolveDueGames().catch((e) => log.error(`tick loop error: ${formatError(e)}`))
  }, 1000)
  log.info('tick loop started (1s)')
}
