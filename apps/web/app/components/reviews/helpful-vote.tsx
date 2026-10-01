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
    <div className="flex flex-wrap items-center gap-3">
      {canVote ? (
        <button
          type="button"
          aria-pressed={state.helpful}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(!state.helpful)}
          className="rounded-md border border-input-border px-3 py-1.5 text-sm hover:bg-surface aria-pressed:border-link aria-pressed:text-link"
        >
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
