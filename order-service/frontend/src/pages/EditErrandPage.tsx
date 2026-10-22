import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchHistory, fetchOrder, type Order, OrderApiError, updateOrder } from '../api/orderApi'
import { fetchCampusLocations, fetchMyCredits } from '../api/sharedApi'
import { readSession } from '../auth/session'
import { ErrandFormFields } from '../components/ErrandFormFields'
import {
  type BalanceStatus,
  EMPTY,
  type Errors,
  type FieldName,
  type Fields,
  fieldsFromOrder,
  RESERVATION_POLL_MS,
  RESERVATION_WAIT_MS,
  rewardChangeCheck,
  rewardChangeOutcome,
  validate,
} from '../utils/errandForm'
import { credits } from '../utils/orderFormatting'

/** Why the server refused the edit, in the requester's words. */
const EDIT_ERRORS: Record<string, string> = {
  INVALID_STATE_TRANSITION: 'This errand is no longer open, so it can’t be edited.',
  ORDER_EXPIRED: 'This errand expired, so it can’t be edited.',
  REWARD_ADJUSTMENT_PENDING: 'A reward change is still waiting for Credit. Try again once it finishes.',
  VERSION_CONFLICT: 'This errand changed since you opened it. Reload to see the latest before editing.',
  NOT_ORDER_REQUESTER: 'Only the requester can edit this errand.',
}

function serverErrors(error: unknown): { errors: Errors; stale: boolean } {
  if (!(error instanceof OrderApiError)) return { errors: { form: 'Something went wrong. Please try again.' }, stale: false }
  if (error.status === 403 && !error.code) return { errors: { form: 'Switch to Requester in the header to edit.' }, stale: false }
  if (error.code && EDIT_ERRORS[error.code]) return { errors: { form: EDIT_ERRORS[error.code] }, stale: true }
  const mapped: Errors = {}
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const message = messages[0]
    if (!message) continue
    if (field === 'locationsDistinct' || field === 'dropoffLocationName') mapped.dropoffLocationId = message
    else if (field === 'pickupLocationName') mapped.pickupLocationId = message
    else if (field in EMPTY) mapped[field as FieldName] = message
  }
  if (Object.keys(mapped).length === 0) mapped.form = error.message
  return { errors: mapped, stale: false }
}

/** Edit an OPEN errand (the requester only). A reward change waits for Credit before leaving. */
export function EditErrandPage() {
  const { orderId = '' } = useParams()
  const errand = useQuery({ queryKey: ['orders', orderId], queryFn: () => fetchOrder(orderId) })

  if (errand.isPending) return <p className="subtle">Loading errand…</p>
  if (errand.isError)
    return (
      <section className="card state-panel">
        <h2>We couldn't load this errand</h2>
        <p>{errand.error.message}</p>
        <Link className="text-link" to="/errands/mine">
          Back to my errands
        </Link>
      </section>
    )
  const order = errand.data
  const editable =
    order.requesterId === readSession()?.userId && order.state === 'OPEN' && order.pendingCreditReward === null
  if (!editable)
    return (
      <section className="card state-panel">
        <h2>This errand can’t be edited</h2>
        <p>
          {order.pendingCreditReward !== null
            ? 'A reward change is still waiting for Credit.'
            : 'Only open errands can be edited, by the person who posted them.'}
        </p>
        <Link className="text-link" to={`/errands/${order.id}`}>
          Back to the errand
        </Link>
      </section>
    )
  return <EditForm key={order.version} order={order} />
}

