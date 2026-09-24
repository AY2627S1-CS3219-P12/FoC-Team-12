import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  SupplierMutationError,
  type CreateSupplierRequest,
  type SupplierStatus,
  type UpdateSupplierRequest,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
} from '../api/adminSupplierApi'
import type { Supplier } from '../api/supplierQueries'
import {
  SupplierApiError,
  useSupplierDetailQuery,
} from '../api/supplierQueries'
import { Button } from '../components/DirectoryControls'
import { StatePanel } from '../components/DirectoryStates'
import styles from './AdminSupplierFormPage.module.css'

interface SupplierFormValues {
  name: string
  type: string
  building: string
  floor: string
  locationDescription: string
  latitude: string
  longitude: string
  openingTime: string
  closingTime: string
  imageUrl: string
  status: SupplierStatus
}

type FieldErrors = Partial<Record<keyof SupplierFormValues, string>>

const emptyValues: SupplierFormValues = {
  name: '',
  type: '',
  building: '',
  floor: '',
  locationDescription: '',
  latitude: '',
  longitude: '',
  openingTime: '',
  closingTime: '',
  imageUrl: '',
  status: 'ACTIVE',
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function valuesFromSupplier(supplier: Supplier): SupplierFormValues {
  return {
    name: supplier.name ?? '',
    type: supplier.type ?? '',
    building: supplier.building ?? '',
    floor: supplier.floor ?? '',
    locationDescription: supplier.locationDescription ?? '',
    latitude: String(supplier.latitude ?? ''),
    longitude: String(supplier.longitude ?? ''),
    openingTime: supplier.openingTime?.slice(0, 5) ?? '',
    closingTime: supplier.closingTime?.slice(0, 5) ?? '',
    imageUrl: supplier.imageUrl ?? '',
    status: supplier.status ?? 'ACTIVE',
  }
}

function validate(values: SupplierFormValues) {
  const errors: FieldErrors = {}
  const requiredText = [
    ['name', 'Name', 255],
    ['type', 'Category', 100],
    ['building', 'Building', 255],
  ] as const

  for (const [field, label, limit] of requiredText) {
    const value = values[field].trim()
    if (!value) errors[field] = `${label} is required.`
    else if (value.length > limit)
      errors[field] = `${label} must be ${limit} characters or fewer.`
  }
  if (values.floor.trim().length > 20) {
    errors.floor = 'Floor must be 20 characters or fewer.'
  }

  const latitude = Number(values.latitude)
  if (!values.latitude.trim()) errors.latitude = 'Latitude is required.'
  else if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    errors.latitude = 'Latitude must be between -90 and 90.'
  }

  const longitude = Number(values.longitude)
  if (!values.longitude.trim()) errors.longitude = 'Longitude is required.'
  else if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    errors.longitude = 'Longitude must be between -180 and 180.'
  }

  const imageUrl = values.imageUrl.trim()
  if (imageUrl) {
    try {
      const parsed = new URL(imageUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.imageUrl = 'Image URL must begin with http:// or https://.'
      }
    } catch {
      errors.imageUrl = 'Enter a valid absolute image URL.'
    }
  }
  return errors
}

function normalizedDetails(values: SupplierFormValues) {
  const nullable = (value: string) => value.trim() || null
  return {
    name: values.name.trim(),
    type: values.type.trim(),
    building: values.building.trim(),
    floor: nullable(values.floor),
    locationDescription: nullable(values.locationDescription),
    latitude: Number(values.latitude),
    longitude: Number(values.longitude),
    openingTime: nullable(values.openingTime),
    closingTime: nullable(values.closingTime),
    imageUrl: nullable(values.imageUrl),
  }
}

function serverFieldErrors(error: SupplierMutationError) {
  const mapped: FieldErrors = {}
  for (const [field, messages] of Object.entries(error.fieldErrors ?? {})) {
    if (field in emptyValues && messages?.length) {
      mapped[field as keyof SupplierFormValues] = messages.join(' ')
    }
  }
  return mapped
}

