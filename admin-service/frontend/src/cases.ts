import { readSession } from './auth/session'

export type Summary = {
  caseId: string
  orderId: string
  state: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED'
  reviewerId: string | null
  revision: number
  createdAt: string
}
export type Statement = {
  reporterId: string
  description: string
  submittedAt: string
}
export type Report = { case: Summary; ownStatement: Statement }
export type CreditAction = {
  operationId: string
  caseId: string
  targetUserId: string
  type: 'CREDIT_ADJUSTMENT'
  amount: number
  reason: string
  status: 'PENDING' | 'UNKNOWN' | 'SUCCEEDED' | 'REJECTED'
  reasonCode: string | null
  createdAt: string
  completedAt: string | null
}
export type Detail = {
  case: Summary
  statements: Statement[]
  actions?: CreditAction[]
}
export type Page = {
  content: Summary[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}
export class CaseError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function request<T>(
  path: string,
  signal: AbortSignal,
  mutation?: { key: string; body: unknown },
): Promise<T> {
  const session = readSession()
  if (!session) throw new CaseError(401, 'Sign in to continue.')
  const response = await fetch('/api/admin/' + path, {
    method: mutation ? 'POST' : 'GET',
    signal,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(mutation
        ? {
            'Content-Type': 'application/json',
            'Idempotency-Key': mutation.key,
          }
        : {}),
    },
    ...(mutation ? { body: JSON.stringify(mutation.body) } : {}),
  })
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as {
      detail?: string
    }
    throw new CaseError(
      response.status,
      problem.detail || 'The request could not be completed.',
    )
  }
  return (await response.json()) as T
}
export const uuidPattern =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
export const isUuid = (value: string) =>
  new RegExp('^' + uuidPattern + '$').test(value)
