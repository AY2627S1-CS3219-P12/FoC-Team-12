import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchMyOrders, type Order } from '../api/orderApi'
import { ErrandTabs } from '../components/ErrandTabs'
import { StateBadge } from '../components/StateBadge'
import { formatDeadline, locationName } from '../utils/orderFormatting'

type Tab = 'requested' | 'delivered'

const TABS: { value: Tab; label: string; empty: string }[] = [
  {
    value: 'requested',
    label: 'Errands I requested',
    empty:
      "Errands you requested appear here once they're completed, cancelled or expired.",
  },
  {
    value: 'delivered',
    label: 'Errands I delivered',
    empty:
      'Errands you delivered appear here once the requester confirms receipt.',
  },
]

/** F9: the requester's finished errands (F9.1) and the courier's completed deliveries (F9.2). */
export function MyErrandsPage() {
  const [tab, setTab] = useState<Tab>('requested')
  const [page, setPage] = useState(0)
  const history = useQuery({
    queryKey: ['orders', 'mine', tab, page],
    queryFn: () => fetchMyOrders(tab, page),
    placeholderData: keepPreviousData,
  })
  const current = TABS.find((item) => item.value === tab)!

  return (
    <>
      <div className="page-intro">
        <div>
          <h1>My errands</h1>
          <p>Errands you've finished, as a requester or as a courier.</p>
        </div>
      </div>
      <ErrandTabs />
      <div aria-label="Errand history" className="tabs" role="tablist">
        {TABS.map((item) => (
          <button
            aria-controls="history-panel"
            aria-selected={tab === item.value}
            className="tab"
            id={`tab-${item.value}`}
            key={item.value}
            onClick={() => {
              setTab(item.value)
              setPage(0)
            }}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <section
        aria-labelledby={`tab-${tab}`}
        id="history-panel"
        role="tabpanel"
      >
        {history.isPending && <p className="subtle">Loading your errands…</p>}
        {history.isError && (
          <div className="notice notice-error" role="alert">
            We couldn't load your errands. {history.error.message}
          </div>
        )}
        {history.data && history.data.items.length === 0 && (
          <div className="card state-panel">
            <h2>Nothing here yet</h2>
            <p>{current.empty}</p>
          </div>
        )}
        {history.data && history.data.items.length > 0 && (
          <>
            <ul className="errand-list">
              {history.data.items.map((order) => (
                <HistoryCard key={order.id} order={order} />
              ))}
            </ul>
            {history.data.totalPages > 1 && (
              <nav aria-label="Pages" className="actions">
                <button
                  className="button-secondary"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  type="button"
                >
                  Previous
                </button>
                <span className="subtle">
                  Page {history.data.page + 1} of {history.data.totalPages}
                </span>
                <button
                  className="button-secondary"
                  disabled={page + 1 >= history.data.totalPages}
                  onClick={() => setPage(page + 1)}
                  type="button"
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </>
  )
}

function HistoryCard({ order }: { order: Order }) {
  return (
    <li className="card errand-card">
      <div className="errand-card-head">
        <h3>{order.title}</h3>
        <span className="reward">{order.creditReward} cr</span>
      </div>
      <p>
        {locationName(order.pickupLocationName)} →{' '}
        {locationName(order.dropoffLocationName)}
      </p>
      <p>Finished {formatDeadline(order.stateChangedAt)}</p>
      <div className="errand-card-foot">
        <StateBadge state={order.state} />
        <Link
          aria-label={`View ${order.title}`}
          className="text-link"
          to={`/errands/${order.id}`}
        >
          View →
        </Link>
      </div>
    </li>
  )
}
