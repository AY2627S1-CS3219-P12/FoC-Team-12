import { clearSession, readSession } from '../auth/session'

export type CreditBalance = {
  userId: string
  availableBalance: number
  reservedBalance: number
  totalBalance: number
  updatedAt: string | null
}

export type LedgerEntryType =
  | 'INITIAL_ALLOCATION'
  | 'RESERVATION_CREATED'
  | 'RESERVATION_INCREASED'
  | 'RESERVATION_DECREASED'
  | 'RESERVATION_RELEASED'
  | 'SETTLEMENT_DEBIT'
  | 'SETTLEMENT_CREDIT'
  | 'COMPENSATION_DEBIT'
  | 'COMPENSATION_CREDIT'

export type CreditTransaction = {
  id: string
  operationId: string
  reservationId: string | null
  type: LedgerEntryType
  availableDelta: number
  reservedDelta: number
  availableBalanceAfter: number
  reservedBalanceAfter: number
  createdAt: string
}

export type TransactionPage = {
  content: CreditTransaction[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export class CreditApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function authenticatedGet<T>(path: string): Promise<T> {
  const session = readSession()
  if (!session) throw new CreditApiError(401, 'Sign in is required')
  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
      Authorization: `${session.tokenType} ${session.accessToken}`,
    },
  })
  if (response.status === 401) clearSession()
  if (!response.ok) {
    let detail = 'Unable to load credit information'
    try {
      const problem = (await response.json()) as { detail?: unknown }
      if (typeof problem.detail === 'string') detail = problem.detail
    } catch {
      // Use the stable fallback when an upstream response is not JSON.
    }
    throw new CreditApiError(response.status, detail)
  }
  return (await response.json()) as T
}

export function getBalance() {
  return authenticatedGet<CreditBalance>('/api/credits/me')
}

export function getTransactions(page: number, size = 8) {
  const query = new URLSearchParams({ page: String(page), size: String(size) })
  return authenticatedGet<TransactionPage>(
    `/api/credits/me/transactions?${query.toString()}`,
  )
}