function EditForm({ order }: { order: Order }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [fields, setFields] = useState<Fields>(() => fieldsFromOrder(order))
  const [errors, setErrors] = useState<Errors>({})
  const [stale, setStale] = useState(false)
  // A saved reward change, while Credit decides; the form stays until then.
  const [awaiting, setAwaiting] = useState<{ reward: number; version: number } | null>(null)
  const [slow, setSlow] = useState(false)
  // A rejection message stays until the requester edits a field.
  const [dismissedVersion, setDismissedVersion] = useState<number | null>(null)
  const locations = useQuery({ queryKey: ['campus-locations'], queryFn: fetchCampusLocations, staleTime: 300_000 })
  const balance = useQuery({ queryKey: ['credits', 'me'], queryFn: fetchMyCredits })

  const save = useMutation({
    mutationFn: () => {
      const byId = new Map((locations.data ?? []).map((location) => [location.id, location]))
      return updateOrder(order.id, {
        version: base.version,
        title: fields.title.trim(),
        description: fields.description.trim(),
        pickupLocationId: fields.pickupLocationId,
        pickupLocationName: byId.get(fields.pickupLocationId)?.name ?? base.pickupLocationName ?? '',
        dropoffLocationId: fields.dropoffLocationId,
        dropoffLocationName: byId.get(fields.dropoffLocationId)?.name ?? base.dropoffLocationName ?? '',
        creditReward: Number(fields.creditReward),
        pickupDeadline: new Date(fields.pickupDeadline).toISOString(),
      })
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['orders', 'mine'] })
      setSlow(false)
      if (updated.pendingCreditReward !== null) {
        setAwaiting({ reward: updated.pendingCreditReward, version: updated.version })
        return
      }
      queryClient.setQueryData(['orders', order.id], updated)
      navigate(`/errands/${order.id}`)
    },
    onError: (error) => {
      const { errors: found, stale: changed } = serverErrors(error)
      setErrors(found)
      setStale(changed)
    },
  })

  const pollable = awaiting !== null && !slow
  const latest = useQuery({
    // Keyed by the saved version so a later save never reads an earlier answer.
    queryKey: ['orders', order.id, 'reward-change', awaiting?.version],
    queryFn: async () => {
      const [current, history] = await Promise.all([fetchOrder(order.id), fetchHistory(order.id)])
      return { current, history }
    },
    enabled: pollable,
    refetchInterval: (query) =>
      query.state.data && query.state.data.current.pendingCreditReward === null ? false : RESERVATION_POLL_MS,
  })
  const outcome =
    awaiting && latest.data
      ? rewardChangeOutcome(latest.data.current, latest.data.history, awaiting.reward, awaiting.version)
      : null
  const outcomeKind = outcome?.kind
  const rejected =
    outcome?.kind === 'rejected' && awaiting?.version !== dismissedVersion ? outcome.message : null
  const waiting = pollable && (outcomeKind === undefined || outcomeKind === 'waiting')

  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => setSlow(true), RESERVATION_WAIT_MS)
    return () => clearTimeout(timer)
  }, [waiting])

  const answered = latest.data?.current
  useEffect(() => {
    if (!answered || !outcomeKind || outcomeKind === 'waiting') return
    void queryClient.invalidateQueries({ queryKey: ['credits', 'me'] })
    if (outcomeKind === 'rejected') return
    queryClient.setQueryData(['orders', order.id], answered)
    navigate(`/errands/${order.id}`)
  }, [answered, outcomeKind, navigate, order.id, queryClient])

  const update = (name: FieldName) => (value: string) => {
    setFields((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }))
    if (awaiting) setDismissedVersion(awaiting.version)
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
  // After a rejection the saved errand is newer than the one this form opened with.
  const base = outcomeKind === 'rejected' && answered ? answered : order
  const credit = rewardChangeCheck(balanceStatus, base.creditReward, rewardIsValid ? reward : null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (waiting || stale) return
    if (awaiting) setDismissedVersion(awaiting.version)
    const found = validate(fields)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      document.getElementById(`field-${Object.keys(found)[0]}`)?.focus()
      return
    }
    if (!credit.canSave) {
      if (balanceStatus.kind === 'loaded') {
        setErrors({ creditReward: credit.message ?? undefined })
        document.getElementById('field-creditReward')?.focus()
      }
      return
    }
    save.mutate()
  }

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders', order.id] })
  }

  return (
    <>
      <div className="back-row">
        <Link className="text-link" to={`/errands/${order.id}`}>
          ← Back to the errand
        </Link>
      </div>
      <div className="page-intro">
        <div>
          <h1>Edit errand</h1>
          <p>Couriers see your changes straight away. A new reward applies once Credit confirms it.</p>
        </div>
      </div>
      <div className="two-column">
        <form aria-labelledby="edit-heading" className="errand-form" noValidate onSubmit={submit}>
          <h2 className="visually-hidden" id="edit-heading">
            Errand details
          </h2>
          <fieldset className="errand-fields" disabled={waiting || stale}>
            <ErrandFormFields
              errors={errors}
              fields={fields}
              locations={locations.data}
              locationsFailed={locations.isError}
              maxReward={balance.data ? base.creditReward + balance.data.availableBalance : undefined}
              onChange={update}
              rewardHint={`Currently ${credits(base.creditReward)} reserved. Raising it reserves the difference.`}
            />
          </fieldset>
          {errors.form && (
            <p className="notice notice-error" role="alert">
              {errors.form}{' '}
              {stale && (
                <button className="button-link" onClick={reload} type="button">
                  Reload errand
                </button>
              )}
            </p>
          )}
          {rejected && (
            <p className="notice notice-error" role="alert">
              {rejected}
            </p>
          )}
          {slow && awaiting && (
            <p className="notice notice-next" role="status">
              Credit is taking longer than usual. Your other changes are saved; the reward changes to{' '}
              {credits(awaiting.reward)} once Credit confirms.{' '}
              <Link className="text-link" to={`/errands/${order.id}`}>
                View errand
              </Link>
            </p>
          )}
          <div className="actions">
            <button
              aria-describedby={credit.message ? 'reward-check-message' : undefined}
              disabled={save.isPending || waiting || stale || !credit.canSave}
              type="submit"
            >
              {save.isPending ? 'Saving…' : waiting ? 'Updating your reward…' : 'Save changes'}
            </button>
            <Link className="button-secondary" to={`/errands/${order.id}`}>
              Cancel
            </Link>
          </div>
          {credit.message && (
            <p className="notice notice-warn" id="reward-check-message" role="status">
              {credit.message}
            </p>
          )}
        </form>
        <aside aria-labelledby="credits-heading" className="card">
          <h2 id="credits-heading">Your credits</h2>
          {balance.isPending && <p>Loading your balance…</p>}
          {balance.isError && <p>Your balance is unavailable right now.</p>}
          {balance.data && (
            <dl className="facts">
              <dt>Reserved for this errand</dt>
              <dd>{credits(base.creditReward)}</dd>
              <dt>Available</dt>
              <dd>{credits(balance.data.availableBalance)}</dd>
              <dt>Change</dt>
              <dd>
                {rewardIsValid && reward !== base.creditReward
                  ? `${reward > base.creditReward ? 'Reserve' : 'Release'} ${credits(Math.abs(reward - base.creditReward))}`
                  : 'None'}
              </dd>
            </dl>
          )}
        </aside>
      </div>
    </>
  )
}