export function CreateSupplierPage() {
  const navigate = useNavigate()
  const mutation = useCreateSupplierMutation()
  const [values, setValues] = useState(emptyValues)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submissionError, setSubmissionError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mutation.isPending) return
    const validationErrors = validate(values)
    setErrors(validationErrors)
    setSubmissionError('')
    if (Object.keys(validationErrors).length) return

    const request: CreateSupplierRequest = {
      ...normalizedDetails(values),
      status: values.status,
    }
    try {
      const created = await mutation.mutateAsync(request)
      navigate('/admin/suppliers', {
        replace: true,
        state: { notice: `${created.name} was created successfully.` },
      })
    } catch (error) {
      if (error instanceof SupplierMutationError) {
        setErrors(serverFieldErrors(error))
        setSubmissionError(error.message)
      } else {
        setSubmissionError('The supplier could not be created. Try again.')
      }
    }
  }

  return (
    <SupplierFormLayout
      errors={errors}
      mode="create"
      onChange={(field, value) => {
        setValues((current) => ({ ...current, [field]: value }))
        setErrors((current) => ({ ...current, [field]: undefined }))
      }}
      onSubmit={submit}
      pending={mutation.isPending}
      submissionError={submissionError}
      values={values}
    />
  )
}

export function EditSupplierPage() {
  const { id } = useParams()
  const validId = Boolean(id && uuidPattern.test(id))
  const supplierQuery = useSupplierDetailQuery(id, validId)

  if (!validId) {
    return (
      <StatePanel
        message="The supplier ID in this address is not a valid UUID."
        title="Invalid supplier address"
        tone="error"
      />
    )
  }
  if (supplierQuery.isPending) {
    return <p aria-live="polite">Loading supplier details…</p>
  }
  if (supplierQuery.isError || !supplierQuery.data) {
    return (
      <StatePanel
        actionLabel="Try again"
        message={
          supplierQuery.error instanceof SupplierApiError &&
          supplierQuery.error.status === 404
            ? 'This supplier may have been deleted.'
            : 'Check the connection and retry the request.'
        }
        onAction={() => void supplierQuery.refetch()}
        title={
          supplierQuery.error instanceof SupplierApiError &&
          supplierQuery.error.status === 404
            ? 'Supplier not found'
            : 'Supplier could not be loaded'
        }
        tone="error"
      />
    )
  }

  return (
    <LoadedEditSupplierPage
      key={`${supplierQuery.data.id}-${supplierQuery.data.version}`}
      onRefetch={() => supplierQuery.refetch()}
      supplier={supplierQuery.data}
    />
  )
}

function LoadedEditSupplierPage({
  supplier,
  onRefetch,
}: {
  supplier: Supplier
  onRefetch: () => ReturnType<
    ReturnType<typeof useSupplierDetailQuery>['refetch']
  >
}) {
  const navigate = useNavigate()
  const mutation = useUpdateSupplierMutation()
  const [values, setValues] = useState(() => valuesFromSupplier(supplier))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submissionError, setSubmissionError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (mutation.isPending) return
    const validationErrors = validate(values)
    setErrors(validationErrors)
    setSubmissionError('')
    if (Object.keys(validationErrors).length) return

    const request: UpdateSupplierRequest = {
      ...normalizedDetails(values),
      version: supplier.version!,
    }
    try {
      const updated = await mutation.mutateAsync({ id: supplier.id!, request })
      navigate('/admin/suppliers', {
        replace: true,
        state: { notice: `${updated.name} was updated successfully.` },
      })
    } catch (error) {
      if (error instanceof SupplierMutationError) {
        setErrors(serverFieldErrors(error))
        setSubmissionError(
          error.status === 409
            ? 'This supplier changed after you opened the form. Reload the latest version before editing again.'
            : error.message,
        )
      } else {
        setSubmissionError('The supplier could not be updated. Try again.')
      }
    }
  }

  const reloadLatest = async () => {
    mutation.reset()
    setSubmissionError('')
    const result = await onRefetch()
    if (result.data) {
      setValues(valuesFromSupplier(result.data))
      setErrors({})
    }
  }

  return (
    <SupplierFormLayout
      errors={errors}
      mode="edit"
      onChange={(field, value) => {
        setValues((current) => ({ ...current, [field]: value }))
        setErrors((current) => ({ ...current, [field]: undefined }))
      }}
      onReload={submissionError.includes('changed') ? reloadLatest : undefined}
      onSubmit={submit}
      pending={mutation.isPending}
      submissionError={submissionError}
      supplier={supplier}
      values={values}
    />
  )
}

