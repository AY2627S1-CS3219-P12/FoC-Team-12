import type { OrderState } from '../api/orderApi'
import { reservationFailure, stateLabel } from '../utils/orderFormatting'

export function StateBadge({ state, terminalReason = null }: { state: OrderState; terminalReason?: string | null }) {
  const label = state === 'RESERVATION_FAILED' ? reservationFailure(terminalReason).label : stateLabel(state)
  return <span className={`badge badge-${state.toLowerCase()}`}>{label}</span>
}
