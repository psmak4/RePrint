import { type HelpfulVoteResponse, helpfulVoteResponseSchema } from '@reprint/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { copy } from '../../copy/index.js'

const text = copy.reviews.list

async function sendVote(reviewId: string, helpful: boolean): Promise<HelpfulVoteResponse> {
  const response = await fetch(`/reviews/${reviewId}/helpful`, {
    method: helpful ? 'POST' : 'DELETE',
  })
  if (!response.ok) throw new Error(`vote failed with ${response.status}`)
  return helpfulVoteResponseSchema.parse(await response.json())
}

/**
 * "N people found this helpful", plus the toggle for verified Members on other people's reviews
 * (PRD §7.6). The vote updates at once and rolls back if the server refuses it.
 */
export function HelpfulVote({
  reviewId,
  count,
  voted,
  canVote,
}: {
  reviewId: string
  count: number
  voted: boolean
  canVote: boolean
}) {
  const queryClient = useQueryClient()
  const key = ['helpful', reviewId]
  // The loader's numbers seed the state; later changes come from this component only.
  const { data: state } = useQuery<HelpfulVoteResponse>({
    queryKey: key,
    queryFn: () => ({ helpful: voted, helpfulCount: count }),
    initialData: { helpful: voted, helpfulCount: count },
    staleTime: Number.POSITIVE_INFINITY,
  })
  const mutation = useMutation({
    mutationFn: (helpful: boolean) => sendVote(reviewId, helpful),
    onMutate: async (helpful) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<HelpfulVoteResponse>(key)
      queryClient.setQueryData<HelpfulVoteResponse>(key, {
        helpful,
        helpfulCount: Math.max(0, state.helpfulCount + (helpful ? 1 : -1)),
      })
      return { previous }
    },
    onError: (_error, _helpful, context) => {
      queryClient.setQueryData(key, context?.previous)
    },
    onSuccess: (result) => queryClient.setQueryData(key, result),
  })

  return (
    <div className="flex flex-wrap items-center gap-4">
      {canVote ? (
        <button
          type="button"
          aria-pressed={state.helpful}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(!state.helpful)}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-input-border bg-surface px-4 text-sm font-medium hover:bg-surface-raised aria-pressed:border-accent aria-pressed:bg-[#eff6ff] aria-pressed:text-[#1e40af]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 10v12" />
            <path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.4 22H7V10l4-8a3 3 0 0 1 4 3.9z" />
          </svg>
          {state.helpful ? text.markedHelpful : text.markHelpful}
        </button>
      ) : null}
      {state.helpfulCount > 0 ? (
        <p className="text-sm text-muted-foreground">{text.helpful(state.helpfulCount)}</p>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="text-sm text-danger">
          {text.helpfulFailed}
        </p>
      ) : null}
    </div>
  )
}