interface SupplierFormLayoutProps {
  mode: 'create' | 'edit'
  values: SupplierFormValues
  errors: FieldErrors
  pending: boolean
  submissionError: string
  supplier?: Supplier
  onChange: (field: keyof SupplierFormValues, value: string) => void
  onSubmit: (event: FormEvent) => void
  onReload?: () => void
}

function SupplierFormLayout({
  mode,
  values,
  errors,
  pending,
  submissionError,
  supplier,
  onChange,
  onSubmit,
  onReload,
}: SupplierFormLayoutProps) {
  const create = mode === 'create'
  return (
    <section aria-labelledby="supplier-form-heading" className={styles.page}>
      <Link className={styles.backLink} to="/admin/suppliers">
        ← Back to suppliers
      </Link>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Supplier administration</p>
        <h1 id="supplier-form-heading">
          {create ? 'Add campus location' : `Edit ${supplier?.name}`}
        </h1>
        <p>
          {create
            ? 'Create a supplier record using the fields shown in the public directory.'
            : 'This replaces all editable details. Status is managed separately from the list.'}
        </p>
      </header>

      {submissionError && (
        <div className={styles.formError} role="alert">
          <strong>The supplier was not saved.</strong>
          <p>{submissionError}</p>
          {onReload && (
            <Button onClick={onReload} variant="secondary">
              Reload latest version
            </Button>
          )}
        </div>
      )}

      <form className={styles.form} noValidate onSubmit={onSubmit}>
        <fieldset>
          <legend>Supplier details</legend>
          <div className={styles.grid}>
            <FormField error={errors.name} id="supplier-name" label="Name">
              <input
                aria-describedby={
                  errors.name ? 'supplier-name-error' : undefined
                }
                aria-invalid={Boolean(errors.name)}
                id="supplier-name"
                maxLength={255}
                onChange={(event) => onChange('name', event.target.value)}
                required
                value={values.name}
              />
            </FormField>
            <FormField
              error={errors.type}
              id="supplier-type-form"
              label="Category"
            >
              <input
                aria-describedby={
                  errors.type ? 'supplier-type-form-error' : undefined
                }
                aria-invalid={Boolean(errors.type)}
                id="supplier-type-form"
                maxLength={100}
                onChange={(event) => onChange('type', event.target.value)}
                required
                value={values.type}
              />
            </FormField>
            {create && (
              <FormField
                error={errors.status}
                id="supplier-status-form"
                label="Initial status"
              >
                <select
                  aria-describedby={
                    errors.status ? 'supplier-status-form-error' : undefined
                  }
                  aria-invalid={Boolean(errors.status)}
                  id="supplier-status-form"
                  onChange={(event) => onChange('status', event.target.value)}
                  value={values.status}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </FormField>
            )}
            {!create && (
              <div className={styles.readOnlyField}>
                <span>Status</span>
                <strong>
                  {supplier?.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </strong>
                <small>Change status from the supplier list.</small>
              </div>
            )}
            <FormField
              error={errors.building}
              id="supplier-building-form"
              label="Building"
            >
              <input
                aria-describedby={
                  errors.building ? 'supplier-building-form-error' : undefined
                }
                aria-invalid={Boolean(errors.building)}
                id="supplier-building-form"
                maxLength={255}
                onChange={(event) => onChange('building', event.target.value)}
                required
                value={values.building}
              />
            </FormField>
            <FormField error={errors.floor} id="supplier-floor" label="Floor">
              <input
                aria-describedby={
                  errors.floor ? 'supplier-floor-error' : undefined
                }
                aria-invalid={Boolean(errors.floor)}
                id="supplier-floor"
                maxLength={20}
                onChange={(event) => onChange('floor', event.target.value)}
                placeholder="For example, B1 or 1M"
                value={values.floor}
              />
            </FormField>
            <div className={styles.fullWidth}>
              <FormField
                error={errors.locationDescription}
                id="supplier-directions"
                label="Location description / directions"
              >
                <textarea
                  aria-describedby={
                    errors.locationDescription
                      ? 'supplier-directions-error'
                      : undefined
                  }
                  aria-invalid={Boolean(errors.locationDescription)}
                  id="supplier-directions"
                  onChange={(event) =>
                    onChange('locationDescription', event.target.value)
                  }
                  rows={4}
                  value={values.locationDescription}
                />
              </FormField>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Map coordinates</legend>
          <p className={styles.fieldsetHelp}>
            Decimal degrees. Latitude is −90 to 90; longitude is −180 to 180.
          </p>
          <div className={styles.grid}>
            <FormField
              error={errors.latitude}
              id="supplier-latitude"
              label="Latitude"
            >
              <input
                aria-describedby={
                  errors.latitude ? 'supplier-latitude-error' : undefined
                }
                aria-invalid={Boolean(errors.latitude)}
                id="supplier-latitude"
                inputMode="decimal"
                onChange={(event) => onChange('latitude', event.target.value)}
                required
                value={values.latitude}
              />
            </FormField>
            <FormField
              error={errors.longitude}
              id="supplier-longitude"
              label="Longitude"
            >
              <input
                aria-describedby={
                  errors.longitude ? 'supplier-longitude-error' : undefined
                }
                aria-invalid={Boolean(errors.longitude)}
                id="supplier-longitude"
                inputMode="decimal"
                onChange={(event) => onChange('longitude', event.target.value)}
                required
                value={values.longitude}
              />
            </FormField>
          </div>
        </fieldset>

        <fieldset>
          <legend>Hours and image</legend>
          <div className={styles.grid}>
            <FormField
              error={errors.openingTime}
              id="supplier-opening-time"
              label="Opening time"
            >
              <input
                aria-describedby={
                  errors.openingTime ? 'supplier-opening-time-error' : undefined
                }
                aria-invalid={Boolean(errors.openingTime)}
                id="supplier-opening-time"
                onChange={(event) =>
                  onChange('openingTime', event.target.value)
                }
                type="time"
                value={values.openingTime}
              />
            </FormField>
            <FormField
              error={errors.closingTime}
              id="supplier-closing-time"
              label="Closing time"
            >
              <input
                aria-describedby={
                  errors.closingTime ? 'supplier-closing-time-error' : undefined
                }
                aria-invalid={Boolean(errors.closingTime)}
                id="supplier-closing-time"
                onChange={(event) =>
                  onChange('closingTime', event.target.value)
                }
                type="time"
                value={values.closingTime}
              />
            </FormField>
            <div className={styles.fullWidth}>
              <FormField
                error={errors.imageUrl}
                id="supplier-image-url"
                label="Image URL"
              >
                <input
                  aria-describedby={
                    errors.imageUrl ? 'supplier-image-url-error' : undefined
                  }
                  aria-invalid={Boolean(errors.imageUrl)}
                  id="supplier-image-url"
                  onChange={(event) => onChange('imageUrl', event.target.value)}
                  placeholder="https://example.com/location.jpg"
                  type="url"
                  value={values.imageUrl}
                />
              </FormField>
            </div>
          </div>
        </fieldset>

        {!create && supplier && (
          <aside className={styles.recordInfo}>
            <strong>Record information</strong>
            <span>ID: {supplier.id}</span>
            <span>Version: {supplier.version}</span>
            <span>Created: {supplier.createdAt}</span>
          </aside>
        )}

        <div className={styles.actions}>
          <Link to="/admin/suppliers">Cancel</Link>
          <Button disabled={pending} type="submit">
            {pending ? 'Saving…' : create ? 'Create supplier' : 'Save changes'}
          </Button>
        </div>
      </form>
    </section>
  )
}

function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <span className={styles.fieldError} id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
