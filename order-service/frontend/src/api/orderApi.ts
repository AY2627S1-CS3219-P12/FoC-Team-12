import { expireSession, readSession } from '../auth/session'

export type OrderState =
  | 'PENDING_CREDIT'
  | 'OPEN'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'RESERVATION_FAILED'

/** Mirrors OrderResponse in order-service (web/dto/OrderResponse.java). */
export type Order = {
  id: string
  requesterId: string
  courierId: string | null
  title: string
  description: string
  pickupLocationId: string
  pickupLocationName: string | null
  dropoffLocationId: string
  dropoffLocationName: string | null
  creditReward: number
  pendingCreditReward: number | null
  pickupDeadline: string
  state: OrderState
  terminalReason: string | null
  version: number
  createdAt: string
  stateChangedAt: string
}

/** Mirrors OrderTransitionResponse. */
export type OrderTransition = {
  action: string
  fromState: OrderState | null
  toState: OrderState
  actorRole: 'REQUESTER' | 'COURIER' | 'SYSTEM'
  actorId: string | null
  courierId: string | null
  reason: string | null
  orderVersion: number
  occurredAt: string
}

/** Mirrors OrderPageResponse (same shape as Supplier's list response). */
export type OrderPage = {
  items: Order[]
  page: number
  size: number
  totalItems: number
  totalPages: number
}

export type PoolSort = 'deadline' | 'reward' | 'pickupLocationName'

export type PoolQuery = {
  minReward?: number
  maxReward?: number
  sort: PoolSort
  page: number
}

export type OrderAction = 'accept' | 'withdraw' | 'pickup' | 'deliver' | 'complete' | 'cancel'

/** A problem+json rejection; `code` is the Order error code (e.g. ORDER_ALREADY_ACCEPTED). */
export class OrderApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
    readonly currentState: OrderState | null = null,
    /** Field name -> messages from a 400's `errors` map (see the README). */
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = readSession()
  if (!session) throw new OrderApiError(401, 'Sign in is required')
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('Authorization', `${session.tokenType} ${session.accessToken}`)
  const response = await fetch(path, { ...init, headers })
  if (response.status === 401) expireSession()
  if (!response.ok) {
    let detail = 'Something went wrong. Please try again.'
    let code: string | null = null
    let currentState: OrderState | null = null
    let fieldErrors: Record<string, string[]> = {}
    try {
      const problem = (await response.json()) as {
        detail?: string
        code?: string
        currentState?: OrderState
        errors?: Record<string, string[]>
      }
      detail = problem.detail ?? detail
      code = problem.code ?? null
      currentState = problem.currentState ?? null
      fieldErrors = problem.errors ?? {}
    } catch {
      // Keep the generic message when the body is not problem+json.
    }
    throw new OrderApiError(response.status, detail, code, currentState, fieldErrors)
  }
  return (await response.json()) as T
}

export function fetchOpenPool(query: PoolQuery): Promise<OrderPage> {
  const params = new URLSearchParams({ sort: query.sort, page: String(query.page), size: '20' })
  if (query.minReward) params.set('minReward', String(query.minReward))
  if (query.maxReward) params.set('maxReward', String(query.maxReward))
  return request<OrderPage>(`/api/orders?${params}`)
}

export function fetchOrder(id: string): Promise<Order> {
  return request<Order>(`/api/orders/${encodeURIComponent(id)}`)
}

export function fetchHistory(id: string): Promise<OrderTransition[]> {
  return request<OrderTransition[]>(`/api/orders/${encodeURIComponent(id)}/history`)
}

/** The caller's own errands: `active` (in progress) or `past` (finished), optionally one state. */
export function fetchMyOrders(
  kind: 'requested' | 'delivered',
  status: 'active' | 'past',
  page: number,
  state?: OrderState,
): Promise<OrderPage> {
  const params = new URLSearchParams({ status, page: String(page), size: '20' })
  if (state) params.set('state', state)
  return request<OrderPage>(`/api/orders/me/${kind}?${params}`)
}

export function performAction(id: string, action: OrderAction): Promise<Order> {
  return request<Order>(`/api/orders/${encodeURIComponent(id)}/${action}`, { method: 'POST' })
}


/** Body of POST /api/orders (CreateOrderRequest). Locations come from Supplier Service. */
export type CreateOrderInput = {
  title: string
  description: string
  pickupLocationId: string
  pickupLocationName: string
  dropoffLocationId: string
  dropoffLocationName: string
  creditReward: number
  pickupDeadline: string
}

export function createOrder(input: CreateOrderInput): Promise<Order> {
  return request<Order>('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}
