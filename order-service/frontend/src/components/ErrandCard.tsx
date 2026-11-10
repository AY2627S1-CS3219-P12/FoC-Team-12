import { ArrowRight, Clock3, MapPinned, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Order } from '../api/orderApi'
import {
  credits,
  REPOSTABLE_STATES,
  repostPath,
} from '../utils/orderFormatting'
import { RouteLine } from './RouteLine'
import { StateBadge } from './StateBadge'

interface ErrandCardProps {
  canRepost?: boolean
  order: Order
  showPendingReward?: boolean
  timingLabel: string
}

/** One real-data card language for Courier discovery and both roles' errand history. */
export function ErrandCard({
  canRepost = false,
  order,
  showPendingReward = false,
  timingLabel,
}: ErrandCardProps) {
  return (
    <li className="card errand-card">
      <div aria-hidden="true" className="errand-card-visual">
        <span className="errand-card-visual-icon">
          <MapPinned />
        </span>
        <span>Campus errand</span>
      </div>
      <div className="errand-card-content">
        <div className="errand-card-head">
          <StateBadge
            state={order.state}
            terminalReason={order.terminalReason}
          />
          <span aria-label={`${credits(order.creditReward)} reward`} className="reward">
            <strong>{order.creditReward}</strong>
            <small>credits</small>
          </span>
        </div>
        <h3>{order.title}</h3>
        <div className="errand-card-meta">
          <RouteLine order={order} />
          <p className="errand-timing">
            <Clock3 aria-hidden="true" />
            <span>{timingLabel}</span>
          </p>
        </div>
        {showPendingReward && order.pendingCreditReward !== null && (
          <p className="notice notice-next errand-card-notice">
            Reward change to {credits(order.pendingCreditReward)} pending
          </p>
        )}
        <div className="errand-card-foot">
          <div className="errand-card-links">
            {canRepost && REPOSTABLE_STATES.includes(order.state) && (
              <Link
                aria-label={`Post ${order.title} again`}
                className="text-link"
                to={repostPath(order.id)}
              >
                <RotateCcw aria-hidden="true" /> Post again
              </Link>
            )}
            <Link
              aria-label={`View ${order.title}`}
              className="text-link errand-view-link"
              to={`/errands/${order.id}`}
            >
              View details <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </li>
  )
}
