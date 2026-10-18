import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchOpenPool, type PoolQuery, type PoolSort } from '../api/orderApi'
import { StateBadge } from '../components/StateBadge'
import { formatDeadline, locationName } from '../utils/orderFormatting'

const FILTER_KEY = 'foc.errands.browse'

const SORTS: { value: PoolSort; label: string }[] = [
  { value: 'deadline', label: 'Nearest pickup deadline' },
  { value: 'reward', label: 'Highest credits' },
  { value: 'pickupLocationName', label: 'Pickup location (A–Z)' },
]

/** F4.4: the filter and sort survive leaving the list and coming back (same browser tab). */
function loadQuery(): PoolQuery {
  try {
    const saved = JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? 'null') as Partial<PoolQuery> | null
    if (saved && SORTS.some((sort) => sort.value === saved.sort)) {
      return {
        minReward: saved.minReward || undefined,
        maxReward: saved.maxReward || undefined,
        sort: saved.sort as PoolSort,
        page: 0,
      }
    }
  } catch {
    // Ignore a corrupted saved filter.
  }
  return { sort: 'deadline', page: 0 }
}

function saveQuery(query: PoolQuery) {
  sessionStorage.setItem(FILTER_KEY, JSON.stringify({ ...query, page: 0 }))
}

export function BrowsePage() {
  const [query, setQuery] = useState<PoolQuery>(loadQuery)
  const [draft, setDraft] = useState({
    minReward: query.minReward ? String(query.minReward) : '',
    maxReward: query.maxReward ? String(query.maxReward) : '',
    sort: query.sort,
  })
  const [formError, setFormError] = useState('')
  const pool = useQuery({
    queryKey: ['orders', 'pool', query],
    queryFn: () => fetchOpenPool(query),
    placeholderData: keepPreviousData,
  })

  const applyFilters = (event: FormEvent) => {
    event.preventDefault()
    const min = draft.minReward ? Number(draft.minReward) : undefined
    const max = draft.maxReward ? Number(draft.maxReward) : undefined
    if ((min !== undefined && !(Number.isInteger(min) && min > 0)) || (max !== undefined && !(Number.isInteger(max) && max > 0))) {
      setFormError('Rewards must be whole numbers of credits, 1 or more.')
      return
    }
    if (min !== undefined && max !== undefined && min > max) {
      setFormError('The minimum reward cannot be more than the maximum.')
      return
    }
    setFormError('')
    const next: PoolQuery = { minReward: min, maxReward: max, sort: draft.sort, page: 0 }
    saveQuery(next)
    setQuery(next)
  }

  const page = pool.data
  return (
    <>
      <div className="page-intro">
        <div>
          <h1>Run an errand</h1>
          <p>Find a campus errand that fits your trip.</p>
        </div>
      </div>
      <nav aria-label="Errand mode" className="tabs">
        <Link className="tab tab-link" to="/errands/new">
          Request help
        </Link>
        <Link aria-current="page" className="tab tab-link" to="/errands/browse">
          Run errands
        </Link>
      </nav>
      <div className="two-column">
        <section aria-labelledby="results-heading">
          <h2 className="visually-hidden" id="results-heading">
            Open errands
          </h2>
          {pool.isPending && <p className="subtle">Loading errands…</p>}
          {pool.isError && (
            <div className="notice notice-error" role="alert">
              We couldn't load errands. {pool.error.message}
            </div>
          )}
          {page && page.items.length === 0 && (
            <div className="card state-panel">
              <h2>No matching errands</h2>
              <p>No open errands match these filters. Try a wider reward range.</p>
            </div>
          )}
          {page && page.items.length > 0 && (
            <>
              <p className="subtle" aria-live="polite">
                {page.totalItems} open {page.totalItems === 1 ? 'errand' : 'errands'}
              </p>
              <ul className="errand-list">
                {page.items.map((order) => (
                  <li className="card errand-card" key={order.id}>
                    <div className="errand-card-head">
                      <h3>{order.title}</h3>
                      <span className="reward">{order.creditReward} cr</span>
                    </div>
                    <p>
                      {locationName(order.pickupLocationName)} → {locationName(order.dropoffLocationName)}
                    </p>
                    <p>Pick up by {formatDeadline(order.pickupDeadline)}</p>
                    <div className="errand-card-foot">
                      <StateBadge state={order.state} />
                      <Link aria-label={`View ${order.title}`} className="text-link" to={`/errands/${order.id}`}>
                        View →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
              {page.totalPages > 1 && (
                <nav aria-label="Pages" className="actions">
                  <button
                    className="button-secondary"
                    disabled={query.page === 0}
                    onClick={() => setQuery({ ...query, page: query.page - 1 })}
                    type="button"
                  >
                    Previous
                  </button>
                  <span className="subtle">
                    Page {page.page + 1} of {page.totalPages}
                  </span>
                  <button
                    className="button-secondary"
                    disabled={query.page + 1 >= page.totalPages}
                    onClick={() => setQuery({ ...query, page: query.page + 1 })}
                    type="button"
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
        <aside aria-labelledby="filters-heading" className="card">
          <h2 id="filters-heading">Find a suitable trip</h2>
          <form className="filter-form" noValidate onSubmit={applyFilters}>
            <label htmlFor="min-reward">Minimum reward</label>
            <input
              id="min-reward"
              inputMode="numeric"
              min={1}
              onChange={(event) => setDraft({ ...draft, minReward: event.target.value })}
              placeholder="Any credits"
              type="number"
              value={draft.minReward}
            />
            <label htmlFor="max-reward">Maximum reward</label>
            <input
              id="max-reward"
              inputMode="numeric"
              min={1}
              onChange={(event) => setDraft({ ...draft, maxReward: event.target.value })}
              placeholder="Any credits"
              type="number"
              value={draft.maxReward}
            />
            <label htmlFor="sort">Sort by</label>
            <select
              id="sort"
              onChange={(event) => setDraft({ ...draft, sort: event.target.value as PoolSort })}
              value={draft.sort}
            >
              {SORTS.map((sort) => (
                <option key={sort.value} value={sort.value}>
                  {sort.label}
                </option>
              ))}
            </select>
            {formError && (
              <p className="notice notice-error" role="alert">
                {formError}
              </p>
            )}
            <button type="submit">Apply filters</button>
          </form>
          <p>Only OPEN errands can be accepted. Your filter and sort choices stay when you return from an errand.</p>
        </aside>
      </div>
    </>
  )
}
