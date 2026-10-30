import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { CreditActions } from './CreditActions'
import { saveSession } from './auth/session'
import type { CreditAction, Summary } from './cases'

const actor = '10000000-0000-4000-8000-000000000001',
  target = '20000000-0000-4000-8000-000000000001',
  caseId = '30000000-0000-4000-8000-000000000001',
  orderId = '40000000-0000-4000-8000-000000000001',
  operationId = '50000000-0000-4000-8000-000000000001'
const summary: Summary = {
  caseId,
  orderId,
  state: 'UNDER_REVIEW',
  reviewerId: actor,
  revision: 2,
  createdAt: '2026-10-29T10:00:00Z',
}
function action(status: CreditAction['status'] = 'PENDING'): CreditAction {
  return {
    operationId,
    caseId,
    targetUserId: target,
    type: 'CREDIT_ADJUSTMENT',
    amount: -5,
    reason: 'Missing item correction',
    status,
    reasonCode: status === 'REJECTED' ? 'INSUFFICIENT_AVAILABLE_CREDITS' : null,
    createdAt: summary.createdAt,
    completedAt: ['SUCCEEDED', 'REJECTED'].includes(status)
      ? summary.createdAt
      : null,
  }
}
const response = (value: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => value,
})
function setup(initialActions: CreditAction[] = [], who = actor) {
  return render(
    <CreditActions
      summary={summary}
      actorId={who}
      participantIds={[target]}
      initialActions={initialActions}
    />,
  )
}
function fill() {
  fireEvent.change(screen.getByLabelText('Participant'), {
    target: { value: target },
  })
  fireEvent.click(screen.getByLabelText('Subtract credits'))
  fireEvent.change(screen.getByLabelText('Whole credits'), {
    target: { value: '5' },
  })
  fireEvent.change(screen.getByLabelText('Reason for correction'), {
    target: { value: 'Missing item correction' },
  })
}
beforeEach(() => {
  saveSession({
    userId: actor,
    username: 'Reviewer',
    role: 'ADMIN',
    accessToken: 'user-jwt',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})
it('requires confirmation and preserves the same request after an uncertain submission', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('lost response'))
    .mockResolvedValueOnce(response(action(), 202))
    .mockResolvedValue(response(action()))
  vi.stubGlobal('fetch', fetcher)
  setup()
  fill()
  fireEvent.click(screen.getByRole('button', { name: 'Review correction' }))
  expect(fetcher).not.toHaveBeenCalled()
  expect(
    screen.getByRole('region', { name: 'Confirm credit correction' }),
  ).toHaveTextContent('Subtract 5 credits from Participant 1')
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm credit correction' }),
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No new financial outcome is confirmed',
  )
  expect(screen.getByLabelText('Whole credits')).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry same correction' }))
  expect(await screen.findByText('PENDING')).toBeVisible()
  expect(screen.getByText(/Waiting for Credit to confirm/)).toBeVisible()
  const first = fetcher.mock.calls[0]![1],
    second = fetcher.mock.calls[1]![1]
  expect(first.body).toBe(second.body)
  expect(first.headers['Idempotency-Key']).toBe(
    second.headers['Idempotency-Key'],
  )
  expect(JSON.parse(first.body)).toEqual({
    type: 'CREDIT_ADJUSTMENT',
    targetUserId: target,
    amount: -5,
    reason: 'Missing item correction',
  })
  expect(screen.queryByText('SUCCEEDED')).not.toBeInTheDocument()
})
it('blocks empty/fractional/zero amounts and only offers verified participants', () => {
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  setup()
  expect(screen.getAllByRole('option')).toHaveLength(2)
  fill()
  for (const amount of ['0', '1.5', '2147483648']) {
    fireEvent.change(screen.getByLabelText('Whole credits'), {
      target: { value: amount },
    })
    expect(
      screen.getByRole('button', { name: 'Review correction' }),
    ).toBeDisabled()
  }
  expect(fetcher).not.toHaveBeenCalled()
})
it('lets other administrators review history without offering a correction form', () => {
  setup([action('REJECTED')], orderId)
  expect(screen.getByText('REJECTED')).toBeVisible()
  expect(screen.getByText(/insufficient available credits/)).toBeVisible()
  expect(screen.queryByLabelText('Whole credits')).not.toBeInTheDocument()
})
it('shows UNKNOWN as uncertain and reconciles a late success without another command', async () => {
  const fetcher = vi.fn().mockResolvedValue(response(action('SUCCEEDED')))
  vi.stubGlobal('fetch', fetcher)
  setup([action('UNKNOWN')])
  expect(screen.getByText('UNKNOWN')).toBeVisible()
  expect(screen.getByText(/may already have taken effect/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh action status' }))
  expect(await screen.findByText('SUCCEEDED')).toBeVisible()
  expect(fetcher.mock.calls.every((c) => c[1].method === 'GET')).toBe(true)
  expect(screen.getAllByText('29 Oct 2026, 6:00:00 pm SGT')).toHaveLength(2)
})
it('polls pending outcomes without submitting another correction', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn().mockResolvedValue(response(action('REJECTED')))
  vi.stubGlobal('fetch', fetcher)
  setup([action()])
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000)
  })
  expect(screen.getByText('REJECTED')).toBeVisible()
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('keeps last known status on outage and hides history after access denial', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response({}, 503))
    .mockResolvedValue(response({}, 403))
  vi.stubGlobal('fetch', fetcher)
  setup([action('UNKNOWN')])
  fireEvent.click(screen.getByRole('button', { name: 'Refresh action status' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Last confirmed information is shown',
  )
  expect(screen.getByText('UNKNOWN')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh action status' }))
  await waitFor(() =>
    expect(screen.queryByText('UNKNOWN')).not.toBeInTheDocument(),
  )
  expect(screen.queryByLabelText('Whole credits')).not.toBeInTheDocument()
})
it('does not silently replace invalid action history with an empty history', () => {
  setup([{ ...action(), caseId: orderId }])
  expect(screen.getByRole('alert')).toHaveTextContent(
    'history could not be verified',
  )
  expect(
    screen.queryByText('No credit corrections recorded for this case.'),
  ).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Whole credits')).not.toBeInTheDocument()
})
