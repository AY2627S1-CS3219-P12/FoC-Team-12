import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchOrder, type Order, type OrderAction, OrderApiError, performAction } from '../api/orderApi'
import { readSession } from '../auth/session'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ProgressCard } from '../components/ProgressCard'
import { RouteSummary } from '../components/RouteSummary'
import { StateBadge } from '../components/StateBadge'
import { credits, errandReference, formatDeadline } from '../utils/orderFormatting'

/** Friendly text for the error codes in the Order README. */
const ERROR_MESSAGES: Record<string, string> = {
  ORDER_ALREADY_ACCEPTED: 'Another courier accepted this errand first.',
  ORDER_EXPIRED: 'This errand expired before it could be accepted.',
  SELF_ACCEPTANCE_FORBIDDEN: "You can't accept your own errand.",
  REWARD_ADJUSTMENT_PENDING: 'The reward is being updated. Try again in a moment.',
  CANCELLATION_NOT_ALLOWED: "This errand can't be cancelled after pickup.",
  NOT_ASSIGNED_COURIER: 'Only the assigned courier can do this.',
  NOT_ORDER_REQUESTER: 'Only the requester can do this.',
  INVALID_STATE_TRANSITION: 'This errand has changed. The latest status is shown.',
}

function errorText(error: unknown): string {
  if (error instanceof OrderApiError) {
    // A 403 without a code comes from the session-role check, not the order itself.
    if (error.status === 403 && !error.code) return 'Switch to the right role in the header to do this.'
    return (error.code && ERROR_MESSAGES[error.code]) || error.message
  }
  return 'Something went wrong. Please try again.'
}

type View = 'browser' | 'courier' | 'requester'
type Confirmation = { action: OrderAction; title: string; body: string; label: string }

/**
 * One route for every viewer of an errand (Figma "Errand details", "Courier active order",
 * "Requester active order"). The viewer's relationship to the order picks the layout; the
 * backend still authorises every action.
 */
export function ErrandPage() {
  const { orderId = '' } = useParams()
  const session = readSession()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<Confirmation | null>(null)
  const errand = useQuery({ queryKey: ['orders', orderId], queryFn: () => fetchOrder(orderId) })
  const action = useMutation({
    mutationFn: (next: OrderAction) => performAction(orderId, next),
    onSuccess: (updated) => {
      queryClient.setQueryData(['orders', orderId], updated)
      void queryClient.invalidateQueries({ queryKey: ['orders', 'pool'] })
    },
    // A rejection usually means the errand changed (taken, expired): show its latest state.
    onError: () => void queryClient.invalidateQueries({ queryKey: ['orders', orderId] }),
    onSettled: () => setConfirming(null),
  })

  if (errand.isPending) return <p className="subtle">Loading errand…</p>
  if (errand.isError) {
    const notFound = errand.error instanceof OrderApiError && errand.error.status === 404
    return (
      <section className="card state-panel">
        <h2>{notFound ? 'Errand not found' : "We couldn't load this errand"}</h2>
        <p>{notFound ? 'It may have been taken or it is no longer open.' : errand.error.message}</p>
        <Link className="text-link" to="/errands">
          Back to errands
        </Link>
      </section>
    )
  }

  const order = errand.data
  const userId = session?.userId
  const view: View =
    userId === order.requesterId ? 'requester' : userId && userId === order.courierId ? 'courier' : 'browser'
  const run = (next: OrderAction) => action.mutate(next)
  const ask = (confirmation: Confirmation) => {
    action.reset()
    setConfirming(confirmation)
  }

  return (
    <>
      <div className="back-row">
        <Link className="text-link" to={view === 'browser' ? '/errands/browse' : '/errands/mine'}>
          ← Back
        </Link>
      </div>
      <div className="two-column">
        <section aria-labelledby="errand-title">
          {view === 'browser' && <BrowserHeading order={order} />}
          {view === 'courier' && <CourierHeading order={order} />}
          {view === 'requester' && <RequesterHeading order={order} />}
          <StateBadge state={order.state} />
          <RouteSummary order={order} />
          <dl className="facts">
            <dt>Pick up by</dt>
            <dd>{formatDeadline(order.pickupDeadline)}</dd>
          </dl>
          <hr className="divider" />
          <h2 className="section-title">What to collect</h2>
          <p className="description">{order.description}</p>
          {action.isError && (
            <div className="notice notice-error" role="alert">
              {errorText(action.error)}
            </div>
          )}
          <div className="actions">
            {view === 'browser' && order.state === 'OPEN' && (
              <button
                disabled={action.isPending || order.pendingCreditReward !== null}
                onClick={() =>
                  ask({
                    action: 'accept',
                    title: 'Accept this errand?',
                    body: `You'll be the courier for "${order.title}". Pick it up by ${formatDeadline(order.pickupDeadline)}.`,
                    label: 'Accept errand',
                  })
                }
                type="button"
              >
                Accept errand
              </button>
            )}
            {view === 'courier' && order.state === 'ACCEPTED' && (
              <>
                <button disabled={action.isPending} onClick={() => run('pickup')} type="button">
                  Mark as picked up
                </button>
                <button
                  className="button-danger"
                  disabled={action.isPending}
                  onClick={() =>
                    ask({
                      action: 'withdraw',
                      title: 'Withdraw from this errand?',
                      body: 'Before the pickup deadline it goes back to other couriers. After the deadline it expires.',
                      label: 'Withdraw',
                    })
                  }
                  type="button"
                >
                  Withdraw
                </button>
              </>
            )}
            {view === 'courier' && order.state === 'PICKED_UP' && (
              <button disabled={action.isPending} onClick={() => run('deliver')} type="button">
                Mark as delivered
              </button>
            )}
            {view === 'requester' && order.state === 'DELIVERED' && (
              <button
                disabled={action.isPending}
                onClick={() =>
                  ask({
                    action: 'complete',
                    title: 'Confirm you received it?',
                    body: `This completes the errand and transfers ${credits(order.creditReward)} to your courier.`,
                    label: `Confirm receipt · Transfer ${credits(order.creditReward)}`,
                  })
                }
                type="button"
              >
                Confirm receipt · Transfer {credits(order.creditReward)}
              </button>
            )}
            {view === 'requester' && (order.state === 'OPEN' || order.state === 'ACCEPTED') && (
              <button
                className="button-danger"
                disabled={action.isPending}
                onClick={() =>
                  ask({
                    action: 'cancel',
                    title: 'Cancel this errand?',
                    body:
                      order.state === 'ACCEPTED'
                        ? 'A courier has accepted it, so they receive 20% of the reward as compensation.'
                        : 'Your reserved credits are returned in full.',
                    label: 'Cancel errand',
                  })
                }
                type="button"
              >
                Cancel errand
              </button>
            )}
          </div>
        </section>
        <SidePanel order={order} view={view} />
      </div>
      <ConfirmDialog
        body={confirming?.body ?? ''}
        busy={action.isPending}
        confirmLabel={confirming?.label ?? ''}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && run(confirming.action)}
        open={confirming !== null}
        title={confirming?.title ?? ''}
      />
    </>
  )
}

