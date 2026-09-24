import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import {
  useSupplierListQuery,
  useSupplierMetadataQuery,
} from '../api/supplierQueries'
import { Button, Field, SelectField } from '../components/DirectoryControls'
import {
  StatePanel,
  SupplierCardSkeletons,
} from '../components/DirectoryStates'
import { Pagination } from '../components/Pagination'
import { SupplierCard } from '../components/SupplierCard'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import styles from './SupplierDirectoryPage.module.css'

const PAGE_SIZE = 12
const DEFAULT_SORT = 'name,asc'

const sortOptions = [
  ['name,asc', 'Name (A–Z)'],
  ['name,desc', 'Name (Z–A)'],
  ['type,asc', 'Category (A–Z)'],
  ['building,asc', 'Building (A–Z)'],
  ['openingTime,asc', 'Opening time (earliest)'],
  ['openingTime,desc', 'Opening time (latest)'],
  ['closingTime,asc', 'Closing time (earliest)'],
  ['closingTime,desc', 'Closing time (latest)'],
] as const

const allowedSorts = new Set<string>(sortOptions.map(([value]) => value))

function safePage(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return 0
  return Number(value)
}

export function SupplierDirectoryPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSearch = searchParams.get('search') ?? ''
  const type = searchParams.get('type') ?? ''
  const building = searchParams.get('building') ?? ''
  const page = safePage(searchParams.get('page'))
  const requestedSort = searchParams.get('sort') ?? DEFAULT_SORT
  const sort = allowedSorts.has(requestedSort) ? requestedSort : DEFAULT_SORT

  const updateParameter = (name: string, value: string, resetPage = true) => {
    const next = new URLSearchParams(searchParams)
    if (value && !(name === 'sort' && value === DEFAULT_SORT)) {
      next.set(name, value)
    } else {
      next.delete(name)
    }
    if (resetPage) next.delete('page')
    setSearchParams(next)
  }

  const clearFilters = () => {
    setSearchParams(new URLSearchParams())
  }

  const updateSearch = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('search', value)
    else next.delete('search')
    next.delete('page')
    setSearchParams(next, { replace: true })
  }

  const suppliers = useSupplierListQuery({
    search: urlSearch || undefined,
    type: type || undefined,
    building: building || undefined,
    page,
    size: PAGE_SIZE,
    sort,
  })
  const metadata = useSupplierMetadataQuery()
  const items = suppliers.data?.items ?? []
  const totalItems = suppliers.data?.totalItems ?? 0
  const totalPages = suppliers.data?.totalPages ?? 0
  const returnTo = `${location.pathname}${location.search}`
  const hasFilters = Boolean(
    urlSearch || type || building || sort !== DEFAULT_SORT,
  )

  return (
    <section aria-labelledby="supplier-heading" className={styles.page}>
      <header className={styles.pageHeading}>
        <p className={styles.eyebrow}>Explore campus</p>
        <h1 id="supplier-heading">Campus locations</h1>
        <p>
          Find active food, coffee, printing, and shopping locations across
          campus.
        </p>
      </header>

      <div aria-label="Filter campus locations" className={styles.filters}>
        <div className={styles.searchField}>
          <SearchControl
            key={urlSearch}
            onDebouncedChange={updateSearch}
            value={urlSearch}
          />
        </div>
        <SelectField
          id="supplier-type"
          label="Category"
          onChange={(event) => updateParameter('type', event.target.value)}
          value={type}
        >
          <option value="">All categories</option>
          {(metadata.data?.types ?? []).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="supplier-building"
          label="Building"
          onChange={(event) => updateParameter('building', event.target.value)}
          value={building}
        >
          <option value="">All buildings</option>
          {(metadata.data?.buildings ?? []).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="supplier-sort"
          label="Sort by"
          onChange={(event) => updateParameter('sort', event.target.value)}
          value={sort}
        >
          {sortOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      </div>

      {hasFilters && (
        <div className={styles.clearRow}>
          <Button onClick={clearFilters} variant="secondary">
            Clear filters
          </Button>
        </div>
      )}

      <div className={styles.resultsHeading}>
        <p aria-live="polite">
          {suppliers.isPending
            ? 'Loading locations…'
            : `${totalItems} active ${totalItems === 1 ? 'location' : 'locations'}`}
        </p>
        {suppliers.isFetching && !suppliers.isPending && (
          <span>Updating results…</span>
        )}
      </div>

      {suppliers.isPending && <SupplierCardSkeletons />}
      {suppliers.isError && (
        <StatePanel
          actionLabel="Try again"
          message="Your filters are still here. Check the connection and retry the directory request."
          onAction={() => void suppliers.refetch()}
          title="Locations could not be loaded"
          tone="error"
        />
      )}
      {suppliers.isSuccess && items.length === 0 && (
        <StatePanel
          actionLabel="Clear filters"
          message="No active campus locations match the current search and filters."
          onAction={clearFilters}
          title="No locations found"
        />
      )}
      {items.length > 0 && (
        <div className={styles.cardGrid}>
          {items.map((supplier) => (
            <SupplierCard
              key={supplier.id}
              returnTo={returnTo}
              supplier={supplier}
            />
          ))}
        </div>
      )}

      <Pagination
        onPageChange={(nextPage) =>
          updateParameter('page', String(nextPage), false)
        }
        page={page}
        totalPages={totalPages}
      />
    </section>
  )
}

function SearchControl({
  value,
  onDebouncedChange,
}: {
  value: string
  onDebouncedChange: (value: string) => void
}) {
  const [inputValue, setInputValue] = useState(value)
  const debouncedValue = useDebouncedValue(inputValue, 300)

  useEffect(() => {
    const normalized = debouncedValue.trim()
    if (normalized !== value) onDebouncedChange(normalized)
  }, [debouncedValue, onDebouncedChange, value])

  return (
    <Field id="supplier-search" label="Search locations">
      <input
        autoComplete="off"
        id="supplier-search"
        onChange={(event) => setInputValue(event.target.value)}
        placeholder="Search by name, building, or directions"
        type="search"
        value={inputValue}
      />
    </Field>
  )
}
