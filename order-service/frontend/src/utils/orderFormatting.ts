import type { OrderState } from '../api/orderApi'

const STATE_LABELS: Record<OrderState, string> = {
  PENDING_CREDIT: 'Reserving credits',
  OPEN: 'Open',
  ACCEPTED: 'Accepted',
  PICKED_UP: 'Picked up',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  RESERVATION_FAILED: 'Not enough credits',
}

export function stateLabel(state: OrderState): string {
  return STATE_LABELS[state]
}

/** Short reference shown in the design ("Errand FOC-1042"); derived from the UUID. */
export function errandReference(id: string): string {
  return `FOC-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

export function credits(amount: number): string {
  return `${amount} ${amount === 1 ? 'credit' : 'credits'}`
}

/** "Today, 12:45", "Tomorrow, 09:00", otherwise "09 Sep 2026, 12:45" (local time). */
export function formatDeadline(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((day(date) - day(now)) / 86_400_000)
  if (diffDays === 0) return `Today, ${time}`
  if (diffDays === 1) return `Tomorrow, ${time}`
  const dayText = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${dayText}, ${time}`
}

export function locationName(name: string | null): string {
  return name ?? 'Location not recorded'
}