function BrowserHeading({ order }: { order: Order }) {
  return (
    <header className="errand-heading">
      <h1 id="errand-title">{order.title}</h1>
      <p className="subtle">Errand {errandReference(order.id)}</p>
    </header>
  )
}

function CourierHeading({ order }: { order: Order }) {
  const next: Partial<Record<Order['state'], string>> = {
    ACCEPTED: 'Next: collect the item. Only you, the assigned courier, can mark pickup.',
    PICKED_UP: 'Next: deliver it to the drop-off point, then mark it as delivered.',
    DELIVERED: 'Waiting for the requester to confirm receipt. Your reward is released then.',
  }
  return (
    <header className="errand-heading">
      <h1 id="errand-title">{order.state === 'COMPLETED' ? 'Errand completed' : "You're the courier"}</h1>
      <p className="subtle">
        {order.title} · {errandReference(order.id)}
      </p>
      {next[order.state] && <div className="notice notice-next">{next[order.state]}</div>}
    </header>
  )
}

function RequesterHeading({ order }: { order: Order }) {
  const headings: Record<Order['state'], [string, string]> = {
    PENDING_CREDIT: ['Reserving your credits', 'Your errand opens once the credits are reserved.'],
    OPEN: ['Waiting for a courier', 'Your errand is visible to couriers.'],
    ACCEPTED: ['A courier is on the way', 'Your courier accepted the errand.'],
    PICKED_UP: ['Your item has been picked up', 'Your courier is bringing it to the drop-off point.'],
    DELIVERED: ['Have you received your item?', 'Your courier marked this errand as delivered.'],
    COMPLETED: ['Errand completed', 'You confirmed receipt and the reward was transferred.'],
    CANCELLED: ['Errand cancelled', 'This errand was cancelled.'],
    EXPIRED: ['Errand expired', 'Nobody picked it up before the deadline.'],
    RESERVATION_FAILED: ['Not enough credits', "Your credits couldn't be reserved, so the errand didn't open."],
  }
  const [title, subtitle] = headings[order.state]
  return (
    <header className="errand-heading">
      <h1 id="errand-title">{title}</h1>
      <p className="subtle">
        {subtitle} · {order.title}
      </p>
      {order.state === 'DELIVERED' && (
        <div className="notice notice-warn">
          <strong>Confirm only after you receive the items</strong>
          Confirming receipt completes this errand and transfers the reserved {credits(order.creditReward)} to your
          courier.
        </div>
      )}
      {order.pendingCreditReward !== null && (
        <div className="notice notice-next">
          Reward change to {credits(order.pendingCreditReward)} is waiting for Credit to confirm.
        </div>
      )}
    </header>
  )
}

function SidePanel({ order, view }: { order: Order; view: View }) {
  if (view === 'browser') {
    return (
      <aside aria-labelledby="earn-heading" className="card">
        <h2 id="earn-heading">Earn {credits(order.creditReward)}</h2>
        <p>The reward transfers after the requester confirms receipt.</p>
        <dl className="facts">
          <dt>Reward</dt>
          <dd>{credits(order.creditReward)}</dd>
          <dt>Status</dt>
          <dd>
            <StateBadge state={order.state} />
          </dd>
        </dl>
        <p>Item payments are handled outside this platform. Credits reward the errand itself.</p>
      </aside>
    )
  }
  return (
    <ProgressCard order={order} rewardLabel={view === 'courier' ? 'Your reward' : 'Reserved reward'}>
      {view === 'courier' && <p>Credits remain reserved until the requester confirms receipt.</p>}
    </ProgressCard>
  )
}
