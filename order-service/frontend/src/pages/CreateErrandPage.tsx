import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { ErrandFormFields } from '../components/ErrandFormFields'
import { ErrandTabs } from '../components/ErrandTabs'
import { Link, useNavigate } from 'react-router-dom'
import { createOrder, fetchOrder, OrderApiError } from '../api/orderApi'
import { fetchCampusLocations, fetchMyCredits } from '../api/sharedApi'
import { credits } from '../utils/orderFormatting'
import {
  EMPTY,
  type Errors,
  type FieldName,
  type Fields,
  validate,
  type BalanceStatus,
  creditCheck,
  RESERVATION_POLL_MS,
  RESERVATION_WAIT_MS,
  reservationOutcome,
} from '../utils/errandForm'

/** Server field names map back to the form's own (both locations report on the drop-off picker). */
function serverErrors(error: OrderApiError): Errors {
  const mapped: Errors = {}
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const message = messages[0]
    if (!message) continue
    if (field === 'locationsDistinct') mapped.dropoffLocationId = message
    else if (field === 'pickupLocationName') mapped.pickupLocationId = message
    else if (field === 'dropoffLocationName') mapped.dropoffLocationId = message
    else if (field in EMPTY) mapped[field as FieldName] = message
  }
  if (Object.keys(mapped).length === 0) mapped.form = error.message
  return mapped
}

