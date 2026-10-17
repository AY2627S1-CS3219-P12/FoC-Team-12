import type { OrderState } from '../api/orderApi'
import { stateLabel } from '../utils/orderFormatting'

export function StateBadge({ state }: { state: OrderState }) {
  return <span className={`badge badge-${state.toLowerCase()}`}>{stateLabel(state)}</span>
}
