import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createOrder, OrderApiError } from '../api/orderApi'
import {
  type CampusLocation,
  fetchCampusLocations,
  fetchMyCredits,
} from '../api/sharedApi'
import { readSession } from '../auth/session'
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
  const session = readSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
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
      navigate(`/errands/${order.id}`)
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

  const update = (name: FieldName) => (value: string) => {
    setFields((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validate(fields)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      document.getElementById(`field-${Object.keys(found)[0]}`)?.focus()
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

  const reward = Number(fields.creditReward)
  const rewardIsValid = Number.isInteger(reward) && reward > 0

  return (
    <>
      <div className="page-intro">
        <div>
          <h1>Request a hand</h1>
          <p>Tell your courier what to collect and where to bring it.</p>
        </div>
      </div>
      <nav aria-label="Errand mode" className="tabs">
        <Link aria-current="page" className="tab tab-link" to="/errands/new">
          Request help
        </Link>
        <Link className="tab tab-link" to="/errands/browse">
          Run errands
        </Link>
      </nav>
      {session?.role !== 'REQUESTER' && (
        <div className="notice notice-next">
          Posting errands needs a Requester session. Switch to Requester in the
          header.
        </div>
      )}
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
          {errors.form && (
            <p className="notice notice-error" role="alert">
              {errors.form}
            </p>
          )}
          <div className="actions">
            <button disabled={create.isPending} type="submit">
              {create.isPending ? 'Posting…' : 'Post errand'}
            </button>
          </div>
        </form>
        <aside aria-labelledby="credits-heading" className="card">
          <h2 id="credits-heading">Your credits</h2>
          {balance.isPending && <p>Loading your balance…</p>}
          {balance.isError && (
            <p>Your balance is unavailable right now. You can still post.</p>
          )}
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
                    ? credits(balance.data.availableBalance - reward)
                    : '—'}
                </dd>
              </dl>
              {rewardIsValid && reward > balance.data.availableBalance && (
                <p className="notice notice-warn" role="status">
                  You don't have enough available credits for this reward, so
                  the errand won't open.
                </p>
              )}
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