/** Figma "Create errand" ("Request a hand"). */
export function CreateErrandPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  // The errand just posted while Credit decides on its reservation; the form stays until then.
  const [posted, setPosted] = useState<{ id: string; reward: number } | null>(null)
  const [slowId, setSlowId] = useState<string | null>(null)
  // A failure message stays until the requester edits the form or posts again.
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const locations = useQuery({
    queryKey: ['campus-locations'],
    queryFn: fetchCampusLocations,
    staleTime: 300_000,
  })
  const balance = useQuery({
    queryKey: ['credits', 'me'],
    queryFn: fetchMyCredits,
  })
  const create = useMutation({
    mutationFn: createOrder,
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      setPosted({ id: order.id, reward: order.creditReward })
    },
    onError: (error) =>
      setErrors(
        error instanceof OrderApiError
          ? error.status === 403 && !error.code
            ? { form: 'Switch to Requester in the header to post an errand.' }
            : serverErrors(error)
          : { form: 'Something went wrong. Please try again.' },
      ),
  })

  const reservation = useQuery({
    queryKey: ['orders', posted?.id],
    queryFn: () => fetchOrder(posted!.id),
    enabled: posted !== null && slowId === null,
    refetchInterval: (query) =>
      query.state.data && query.state.data.state !== 'PENDING_CREDIT'
        ? false
        : RESERVATION_POLL_MS,
  })
  const outcome =
    posted && reservation.data?.id === posted.id
      ? reservationOutcome(
          reservation.data.state,
          reservation.data.terminalReason,
          posted.reward,
        )
      : null
  const failure =
    outcome?.kind === 'failed' && posted?.id !== dismissedId ? outcome : null
  const waiting =
    posted !== null &&
    slowId === null &&
    outcome?.kind !== 'failed' &&
    outcome?.kind !== 'reserved'

  useEffect(() => {
    if (!waiting || !posted) return
    const timer = setTimeout(() => setSlowId(posted.id), RESERVATION_WAIT_MS)
    return () => clearTimeout(timer)
  }, [waiting, posted])

  const outcomeKind = outcome?.kind
  useEffect(() => {
    if (!posted) return
    if (outcomeKind === 'reserved') navigate(`/errands/${posted.id}`)
    else if (outcomeKind === 'failed')
      void queryClient.invalidateQueries({ queryKey: ['credits', 'me'] })
  }, [posted, outcomeKind, navigate, queryClient])

  const update = (name: FieldName) => (value: string) => {
    setFields((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }))
    if (posted) setDismissedId(posted.id)
  }

  const reward = Number(fields.creditReward)
  const rewardIsValid = Number.isInteger(reward) && reward > 0
  const balanceStatus: BalanceStatus = balance.isPending
    ? { kind: 'loading' }
    : balance.isError
      ? { kind: 'unavailable' }
      : balance.data === null || balance.data === undefined
        ? { kind: 'no-account' }
        : { kind: 'loaded', available: balance.data.availableBalance }
  const credit = creditCheck(balanceStatus, rewardIsValid ? reward : null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (waiting) return
    if (posted) setDismissedId(posted.id)
    setSlowId(null)
    const found = validate(fields)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      document.getElementById(`field-${Object.keys(found)[0]}`)?.focus()
      return
    }
    if (!credit.canPost) {
      const blocked =
        balanceStatus.kind === 'loaded'
          ? { creditReward: credit.message ?? undefined }
          : { form: credit.message ?? undefined }
      setErrors(blocked)
      // Other blocks keep the button disabled and are announced by the status message.
      if (balanceStatus.kind === 'loaded') {
        document.getElementById('field-creditReward')?.focus()
      }
      return
    }
    const byId = new Map(
      (locations.data ?? []).map((location) => [location.id, location]),
    )
    create.mutate({
      title: fields.title.trim(),
      description: fields.description.trim(),
      pickupLocationId: fields.pickupLocationId,
      pickupLocationName: byId.get(fields.pickupLocationId)?.name ?? '',
      dropoffLocationId: fields.dropoffLocationId,
      dropoffLocationName: byId.get(fields.dropoffLocationId)?.name ?? '',
      creditReward: Number(fields.creditReward),
      pickupDeadline: new Date(fields.pickupDeadline).toISOString(),
    })
  }

  return (
    <>
      <div className="page-intro">
        <div>
          <h1>Request a hand</h1>
          <p>Tell your courier what to collect and where to bring it.</p>
        </div>
      </div>
      <ErrandTabs />
      <div className="two-column">
        <form
          aria-labelledby="create-heading"
          className="errand-form"
          noValidate
          onSubmit={submit}
        >
          <h2 className="visually-hidden" id="create-heading">
            Errand details
          </h2>
          <fieldset className="errand-fields" disabled={waiting}>
          <ErrandFormFields
            errors={errors}
            fields={fields}
            locations={locations.data}
            locationsFailed={locations.isError}
            maxReward={balance.data?.availableBalance}
            onChange={update}
            rewardHint="Reserved from your credits when you post."
          />
          </fieldset>
          {errors.form && (
            <p className="notice notice-error" role="alert">
              {errors.form}
            </p>
          )}
          {failure && (
            <p className="notice notice-error" role="alert">
              {failure.message}
              {failure.setUpCredits && (
                <>
                  {' '}
                  <a className="text-link" href="/credits">
                    Set up your credits
                  </a>
                </>
              )}
            </p>
          )}
          {slowId && (
            <p className="notice notice-next" role="status">
              Credit is taking longer than usual. Your errand will open once your
              credits are reserved.{' '}
              <Link className="text-link" to={`/errands/${slowId}`}>
                View errand
              </Link>
            </p>
          )}
          <div className="actions">
            <button
              aria-describedby={
                credit.message ? 'credit-check-message' : undefined
              }
              disabled={create.isPending || waiting || !credit.canPost}
              id="submit-errand"
              type="submit"
            >
              {create.isPending
                ? 'Posting…'
                : waiting
                  ? 'Reserving your credits…'
                  : 'Post errand'}
            </button>
          </div>
          {credit.message && (
            <p
              className="notice notice-warn"
              id="credit-check-message"
              role="status"
            >
              {credit.message}
              {balanceStatus.kind === 'no-account' && (
                <>
                  {' '}
                  <a className="text-link" href="/credits">
                    Set up your credits
                  </a>
                </>
              )}
            </p>
          )}
        </form>
        <aside aria-labelledby="credits-heading" className="card">
          <h2 id="credits-heading">Your credits</h2>
          {balance.isPending && <p>Loading your balance…</p>}
          {balance.isError && <p>Your balance is unavailable right now.</p>}
          {balance.isSuccess && balance.data === null && (
            <p>Your credit account isn't set up yet.</p>
          )}
          {balance.data && (
            <>
              <div className="balance-tiles">
                <div>
                  <strong>{balance.data.availableBalance} cr</strong>
                  <span>Available</span>
                </div>
                <div>
                  <strong>{balance.data.reservedBalance} cr</strong>
                  <span>Reserved</span>
                </div>
              </div>
              <dl className="facts">
                <dt>Reserve for this errand</dt>
                <dd>{rewardIsValid ? credits(reward) : '—'}</dd>
                <dt>Available after posting</dt>
                <dd>
                  {rewardIsValid
                    ? credits(
                        Math.max(0, balance.data.availableBalance - reward),
                      )
                    : '—'}
                </dd>
              </dl>
            </>
          )}
        </aside>
      </div>
    </>
  )
}
