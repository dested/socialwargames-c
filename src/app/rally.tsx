// /rally/:code — the coordination weapon's landing page, styled as an urgent
// field telegram. Shows the slate and its creator; one tap casts your energy
// across it and drops you into the war.

import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { authClient } from '~/lib/auth-client'
import { useTRPC } from '~/lib/trpc'
import { DISPLAY, Grain, POSTER, Panel, Stamp, Sunburst, TYPEWRITER } from './poster'

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
      className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-4 py-12"
      style={{ background: POSTER.paper, paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Sunburst at="50% 40%" alpha={0.05} />
      <Grain opacity={0.12} />
      <Panel className="rise w-full max-w-md p-6">
        <div className="-mt-9 text-center">
          <Stamp rotate={-5}>Urgent — rally call</Stamp>
        </div>
        {rallyQuery.isLoading && (
          <p className="mt-4 text-sm" style={{ fontFamily: TYPEWRITER, color: POSTER.inkSoft }}>
            RECEIVING TRANSMISSION…
          </p>
        )}
        {rallyQuery.isError && (
          <p className="mt-4 text-sm" style={{ fontFamily: TYPEWRITER, color: POSTER.inkSoft }}>
            This rally doesn't exist (or expired).
          </p>
        )}
        {rally && (
          <>
            <h1 className="mt-4 text-3xl" style={{ color: POSTER.ink, fontFamily: DISPLAY }}>
              {rally.creatorName} needs you
            </h1>
            <p className="mt-3 text-sm leading-relaxed" style={{ fontFamily: TYPEWRITER, color: POSTER.ink }}>
              A battle plan for the <strong>{rally.mode}</strong> war: {rally.slate.length}{' '}
              {rally.slate.length === 1 ? 'order' : 'orders'} · applied by {rally.applies}{' '}
              {rally.applies === 1 ? 'player' : 'players'} so far.
            </p>
            {!rally.active && (
              <p className="mt-2 text-sm font-semibold" style={{ color: POSTER.stamp }}>
                This war has ended — the rally is a museum piece now.
              </p>
            )}
            <button
              onClick={() => void apply()}
              disabled={busy || !rally.active}
              className="poster-btn poster-btn--gold mt-6 w-full text-base"
            >
              {busy ? 'Casting your votes…' : 'Apply rally & join the war'}
            </button>
            {error && (
              <p className="mt-2 text-sm font-semibold" style={{ color: POSTER.stamp }}>
                {error}
              </p>
            )}
            <p className="mt-4 text-xs leading-relaxed" style={{ fontFamily: TYPEWRITER, color: POSTER.inkSoft }}>
              Applying casts 1 energy per order you haven't already voted on. You can change any
              vote afterwards.
            </p>
          </>
        )}
      </Panel>
    </div>
  )
}
