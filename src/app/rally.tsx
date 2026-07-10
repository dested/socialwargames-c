// /rally/:code — the coordination weapon's landing page. Shows the slate and
// its creator; one tap casts your energy across it and drops you into the war.

import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { authClient } from '~/lib/auth-client'
import { useTRPC } from '~/lib/trpc'
import { GOLD_LINE, INK, INK_SOFT, LINE, PANEL } from '~/game/palette'

export function RallyPage() {
  const { code = '' } = useParams()
  const trpc = useTRPC()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rallyQuery = useQuery(trpc.game.rally.get.queryOptions({ shortCode: code }, { enabled: !!code }))
  const joinMutation = useMutation(trpc.game.join.mutationOptions())
  const castMutation = useMutation(trpc.game.rally.cast.mutationOptions())
  const rally = rallyQuery.data

  const apply = async () => {
    if (!rally) return
    setBusy(true)
    setError(null)
    try {
      const session = await authClient.getSession()
      if (!session.data) await authClient.signIn.anonymous()
      await joinMutation.mutateAsync({ mode: rally.mode })
      const result = await castMutation.mutateAsync({ shortCode: code })
      navigate(`/play/${rally.mode}?applied=${result.cast}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not apply the rally')
      setBusy(false)
    }
  }

  return (
    <div
      className="flex min-h-dvh items-center justify-center px-4"
      style={{ background: '#f6efdc', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: PANEL, border: `2px solid ${LINE}` }}
      >
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: GOLD_LINE }}>
          Rally call
        </div>
        {rallyQuery.isLoading && <p className="mt-3 text-sm" style={{ color: INK_SOFT }}>Loading the battle plan…</p>}
        {rallyQuery.isError && <p className="mt-3 text-sm" style={{ color: INK_SOFT }}>This rally doesn't exist (or expired).</p>}
        {rally && (
          <>
            <h1
              className="mt-2 text-2xl font-bold"
              style={{ color: INK, fontFamily: "Rockwell, 'Roboto Slab', serif" }}
            >
              {rally.creatorName} needs you
            </h1>
            <p className="mt-2 text-sm" style={{ color: INK_SOFT }}>
              A battle plan for the <strong>{rally.mode}</strong> war: {rally.slate.length}{' '}
              {rally.slate.length === 1 ? 'order' : 'orders'} · applied by {rally.applies}{' '}
              {rally.applies === 1 ? 'player' : 'players'} so far.
            </p>
            {!rally.active && (
              <p className="mt-2 text-sm font-semibold" style={{ color: INK_SOFT }}>
                This war has ended — the rally is a museum piece now.
              </p>
            )}
            <button
              onClick={() => void apply()}
              disabled={busy || !rally.active}
              className="mt-5 w-full rounded-xl py-3 text-base font-bold"
              style={{
                background: busy ? LINE : '#cf9c3c',
                color: '#3d2f0c',
                border: `2px solid ${GOLD_LINE}`,
                minHeight: 48,
              }}
            >
              {busy ? 'Casting your votes…' : 'Apply rally & join the war'}
            </button>
            {error && <p className="mt-2 text-sm font-semibold" style={{ color: '#a4402a' }}>{error}</p>}
            <p className="mt-3 text-xs" style={{ color: INK_SOFT }}>
              Applying casts 1 energy per order you haven't already voted on. You can change any vote afterwards.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
