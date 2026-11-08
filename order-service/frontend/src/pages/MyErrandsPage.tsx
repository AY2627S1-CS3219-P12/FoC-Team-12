import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowRight, ClipboardList, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchMyOrders, type Order, type OrderState } from '../api/orderApi'
import { ErrandTabs } from '../components/ErrandTabs'
import { RouteLine } from '../components/RouteLine'
import { ErrandListSkeleton } from '../components/Skeleton'
import { StateBadge } from '../components/StateBadge'
import { StatePanel } from '../components/StatePanel'
import { useSessionRole } from '../hooks/useSessionRole'
import { credits, formatDeadline, REPOSTABLE_STATES, repostPath, stateLabel } from '../utils/orderFormatting'

type Kind = 'requested' | 'delivered'
type Status = 'active' | 'past'

const LISTS: {
  value: Kind
  activeEmpty: string
  pastEmpty: string
  pastStates: OrderState[]
}[] = [
  {
    value: 'requested',
    activeEmpty: 'Errands you post appear here until they finish. Request help to post one.',
    pastEmpty: 'Errands you requested appear here once they’re completed, cancelled or expired.',
    pastStates: ['COMPLETED', 'CANCELLED', 'EXPIRED'],
  },
  {
    value: 'delivered',
    activeEmpty: 'Errands you accept appear here until the requester confirms receipt.',
    pastEmpty: 'Errands you delivered appear here once the requester confirms receipt.',
    pastStates: ['COMPLETED'],
  },
]

/** F9: the caller's errands for the current role, in progress and finished. */
export function MyErrandsPage() {
  // The header role switch picks the list: Requester sees errands they posted, Courier errands they run.
  const kind: Kind = useSessionRole() === 'COURIER' ? 'delivered' : 'requested'
  const current = LISTS.find((item) => item.value === kind)!

  return (
    <>
      <div className="page-intro">
        <div>
          <h1>My errands</h1>
          <p>
            {kind === 'requested'
              ? 'Errands you posted, in progress and finished.'
              : 'Errands you’re running and have delivered.'}
          </p>
        </div>
      </div>
      <ErrandTabs />
      <ErrandSection empty={current.activeEmpty} key={`${kind}-active`} kind={kind} status="active" title="Active" />
      <ErrandSection
        empty={current.pastEmpty}
        key={`${kind}-past`}
        kind={kind}
        states={current.pastStates}
        status="past"
        title="Past"
      />
    </>
  )
}

function ErrandSection({
  kind,
  status,
  title,
  empty,
  states = [],
}: {
  kind: Kind
  status: Status
  title: string
  empty: string
  states?: OrderState[]
}) {
  const [page, setPage] = useState(0)
  const [state, setState] = useState<OrderState | undefined>()
  const list = useQuery({
    queryKey: ['orders', 'mine', kind, status, state, page],
    queryFn: () => fetchMyOrders(kind, status, page, state),
    placeholderData: keepPreviousData,
  })
  const headingId = `${kind}-${status}-heading`

  return (
    <section aria-labelledby={headingId} className="my-errands-section">
      <div className="my-errands-section-head">
        <h2 className="section-title" id={headingId}>
          {title}
          {list.data && list.data.totalItems > 0 && <span className="record-count">{list.data.totalItems}</span>}
        </h2>
        {states.length > 1 && (
          <div aria-label={`Filter ${title.toLowerCase()} errands`} className="filter-chips" role="group">
            {[undefined, ...states].map((value) => (
              <button
                aria-pressed={state === value}
                className="filter-chip"
                key={value ?? 'all'}
                onClick={() => {
                  setState(value)
                  setPage(0)
                }}
                type="button"
              >
                {value ? stateLabel(value) : 'All'}
              </button>
            ))}
          </div>
        )}
      </div>
      {list.isPending && <ErrandListSkeleton count={2} label="Loading your errands…" />}
      {list.isError && (
        <div className="notice notice-error" role="alert">
          We couldn't load your errands. {list.error.message}
        </div>
      )}
      {list.data && list.data.items.length === 0 && (
        <StatePanel
          action={
            status === 'active' && (
              <Link className="button-secondary" to={kind === 'requested' ? '/errands/new' : '/errands/browse'}>
                {kind === 'requested' ? 'Request help' : 'Find errands'}
              </Link>
            )
          }
          compact
          headingLevel={3}
          icon={ClipboardList}
          title={state ? `No ${stateLabel(state).toLowerCase()} errands` : `No ${title.toLowerCase()} errands`}
        >
          {state ? 'Choose another status to see more.' : empty}
        </StatePanel>
      )}
      {list.data && list.data.items.length > 0 && (
        <>
          <ul className="errand-list">
            {list.data.items.map((order) => (
              <ErrandCard canRepost={kind === 'requested'} key={order.id} order={order} status={status} />
            ))}
          </ul>
          {list.data.totalPages > 1 && (
            <nav aria-label={`${title} pages`} className="actions">
              <button
                className="button-secondary"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                type="button"
              >
                Previous
              </button>
              <span className="subtle">
                Page {list.data.page + 1} of {list.data.totalPages}
              </span>
              <button
                className="button-secondary"
                disabled={page + 1 >= list.data.totalPages}
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
  )
}

function ErrandCard({ order, status, canRepost }: { order: Order; status: Status; canRepost: boolean }) {
  return (
    <li className="card errand-card">
      <div className="errand-card-head">
        <h3>{order.title}</h3>
        <span className="reward">{order.creditReward} cr</span>
      </div>
      <RouteLine order={order} />
      <p>
        {status === 'active'
          ? `Pick up by ${formatDeadline(order.pickupDeadline)}`
          : `Finished ${formatDeadline(order.stateChangedAt)}`}
      </p>
      {status === 'active' && order.pendingCreditReward !== null && (
        <p className="subtle">Reward change to {credits(order.pendingCreditReward)} pending</p>
      )}
      <div className="errand-card-foot">
        <StateBadge state={order.state} />
        <div className="errand-card-links">
          {canRepost && REPOSTABLE_STATES.includes(order.state) && (
            <Link aria-label={`Post ${order.title} again`} className="text-link" to={repostPath(order.id)}>
              <RotateCcw aria-hidden="true" /> Post again
            </Link>
          )}
          <Link aria-label={`View ${order.title}`} className="text-link" to={`/errands/${order.id}`}>
            View <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </li>
  )
}
