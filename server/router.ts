import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { router, publicProcedure, protectedProcedure } from './trpc'
import { prisma } from './prisma'
import {
  GAME_MODES,
  castVotesForPlayer,
  effectiveEnergy,
  latestRound,
  type GameMode,
} from './game'
import type { Action, SimEvent } from '../shared/types'

const modeSchema = z.enum(['blitz', 'campaign'])

const actionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hold') }),
  z.object({ kind: z.literal('move'), q: z.number().int(), r: z.number().int() }),
  z.object({ kind: z.literal('attack'), q: z.number().int(), r: z.number().int() }),
  z.object({ kind: z.literal('mine') }),
  z.object({ kind: z.literal('build'), q: z.number().int(), r: z.number().int() }),
  z.object({ kind: z.literal('produce'), unit: z.enum(['worker', 'scout', 'tank']) }),
])

const castEntrySchema = z.object({ unitId: z.number().int().nonnegative(), action: actionSchema })

async function activeGame(mode: GameMode) {
  const game = await prisma.game.findFirst({ where: { mode, status: 'active' } })
  if (!game) throw new TRPCError({ code: 'NOT_FOUND', message: `no active ${mode} war` })
  return game
}

function shortCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789' // no 0/O/1/l/i lookalikes
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

const gameRouter = router({
  /** Drop into the war: assigns the least-populated faction on first join. */
  join: protectedProcedure.input(z.object({ mode: modeSchema })).mutation(async ({ ctx, input }) => {
    const game = await activeGame(input.mode)
    const existing = await prisma.gamePlayer.findUnique({
      where: { gameId_userId: { gameId: game.id, userId: ctx.session.user.id } },
    })
    if (existing) return { gameId: game.id, faction: existing.faction }
    const counts = await prisma.gamePlayer.groupBy({
      by: ['faction'],
      where: { gameId: game.id },
      _count: true,
    })
    const byFaction = [0, 0, 0]
    for (const c of counts) byFaction[c.faction] = c._count
    const faction = byFaction.indexOf(Math.min(...byFaction))
    await prisma.gamePlayer.create({
      data: { gameId: game.id, userId: ctx.session.user.id, faction, energyRound: game.roundNumber },
    })
    return { gameId: game.id, faction }
  }),

  /** Full war state: game meta + latest snapshot + last round's events (for the
   *  flip animation) + the caller's player info when signed in. */
  state: publicProcedure.input(z.object({ mode: modeSchema })).query(async ({ ctx, input }) => {
    const game = await activeGame(input.mode)
    const { snapshot, events } = await latestRound(game.id, game.roundNumber)
    let me: { faction: number; energy: number; votedUnitIds: number[] } | null = null
    if (ctx.session) {
      const player = await prisma.gamePlayer.findUnique({
        where: { gameId_userId: { gameId: game.id, userId: ctx.session.user.id } },
      })
      if (player) {
        const myVotes = await prisma.vote.findMany({
          where: { gameId: game.id, round: game.roundNumber, playerId: ctx.session.user.id },
          select: { unitId: true },
        })
        me = {
          faction: player.faction,
          energy: effectiveEnergy(player.voteEnergy, player.energyRound, game.roundNumber),
          votedUnitIds: myVotes.map((v) => v.unitId),
        }
      }
    }
    return {
      game: {
        id: game.id,
        mode: game.mode as GameMode,
        seed: game.seed,
        mapRadius: game.mapRadius,
        roundNumber: game.roundNumber,
        roundSeconds: game.roundSeconds,
        roundEndsAt: game.roundEndsAt.toISOString(),
        maxRounds: GAME_MODES[game.mode as GameMode].maxRounds,
      },
      snapshot,
      events: events as unknown as SimEvent[],
      me,
    }
  }),

  /** Live vote tally for the current round (bottom-sheet bars). */
  tally: publicProcedure.input(z.object({ gameId: z.string() })).query(async ({ input }) => {
    const game = await prisma.game.findUnique({ where: { id: input.gameId } })
    if (!game) throw new TRPCError({ code: 'NOT_FOUND' })
    const votes = await prisma.vote.findMany({
      where: { gameId: game.id, round: game.roundNumber },
      select: { unitId: true, action: true, weight: true },
    })
    const byUnit = new Map<number, Map<string, { action: Action; weight: number }>>()
    for (const v of votes) {
      const action = v.action as unknown as Action
      const key = JSON.stringify(action)
      let unit = byUnit.get(v.unitId)
      if (!unit) byUnit.set(v.unitId, (unit = new Map()))
      const t = unit.get(key)
      if (t) t.weight += v.weight
      else unit.set(key, { action, weight: v.weight })
    }
    return [...byUnit.entries()].map(([unitId, actions]) => ({
      unitId,
      actions: [...actions.values()].sort((a, b) => b.weight - a.weight),
    }))
  }),

  /** Cast votes (1 energy per unit; re-voting the same unit is free). */
  castVotes: protectedProcedure
    .input(z.object({ gameId: z.string(), votes: z.array(castEntrySchema).min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await castVotesForPlayer(input.gameId, ctx.session.user.id, input.votes)
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'vote failed' })
      }
    }),

  rally: router({
    create: protectedProcedure
      .input(z.object({ gameId: z.string(), slate: z.array(castEntrySchema).min(1).max(60) }))
      .mutation(async ({ ctx, input }) => {
        const game = await prisma.game.findUnique({ where: { id: input.gameId } })
        if (!game || game.status !== 'active') throw new TRPCError({ code: 'NOT_FOUND' })
        for (let attempt = 0; ; attempt++) {
          const code = shortCode()
          try {
            const rally = await prisma.rally.create({
              data: {
                shortCode: code,
                gameId: game.id,
                creatorId: ctx.session.user.id,
                slate: input.slate,
                round: game.roundNumber,
              },
            })
            return { shortCode: rally.shortCode }
          } catch (e) {
            if (attempt >= 3) throw e // shortCode collision lottery jackpot
          }
        }
      }),

    get: publicProcedure.input(z.object({ shortCode: z.string() })).query(async ({ input }) => {
      const rally = await prisma.rally.findUnique({
        where: { shortCode: input.shortCode },
        include: { creator: { select: { name: true } }, game: { select: { mode: true, status: true } } },
      })
      if (!rally) throw new TRPCError({ code: 'NOT_FOUND' })
      return {
        shortCode: rally.shortCode,
        gameId: rally.gameId,
        mode: rally.game.mode as GameMode,
        active: rally.game.status === 'active',
        creatorName: rally.creator.name,
        slate: rally.slate as unknown as { unitId: number; action: Action }[],
        applies: rally.applies,
      }
    }),

    /** Apply a rally: casts your energy across its slate in one tap.
     *  (Named `cast`, not `apply` — tRPC reserves Function.prototype words.) */
    cast: protectedProcedure.input(z.object({ shortCode: z.string() })).mutation(async ({ ctx, input }) => {
      const rally = await prisma.rally.findUnique({ where: { shortCode: input.shortCode } })
      if (!rally) throw new TRPCError({ code: 'NOT_FOUND' })
      const slate = rally.slate as unknown as { unitId: number; action: Action }[]
      try {
        const result = await castVotesForPlayer(rally.gameId, ctx.session.user.id, slate, rally.id)
        if (result.cast > 0) {
          await prisma.rally.update({ where: { id: rally.id }, data: { applies: { increment: 1 } } })
        }
        return result
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'apply failed' })
      }
    }),
  }),

  /** Ledger totals per player for one war; the client sorts/filters. */
  leaderboard: publicProcedure.input(z.object({ gameId: z.string() })).query(async ({ input }) => {
    const rows = await prisma.playerStat.findMany({
      where: { gameId: input.gameId },
      include: { player: { select: { name: true } } },
    })
    const players = new Map<string, { playerId: string; name: string; stats: Record<string, number> }>()
    for (const row of rows) {
      let p = players.get(row.playerId)
      if (!p) players.set(row.playerId, (p = { playerId: row.playerId, name: row.player.name, stats: {} }))
      p.stats[row.stat] = row.total
    }
    const total = (s: Record<string, number>) => Object.values(s).reduce((a, b) => a + b, 0)
    return [...players.values()].sort((a, b) => total(b.stats) - total(a.stats)).slice(0, 100)
  }),

  /** Notable events feed: deaths and capital losses from recent rounds. */
  warReport: publicProcedure.input(z.object({ gameId: z.string() })).query(async ({ input }) => {
    const game = await prisma.game.findUnique({ where: { id: input.gameId } })
    if (!game) throw new TRPCError({ code: 'NOT_FOUND' })
    const rounds = await prisma.round.findMany({
      where: { gameId: game.id },
      orderBy: { number: 'desc' },
      take: 50,
      select: { number: true, events: true },
    })
    return rounds
      .map((r) => ({
        round: r.number,
        deaths: (r.events as unknown as SimEvent[]).filter((e) => e.type === 'death'),
      }))
      .filter((r) => r.deaths.length > 0)
  }),
})

export const appRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.session.user),
  game: gameRouter,
  posts: router({
    list: publicProcedure.query(async () => {
      const rows = await prisma.post.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { name: true } } },
      })
      // ISO strings on the wire so SSR-rendered HTML and React Query's
      // post-hydration render produce identical markup (no Date-locale drift).
      return rows.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        createdAt: p.createdAt.toISOString(),
        authorName: p.author?.name ?? null,
      }))
    }),
    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1).max(200),
          content: z.string().min(1).max(2000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return prisma.post.create({
          data: { ...input, authorId: ctx.session.user.id },
        })
      }),
  }),
})

export type AppRouter = typeof appRouter
