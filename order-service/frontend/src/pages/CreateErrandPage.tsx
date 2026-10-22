import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'
import { ErrandTabs } from '../components/ErrandTabs'
import { Link, useNavigate } from 'react-router-dom'
import { createOrder, fetchOrder, OrderApiError } from '../api/orderApi'
import {
  type CampusLocation,
  fetchCampusLocations,
  fetchMyCredits,
} from '../api/sharedApi'
import { credits } from '../utils/orderFormatting'
import {
  DESCRIPTION_MAX,
  EMPTY,
  type Errors,
  type FieldName,
  type Fields,
  locationLabel,
  TITLE_MAX,
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
          <Field error={errors.title} id="field-title" label="Errand title">
            <input
              aria-describedby={errors.title ? 'field-title-error' : undefined}
              aria-invalid={Boolean(errors.title)}
              id="field-title"
              maxLength={TITLE_MAX}
              onChange={(event) => update('title')(event.target.value)}
              placeholder="Collect my printed notes"
              value={fields.title}
            />
          </Field>
          <LocationField
            error={errors.pickupLocationId}
            id="field-pickupLocationId"
            label="Pickup location"
            locations={locations.data}
            loadError={locations.isError}
            onChange={update('pickupLocationId')}
            value={fields.pickupLocationId}
          />
          <LocationField
            error={errors.dropoffLocationId}
            id="field-dropoffLocationId"
            label="Drop-off location"
            locations={locations.data}
            loadError={locations.isError}
            onChange={update('dropoffLocationId')}
            value={fields.dropoffLocationId}
          />
          <Field
            error={errors.pickupDeadline}
            hint="If nobody accepts by this time, your request expires."
            id="field-pickupDeadline"
            label="Pick up by"
          >
            <input
              aria-describedby="field-pickupDeadline-hint"
              aria-invalid={Boolean(errors.pickupDeadline)}
              id="field-pickupDeadline"
              onChange={(event) => update('pickupDeadline')(event.target.value)}
              type="datetime-local"
              value={fields.pickupDeadline}
            />
          </Field>
          <Field
            error={errors.creditReward}
            hint="Reserved from your credits when you post."
            id="field-creditReward"
            label="Reward (credits)"
          >
            <input
              aria-describedby="field-creditReward-hint"
              aria-invalid={Boolean(errors.creditReward)}
              id="field-creditReward"
              inputMode="numeric"
              max={balance.data?.availableBalance}
              min={1}
              onChange={(event) => update('creditReward')(event.target.value)}
              placeholder="3"
              type="number"
              value={fields.creditReward}
            />
          </Field>
          <Field
            error={errors.description}
            id="field-description"
            label="Description"
          >
            <textarea
              aria-invalid={Boolean(errors.description)}
              id="field-description"
              maxLength={DESCRIPTION_MAX}
              onChange={(event) => update('description')(event.target.value)}
              placeholder="What to collect, who to ask, where to meet."
              rows={4}
              value={fields.description}
            />
          </Field>
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

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

function LocationField({
  id,
  label,
  value,
  onChange,
  locations,
  loadError,
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  locations: CampusLocation[] | undefined
  loadError: boolean
  error?: string
}) {
  return (
    <Field
      error={
        error ??
        (loadError ? 'Campus locations are unavailable right now.' : undefined)
      }
      id={id}
      label={label}
    >
      <select
        aria-invalid={Boolean(error)}
        disabled={!locations}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">
          {locations ? 'Choose a campus location' : 'Loading locations…'}
        </option>
        {locations?.map((location) => (
          <option key={location.id} value={location.id}>
            {locationLabel(location)}
          </option>
        ))}
      </select>
    </Field>
  )
}
