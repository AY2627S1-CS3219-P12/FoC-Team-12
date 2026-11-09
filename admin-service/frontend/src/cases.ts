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
export type ReportContext = {
  orderId: string
  status: 'OWN_REPORT' | 'ELIGIBLE' | 'INELIGIBLE'
  caseId: string | null
  state: Summary['state'] | null
}
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
export type BanAction = Omit<CreditAction, 'type' | 'amount'> & {
  type: 'BAN'
  amount: null
}
export type AdminAction = CreditAction | BanAction
export type Detail = {
  closure?: {
    operationId: string
    resolution: string
    revision: number
    explanations: { operationId: string; explanation: string }[]
  } | null
  resolution?: string | null
  case: Summary
  statements: Statement[]
  actions?: AdminAction[]
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

// Translate API diagnostics at the display boundary; retain the original error
// for existing status, retry and reviewer-independence handling.
export function caseErrorMessage(error: CaseError): string {
  const messages: Record<string, string> = {
    'An errand UUID and an issue of 1–2000 characters are required.':
      'Choose an errand and describe the issue using 1–2,000 characters.',
    'Reporting eligibility evidence is incomplete. Please try again later.':
      'We couldn’t check reporting access. Try again shortly.',
    'Reporting eligibility could not be verified. This is not confirmation that no report exists. Please retry.':
      'We couldn’t check reporting access. If you already submitted a report, check its status before trying again.',
    'You have already submitted a statement for this errand.':
      'You already reported this errand. Open your report to check its status.',
    'Resolution preparation is pending; this case no longer accepts reports.':
      'This case is being closed and no longer accepts reports.',
    'This case has changed. Refresh it before claiming.':
      'This case has changed. Refresh before assigning it to yourself.',
    'This case has already been claimed or resolved.':
      'This case is already assigned or closed. Refresh to check its status.',
    'Reviewer independence could not be verified. Refresh the evidence and try again. The case remains open.':
      'We couldn’t verify whether you were involved in this errand. Refresh the evidence and try again. Review actions remain unavailable.',
    'Conversation initiation is unconfirmed. Retry with the same request key.':
      'We couldn’t confirm whether the conversation was started. Retry the same request to check.',
    'Conversation confirmation could not be saved. Retry with the same request key.':
      'We couldn’t confirm the conversation’s status. Retry the original request.',
    'Chat returned a conflicting conversation reference. Retry with the same request key.':
      'We couldn’t confirm the conversation’s status. Retry the original request.',
    'The case could not be saved. Retry using the same request key.':
      'We couldn’t confirm whether your changes were saved. Retry the same request.',
    'This request key was already used for a different request.':
      'This retry does not match the original request. Refresh and check the case status.',
    'This request key belongs to a different request.':
      'This retry does not match the original request. Refresh and check the case status.',
    'This request key belongs to a different operation.':
      'This retry does not match the original request. Refresh and check existing actions.',
    'Provide a resolution of 1–2000 characters, a revision and a request key.':
      'Check your resolution reason (1–2,000 characters). If the problem continues, refresh the case.',
    'Provide one nonblank explanation per rejected action, without duplicates.':
      'Add one explanation for each rejected action.',
    'Explain every rejected action and only rejected actions before resolving.':
      'Add one explanation for each rejected action before closing the case.',
    'This case has pending or unknown actions. Wait for owner confirmation before resolving.':
      'Wait for every action’s outcome to be confirmed before closing the case.',
    'Resume the original prepared resolution with its original request key and body.':
      'Resume the original case closure request. Do not submit a replacement.',
    'Resolution preparation is pending. Retry the same operation.':
      'Case closure is in progress. Resume the original request to check its outcome.',
    'Resolution preparation is pending. Retry the original resolution to confirm the conversation barrier.':
      'Case closure is waiting for conversations to become read-only. Resume the original request.',
    'Fresh complete Chat evidence is required. Evidence is unavailable, stale, has blocking gaps, or does not cover the current case. The case remains open.':
      'Current, complete evidence could not be verified. Refresh the evidence and resume the original closure request.',
    'Check the request fields, UUID identifiers and Idempotency-Key header.':
      'We couldn’t process the request. Check your entries. If the problem continues, refresh the page.',
    'Current account authorization denied or unavailable':
      error.status === 403
        ? 'Your account cannot access this resource.'
        : error.status === 401
          ? 'Your session has expired. Sign in again.'
          : 'We couldn’t check your permissions. Try again shortly.',
    'A valid token is required': 'Sign in again to continue.',
    'Current active administrator access is required.':
      'You need an active admin account to continue.',
    'Current administrator access is required.':
      'You need an active admin account to continue.',
    'Select Admin mode.': 'Choose “Switch to Admin” in your account menu.',
    'Case storage is temporarily unavailable. Retry with the same request key if a submission is pending.':
      'We couldn’t load or save the case. If a submission is unconfirmed, retry the same request.',
  }
  return Object.hasOwn(messages, error.message)
    ? messages[error.message]!
    : error.message
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
